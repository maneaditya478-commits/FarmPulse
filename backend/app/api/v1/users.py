"""User profile, cooperative membership and administrator user management."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, page_result, require_roles
from app.core.errors import AppError
from app.core.security import hash_password
from app.models import Animal, CooperativeMembership, Farm, User
from app.schemas.domain import (
    CooperativeInvitationDecision,
    CooperativeInvitationOut,
    CooperativeMemberCreate,
    CooperativeMemberOut,
    UserAdminView,
    UserBrief,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services.notifications import create_notification

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "use_change_password",
            "Change your password via /auth/change-password, which requires your current password",
        )
    if "is_active" in data:
        raise AppError(status.HTTP_400_BAD_REQUEST, "forbidden", "Account activation is managed by administrators")
    for key, value in data.items():
        setattr(user, key, value)
    record_audit(db, actor=user, action="user.updated", entity_type="user", entity_id=user.id, detail={"fields": list(data)})
    db.commit()
    db.refresh(user)
    return user


@router.get("/me/summary")
def my_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    farm_ids = list(db.scalars(select(Farm.id).where(Farm.owner_id == user.id)).all())
    animal_count = 0
    if farm_ids:
        animal_count = db.scalar(select(func.count(Animal.id)).where(Animal.farm_id.in_(farm_ids))) or 0
    return {
        "user_id": str(user.id),
        "role": user.role,
        "farms": len(farm_ids),
        "animals": int(animal_count),
        "language": user.language,
        "sample_account": user.is_sample,
    }


# ---------------------------------------------------------------- admin
@router.get("", response_model=dict)
def list_users(
    q: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    stmt = select(User)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern), User.village.ilike(pattern)))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = db.scalars(stmt.order_by(User.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    ids = [user.id for user in users]
    farm_counts = dict(
        db.execute(select(Farm.owner_id, func.count(Farm.id)).where(Farm.owner_id.in_(ids)).group_by(Farm.owner_id)).all()
    )
    animal_counts = dict(
        db.execute(
            select(Farm.owner_id, func.count(Animal.id))
            .join(Animal, Animal.farm_id == Farm.id)
            .where(Farm.owner_id.in_(ids))
            .group_by(Farm.owner_id)
        ).all()
    )
    items = []
    for user in users:
        base = UserOut.model_validate(user)
        items.append(
            UserAdminView(
                **base.model_dump(),
                farm_count=int(farm_counts.get(user.id, 0)),
                animal_count=int(animal_counts.get(user.id, 0)),
            )
        )
    return page_result(items, int(total), pagination)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> User:
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise AppError(status.HTTP_409_CONFLICT, "email_exists", "An account with this email already exists")
    user = User(
        email=payload.email.lower(),
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        language=payload.language,
        village=payload.village,
        district=payload.district,
        state=payload.state,
    )
    db.add(user)
    record_audit(db, actor=admin, action="admin.user_created", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise AppError(status.HTTP_404_NOT_FOUND, "user_not_found", "User not found")
    data = payload.model_dump(exclude_unset=True)
    if user.id == admin.id and data.get("is_active") is False:
        raise AppError(status.HTTP_400_BAD_REQUEST, "self_deactivation", "You cannot deactivate your own account")
    password = data.pop("password", None)
    for key, value in data.items():
        setattr(user, key, value)
    if password:
        user.password_hash = hash_password(password)
        user.token_version += 1
    record_audit(db, actor=admin, action="admin.user_updated", entity_type="user", entity_id=user.id, detail={"fields": list(data)})
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------- cooperative
@router.get("/cooperative/members", response_model=list[CooperativeMemberOut])
def list_members(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("cooperative", "admin")),
) -> list[CooperativeMemberOut]:
    cooperative_id = user.id
    stmt = select(CooperativeMembership).where(CooperativeMembership.cooperative_id == cooperative_id)
    memberships = db.scalars(stmt.order_by(CooperativeMembership.joined_at.desc())).all()
    farmer_ids = [membership.farmer_id for membership in memberships]
    animal_counts: dict[uuid.UUID, int] = {}
    if farmer_ids:
        animal_counts = dict(
            db.execute(
                select(Farm.owner_id, func.count(Animal.id))
                .join(Animal, Animal.farm_id == Farm.id)
                .where(Farm.owner_id.in_(farmer_ids))
                .group_by(Farm.owner_id)
            ).all()
        )
    results = []
    for membership in memberships:
        farmer = db.get(User, membership.farmer_id)
        if not farmer:
            continue
        results.append(
            CooperativeMemberOut(
                id=membership.id,
                member_code=membership.member_code,
                status=membership.status,
                joined_at=membership.joined_at,
                farmer=UserOut.model_validate(farmer),
                animal_count=int(animal_counts.get(farmer.id, 0)),
            )
        )
    return results


@router.post("/cooperative/members", response_model=CooperativeMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    payload: CooperativeMemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("cooperative", "admin")),
) -> CooperativeMemberOut:
    farmer = db.scalar(select(User).where(User.email == payload.farmer_email.lower(), User.role == "farmer"))
    if not farmer:
        raise AppError(status.HTTP_404_NOT_FOUND, "farmer_not_found", "No farmer account with this email")
    existing = db.scalar(
        select(CooperativeMembership).where(
            CooperativeMembership.cooperative_id == user.id, CooperativeMembership.farmer_id == farmer.id
        )
    )
    if existing:
        raise AppError(status.HTTP_409_CONFLICT, "already_member", "This farmer is already a member")
    membership = CooperativeMembership(
        cooperative_id=user.id,
        farmer_id=farmer.id,
        member_code=payload.member_code or f"CM-{farmer.id.hex[:6].upper()}",
        status="pending",
        joined_at=datetime.now(UTC),
    )
    db.add(membership)
    db.flush()
    create_notification(
        db,
        user_id=farmer.id,
        title=f"Cooperative membership invitation — {user.full_name}",
        body=f"{user.full_name} invited you to join their cooperative. Review the invitation and accept only if you consent to sharing your farm data with them.",
        type="cooperative_invitation",
        language=farmer.language,
        related_type="cooperative_membership",
        related_id=membership.id,
    )
    record_audit(db, actor=user, action="cooperative.member_invited", entity_type="cooperative_membership", entity_id=membership.id)
    db.commit()
    db.refresh(membership)
    return CooperativeMemberOut(
        id=membership.id,
        member_code=membership.member_code,
        status=membership.status,
        joined_at=membership.joined_at,
        farmer=UserOut.model_validate(farmer),
    )


@router.get("/cooperative/invitations", response_model=list[CooperativeInvitationOut])
def list_invitations(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer")),
) -> list[CooperativeInvitationOut]:
    memberships = db.scalars(
        select(CooperativeMembership)
        .where(CooperativeMembership.farmer_id == user.id, CooperativeMembership.status == "pending")
        .order_by(CooperativeMembership.joined_at.desc())
    ).all()
    results = []
    for membership in memberships:
        cooperative = db.get(User, membership.cooperative_id)
        if not cooperative:
            continue
        results.append(
            CooperativeInvitationOut(
                id=membership.id,
                member_code=membership.member_code,
                status=membership.status,
                joined_at=membership.joined_at,
                cooperative=UserBrief.model_validate(cooperative),
            )
        )
    return results


@router.post("/cooperative/invitations/{membership_id}/decision")
def decide_invitation(
    membership_id: uuid.UUID,
    payload: CooperativeInvitationDecision,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer")),
):
    membership = db.get(CooperativeMembership, membership_id)
    if not membership or membership.farmer_id != user.id or membership.status != "pending":
        raise AppError(status.HTTP_404_NOT_FOUND, "invitation_not_found", "Invitation not found")
    cooperative = db.get(User, membership.cooperative_id)
    if payload.decision == "accept":
        membership.status = "active"
        membership.consented_at = datetime.now(UTC)
        record_audit(db, actor=user, action="cooperative.membership_consented", entity_type="cooperative_membership", entity_id=membership.id)
        result = CooperativeMemberOut(
            id=membership.id,
            member_code=membership.member_code,
            status=membership.status,
            joined_at=membership.joined_at,
            farmer=UserOut.model_validate(user),
        )
    else:
        db.delete(membership)
        record_audit(db, actor=user, action="cooperative.membership_declined", entity_type="cooperative_membership", entity_id=membership.id)
        result = {"id": str(membership_id), "status": "declined"}
    if cooperative:
        outcome = "accepted" if payload.decision == "accept" else "declined"
        create_notification(
            db,
            user_id=cooperative.id,
            title=f"Membership invitation {outcome} — {user.full_name}",
            body=f"{user.full_name} {outcome} your cooperative membership invitation.",
            type="cooperative_invitation",
            language=cooperative.language,
            related_type="cooperative_membership",
            related_id=membership_id,
        )
    db.commit()
    return result


@router.delete("/cooperative/members/{membership_id}")
def remove_member(
    membership_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("cooperative", "admin")),
) -> dict:
    membership = db.get(CooperativeMembership, membership_id)
    if not membership or (user.role != "admin" and membership.cooperative_id != user.id):
        raise AppError(status.HTTP_404_NOT_FOUND, "membership_not_found", "Membership not found")
    db.delete(membership)
    record_audit(db, actor=user, action="cooperative.member_removed", entity_type="cooperative_membership", entity_id=membership_id)
    db.commit()
    return {"message": "Membership removed"}
