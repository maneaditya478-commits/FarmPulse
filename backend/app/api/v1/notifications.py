"""Notification inbox and reminder dispatch."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, page_result, require_roles
from app.core.errors import AppError
from app.models import Notification, User
from app.schemas.domain import NotificationCreate, NotificationOut
from app.services.notifications import create_notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=dict)
def list_notifications(
    status_filter: str | None = Query(default=None, alias="status"),
    channel: str | None = None,
    unread_only: bool = False,
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if status_filter:
        stmt = stmt.where(Notification.status == status_filter)
    if channel:
        stmt = stmt.where(Notification.channel == channel)
    if unread_only:
        stmt = stmt.where(Notification.status != "read")
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Notification.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    return page_result([NotificationOut.model_validate(row) for row in rows], int(total), pagination)


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    count = db.scalar(
        select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.status != "read")
    ) or 0
    return {"unread": int(count)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Notification:
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise AppError(status.HTTP_404_NOT_FOUND, "notification_not_found", "Notification not found")
    notification.status = "read"
    notification.read_at = datetime.now(UTC)
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.status != "read")).all()
    now = datetime.now(UTC)
    for row in rows:
        row.status = "read"
        row.read_at = now
    db.commit()
    return {"message": f"{len(rows)} notification(s) marked as read", "updated": len(rows)}


@router.post("", response_model=NotificationOut, status_code=status.HTTP_201_CREATED)
def send_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> Notification:
    target = db.get(User, payload.user_id)
    if not target:
        raise AppError(status.HTTP_404_NOT_FOUND, "user_not_found", "Target user not found")
    notification = create_notification(
        db,
        user_id=payload.user_id,
        title=payload.title,
        body=payload.body,
        type=payload.type,
        language=payload.language,
        channel=payload.channel,
        scheduled_at=payload.scheduled_at,
        related_type=payload.related_type,
        related_id=payload.related_id,
    )
    record_audit(db, actor=admin, action="notification.created", entity_type="notification", entity_id=notification.id)
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/dispatch-due")
def dispatch_due(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> dict:
    now = datetime.now(UTC)
    rows = db.scalars(
        select(Notification).where(
            Notification.status == "pending",
            Notification.channel == "in_app",
            Notification.scheduled_at.is_not(None),
            Notification.scheduled_at <= now,
        )
    ).all()
    for row in rows:
        row.status = "sent"
        row.sent_at = now
    record_audit(db, actor=admin, action="notification.dispatched_due", entity_type="notification", entity_id=None, detail={"count": len(rows)})
    db.commit()
    pending_external = db.scalar(
        select(func.count(Notification.id)).where(Notification.status == "pending", Notification.channel != "in_app")
    ) or 0
    return {
        "dispatched": len(rows),
        "external_pending": int(pending_external),
        "note": "External SMS/WhatsApp/push channels remain pending until a provider gateway is configured.",
    }
