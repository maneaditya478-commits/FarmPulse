"""Audit trail helper used by every mutating endpoint and agent action."""

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID | None,
    detail: dict[str, Any] | None = None,
    request: Request | None = None,
    commit: bool = False,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        detail=detail or {},
        ip_address=(request.client.host if request and request.client else None),
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry
