"""Nutrition, environment, market prices and financial records."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class NutritionProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "nutrition_profiles"

    species_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("species.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(30), default="maintenance", nullable=False)
    dry_matter_kg: Mapped[float | None] = mapped_column(Float)
    feed_guidance: Mapped[str] = mapped_column(Text, nullable=False)
    water_litres: Mapped[float | None] = mapped_column(Float)
    minerals: Mapped[str | None] = mapped_column(Text)
    reference_source: Mapped[str] = mapped_column(String(300), nullable=False)


class FeedRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "feed_records"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    feed_type: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    mineral_supplement: Mapped[str | None] = mapped_column(String(160))
    cost: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class WaterRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "water_records"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    litres: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str | None] = mapped_column(String(80))
    quality_note: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class EnvironmentalRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "environmental_records"

    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    humidity_pct: Mapped[float | None] = mapped_column(Float)
    weather: Mapped[str | None] = mapped_column(String(80))
    shed_cleanliness: Mapped[int | None] = mapped_column(Integer)
    water_available: Mapped[bool | None] = mapped_column(Boolean)
    sanitation_note: Mapped[str | None] = mapped_column(Text)
    risk_flags: Mapped[list | None] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(30), default="farmer_report", nullable=False)
    reported_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class LivestockMarketPrice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "livestock_market_prices"

    species_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("species.id"), index=True)
    category: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    breed: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    market_name: Mapped[str | None] = mapped_column(String(160))
    price_per_unit: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, default="per animal")
    observed_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class FinancialRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "financial_records"

    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    animal_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="SET NULL"), index=True
    )
    record_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    record_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    is_estimate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assumptions: Mapped[dict | None] = mapped_column(JSON)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
