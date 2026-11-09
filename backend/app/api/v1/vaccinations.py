"""Vaccination catalogue, records, schedule and reminders."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import Animal, User, Vaccination, VaccineCatalog, Veterinarian
from app.schemas.domain import (
    VaccinationCreate,
    VaccinationOut,
    VaccinationScheduleItem,
    VaccinationVerify,
    VaccineCatalogOut,
)
from app.services.access import animal_query, get_animal_for_user, get_vet_profile, require_verified_professional
from app.services.vaccination import (
    create_vaccination_reminders,
    ensure_animal_schedule,
    mark_given,
    refresh_statuses,
    schedule_items,
)

router = APIRouter(prefix="/vaccinations", tags=["Vaccinations"])


def _vax_options():
    return (
        selectinload(Vaccination.animal).selectinload(Animal.species),
        selectinload(Vaccination.vaccine),
    )


@router.get("/catalog", response_model=list[VaccineCatalogOut])
def list_catalog(
    species_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[VaccineCatalog]:
    stmt = select(VaccineCatalog).order_by(VaccineCatalog.name)
    if species_id:
        stmt = stmt.where(VaccineCatalog.species_id == species_id)
    return list(db.scalars(stmt).all())


@router.get("/schedule", response_model=list[VaccinationScheduleItem])
def vaccination_schedule(
    animal_id: uuid.UUID | None = None,
    within_days: int = Query(default=30, ge=0, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    if animal_id:
        animals = [get_animal_for_user(db, user, animal_id)]
    else:
        animals = db.scalars(animal_query(db, user)).all()[:100]
    for animal in animals:
        ensure_animal_schedule(db, animal)
    db.flush()
    items = schedule_items(db, [animal.id for animal in animals], within_days=within_days)
    db.commit()
    return items


@router.get("/overdue", response_model=list[VaccinationScheduleItem])
def overdue_vaccinations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    animals = db.scalars(animal_query(db, user)).all()[:100]
    for animal in animals:
        ensure_animal_schedule(db, animal)
    db.flush()
    items = schedule_items(db, [animal.id for animal in animals], within_days=0)
    db.commit()
    return [item for item in items if item["status"] == "overdue"]


@router.get("", response_model=list[VaccinationOut])
def list_vaccinations(
    animal_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Vaccination]:
    if animal_id:
        get_animal_for_user(db, user, animal_id)
        animal_ids = [animal_id]
    else:
        animal_ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:200]]
    if not animal_ids:
        return []
    refresh_statuses(db, animal_ids)
    stmt = select(Vaccination).options(*_vax_options()).where(Vaccination.animal_id.in_(animal_ids))
    if status_filter:
        stmt = stmt.where(Vaccination.status == status_filter)
    rows = list(db.scalars(stmt.order_by(Vaccination.due_on)).all())
    db.commit()
    return rows


@router.post("", response_model=VaccinationOut, status_code=status.HTTP_201_CREATED)
def record_vaccination(
    payload: VaccinationCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "veterinarian", "paravet", "admin")),
) -> Vaccination:
    animal = get_animal_for_user(db, user, payload.animal_id)
    vaccine = db.get(VaccineCatalog, payload.vaccine_id)
    if not vaccine or vaccine.species_id != animal.species_id:
        raise AppError(status.HTTP_400_BAD_REQUEST, "invalid_vaccine", "Vaccine does not match this animal's species")
    vet = get_vet_profile(db, user) if user.role in ("veterinarian", "paravet") else None
    row = db.scalar(
        select(Vaccination).where(Vaccination.animal_id == animal.id, Vaccination.vaccine_id == vaccine.id)
    )
    if not row:
        row = Vaccination(animal_id=animal.id, vaccine_id=vaccine.id, due_on=payload.due_on or date.today())
        db.add(row)
        db.flush()
    mark_given(
        db,
        row,
        administered_on=payload.administered_on,
        batch_no=payload.batch_no,
        administered_by=payload.administered_by or user.full_name,
        certificate_ref=None,
    )
    if vet and vet.verified:
        row.verified_by = vet.id
        row.certificate_ref = row.certificate_ref or f"VAC-{row.id.hex[:8].upper()}"
    if payload.notes:
        row.notes = payload.notes
    record_audit(
        db,
        actor=user,
        action="vaccination.recorded",
        entity_type="vaccination",
        entity_id=row.id,
        detail={"animal_id": str(animal.id), "vaccine": vaccine.name},
        request=request,
    )
    db.commit()
    return db.scalar(select(Vaccination).options(*_vax_options()).where(Vaccination.id == row.id))


@router.post("/{vaccination_id}/verify", response_model=VaccinationOut)
def verify_vaccination(
    vaccination_id: uuid.UUID,
    payload: VaccinationVerify,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet")),
) -> Vaccination:
    row = db.get(Vaccination, vaccination_id)
    if not row:
        raise AppError(status.HTTP_404_NOT_FOUND, "vaccination_not_found", "Vaccination record not found")
    get_animal_for_user(db, user, row.animal_id)
    vet = require_verified_professional(db, user)
    row.verified_by = vet.id if payload.verified else None
    if payload.batch_no:
        row.batch_no = payload.batch_no
    if payload.certificate_ref:
        row.certificate_ref = payload.certificate_ref
    record_audit(db, actor=user, action="vaccination.verified", entity_type="vaccination", entity_id=row.id)
    db.commit()
    return db.scalar(select(Vaccination).options(*_vax_options()).where(Vaccination.id == row.id))


@router.post("/reminders")
def schedule_reminders(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "veterinarian", "paravet", "admin")),
) -> dict:
    animals = db.scalars(animal_query(db, user)).all()[:200]
    for animal in animals:
        ensure_animal_schedule(db, animal)
    db.flush()
    created = create_vaccination_reminders(db, [animal.id for animal in animals])
    record_audit(db, actor=user, action="vaccination.reminders_scheduled", entity_type="vaccination", entity_id=None, detail={"count": created})
    db.commit()
    return {"message": f"{created} reminder(s) scheduled", "created": created}
