"""Financial records, production records and estimates."""

import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import Animal, EggProduction, Farm, FinancialRecord, MilkProduction, User
from app.schemas.domain import (
    EggRecordCreate,
    EggRecordOut,
    FinancialRecordCreate,
    FinancialRecordOut,
    FinancialSummary,
    MilkRecordCreate,
    MilkRecordOut,
)
from app.services.access import accessible_farm_ids, animal_query, get_animal_for_user, primary_farm
from app.services.finance import financial_summary

router = APIRouter(prefix="/finance", tags=["Finance"])


def _scope_farm_ids(db: Session, user: User) -> list[uuid.UUID] | None:
    if user.role == "admin":
        return None
    return accessible_farm_ids(db, user) or []


@router.get("/summary", response_model=FinancialSummary)
def summary(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return financial_summary(db, user, period_days=days)


@router.get("/records", response_model=list[FinancialRecordOut])
def list_records(
    days: int = Query(default=90, ge=1, le=365),
    record_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FinancialRecord]:
    since = date.today() - timedelta(days=days)
    stmt = select(FinancialRecord).where(FinancialRecord.record_date >= since).order_by(FinancialRecord.record_date.desc())
    farm_ids = _scope_farm_ids(db, user)
    if farm_ids is not None:
        stmt = stmt.where(FinancialRecord.farm_id.in_(farm_ids))
    if record_type:
        stmt = stmt.where(FinancialRecord.record_type == record_type)
    return list(db.scalars(stmt.limit(300)).all())


@router.post("/records", response_model=FinancialRecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    payload: FinancialRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "admin")),
) -> FinancialRecord:
    farm = db.get(Farm, payload.farm_id) if payload.farm_id else primary_farm(db, user)
    if not farm:
        raise AppError(status.HTTP_400_BAD_REQUEST, "farm_required", "No farm is registered for this account")
    if user.role != "admin" and farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot add financial records to this farm")
    if payload.animal_id:
        get_animal_for_user(db, user, payload.animal_id)
    record = FinancialRecord(
        farm_id=farm.id,
        animal_id=payload.animal_id,
        record_date=payload.record_date or date.today(),
        record_type=payload.record_type,
        category=payload.category,
        amount=payload.amount,
        description=payload.description,
        is_estimate=payload.is_estimate or payload.record_type == "estimate",
        assumptions=payload.assumptions,
    )
    db.add(record)
    record_audit(db, actor=user, action="financial_record.created", entity_type="financial_record", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record


@router.get("/milk", response_model=list[MilkRecordOut])
def list_milk(
    animal_id: uuid.UUID | None = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MilkProduction]:
    since = date.today() - timedelta(days=days)
    stmt = select(MilkProduction).where(MilkProduction.record_date >= since).order_by(MilkProduction.record_date.desc())
    if animal_id:
        get_animal_for_user(db, user, animal_id)
        stmt = stmt.where(MilkProduction.animal_id == animal_id)
    else:
        ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:200]]
        stmt = stmt.where(MilkProduction.animal_id.in_(ids))
    return list(db.scalars(stmt.limit(500)).all())


@router.post("/milk", response_model=MilkRecordOut, status_code=status.HTTP_201_CREATED)
def create_milk(
    payload: MilkRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> MilkProduction:
    animal = get_animal_for_user(db, user, payload.animal_id)
    record = MilkProduction(
        animal_id=animal.id,
        record_date=payload.record_date or date.today(),
        session=payload.session,
        litres=payload.litres,
        fat_pct=payload.fat_pct,
        price_per_litre=payload.price_per_litre,
        is_sample=animal.is_sample,
    )
    db.add(record)
    record_audit(db, actor=user, action="milk.recorded", entity_type="milk_production", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record


@router.get("/eggs", response_model=list[EggRecordOut])
def list_eggs(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EggProduction]:
    since = date.today() - timedelta(days=days)
    stmt = select(EggProduction).where(EggProduction.record_date >= since).order_by(EggProduction.record_date.desc())
    farm_ids = _scope_farm_ids(db, user)
    if farm_ids is not None:
        stmt = stmt.where(EggProduction.farm_id.in_(farm_ids))
    return list(db.scalars(stmt.limit(300)).all())


@router.post("/eggs", response_model=EggRecordOut, status_code=status.HTTP_201_CREATED)
def create_eggs(
    payload: EggRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> EggProduction:
    farm = db.get(Farm, payload.farm_id) if payload.farm_id else primary_farm(db, user)
    if not farm:
        raise AppError(status.HTTP_400_BAD_REQUEST, "farm_required", "No farm is registered for this account")
    if user.role != "admin" and farm.owner_id != user.id:
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "You cannot add production records to this farm")
    record = EggProduction(
        farm_id=farm.id,
        record_date=payload.record_date or date.today(),
        eggs_count=payload.eggs_count,
        broken_count=payload.broken_count,
        price_per_egg=payload.price_per_egg,
    )
    db.add(record)
    record_audit(db, actor=user, action="eggs.recorded", entity_type="egg_production", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record


@router.get("/production-trends")
def production_trends(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    since = date.today() - timedelta(days=days - 1)
    animal_ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:500]]
    milk_rows = db.execute(
        select(MilkProduction.record_date, func.sum(MilkProduction.litres))
        .where(MilkProduction.record_date >= since, MilkProduction.animal_id.in_(animal_ids))
        .group_by(MilkProduction.record_date)
        .order_by(MilkProduction.record_date)
    ).all() if animal_ids else []
    farm_ids = _scope_farm_ids(db, user)
    egg_stmt = select(EggProduction.record_date, func.sum(EggProduction.eggs_count)).where(EggProduction.record_date >= since)
    if farm_ids is not None:
        egg_stmt = egg_stmt.where(EggProduction.farm_id.in_(farm_ids))
    egg_rows = db.execute(egg_stmt.group_by(EggProduction.record_date).order_by(EggProduction.record_date)).all()
    return {
        "milk": [{"date": day.isoformat(), "litres": round(float(total or 0), 2)} for day, total in milk_rows],
        "eggs": [{"date": day.isoformat(), "count": int(total or 0)} for day, total in egg_rows],
        "note": "Production series derive only from recorded farm data.",
    }
