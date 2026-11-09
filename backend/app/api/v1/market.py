"""District-wise livestock market intelligence with source attribution."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.models import LivestockMarketPrice, Species, User
from app.schemas.domain import MarketPriceCreate, MarketPriceOut

router = APIRouter(prefix="/market", tags=["Market Intelligence"])


@router.get("/prices", response_model=list[MarketPriceOut])
def list_prices(
    district: str | None = None,
    species_id: uuid.UUID | None = None,
    category: str | None = None,
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=60, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LivestockMarketPrice]:
    since = date.today() - timedelta(days=days)
    stmt = select(LivestockMarketPrice).where(
        LivestockMarketPrice.observed_on >= since, LivestockMarketPrice.observed_on <= date.today()
    )
    if district:
        stmt = stmt.where(LivestockMarketPrice.district.ilike(f"%{district}%"))
    if species_id:
        stmt = stmt.where(LivestockMarketPrice.species_id == species_id)
    if category:
        stmt = stmt.where(LivestockMarketPrice.category.ilike(f"%{category}%"))
    return list(db.scalars(stmt.order_by(LivestockMarketPrice.observed_on.desc()).limit(limit)).all())


@router.get("/trends")
def market_trends(
    district: str,
    category: str,
    days: int = Query(default=90, ge=7, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    since = date.today() - timedelta(days=days)
    rows = db.scalars(
        select(LivestockMarketPrice)
        .where(
            LivestockMarketPrice.district.ilike(district),
            LivestockMarketPrice.category.ilike(f"%{category}%"),
            LivestockMarketPrice.observed_on >= since,
        )
        .order_by(LivestockMarketPrice.observed_on)
    ).all()
    buckets: dict[date, list[LivestockMarketPrice]] = {}
    for row in rows:
        buckets.setdefault(row.observed_on, []).append(row)
    series = []
    for day, entries in buckets.items():
        series.append(
            {
                "date": day.isoformat(),
                "price_per_unit": round(sum(entry.price_per_unit for entry in entries) / len(entries), 2),
                "unit": entries[0].unit,
                "samples": len(entries),
                "sources": sorted({entry.source for entry in entries}),
                "is_demo": any(entry.is_demo for entry in entries),
            }
        )
    return {
        "district": district,
        "category": category,
        "series": series,
        "sources": sorted({row.source for row in rows}),
        "demo_data": any(row.is_demo for row in rows),
        "disclaimer": "Prices are informational. Verify at the local market before any transaction.",
    }


@router.get("/sources")
def market_sources(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> dict:
    rows = db.scalars(
        select(LivestockMarketPrice).order_by(LivestockMarketPrice.observed_on.desc())
    ).all()
    latest: dict[str, dict] = {}
    for row in rows:
        if row.source not in latest:
            latest[row.source] = {
                "source": row.source,
                "source_url": row.source_url,
                "is_demo": row.is_demo,
                "latest_observed_on": row.observed_on.isoformat(),
                "districts": {row.district},
            }
        else:
            latest[row.source]["districts"].add(row.district)
    sources = []
    for item in latest.values():
        item["districts"] = sorted(item["districts"])
        sources.append(item)
    return {
        "sources": sources,
        "note": "Demonstration rows are explicitly flagged and are not live mandi feeds.",
    }


@router.get("/categories")
def market_categories(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[dict]:
    species = {row.id: row for row in db.scalars(select(Species)).all()}
    rows = db.scalars(select(LivestockMarketPrice).order_by(LivestockMarketPrice.category)).all()
    seen: set[str] = set()
    result = []
    for row in rows:
        if row.category in seen:
            continue
        seen.add(row.category)
        result.append(
            {
                "category": row.category,
                "unit": row.unit,
                "species_code": species[row.species_id].code if row.species_id in species else None,
            }
        )
    return result


@router.post("/prices", response_model=MarketPriceOut, status_code=status.HTTP_201_CREATED)
def create_price(
    payload: MarketPriceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> LivestockMarketPrice:
    price = LivestockMarketPrice(**payload.model_dump())
    db.add(price)
    record_audit(db, actor=user, action="market_price.created", entity_type="livestock_market_price", entity_id=price.id)
    db.commit()
    db.refresh(price)
    return price


@router.delete("/prices/{price_id}")
def delete_price(
    price_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
) -> dict:
    price = db.get(LivestockMarketPrice, price_id)
    if not price:
        raise AppError(status.HTTP_404_NOT_FOUND, "price_not_found", "Price record not found")
    db.delete(price)
    record_audit(db, actor=user, action="market_price.deleted", entity_type="livestock_market_price", entity_id=price_id)
    db.commit()
    return {"message": "Price deleted"}
