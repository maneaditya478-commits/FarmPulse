"""Administrator operations: monitoring, auditing, veterinary verification, system info."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import Pagination, page_result, require_roles
from app.core.errors import AppError
from app.models import (
    AgentApproval,
    AIInteraction,
    Animal,
    AuditLog,
    CooperativeMembership,
    Farm,
    HealthCase,
    SyncOperation,
    User,
    Veterinarian,
)
from app.schemas.domain import AgentApprovalOut, AuditLogOut, UserAdminView, VerifyVetRequest, VetProfileOut

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/overview")
def admin_overview(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))) -> dict:
    today = datetime.now(UTC)
    day_ago = today - timedelta(hours=24)
    role_counts = db.execute(select(User.role, func.count(User.id)).group_by(User.role)).all()
    case_counts = db.execute(select(HealthCase.severity, func.count(HealthCase.id)).group_by(HealthCase.severity)).all()
    return {
        "users": {role: int(count) for role, count in role_counts},
        "total_users": int(db.scalar(select(func.count(User.id))) or 0),
        "active_users": int(db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0),
        "farms": int(db.scalar(select(func.count(Farm.id))) or 0),
        "animals": int(db.scalar(select(func.count(Animal.id)).where(Animal.status == "active")) or 0),
        "veterinarians": int(db.scalar(select(func.count(Veterinarian.id))) or 0),
        "unverified_veterinarians": int(
            db.scalar(select(func.count(Veterinarian.id)).where(Veterinarian.verified.is_(False))) or 0
        ),
        "cooperative_links": int(db.scalar(select(func.count(CooperativeMembership.id))) or 0),
        "health_cases": int(db.scalar(select(func.count(HealthCase.id))) or 0),
        "open_health_cases": int(
            db.scalar(
                select(func.count(HealthCase.id)).where(
                    HealthCase.status.in_(("reported", "triaged", "assigned", "in_progress"))
                )
            )
            or 0
        ),
        "cases_by_severity": {severity: int(count) for severity, count in case_counts},
        "pending_approvals": int(
            db.scalar(select(func.count(AgentApproval.id)).where(AgentApproval.status == "pending")) or 0
        ),
        "ai_interactions": int(db.scalar(select(func.count(AIInteraction.id))) or 0),
        "ai_interactions_24h": int(
            db.scalar(select(func.count(AIInteraction.id)).where(AIInteraction.created_at >= day_ago)) or 0
        ),
        "sync_operations": int(db.scalar(select(func.count(SyncOperation.id))) or 0),
        "sync_errors": int(db.scalar(select(func.count(SyncOperation.id)).where(SyncOperation.status == "error")) or 0),
        "demo_data_enabled": settings.seed_demo_data,
        "generated_at": today,
    }


@router.get("/audit-logs", response_model=dict)
def list_audit_logs(
    actor_role: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    stmt = select(AuditLog)
    if actor_role:
        stmt = stmt.where(AuditLog.actor_role == actor_role)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    return page_result([AuditLogOut.model_validate(row) for row in rows], int(total), pagination)


@router.get("/agent-monitor")
def agent_monitor(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    interactions = db.scalars(select(AIInteraction).order_by(AIInteraction.created_at.desc()).limit(limit)).all()
    agent_usage: dict[str, int] = {}
    for interaction in interactions:
        for agent in interaction.agents_used or []:
            agent_usage[agent] = agent_usage.get(agent, 0) + 1
    total = int(db.scalar(select(func.count(AIInteraction.id))) or 0)
    escalated = int(db.scalar(select(func.count(AIInteraction.id)).where(AIInteraction.escalated.is_(True))) or 0)
    avg_latency = db.scalar(select(func.avg(AIInteraction.latency_ms))) or 0
    pending = db.scalars(
        select(AgentApproval).where(AgentApproval.status == "pending").order_by(AgentApproval.created_at.desc()).limit(limit)
    ).all()
    recent = db.scalars(select(SyncOperation).order_by(SyncOperation.created_at.desc()).limit(limit)).all()
    return {
        "total_interactions": total,
        "escalated_interactions": escalated,
        "average_latency_ms": round(float(avg_latency), 1),
        "llm_provider": settings.llm_provider if settings.gemini_api_key else "local-expert-rules",
        "agent_usage_recent": agent_usage,
        "recent_interactions": [
            {
                "id": str(item.id),
                "intent": item.intent,
                "language": item.detected_language,
                "agents_used": item.agents_used,
                "escalated": item.escalated,
                "latency_ms": item.latency_ms,
                "created_at": item.created_at,
            }
            for item in interactions
        ],
        "pending_approvals": [AgentApprovalOut.model_validate(item) for item in pending],
        "recent_sync_operations": [
            {
                "id": str(item.id),
                "entity_type": item.entity_type,
                "operation": item.operation,
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in recent
        ],
    }


@router.get("/users", response_model=dict)
def list_users(
    role: str | None = None,
    q: str | None = None,
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(User.full_name.ilike(pattern) | User.email.ilike(pattern))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = db.scalars(stmt.order_by(User.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    animal_counts = dict(
        db.execute(select(Farm.owner_id, func.count(Animal.id)).join(Animal, Animal.farm_id == Farm.id).group_by(Farm.owner_id)).all()
    )
    farm_counts = dict(db.execute(select(Farm.owner_id, func.count(Farm.id)).group_by(Farm.owner_id)).all())
    items = []
    for user in users:
        view = UserAdminView.model_validate(user)
        view.animal_count = int(animal_counts.get(user.id, 0))
        view.farm_count = int(farm_counts.get(user.id, 0))
        items.append(view)
    return page_result(items, int(total), pagination)


@router.get("/veterinarians", response_model=list[VetProfileOut])
def list_veterinarians_for_verification(
    verified: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> list[Veterinarian]:
    stmt = select(Veterinarian).options(selectinload(Veterinarian.user))
    if verified is not None:
        stmt = stmt.where(Veterinarian.verified.is_(verified))
    return list(db.scalars(stmt.order_by(Veterinarian.created_at.desc())).all())


@router.post("/veterinarians/{vet_id}/verify", response_model=VetProfileOut)
def verify_veterinarian(
    vet_id: uuid.UUID,
    payload: VerifyVetRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
) -> Veterinarian:
    vet = db.get(Veterinarian, vet_id)
    if not vet:
        raise AppError(404, "vet_not_found", "Veterinarian not found")
    vet.verified = payload.verified
    if payload.verified and vet.availability == "offline":
        vet.availability = "available"
    record_audit(
        db,
        actor=admin,
        action="veterinarian.verified" if payload.verified else "veterinarian.unverified",
        entity_type="veterinarian",
        entity_id=vet.id,
        detail={"note": payload.note},
    )
    db.commit()
    return db.scalar(select(Veterinarian).options(selectinload(Veterinarian.user)).where(Veterinarian.id == vet.id))


@router.get("/sync-operations", response_model=dict)
def list_sync_operations(
    status_filter: str | None = Query(default=None, alias="status"),
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
) -> dict:
    stmt = select(SyncOperation)
    if status_filter:
        stmt = stmt.where(SyncOperation.status == status_filter)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(SyncOperation.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    items = [
        {
            "id": row.id,
            "client_id": row.client_id,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "operation": row.operation,
            "status": row.status,
            "error": row.error,
            "created_at": row.created_at,
            "server_updated_at": row.server_updated_at,
        }
        for row in rows
    ]
    return page_result(items, int(total), pagination)


@router.get("/system")
def system_info(_: User = Depends(require_roles("admin"))) -> dict:
    return {
        "app": settings.app_name,
        "environment": settings.environment,
        "api_prefix": settings.api_v1_prefix,
        "database": "postgresql" if settings.database_url.startswith("postgres") else "sqlite",
        "llm_provider": settings.llm_provider,
        "llm_configured": bool(settings.gemini_api_key),
        "storage_backend": settings.storage_backend,
        "demo_seed_enabled": settings.seed_demo_data,
        "rate_limit_per_minute": settings.rate_limit_per_minute,
        "guardrails": [
            "AI cannot confirm diagnoses or prescribe medicine.",
            "AI cannot generate drug dosages.",
            "Urgent warning signs trigger veterinary escalation.",
            "Vaccination schedules come from the verified catalog only.",
            "Veterinary diagnoses and treatment require an authorised professional.",
        ],
    }
