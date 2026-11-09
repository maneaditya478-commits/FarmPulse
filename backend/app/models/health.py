"""Health cases, observations, vaccination and veterinary visits."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class HealthCase(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_cases"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    farmer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reported_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    case_code: Mapped[str] = mapped_column(String(30), unique=True, index=True, nullable=False)
    symptom_summary: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="low", index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="reported", index=True, nullable=False)
    requires_vet: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    escalation_reason: Mapped[str | None] = mapped_column(Text)
    triage: Mapped[dict | None] = mapped_column(JSON, default=dict)
    assigned_vet_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("veterinarians.id", ondelete="SET NULL"), index=True
    )
    vet_diagnosis: Mapped[str | None] = mapped_column(Text)
    vet_treatment: Mapped[str | None] = mapped_column(Text)
    vet_notes: Mapped[str | None] = mapped_column(Text)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    observations: Mapped[list[HealthObservation]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="HealthObservation.observed_at"
    )
    visits: Mapped[list[VetVisit]] = relationship(back_populates="case", cascade="all, delete-orphan")
    animal: Mapped["Animal"] = relationship()  # noqa: F821
    farmer: Mapped["User"] = relationship(foreign_keys=[farmer_id])  # noqa: F821
    assigned_vet: Mapped[Veterinarian | None] = relationship(foreign_keys=[assigned_vet_id])


class HealthObservation(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "health_observations"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("health_cases.id", ondelete="CASCADE"), index=True)
    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    appetite: Mapped[str | None] = mapped_column(String(20))
    temperature_c: Mapped[float | None] = mapped_column(Float)
    milk_change: Mapped[str | None] = mapped_column(String(40))
    symptoms: Mapped[list | None] = mapped_column(JSON, default=list)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    case: Mapped[HealthCase] = relationship(back_populates="observations")


class HealthRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "health_records"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("health_cases.id", ondelete="SET NULL"), index=True
    )
    record_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    professional_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("veterinarians.id"))
    approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class VaccineCatalog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vaccine_catalog"

    species_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("species.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    disease: Mapped[str] = mapped_column(String(120), nullable=False)
    age_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    booster_days: Mapped[int | None] = mapped_column(Integer)
    source_reference: Mapped[str] = mapped_column(String(300), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Vaccination(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vaccinations"

    animal_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    vaccine_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("vaccine_catalog.id"), index=True)
    administered_on: Mapped[date | None] = mapped_column(Date)
    due_on: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="due", index=True, nullable=False)
    batch_no: Mapped[str | None] = mapped_column(String(60))
    administered_by: Mapped[str | None] = mapped_column(String(160))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("veterinarians.id"))
    certificate_ref: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    animal: Mapped["Animal"] = relationship()  # noqa: F821
    vaccine: Mapped[VaccineCatalog] = relationship()


class VetVisit(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vet_visits"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("health_cases.id", ondelete="CASCADE"), index=True)
    vet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("veterinarians.id", ondelete="CASCADE"), index=True
    )
    visit_type: Mapped[str] = mapped_column(String(20), default="teleconsult", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="requested", index=True, nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    case: Mapped[HealthCase] = relationship(back_populates="visits")
    vet: Mapped[Veterinarian] = relationship()
