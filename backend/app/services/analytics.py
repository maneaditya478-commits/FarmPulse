"""Role-scoped analytics aggregation."""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Animal,
    EggProduction,
    EnvironmentalRecord,
    FeedRecord,
    HealthCase,
    MilkProduction,
    Species,
    Vaccination,
    VetVisit,
)
from app.services.access import accessible_farm_ids
from app.services.finance import financial_summary
from app.services.weather import assess_environment


def _farms(db: Session, user) -> list[uuid.UUID] | None:
    if user.role == "admin":
        return None
    return accessible_farm_ids(db, user) or []


def overview(db: Session, user) -> dict:
    farm_ids = _farms(db, user)
    today = date.today()
    start_30 = today - timedelta(days=29)

    animal_stmt = select(Animal).where(Animal.status == "active")
    if farm_ids is not None:
        animal_stmt = animal_stmt.where(Animal.farm_id.in_(farm_ids))
    animals = db.scalars(animal_stmt).all()
    animal_ids = [animal.id for animal in animals]

    species_rows = db.execute(
        select(Species.code, Species.name_en, func.count(Animal.id))
        .join(Animal, Animal.species_id == Species.id)
        .where(Animal.id.in_(animal_ids) if animal_ids else False)
        .group_by(Species.code, Species.name_en)
    ).all()

    def case_filter(stmt):
        if user.role in ("veterinarian", "paravet"):
            from app.models import Veterinarian

            vet = db.scalar(select(Veterinarian).where(Veterinarian.user_id == user.id))
            if not vet:
                return stmt.where(False)
            return stmt.where(HealthCase.assigned_vet_id == vet.id)
        if user.role == "farmer":
            return stmt.where(HealthCase.farmer_id == user.id)
        if user.role == "cooperative":
            from app.services.access import cooperative_farmer_ids

            ids = cooperative_farmer_ids(db, user)
            return stmt.where(HealthCase.farmer_id.in_(ids)) if ids else stmt.where(False)
        return stmt

    active_cases = db.scalars(case_filter(select(HealthCase).where(HealthCase.status.in_(("reported", "triaged", "assigned", "in_progress"))))).all()
    critical_cases = [case for case in active_cases if case.severity in ("high", "critical")]

    vaccination_rows = []
    if animal_ids:
        vaccination_rows = db.execute(
            select(Vaccination.status, func.count(Vaccination.id))
            .where(Vaccination.animal_id.in_(animal_ids))
            .group_by(Vaccination.status)
        ).all()
    vaccination_counts = {status: count for status, count in vaccination_rows}

    feed_count = 0
    milk_total = 0.0
    egg_total = 0
    if animal_ids:
        feed_count = db.scalar(
            select(func.count(FeedRecord.id)).where(
                FeedRecord.animal_id.in_(animal_ids), FeedRecord.recorded_at >= datetime.now(UTC) - timedelta(days=30)
            )
        ) or 0
        milk_total = db.scalar(
            select(func.coalesce(func.sum(MilkProduction.litres), 0)).where(
                MilkProduction.animal_id.in_(animal_ids), MilkProduction.record_date >= start_30
            )
        ) or 0
    if farm_ids is not None:
        egg_total = db.scalar(
            select(func.coalesce(func.sum(EggProduction.eggs_count), 0)).where(
                EggProduction.farm_id.in_(farm_ids), EggProduction.record_date >= start_30
            )
        ) or 0
    else:
        egg_total = db.scalar(
            select(func.coalesce(func.sum(EggProduction.eggs_count), 0)).where(EggProduction.record_date >= start_30)
        ) or 0

    appointment_stmt = select(VetVisit).where(VetVisit.status.in_(("requested", "scheduled")))
    if user.role in ("veterinarian", "paravet"):
        from app.models import Veterinarian

        vet = db.scalar(select(Veterinarian).where(Veterinarian.user_id == user.id))
        appointment_stmt = appointment_stmt.where(VetVisit.vet_id == vet.id) if vet else appointment_stmt.where(False)
    elif user.role == "farmer":
        appointment_stmt = appointment_stmt.join(HealthCase, VetVisit.case_id == HealthCase.id).where(
            HealthCase.farmer_id == user.id
        )
    elif user.role == "cooperative":
        from app.services.access import cooperative_farmer_ids

        ids = cooperative_farmer_ids(db, user)
        appointment_stmt = (
            appointment_stmt.join(HealthCase, VetVisit.case_id == HealthCase.id).where(HealthCase.farmer_id.in_(ids))
            if ids
            else appointment_stmt.where(False)
        )
    upcoming_appointments = len(db.scalars(appointment_stmt).all())

    summary = financial_summary(db, user, 30)

    alerts: list[dict] = []
    overdue = vaccination_counts.get("overdue", 0)
    if overdue:
        alerts.append({"type": "vaccination", "severity": "high", "message": f"{overdue} vaccination(s) overdue"})
    due = vaccination_counts.get("due", 0)
    if due:
        alerts.append({"type": "vaccination", "severity": "medium", "message": f"{due} vaccination(s) due within 30 days"})
    if critical_cases:
        alerts.append({"type": "health", "severity": "critical", "message": f"{len(critical_cases)} high-priority health case(s) open"})
    # For admin, aggregate environmental flags across all farms; for others, use their farm scope
    if farm_ids is None:
        # Admin: get latest env record per farm and assess all
        env_records = db.scalars(
            select(EnvironmentalRecord)
            .distinct(EnvironmentalRecord.farm_id)
            .order_by(EnvironmentalRecord.farm_id, EnvironmentalRecord.recorded_at.desc())
        ).all()
        env = env_records  # pass list to assess_environment
    elif farm_ids:
        env = db.scalar(
            select(EnvironmentalRecord).where(EnvironmentalRecord.farm_id.in_(farm_ids)).order_by(EnvironmentalRecord.recorded_at.desc())
        )
    else:
        env = None
    for flag in assess_environment(env):
        alerts.append({"type": "environment", "severity": flag["severity"], "message": flag["message"]})

    return {
        "total_animals": len(animals),
        "species_distribution": [
            {"code": code, "name": name, "count": count} for code, name, count in species_rows
        ],
        "active_health_cases": len(active_cases),
        "critical_cases": len(critical_cases),
        "upcoming_vaccinations": vaccination_counts.get("due", 0),
        "overdue_vaccinations": overdue,
        "nutrition_records_30d": feed_count,
        "upcoming_appointments": upcoming_appointments,
        "milk_litres_30d": round(float(milk_total), 1),
        "egg_count_30d": int(egg_total),
        "estimated_monthly_income": round(summary["milk_revenue"] + summary["egg_revenue"] + summary["other_income"], 2),
        "estimated_monthly_expense": round(summary["feed_expense"] + summary["vet_expense"] + summary["other_expense"], 2),
        "alerts": alerts,
        "generated_at": datetime.now(UTC),
        "is_sample": any(animal.is_sample for animal in animals) if animals else False,
    }
