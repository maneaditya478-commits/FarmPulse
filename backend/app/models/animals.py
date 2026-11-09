"""Species, breeds, animals and production records."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class Species(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "species"

    code: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(60), nullable=False)
    name_hi: Mapped[str] = mapped_column(String(60), nullable=False)
    name_mr: Mapped[str] = mapped_column(String(60), nullable=False)
    icon: Mapped[str] = mapped_column(String(20), default="paw-print", nullable=False)
    milk_bearing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    egg_bearing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    profile: Mapped[dict | None] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    breeds: Mapped[list[Breed]] = relationship(back_populates="species")


class Breed(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "breeds"

    species_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("species.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(30))
    origin: Mapped[str | None] = mapped_column(String(120))

    species: Mapped[Species] = relationship(back_populates="breeds")
    __table_args__ = ()


class Animal(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "animals"

    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    species_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("species.id"), index=True)
    breed_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("breeds.id"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    tag_code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    sex: Mapped[str] = mapped_column(String(10), default="female", nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    color: Mapped[str | None] = mapped_column(String(60))
    photo_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="active", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    farm: Mapped["Farm"] = relationship(back_populates="animals")  # noqa: F821
    species: Mapped[Species] = relationship()
    breed: Mapped[Breed | None] = relationship()
    identifiers: Mapped[list[AnimalIdentifier]] = relationship(back_populates="animal", cascade="all, delete-orphan")

    @property
    def age_months(self) -> int | None:
        if not self.birth_date:
            return None
        today = date.today()
        return (today.year - self.birth_date.year) * 12 + today.month - self.birth_date.month

    @property
    def species_code(self) -> str:
        return self.species.code if self.species else ""


class AnimalIdentifier(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "animal_identifiers"

    animal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True
    )
    identifier_type: Mapped[str] = mapped_column(String(20), default="qr", nullable=False)
    identifier_value: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    qr_payload: Mapped[str | None] = mapped_column(String(300))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    animal: Mapped[Animal] = relationship(back_populates="identifiers")


class BreedingRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "breeding_records"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    sire: Mapped[str | None] = mapped_column(String(120))
    pregnancy_confirmed: Mapped[bool | None] = mapped_column(Boolean)
    expected_delivery: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class MilkProduction(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "milk_production"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    record_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    session: Mapped[str] = mapped_column(String(10), default="morning", nullable=False)
    litres: Mapped[float] = mapped_column(Float, nullable=False)
    fat_pct: Mapped[float | None] = mapped_column(Float)
    price_per_litre: Mapped[float | None] = mapped_column(Float)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class EggProduction(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "egg_production"

    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    record_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    eggs_count: Mapped[int] = mapped_column(Integer, nullable=False)
    broken_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_per_egg: Mapped[float | None] = mapped_column(Float)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
