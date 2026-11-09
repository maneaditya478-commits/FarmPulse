"""Role-scoped analytics dashboard data."""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Animal, EggProduction, HealthCase, MilkProduction, User
from app.schemas.domain import AnalyticsOverview
from app.services.access import accessible_farm_ids, animal_query, cooperative_farmer_ids
from app.services.analytics import overview

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
def analytics_overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return overview(db, user)


@router.get("/trends")
def trends(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    since = date.today() - timedelta(days=days - 1)
    animal_ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()[:500]]
    milk_rows = (
        db.execute(
            select(MilkProduction.record_date, func.sum(MilkProduction.litres))
            .where(MilkProduction.record_date >= since, MilkProduction.animal_id.in_(animal_ids))
            .group_by(MilkProduction.record_date)
            .order_by(MilkProduction.record_date)
        ).all()
        if animal_ids
        else []
    )
    farm_ids = accessible_farm_ids(db, user)
    egg_stmt = select(EggProduction.record_date, func.sum(EggProduction.eggs_count)).where(EggProduction.record_date >= since)
    if farm_ids is not None:
        egg_stmt = egg_stmt.where(EggProduction.farm_id.in_(farm_ids))
    egg_rows = db.execute(egg_stmt.group_by(EggProduction.record_date).order_by(EggProduction.record_date)).all()

    case_stmt = select(HealthCase.opened_at, HealthCase.severity).where(
        HealthCase.opened_at >= datetime.combine(since, datetime.min.time()).replace(tzinfo=UTC)
    )
    if user.role == "farmer":
        case_stmt = case_stmt.where(HealthCase.farmer_id == user.id)
    elif user.role in ("veterinarian", "paravet"):
        from app.services.access import get_vet_profile

        vet = get_vet_profile(db, user)
        case_stmt = case_stmt.where(HealthCase.assigned_vet_id == vet.id) if vet else case_stmt.where(False)
    elif user.role == "cooperative":
        farmer_ids = cooperative_farmer_ids(db, user)
        case_stmt = case_stmt.where(HealthCase.farmer_id.in_(farmer_ids)) if farmer_ids else case_stmt.where(False)
    cases = db.execute(case_stmt).all()
    case_series: dict[str, dict[str, int]] = {}
    for opened_at, severity in cases:
        key = opened_at.date().isoformat()
        case_series.setdefault(key, {"total": 0, "high": 0})
        case_series[key]["total"] += 1
        if severity in ("high", "critical"):
            case_series[key]["high"] += 1

    return {
        "milk": [{"date": day.isoformat(), "litres": round(float(total or 0), 2)} for day, total in milk_rows],
        "eggs": [{"date": day.isoformat(), "count": int(total or 0)} for day, total in egg_rows],
        "health_cases": [{"date": day, **counts} for day, counts in sorted(case_series.items())],
        "period_days": days,
    }


@router.get("/species-distribution")
def species_distribution(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    from app.models import Species

    ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()]
    if not ids:
        return []
    rows = db.execute(
        select(Species.code, Species.name_en, func.count(Animal.id))
        .join(Animal, Animal.species_id == Species.id)
        .where(Animal.id.in_(ids))
        .group_by(Species.code, Species.name_en)
    ).all()
    return [{"code": code, "name": name, "count": count} for code, name, count in rows]
