"""Farm management."""

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import Animal, Farm, User
from app.schemas.domain import FarmCreate, FarmOut, FarmUpdate
from app.services.access import accessible_farm_ids, ensure_farm_owner

router = APIRouter(prefix="/farms", tags=["Farms"])


@router.get("", response_model=list[FarmOut])
def list_farms(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Farm]:
    stmt = select(Farm).order_by(Farm.created_at)
    ids = accessible_farm_ids(db, user)
    if ids is not None:
        stmt = stmt.where(Farm.id.in_(ids))
    return list(db.scalars(stmt).all())


@router.post("", response_model=FarmOut, status_code=status.HTTP_201_CREATED)
def create_farm(
    payload: FarmCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> Farm:
    owner_id = user.id
    farm = Farm(owner_id=owner_id, **payload.model_dump())
    db.add(farm)
    db.flush()
    record_audit(db, actor=user, action="farm.created", entity_type="farm", entity_id=farm.id, request=request)
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Farm:
    ids = accessible_farm_ids(db, user)
    farm = db.get(Farm, farm_id)
    if not farm or (ids is not None and farm.id not in ids):
        raise AppError(status.HTTP_404_NOT_FOUND, "farm_not_found", "Farm not found")
    return farm


@router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(
    farm_id: uuid.UUID,
    payload: FarmUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> Farm:
    farm = ensure_farm_owner(db, user, farm_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(farm, key, value)
    record_audit(db, actor=user, action="farm.updated", entity_type="farm", entity_id=farm.id)
    db.commit()
    db.refresh(farm)
    return farm


@router.delete("/{farm_id}")
def delete_farm(
    farm_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> dict:
    farm = ensure_farm_owner(db, user, farm_id)
    animal_count = db.scalar(select(func.count(Animal.id)).where(Animal.farm_id == farm.id)) or 0
    if animal_count:
        raise AppError(
            status.HTTP_409_CONFLICT,
            "farm_not_empty",
            "Move or archive animals before deleting this farm",
        )
    record_audit(db, actor=user, action="farm.deleted", entity_type="farm", entity_id=farm.id)
    db.delete(farm)
    db.commit()
    return {"message": "Farm deleted"}
