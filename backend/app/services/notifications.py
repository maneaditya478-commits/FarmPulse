"""Notification creation with channel adapters.

In-app notifications are fully functional. SMS/WhatsApp/push adapters record the
outbound message and are marked `pending` unless a provider is configured — they are
never reported as delivered without a provider acknowledgement.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Notification, User

logger = logging.getLogger("alg.notifications")


def create_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    body: str,
    type: str = "general",
    language: str = "en",
    channel: str = "in_app",
    scheduled_at: datetime | None = None,
    related_type: str | None = None,
    related_id: str | uuid.UUID | None = None,
    commit: bool = False,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        channel=channel,
        type=type,
        title=title,
        body=body,
        language=language,
        status="pending" if scheduled_at else ("sent" if channel == "in_app" else "pending"),
        scheduled_at=scheduled_at,
        sent_at=None if scheduled_at else (datetime.now(UTC) if channel == "in_app" else None),
        related_type=related_type,
        related_id=str(related_id) if related_id else None,
    )
    db.add(notification)
    if channel != "in_app":
        logger.info(
            "outbound_adapter_queued channel=%s user=%s title=%r provider_configured=%s",
            channel,
            user_id,
            title,
            bool(settings.enable_background_tasks),
        )
    if commit:
        db.commit()
    return notification


def notify_user_roles(db: Session, roles: list[str], **kwargs) -> list[Notification]:
    users = db.query(User).filter(User.role.in_(roles), User.is_active.is_(True)).all()
    return [create_notification(db, user_id=user.id, **kwargs) for user in users]
