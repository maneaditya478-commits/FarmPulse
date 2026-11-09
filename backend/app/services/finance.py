"""Financial impact estimation with explicit assumptions and data attribution."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Animal,
    EggProduction,
    FinancialRecord,
    HealthCase,
    MilkProduction,
)
from app.services.access import accessible_farm_ids, animal_query

MILK_FALLBACK_PRICE = 35.0
EGG_FALLBACK_PRICE = 6.0
ASSUMED_AFFECTED_DAYS = 3
ASSUMED_YIELD_REDUCTION = 0.3


def _scope_farm_ids(db: Session, user) -> list[uuid.UUID] | None:
    if user.role == "admin":
        return None
    return accessible_farm_ids(db, user) or []


def financial_summary(db: Session, user, period_days: int = 30) -> dict:
    today = date.today()
    start = today - timedelta(days=period_days - 1)
    farm_ids = _scope_farm_ids(db, user)

    milk_stmt = select(MilkProduction).where(MilkProduction.record_date >= start)
    egg_stmt = select(EggProduction).where(EggProduction.record_date >= start)
    fin_stmt = select(FinancialRecord).where(FinancialRecord.record_date >= start)
    animal_stmt = select(Animal)
    if farm_ids is not None:
        # Animal-level data follows animal access (vets see only assigned animals,
        # not every animal on a farm that happens to host an assigned case).
        scoped_animal_ids = [animal.id for animal in db.scalars(animal_query(db, user)).all()]
        milk_stmt = milk_stmt.where(MilkProduction.animal_id.in_(scoped_animal_ids))
        egg_stmt = egg_stmt.where(EggProduction.farm_id.in_(farm_ids))
        fin_stmt = fin_stmt.where(FinancialRecord.farm_id.in_(farm_ids))
        animal_stmt = animal_stmt.where(Animal.id.in_(scoped_animal_ids))

    milk_rows = db.scalars(milk_stmt).all()
    egg_rows = db.scalars(egg_stmt).all()
    finance_rows = db.scalars(fin_stmt).all()
    animals = db.scalars(animal_stmt).all()

    milk_revenue = 0.0
    milk_by_day: dict[date, float] = defaultdict(float)
    for row in milk_rows:
        price = row.price_per_litre if row.price_per_litre is not None else MILK_FALLBACK_PRICE
        value = row.litres * price
        milk_revenue += value
        milk_by_day[row.record_date] += value
    egg_revenue = 0.0
    egg_by_day: dict[date, float] = defaultdict(float)
    for row in egg_rows:
        price = row.price_per_egg if row.price_per_egg is not None else EGG_FALLBACK_PRICE
        value = row.eggs_count * price
        egg_revenue += value
        egg_by_day[row.record_date] += value

    other_income = 0.0
    feed_expense = 0.0
    vet_expense = 0.0
    other_expense = 0.0
    expense_by_day: dict[date, float] = defaultdict(float)
    income_by_day: dict[date, float] = defaultdict(float)
    for row in finance_rows:
        if row.record_type == "income":
            if row.category == "milk":
                continue  # derived from production records to avoid double counting
            if row.category == "egg":
                continue
            other_income += row.amount
            income_by_day[row.record_date] += row.amount
        else:
            if row.category == "feed":
                feed_expense += row.amount
            elif row.category in ("veterinary", "medicine"):
                vet_expense += row.amount
            else:
                other_expense += row.amount
            expense_by_day[row.record_date] += row.amount

    for day, value in milk_by_day.items():
        income_by_day[day] += value
    for day, value in egg_by_day.items():
        income_by_day[day] += value

    net = milk_revenue + egg_revenue + other_income - feed_expense - vet_expense - other_expense

    # Estimated production revenue difference for unresolved cases (explicitly an estimate).
    active_cases = db.scalars(
        select(HealthCase).where(
            HealthCase.status.in_(("reported", "triaged", "assigned", "in_progress")),
            HealthCase.severity.in_(("medium", "high", "critical")),
        )
    ).all()
    animal_map = {animal.id: animal for animal in animals}
    daily_milk_by_animal: dict[uuid.UUID, float] = defaultdict(float)
    days_with_milk: dict[uuid.UUID, set[date]] = defaultdict(set)
    for row in milk_rows:
        daily_milk_by_animal[row.animal_id] += row.litres
        days_with_milk[row.animal_id].add(row.record_date)
    estimated_loss = 0.0
    affected: list[str] = []
    for case in active_cases:
        if case.animal_id not in animal_map:
            continue
        total = daily_milk_by_animal.get(case.animal_id, 0.0)
        day_count = max(len(days_with_milk.get(case.animal_id, set())), 1)
        daily_avg = total / day_count
        if daily_avg <= 0:
            continue
        loss = daily_avg * MILK_FALLBACK_PRICE * ASSUMED_AFFECTED_DAYS * ASSUMED_YIELD_REDUCTION
        estimated_loss += loss
        animal = animal_map[case.animal_id]
        affected.append(f"{animal.name} ({case.severity})")

    daily_series: list[dict] = []
    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        daily_series.append(
            {
                "date": day.isoformat(),
                "income": round(income_by_day.get(day, 0.0), 2),
                "expense": round(expense_by_day.get(day, 0.0), 2),
            }
        )

    assumptions = [
        f"Milk is valued at ₹{MILK_FALLBACK_PRICE:.0f}/litre when a recorded price is unavailable.",
        f"Eggs are valued at ₹{EGG_FALLBACK_PRICE:.0f}/egg when a recorded price is unavailable.",
        "Milk and egg revenue are derived from production records; matching financial income entries are not double counted.",
        f"Production revenue difference assumes {ASSUMED_AFFECTED_DAYS} affected days at {int(ASSUMED_YIELD_REDUCTION * 100)}% yield reduction for unresolved medium/high-severity cases.",
        "This is an estimated revenue difference, not a confirmed net loss or an insurance claim value.",
    ]
    if affected:
        assumptions.append("Cases contributing to the estimate: " + ", ".join(affected) + ".")

    return {
        "period_days": period_days,
        "milk_revenue": round(milk_revenue, 2),
        "egg_revenue": round(egg_revenue, 2),
        "other_income": round(other_income, 2),
        "feed_expense": round(feed_expense, 2),
        "vet_expense": round(vet_expense, 2),
        "other_expense": round(other_expense, 2),
        "net": round(net, 2),
        "estimated_loss": round(estimated_loss, 2),
        "assumptions": assumptions,
        "daily_series": daily_series,
        "attribution": "Estimated revenue difference based on recorded production and expenses; not an audited loss statement.",
    }
