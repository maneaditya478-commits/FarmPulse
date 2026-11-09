"""Authentication endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Farm, User, Veterinarian
from app.schemas.domain import ChangePasswordRequest, LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _issue_token(user: User) -> TokenResponse:
    token = create_access_token(str(user.id), user.role, {"email": user.email, "name": user.full_name}, token_version=user.token_version)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(status.HTTP_409_CONFLICT, "email_exists", "An account with this email already exists")
    if payload.role == "veterinarian" and not payload.registration_no:
        raise AppError(status.HTTP_422_UNPROCESSABLE_ENTITY, "registration_required", "Veterinary registration number is required")

    user = User(
        email=email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        language=payload.language,
        village=payload.village,
        district=payload.district,
        state=payload.state,
        is_active=True,
    )
    db.add(user)
    db.flush()

    if payload.role == "farmer":
        db.add(
            Farm(
                owner_id=user.id,
                name=payload.farm_name or f"{payload.full_name}'s Farm",
                village=payload.village or "Not recorded",
                district=payload.district or "Not recorded",
                state=payload.state or "Maharashtra",
            )
        )
    else:
        db.add(
            Veterinarian(
                user_id=user.id,
                registration_no=payload.registration_no or "",
                qualification=payload.qualification or "Not recorded",
                clinic_name=payload.clinic_name,
                district=payload.district or "Not recorded",
                state=payload.state,
                verified=False,
                availability="offline",
            )
        )

    record_audit(
        db,
        actor=user,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        detail={"role": user.role},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise AppError(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Incorrect email or password")
    if not user.is_active:
        raise AppError(status.HTTP_403_FORBIDDEN, "account_inactive", "This account has been deactivated")
    user.last_login_at = datetime.now(UTC)
    record_audit(
        db,
        actor=user,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TokenResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError(status.HTTP_400_BAD_REQUEST, "invalid_password", "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    record_audit(db, actor=user, action="auth.password_changed", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return _issue_token(user)
