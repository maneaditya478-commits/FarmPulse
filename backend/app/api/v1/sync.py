"""Offline-first synchronization with idempotency and conflict detection."""

import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agents.graph import run_agent_workflow
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models import (
    Animal,
    AnimalIdentifier,
    EnvironmentalRecord,
    Farm,
    FeedRecord,
    FinancialRecord,
    HealthObservation,
    SyncOperation,
    User,
    Vaccination,
    VaccineCatalog,
    WaterRecord,
)
from app.schemas.domain import (
    AnimalCreate,
    AnimalUpdate,
    EnvironmentRecordCreate,
    FeedRecordCreate,
    ObservationInput,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncOperationIn,
    SyncResult,
    VaccinationCreate,
    WaterRecordCreate,
)
from app.services.access import get_animal_for_user, get_farm_for_user, primary_farm
from app.services.vaccination import ensure_animal_schedule, mark_given
from app.services.weather import assess_environment

router = APIRouter(prefix="/sync", tags=["Offline Sync"])

# Mirrors the role gates of the equivalent online mutation routes.
_SYNC_ROLES = {
    "animal": ("farmer", "admin"),
    "health_observation": ("farmer", "paravet", "admin"),
    "vaccination": ("farmer", "veterinarian", "paravet", "admin"),
    "feed_record": ("farmer", "paravet", "admin"),
    "water_record": ("farmer", "paravet", "admin"),
    "environmental_record": ("farmer", "paravet", "admin"),
}


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise AppError(422, "invalid_entity_id", "entity_id must be a UUID") from exc


def _as_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _as_datetime(value) -> datetime:
    if not value:
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _apply_operation(db: Session, user: User, op: SyncOperationIn, entity_id: uuid.UUID) -> tuple[str, str | None]:
    """Apply one operation. Returns (status, message). Raises on validation/access errors."""
    payload = op.payload
    allowed_roles = _SYNC_ROLES.get(op.entity_type)
    if allowed_roles and user.role not in allowed_roles:
        raise AppError(403, "forbidden", "This account cannot sync this record type; the online route forbids it too")
    if op.entity_type != "animal" and op.operation != "create":
        raise AppError(422, "unsupported_operation", "Only animal records support update operations")

    if op.entity_type == "animal":
        if op.operation == "create":
            if db.get(Animal, entity_id):
                return "duplicate", "Animal already exists"
            data = AnimalCreate.model_validate(payload)
            farm = db.get(Farm, data.farm_id) if data.farm_id else primary_farm(db, user)
            if not farm or (user.role != "admin" and farm.owner_id != user.id):
                raise AppError(403, "forbidden", "Farm not accessible")
            tag_code = data.tag_code or f"SYNC-{entity_id.hex[:8].upper()}"
            if db.scalar(select(Animal).where(Animal.tag_code == tag_code)):
                return "conflict", "Tag code already exists on the server"
            animal = Animal(
                id=entity_id,
                farm_id=farm.id,
                species_id=data.species_id,
                breed_id=data.breed_id,
                name=data.name,
                tag_code=tag_code,
                sex=data.sex,
                birth_date=data.birth_date,
                weight_kg=data.weight_kg,
                color=data.color,
                photo_url=data.photo_url,
                notes=data.notes,
            )
            db.add(animal)
            db.flush()
            db.add(
                AnimalIdentifier(
                    animal_id=animal.id,
                    identifier_type="qr",
                    identifier_value=f"ALG-{animal.id.hex[:12].upper()}",
                    qr_payload=f"ALG|{animal.id}|{animal.tag_code}",
                )
            )
            ensure_animal_schedule(db, animal)
            return "applied", "Animal created"
        animal = get_animal_for_user(db, user, entity_id)
        if op.client_updated_at and _aware(animal.updated_at) > _aware(op.client_updated_at) + timedelta(seconds=1):
            return "conflict", "Server copy is newer; review the animal record before retrying"
        data = AnimalUpdate.model_validate(payload)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(animal, key, value)
        return "applied", "Animal updated"

    if op.entity_type == "health_observation":
        if db.get(HealthObservation, entity_id):
            return "duplicate", "Observation already exists"
        ObservationInput.model_validate(payload)
        animal = get_animal_for_user(db, user, _as_uuid(payload["animal_id"]))
        summary = payload.get("symptom_summary") or payload.get("notes") or "Offline symptom report"
        result = run_agent_workflow(
            db, user, text=summary, input_mode="mobile_offline",
            language=payload.get("language") or user.language,
            animal_id=animal.id, observation=payload,
            observation_id=entity_id,
            existing_case_id=_as_uuid(payload["case_id"]) if payload.get("case_id") else None,
            commit=False,
        )
        if not result.get("case_id"):
            raise AppError(403, "health_record_forbidden", "This account cannot create health observations")
        return "applied", "Health observation synced through the safety workflow"

    if op.entity_type == "vaccination":
        if db.get(Vaccination, entity_id):
            return "duplicate", "Vaccination already exists"
        VaccinationCreate.model_validate(payload)
        animal = get_animal_for_user(db, user, _as_uuid(payload["animal_id"]))
        vaccine = db.get(VaccineCatalog, _as_uuid(payload["vaccine_id"]))
        if not vaccine or vaccine.species_id != animal.species_id:
            return "conflict", "Vaccine does not match the animal's species"
        existing = db.scalar(
            select(Vaccination).where(Vaccination.animal_id == animal.id, Vaccination.vaccine_id == vaccine.id)
        )
        if existing and existing.administered_on:
            return "conflict", "A verified vaccination record already exists on the server"
        row = existing or Vaccination(id=entity_id, animal_id=animal.id, vaccine_id=vaccine.id, due_on=date.today())
        if not existing:
            db.add(row)
            db.flush()
        mark_given(
            db,
            row,
            administered_on=_as_date(payload.get("administered_on")),
            batch_no=payload.get("batch_no"),
            administered_by=payload.get("administered_by") or user.full_name,
        )
        return "applied", "Vaccination synced"

    if op.entity_type == "feed_record":
        if db.get(FeedRecord, entity_id):
            return "duplicate", "Feed record already exists"
        FeedRecordCreate.model_validate(payload)
        animal = get_animal_for_user(db, user, _as_uuid(payload["animal_id"]))
        record = FeedRecord(
            id=entity_id,
            animal_id=animal.id,
            recorded_at=_as_datetime(payload.get("recorded_at")),
            feed_type=payload["feed_type"],
            quantity_kg=float(payload["quantity_kg"]),
            mineral_supplement=payload.get("mineral_supplement"),
            cost=payload.get("cost"),
            notes=payload.get("notes"),
            recorded_by=user.id,
            is_sample=animal.is_sample,
        )
        db.add(record)
        if payload.get("cost"):
            db.add(
                FinancialRecord(
                    farm_id=animal.farm_id,
                    animal_id=animal.id,
                    record_date=record.recorded_at.date(),
                    record_type="expense",
                    category="feed",
                    amount=float(payload["cost"]),
                    description=f"Synced feed: {payload['feed_type']}",
                    is_sample=animal.is_sample,
                )
            )
        return "applied", "Feed record synced"

    if op.entity_type == "water_record":
        if db.get(WaterRecord, entity_id):
            return "duplicate", "Water record already exists"
        WaterRecordCreate.model_validate(payload)
        animal = get_animal_for_user(db, user, _as_uuid(payload["animal_id"]))
        db.add(
            WaterRecord(
                id=entity_id,
                animal_id=animal.id,
                recorded_at=_as_datetime(payload.get("recorded_at")),
                litres=payload.get("litres"),
                source=payload.get("source"),
                quality_note=payload.get("quality_note"),
                recorded_by=user.id,
                is_sample=animal.is_sample,
            )
        )
        return "applied", "Water record synced"

    if op.entity_type == "environmental_record":
        if db.get(EnvironmentalRecord, entity_id):
            return "duplicate", "Environmental record already exists"
        EnvironmentRecordCreate.model_validate(payload)
        farm = get_farm_for_user(db, user, _as_uuid(payload["farm_id"])) if payload.get("farm_id") else primary_farm(db, user)
        if not farm:
            raise AppError(400, "farm_required", "No farm is registered for this account")
        record = EnvironmentalRecord(
            id=entity_id,
            farm_id=farm.id,
            recorded_at=_as_datetime(payload.get("recorded_at")),
            temperature_c=payload.get("temperature_c"),
            humidity_pct=payload.get("humidity_pct"),
            weather=payload.get("weather"),
            shed_cleanliness=payload.get("shed_cleanliness"),
            water_available=payload.get("water_available"),
            sanitation_note=payload.get("sanitation_note"),
            source="mobile_offline",
            reported_by=user.id,
        )
        record.risk_flags = assess_environment(record)
        db.add(record)
        return "applied", "Environmental record synced"

    raise AppError(422, "unsupported_entity", f"Unsupported entity type: {op.entity_type}")


@router.post("/batch", response_model=SyncBatchResponse)
def sync_batch(
    payload: SyncBatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SyncBatchResponse:
    results: list[SyncResult] = []
    server_time = datetime.now(UTC)

    for op in payload.operations:
        entity_id = _as_uuid(op.entity_id)
        existing = db.scalar(
            select(SyncOperation).where(SyncOperation.idempotency_key == op.idempotency_key)
        )
        if existing and existing.status != "error":
            results.append(
                SyncResult(
                    idempotency_key=op.idempotency_key,
                    entity_type=op.entity_type,
                    entity_id=op.entity_id,
                    status="duplicate",
                    message="This operation was already processed",
                    server_updated_at=existing.server_updated_at,
                )
            )
            continue
        if existing and existing.status == "error":
            db.delete(existing)
            db.flush()

        status = "error"
        message = None
        try:
            with db.begin_nested():
                status, message = _apply_operation(db, user, op, entity_id)
                db.add(
                    SyncOperation(
                        user_id=user.id,
                        client_id=op.client_id,
                        entity_type=op.entity_type,
                        entity_id=str(entity_id),
                        operation=op.operation,
                        idempotency_key=op.idempotency_key,
                        payload=op.payload,
                        status=status,
                        server_updated_at=datetime.now(UTC),
                    )
                )
        except (AppError, ValidationError, ValueError, KeyError, IntegrityError, AttributeError, TypeError) as exc:
            message = str(exc)[:400]
            status = "error"
            db.add(
                SyncOperation(
                    user_id=user.id,
                    client_id=op.client_id,
                    entity_type=op.entity_type,
                    entity_id=str(entity_id),
                    operation=op.operation,
                    idempotency_key=op.idempotency_key,
                    payload=op.payload,
                    status="error",
                    error=message,
                )
            )
            db.flush()

        results.append(
            SyncResult(
                idempotency_key=op.idempotency_key,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                status=status,  # type: ignore[arg-type]
                message=message,
                server_updated_at=datetime.now(UTC) if status == "applied" else None,
            )
        )

    record_audit(
        db,
        actor=user,
        action="sync.batch_processed",
        entity_type="sync_batch",
        entity_id=None,
        detail={
            "client_id": payload.client_id,
            "operations": len(payload.operations),
            "applied": sum(1 for result in results if result.status == "applied"),
            "errors": sum(1 for result in results if result.status == "error"),
        },
    )
    db.commit()
    return SyncBatchResponse(
        client_id=payload.client_id,
        server_time=server_time,
        results=results,
        applied=sum(1 for result in results if result.status == "applied"),
        duplicates=sum(1 for result in results if result.status == "duplicate"),
        conflicts=sum(1 for result in results if result.status == "conflict"),
        errors=sum(1 for result in results if result.status == "error"),
    )


@router.get("/operations")
def list_operations(
    client_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    from app.models import SyncOperation

    stmt = select(SyncOperation).where(SyncOperation.user_id == user.id)
    if client_id:
        stmt = stmt.where(SyncOperation.client_id == client_id)
    rows = db.scalars(stmt.order_by(SyncOperation.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": str(row.id),
            "client_id": row.client_id,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "operation": row.operation,
            "status": row.status,
            "error": row.error,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
