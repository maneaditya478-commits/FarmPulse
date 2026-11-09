"""Veterinary appointments / visit coordination."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import HealthCase, User, Veterinarian, VetVisit
from app.schemas.domain import AppointmentCreate, AppointmentOut, AppointmentUpdate
from app.services.access import cooperative_farmer_ids, get_case_for_user, get_vet_profile
from app.services.notifications import create_notification

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def _visit_options():
    return (
        selectinload(VetVisit.vet).selectinload(Veterinarian.user),
        selectinload(VetVisit.case),
    )


def _get_visit(db: Session, user: User, visit_id: uuid.UUID) -> VetVisit:
    visit = db.scalar(select(VetVisit).options(*_visit_options()).where(VetVisit.id == visit_id))
    if not visit:
        raise AppError(status.HTTP_404_NOT_FOUND, "appointment_not_found", "Appointment not found")
    get_case_for_user(db, user, visit.case_id)
    return visit


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[VetVisit]:
    stmt = select(VetVisit).options(*_visit_options())
    if user.role == "farmer":
        case_ids = select(HealthCase.id).where(HealthCase.farmer_id == user.id)
        stmt = stmt.where(VetVisit.case_id.in_(case_ids))
    elif user.role in ("veterinarian", "paravet"):
        vet = get_vet_profile(db, user)
        stmt = stmt.where(VetVisit.vet_id == (vet.id if vet else None))
    elif user.role == "cooperative":
        farmer_ids = cooperative_farmer_ids(db, user)
        case_ids = select(HealthCase.id).where(HealthCase.farmer_id.in_(farmer_ids)) if farmer_ids else select(HealthCase.id).where(False)
        stmt = stmt.where(VetVisit.case_id.in_(case_ids))
    if status_filter:
        stmt = stmt.where(VetVisit.status == status_filter)
    return list(db.scalars(stmt.order_by(VetVisit.requested_at.desc()).limit(200)).all())


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "veterinarian", "paravet", "admin")),
) -> VetVisit:
    case = get_case_for_user(db, user, payload.case_id)
    vet = db.get(Veterinarian, payload.vet_id)
    if not vet or not vet.user or not vet.user.is_active:
        raise AppError(status.HTTP_404_NOT_FOUND, "vet_not_found", "Veterinarian not found")
    if not vet.verified and user.role != "admin":
        raise AppError(status.HTTP_400_BAD_REQUEST, "vet_not_verified", "This veterinary professional is not verified yet")
    visit = VetVisit(
        case_id=case.id,
        vet_id=vet.id,
        visit_type=payload.visit_type,
        status="scheduled" if payload.scheduled_at else "requested",
        requested_at=datetime.now(UTC),
        scheduled_at=payload.scheduled_at,
        location=payload.location,
        notes=payload.notes,
    )
    db.add(visit)
    case.assigned_vet_id = vet.id
    if case.status in ("reported", "triaged"):
        case.status = "assigned"
    db.flush()
    if vet.user:
        create_notification(
            db,
            user_id=vet.user.id,
            title=f"Appointment request — {case.case_code}",
            body=f"{payload.visit_type} consultation requested for {case.case_code}. Scheduled: {payload.scheduled_at or 'to be confirmed'}.",
            type="appointment",
            language=vet.user.language,
            related_type="vet_visit",
            related_id=visit.id,
        )
    record_audit(
        db,
        actor=user,
        action="appointment.created",
        entity_type="vet_visit",
        entity_id=visit.id,
        detail={"case_id": str(case.id), "vet_id": str(vet.id)},
        request=request,
    )
    db.commit()
    return _get_visit(db, user, visit.id)


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(
    appointment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VetVisit:
    return _get_visit(db, user, appointment_id)


@router.patch("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: uuid.UUID,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VetVisit:
    visit = _get_visit(db, user, appointment_id)
    if user.role == "cooperative":
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "Cooperative users have read-only access")
    if user.role == "farmer" and payload.status != "cancelled":
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "Farmers can only cancel appointments")
    visit.status = payload.status
    if payload.scheduled_at:
        visit.scheduled_at = payload.scheduled_at
    if payload.notes:
        visit.notes = payload.notes
    if payload.status == "completed":
        visit.completed_at = datetime.now(UTC)
    case = db.get(HealthCase, visit.case_id)
    if case and user.role in ("veterinarian", "paravet") and payload.status == "completed" and case.status not in ("resolved", "closed"):
        case.status = "in_progress"
    record_audit(db, actor=user, action="appointment.updated", entity_type="vet_visit", entity_id=visit.id, detail={"status": payload.status})
    db.commit()
    return _get_visit(db, user, visit.id)
