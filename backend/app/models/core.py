"""Users, farms, veterinary network, platform operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(30), index=True, nullable=False, default="farmer")
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")
    village: Mapped[str | None] = mapped_column(String(120))
    district: Mapped[str | None] = mapped_column(String(120), index=True)
    state: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    farms: Mapped[list[Farm]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    veterinarian: Mapped[Veterinarian | None] = relationship(back_populates="user", uselist=False)


class Farm(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "farms"

    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    village: Mapped[str] = mapped_column(String(120), nullable=False)
    district: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    pincode: Mapped[str | None] = mapped_column(String(12))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    size_acres: Mapped[float | None] = mapped_column(Float)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    owner: Mapped[User] = relationship(back_populates="farms")
    animals: Mapped[list["Animal"]] = relationship(back_populates="farm")  # noqa: F821


class Veterinarian(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "veterinarians"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    registration_no: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    qualification: Mapped[str] = mapped_column(String(160), nullable=False)
    specialization: Mapped[str | None] = mapped_column(String(160))
    clinic_name: Mapped[str | None] = mapped_column(String(160))
    district: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    state: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    availability: Mapped[str] = mapped_column(String(20), default="available", nullable=False)
    service_radius_km: Mapped[float] = mapped_column(Float, default=25.0, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rating: Mapped[float | None] = mapped_column(Float)
    languages: Mapped[list | None] = mapped_column(JSON, default=list)

    user: Mapped[User] = relationship(back_populates="veterinarian")


class CooperativeMembership(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "cooperative_memberships"
    __table_args__ = (UniqueConstraint("cooperative_id", "farmer_id", name="uq_coop_farmer"),)

    cooperative_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    member_code: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20), default="in_app", nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(5), default="en", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    related_type: Mapped[str | None] = mapped_column(String(40))
    related_id: Mapped[str | None] = mapped_column(String(48))
    meta: Mapped[dict | None] = mapped_column(JSON, default=dict)


class AIInteraction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_interactions"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    animal_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("animals.id", ondelete="SET NULL"), index=True
    )
    session_id: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_mode: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    detected_language: Mapped[str] = mapped_column(String(5), default="en", nullable=False)
    intent: Mapped[str | None] = mapped_column(String(50), index=True)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    workflow: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    agents_used: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AgentApproval(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "agent_approvals"

    interaction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ai_interactions.id", ondelete="SET NULL"), index=True
    )
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("health_cases.id", ondelete="CASCADE"), index=True
    )
    agent_name: Mapped[str] = mapped_column(String(60), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    actor_role: Mapped[str | None] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(48), index=True)
    detail: Mapped[dict | None] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class SyncOperation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "sync_operations"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="applied", index=True, nullable=False)
    server_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class KnowledgeDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "knowledge_documents"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    species_code: Mapped[str | None] = mapped_column(String(30), index=True)
    embedding: Mapped[list | None] = mapped_column(JSON)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
