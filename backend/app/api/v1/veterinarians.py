"""Registered veterinary professionals."""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import User, Veterinarian
from app.schemas.domain import VetAvailabilityUpdate, VetProfileOut, VetProfileUpsert
from app.services.access import get_vet_profile, primary_farm
from app.services.vets import haversine_km, nearby_vets

router = APIRouter(prefix="/veterinarians", tags=["Veterinary Network"])


def _vet_options():
    return selectinload(Veterinarian.user)


@router.get("", response_model=list[VetProfileOut])
def list_vets(
    district: str | None = None,
    availability: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Veterinarian]:
    stmt = select(Veterinarian).options(_vet_options()).join(User, Veterinarian.user_id == User.id).where(User.is_active.is_(True))
    if district:
        stmt = stmt.where(Veterinarian.district.ilike(f"%{district}%"))
    if availability:
        stmt = stmt.where(Veterinarian.availability == availability)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(User.full_name.ilike(pattern), Veterinarian.clinic_name.ilike(pattern), Veterinarian.specialization.ilike(pattern))
        )
    return list(db.scalars(stmt.order_by(Veterinarian.rating.desc().nullslast())).all())


@router.get("/me", response_model=VetProfileOut)
def my_vet_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Veterinarian:
    vet = db.scalar(select(Veterinarian).options(_vet_options()).where(Veterinarian.user_id == user.id))
    if not vet:
        raise AppError(status.HTTP_404_NOT_FOUND, "vet_profile_missing", "No veterinary profile is linked to this account")
    return vet


@router.get("/nearby", response_model=list[dict])
def nearby(
    farm_id: uuid.UUID | None = None,
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    farm = None
    if farm_id:
        from app.services.access import get_farm_for_user

        farm = get_farm_for_user(db, user, farm_id)
    elif user.role == "farmer":
        farm = primary_farm(db, user)
    results = nearby_vets(db, farm)
    if latitude is not None and longitude is not None:
        for item in results:
            item["distance_km"] = haversine_km(latitude, longitude, item["vet"].latitude, item["vet"].longitude)
        results.sort(key=lambda item: (item["distance_km"] if item["distance_km"] is not None else 9999, -(item["vet"].rating or 0)))
    return [
        {
            "vet_id": str(item["vet"].id),
            "name": item["vet"].user.full_name if item["vet"].user else None,
            "qualification": item["vet"].qualification,
            "clinic_name": item["vet"].clinic_name,
            "district": item["vet"].district,
            "distance_km": item["distance_km"],
            "availability": item["vet"].availability,
            "verified": item["vet"].verified,
            "phone": item["vet"].user.phone if item["vet"].user else None,
        }
        for item in results
    ]


@router.post("/me", response_model=VetProfileOut, status_code=status.HTTP_201_CREATED)
def upsert_my_profile(
    payload: VetProfileUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet")),
) -> Veterinarian:
    vet = get_vet_profile(db, user)
    if vet:
        data = payload.model_dump()
        credentials_changed = data["registration_no"] != vet.registration_no or data["qualification"] != vet.qualification
        for key, value in data.items():
            setattr(vet, key, value)
        if credentials_changed:
            vet.verified = False
    else:
        vet = Veterinarian(user_id=user.id, verified=False, availability="offline", **payload.model_dump())
        db.add(vet)
        db.flush()
    record_audit(db, actor=user, action="vet_profile.updated", entity_type="veterinarian", entity_id=vet.id)
    db.commit()
    db.refresh(vet)
    return db.scalar(select(Veterinarian).options(_vet_options()).where(Veterinarian.id == vet.id))


@router.patch("/me/availability", response_model=VetProfileOut)
def update_availability(
    payload: VetAvailabilityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet")),
) -> Veterinarian:
    vet = get_vet_profile(db, user)
    if not vet:
        raise AppError(status.HTTP_404_NOT_FOUND, "vet_profile_missing", "Veterinary profile not found")
    vet.availability = payload.availability
    record_audit(db, actor=user, action="vet_profile.availability", entity_type="veterinarian", entity_id=vet.id, detail=payload.model_dump())
    db.commit()
    return db.scalar(select(Veterinarian).options(_vet_options()).where(Veterinarian.id == vet.id))


@router.get("/{vet_id}", response_model=VetProfileOut)
def get_vet(vet_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> Veterinarian:
    vet = db.scalar(select(Veterinarian).options(_vet_options()).where(Veterinarian.id == vet_id))
    if not vet:
        raise AppError(status.HTTP_404_NOT_FOUND, "vet_not_found", "Veterinarian not found")
    return vet
