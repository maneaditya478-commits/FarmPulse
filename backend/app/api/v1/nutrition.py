"""Nutrition profiles, feed and water records."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import Animal, FeedRecord, FinancialRecord, NutritionProfile, User, WaterRecord
from app.schemas.domain import (
    FeedRecordCreate,
    FeedRecordOut,
    NutritionProfileOut,
    WaterRecordCreate,
    WaterRecordOut,
)
from app.services.access import animal_query, get_animal_for_user

router = APIRouter(prefix="/nutrition", tags=["Nutrition"])


@router.get("/profiles", response_model=list[NutritionProfileOut])
def list_profiles(
    species_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[NutritionProfile]:
    stmt = select(NutritionProfile)
    if species_id:
        stmt = stmt.where(NutritionProfile.species_id == species_id)
    return list(db.scalars(stmt).all())


@router.get("/feed", response_model=list[FeedRecordOut])
def list_feed(
    animal_id: uuid.UUID | None = None,
    days: int = Query(default=14, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FeedRecord]:
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(FeedRecord).where(FeedRecord.recorded_at >= since).order_by(FeedRecord.recorded_at.desc())
    if animal_id:
        get_animal_for_user(db, user, animal_id)
        stmt = stmt.where(FeedRecord.animal_id == animal_id)
    else:
        ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:200]]
        stmt = stmt.where(FeedRecord.animal_id.in_(ids))
    return list(db.scalars(stmt.limit(200)).all())


@router.post("/feed", response_model=FeedRecordOut, status_code=status.HTTP_201_CREATED)
def create_feed(
    payload: FeedRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> FeedRecord:
    animal = get_animal_for_user(db, user, payload.animal_id)
    record = FeedRecord(
        animal_id=animal.id,
        recorded_at=payload.recorded_at or datetime.now(UTC),
        feed_type=payload.feed_type,
        quantity_kg=payload.quantity_kg,
        mineral_supplement=payload.mineral_supplement,
        cost=payload.cost,
        notes=payload.notes,
        recorded_by=user.id,
        is_sample=animal.is_sample,
    )
    db.add(record)
    if payload.cost:
        db.add(
            FinancialRecord(
                farm_id=animal.farm_id,
                animal_id=animal.id,
                record_date=(payload.recorded_at or datetime.now(UTC)).date(),
                record_type="expense",
                category="feed",
                amount=payload.cost,
                description=f"Feed: {payload.feed_type} {payload.quantity_kg} kg",
                is_sample=animal.is_sample,
            )
        )
    record_audit(db, actor=user, action="feed.recorded", entity_type="feed_record", entity_id=record.id, request=request)
    db.commit()
    db.refresh(record)
    return record


@router.get("/water", response_model=list[WaterRecordOut])
def list_water(
    animal_id: uuid.UUID | None = None,
    days: int = Query(default=14, ge=1, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WaterRecord]:
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(WaterRecord).where(WaterRecord.recorded_at >= since).order_by(WaterRecord.recorded_at.desc())
    if animal_id:
        get_animal_for_user(db, user, animal_id)
        stmt = stmt.where(WaterRecord.animal_id == animal_id)
    else:
        ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:200]]
        stmt = stmt.where(WaterRecord.animal_id.in_(ids))
    return list(db.scalars(stmt.limit(200)).all())


@router.post("/water", response_model=WaterRecordOut, status_code=status.HTTP_201_CREATED)
def create_water(
    payload: WaterRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> WaterRecord:
    animal = get_animal_for_user(db, user, payload.animal_id)
    record = WaterRecord(
        animal_id=animal.id,
        recorded_at=payload.recorded_at or datetime.now(UTC),
        litres=payload.litres,
        source=payload.source,
        quality_note=payload.quality_note,
        recorded_by=user.id,
        is_sample=animal.is_sample,
    )
    db.add(record)
    record_audit(db, actor=user, action="water.recorded", entity_type="water_record", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record


@router.get("/summary")
def nutrition_summary(
    animal_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if animal_id:
        animals = [get_animal_for_user(db, user, animal_id)]
    else:
        animals = db.scalars(animal_query(db, user)).all()[:50]
    ids = [animal.id for animal in animals]
    since = datetime.now(UTC) - timedelta(days=14)
    feeds = db.scalars(
        select(FeedRecord).where(FeedRecord.animal_id.in_(ids), FeedRecord.recorded_at >= since)
    ).all() if ids else []
    waters = db.scalars(
        select(WaterRecord).where(WaterRecord.animal_id.in_(ids), WaterRecord.recorded_at >= since)
    ).all() if ids else []
    species_id = animals[0].species_id if animals else None
    profile = None
    if species_id:
        profile = db.scalar(
            select(NutritionProfile).where(NutritionProfile.species_id == species_id, NutritionProfile.stage == "maintenance")
        ) or db.scalar(select(NutritionProfile).where(NutritionProfile.species_id == species_id))
    gaps = []
    if not feeds:
        gaps.append("No feed records in the last 14 days")
    if not waters:
        gaps.append("No water observations recorded")
    if any(not animal.weight_kg for animal in animals):
        gaps.append("Body weight missing for one or more animals")
    return {
        "animals": len(animals),
        "feed_records_14d": len(feeds),
        "feed_quantity_kg_14d": round(sum(row.quantity_kg for row in feeds), 2),
        "feed_cost_14d": round(sum(row.cost or 0 for row in feeds), 2),
        "water_records_14d": len(waters),
        "water_litres_14d": round(sum(row.litres or 0 for row in waters), 2),
        "profile": NutritionProfileOut.model_validate(profile).model_dump() if profile else None,
        "gaps": gaps,
        "referral": "Specific dietary or medical decisions must be referred to a veterinarian or qualified animal nutrition professional.",
    }
