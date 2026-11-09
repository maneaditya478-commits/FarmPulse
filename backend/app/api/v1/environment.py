"""Environmental observations, live weather and threshold alerts."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import EnvironmentalRecord, Farm, User
from app.schemas.domain import EnvironmentRecordCreate, EnvironmentRecordOut, WeatherOut
from app.services.access import accessible_farm_ids, primary_farm
from app.services.weather import assess_environment, get_weather

router = APIRouter(prefix="/environment", tags=["Environment"])


def _resolve_farm(db: Session, user: User, farm_id: uuid.UUID | None) -> Farm | None:
    if farm_id:
        farm = db.get(Farm, farm_id)
        allowed = accessible_farm_ids(db, user)
        if not farm or (allowed is not None and farm_id not in allowed):
            raise AppError(status.HTTP_404_NOT_FOUND, "farm_not_found", "Farm not found")
        return farm
    return primary_farm(db, user)


@router.get("/records", response_model=list[EnvironmentRecordOut])
def list_records(
    farm_id: uuid.UUID | None = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EnvironmentalRecord]:
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(EnvironmentalRecord).where(EnvironmentalRecord.recorded_at >= since).order_by(EnvironmentalRecord.recorded_at.desc())
    if farm_id:
        stmt = stmt.where(EnvironmentalRecord.farm_id == farm_id)
    allowed = accessible_farm_ids(db, user)
    if allowed is not None:
        stmt = stmt.where(EnvironmentalRecord.farm_id.in_(allowed))
    return list(db.scalars(stmt.limit(200)).all())


@router.post("/records", response_model=EnvironmentRecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    payload: EnvironmentRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> EnvironmentalRecord:
    farm = _resolve_farm(db, user, payload.farm_id)
    if not farm:
        raise AppError(status.HTTP_400_BAD_REQUEST, "farm_required", "No farm is registered for this account")
    record = EnvironmentalRecord(
        farm_id=farm.id,
        recorded_at=datetime.now(UTC),
        temperature_c=payload.temperature_c,
        humidity_pct=payload.humidity_pct,
        weather=payload.weather,
        shed_cleanliness=payload.shed_cleanliness,
        water_available=payload.water_available,
        sanitation_note=payload.sanitation_note,
        source="farmer_report",
        reported_by=user.id,
    )
    record.risk_flags = assess_environment(record)
    db.add(record)
    record_audit(
        db,
        actor=user,
        action="environment.recorded",
        entity_type="environmental_record",
        entity_id=record.id,
        detail={"flags": [flag["code"] for flag in record.risk_flags]},
        request=request,
    )
    db.commit()
    db.refresh(record)
    return record


@router.get("/weather", response_model=WeatherOut)
def weather(
    farm_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return get_weather(_resolve_farm(db, user, farm_id))


@router.get("/alerts")
def alerts(
    farm_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    farm = _resolve_farm(db, user, farm_id)
    latest = None
    if farm:
        latest = db.scalar(
            select(EnvironmentalRecord)
            .where(EnvironmentalRecord.farm_id == farm.id)
            .order_by(EnvironmentalRecord.recorded_at.desc())
        )
    flags = list(assess_environment(latest))
    weather_data = get_weather(farm)
    if weather_data.get("available"):
        temp = weather_data.get("temperature_c")
        humidity = weather_data.get("humidity_pct")
        if temp is not None and temp >= 40:
            flags.append({"code": "forecast_heat", "severity": "high", "message": "Live weather indicates high heat — provide shade and water."})
        if humidity is not None and humidity >= 85:
            flags.append({"code": "forecast_humidity", "severity": "medium", "message": "High live humidity — improve shed ventilation."})
    return {
        "flags": flags,
        "latest_observation": EnvironmentRecordOut.model_validate(latest).model_dump(mode="json") if latest else None,
        "weather": weather_data,
        "disclaimer": "Environmental observations identify risk factors only; they never confirm a disease.",
    }
