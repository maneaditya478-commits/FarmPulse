"""Animal healthcare: reporting, triage workflow, cases, observations and approvals."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.agents.graph import run_agent_workflow
from app.core.audit import record_audit
from app.core.constants import URGENT_WARNING_SIGNS_BY_LANGUAGE, WARNING_SIGN_NOTES
from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, page_result, require_roles
from app.core.errors import AppError
from app.models import (
    AgentApproval,
    Animal,
    Farm,
    HealthCase,
    HealthObservation,
    HealthRecord,
    User,
    Veterinarian,
    VetVisit,
)
from app.schemas.domain import (
    AgentApprovalDecision,
    AgentApprovalOut,
    CaseAssignRequest,
    HealthCaseCreate,
    HealthCaseOut,
    HealthCaseUpdate,
    HealthRecordCreate,
    HealthRecordOut,
    HealthReportResponse,
    ObservationInput,
    ObservationOut,
)
from app.services.access import (
    animal_query,
    case_query,
    cooperative_farmer_ids,
    get_animal_for_user,
    get_case_for_user,
    get_vet_profile,
    require_verified_professional,
)
from app.services.notifications import create_notification
from app.services.vaccination import create_vaccination_reminders, ensure_animal_schedule

router = APIRouter(prefix="/health", tags=["Healthcare"])


def _case_options():
    return (
        selectinload(HealthCase.observations),
        selectinload(HealthCase.animal).selectinload(Animal.species),
        selectinload(HealthCase.farmer),
        selectinload(HealthCase.visits).selectinload(VetVisit.vet).selectinload(Veterinarian.user),
        selectinload(HealthCase.assigned_vet).selectinload(Veterinarian.user),
    )


def _loaded_case(db: Session, user: User, case_id: uuid.UUID) -> HealthCase:
    case = db.scalar(case_query(db, user).options(*_case_options()).where(HealthCase.id == case_id))
    if not case:
        raise AppError(status.HTTP_404_NOT_FOUND, "case_not_found", "Health case not found")
    return case


@router.get("/warning-signs")
def warning_signs(
    language: str = Query("en", pattern="^(en|hi|mr)$"),
    _: User = Depends(get_current_user),
) -> dict:
    return {
        "warning_signs": URGENT_WARNING_SIGNS_BY_LANGUAGE[language],
        "note": WARNING_SIGN_NOTES[language],
    }


@router.post("/cases", response_model=HealthReportResponse, status_code=status.HTTP_201_CREATED)
def report_symptoms(
    payload: HealthCaseCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("farmer", "paravet", "admin")),
) -> HealthReportResponse:
    animal = get_animal_for_user(db, user, payload.animal_id)
    observation = payload.observation.model_dump() if payload.observation else {}
    result = run_agent_workflow(
        db,
        user,
        text=payload.symptom_summary,
        input_mode=observation.get("source", "text"),
        language=payload.language or user.language,
        animal_id=animal.id,
        observation=observation,
    )
    case_data = None
    if result.get("case_id"):
        case = _loaded_case(db, user, uuid.UUID(result["case_id"]))
        case_data = HealthCaseOut.model_validate(case)
    return HealthReportResponse(
        case=case_data,
        triage=result.get("triage") or {},
        response_text=result.get("response_text", ""),
        agents_used=result.get("agents_used", []),
        escalated=bool(result.get("escalated")),
        appointment_id=uuid.UUID(result["appointment_id"]) if result.get("appointment_id") else None,
        interaction_id=uuid.UUID(result["interaction_id"]),
        data=result.get("data") or {},
    )


@router.get("/cases", response_model=dict)
def list_cases(
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = None,
    animal_id: uuid.UUID | None = None,
    q: str | None = None,
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = case_query(db, user).options(*_case_options())
    if status_filter:
        stmt = stmt.where(HealthCase.status == status_filter)
    if severity:
        stmt = stmt.where(HealthCase.severity == severity)
    if animal_id:
        stmt = stmt.where(HealthCase.animal_id == animal_id)
    if q:
        stmt = stmt.where(or_(HealthCase.case_code.ilike(f"%{q}%"), HealthCase.symptom_summary.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    cases = db.scalars(stmt.order_by(HealthCase.opened_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    return page_result([HealthCaseOut.model_validate(case) for case in cases], int(total), pagination)


@router.get("/cases/{case_id}", response_model=HealthCaseOut)
def get_case(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> HealthCase:
    return _loaded_case(db, user, case_id)


@router.patch("/cases/{case_id}", response_model=HealthCaseOut)
def update_case(
    case_id: uuid.UUID,
    payload: HealthCaseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet", "admin")),
) -> HealthCase:
    case = get_case_for_user(db, user, case_id)
    if user.role in ("veterinarian", "paravet"):
        vet = require_verified_professional(db, user)
        if case.assigned_vet_id != vet.id:
            raise AppError(status.HTTP_403_FORBIDDEN, "not_assigned", "Only the assigned veterinary professional can update this case")
    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("status")
    for key, value in data.items():
        setattr(case, key, value)
    if data.get("vet_diagnosis") or data.get("vet_treatment"):
        if not (case.vet_diagnosis and case.vet_treatment):
            raise AppError(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "incomplete_assessment",
                "Both a diagnosis and a treatment plan are required to complete a veterinary assessment",
            )
        case.approved_by = user.id
        case.approved_at = datetime.now(UTC)
        db.add(
            HealthRecord(
                animal_id=case.animal_id,
                case_id=case.id,
                record_type="diagnosis",
                title=f"Veterinary assessment — {case.case_code}",
                details=f"Diagnosis: {case.vet_diagnosis}\nTreatment plan: {case.vet_treatment}\nNotes: {case.vet_notes or ''}",
                professional_id=case.assigned_vet_id,
                approved=True,
                is_sample=case.is_sample,
            )
        )
        pending = db.scalar(
            select(AgentApproval).where(
                AgentApproval.case_id == case.id, AgentApproval.status == "pending", AgentApproval.agent_name == "safety_agent"
            )
        )
        if pending:
            pending.status = "approved"
            pending.decided_by = user.id
            pending.decided_at = datetime.now(UTC)
            pending.reason = "Veterinarian completed and confirmed the clinical assessment."
        create_notification(
            db,
            user_id=case.farmer_id,
            title=f"Veterinary assessment ready — {case.case_code}",
            body=f"{case.animal.name if case.animal else 'Your animal'}: a veterinarian has recorded an assessment. Open the case to view the plan.",
            type="case_update",
            language=case.farmer.language if case.farmer else "en",
            related_type="health_case",
            related_id=case.id,
        )
    if new_status == "resolved":
        case.resolved_at = datetime.now(UTC)
    record_audit(
        db,
        actor=user,
        action="health_case.updated",
        entity_type="health_case",
        entity_id=case.id,
        detail={"fields": list(data), "diagnosis_confirmed": bool(case.approved_at)},
        request=request,
    )
    db.commit()
    return _loaded_case(db, user, case.id)


@router.post("/cases/{case_id}/observations", response_model=ObservationOut, status_code=status.HTTP_201_CREATED)
def add_observation(
    case_id: uuid.UUID,
    payload: ObservationInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HealthObservation:
    case = get_case_for_user(db, user, case_id)
    if user.role == "cooperative":
        raise AppError(status.HTTP_403_FORBIDDEN, "forbidden", "Cooperative users have read-only access")
    observation_id = uuid.uuid4()
    run_agent_workflow(
        db, user, text=payload.notes or "Observation recorded",
        input_mode=payload.source, language=user.language,
        animal_id=case.animal_id, observation=payload.model_dump(),
        observation_id=observation_id, existing_case_id=case.id, commit=False,
    )
    record_audit(db, actor=user, action="health_observation.added", entity_type="health_case", entity_id=case.id)
    db.commit()
    return db.get(HealthObservation, observation_id)


@router.post("/cases/{case_id}/assign", response_model=HealthCaseOut)
def assign_case(
    case_id: uuid.UUID,
    payload: CaseAssignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet", "admin")),
) -> HealthCase:
    case = get_case_for_user(db, user, case_id)
    if user.role == "admin" and payload.vet_id:
        vet = db.get(Veterinarian, payload.vet_id)
    else:
        vet = get_vet_profile(db, user)
    if not vet:
        raise AppError(status.HTTP_404_NOT_FOUND, "vet_not_found", "Veterinarian profile not found")
    case.assigned_vet_id = vet.id
    if case.status in ("reported", "triaged"):
        case.status = "assigned"
    existing = db.scalar(
        select(VetVisit).where(VetVisit.case_id == case.id, VetVisit.status.in_(("requested", "scheduled")))
    )
    if not existing:
        db.add(
            VetVisit(
                case_id=case.id,
                vet_id=vet.id,
                visit_type="teleconsult",
                status="requested",
                requested_at=datetime.now(UTC),
                notes="Assigned manually",
            )
        )
    if vet.user:
        create_notification(
            db,
            user_id=vet.user.id,
            title=f"Case assigned: {case.case_code}",
            body=f"Case {case.case_code} has been assigned to you. Priority: {case.severity}.",
            type="case_assignment",
            language=vet.user.language,
            related_type="health_case",
            related_id=case.id,
        )
    record_audit(db, actor=user, action="health_case.assigned", entity_type="health_case", entity_id=case.id, detail={"vet_id": str(vet.id)})
    db.commit()
    return _loaded_case(db, user, case.id)


@router.get("/records", response_model=list[HealthRecordOut])
def list_records(
    animal_id: uuid.UUID | None = None,
    case_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HealthRecord]:
    stmt = select(HealthRecord).order_by(HealthRecord.recorded_at.desc()).limit(100)
    if case_id:
        get_case_for_user(db, user, case_id)
        stmt = stmt.where(HealthRecord.case_id == case_id)
    if animal_id:
        get_animal_for_user(db, user, animal_id)
        stmt = stmt.where(HealthRecord.animal_id == animal_id)
    if user.role == "farmer" and not animal_id and not case_id:
        animal_ids = select(Animal.id).join(Animal.farm).where(Animal.farm.has(owner_id=user.id))
        stmt = stmt.where(HealthRecord.animal_id.in_(animal_ids))
    if user.role == "cooperative" and not animal_id and not case_id:
        farmer_ids = cooperative_farmer_ids(db, user)
        member_animals = (
            select(Animal.id).where(Animal.farm_id.in_(select(Farm.id).where(Farm.owner_id.in_(farmer_ids))))
            if farmer_ids
            else select(Animal.id).where(False)
        )
        stmt = stmt.where(HealthRecord.animal_id.in_(member_animals))
    if user.role in ("veterinarian", "paravet"):
        vet = get_vet_profile(db, user)
        case_ids = select(HealthCase.id).where(HealthCase.assigned_vet_id == (vet.id if vet else None))
        stmt = stmt.where(HealthRecord.case_id.in_(case_ids))
    return list(db.scalars(stmt).all())


@router.post("/records", response_model=HealthRecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    payload: HealthRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet", "admin")),
) -> HealthRecord:
    animal = get_animal_for_user(db, user, payload.animal_id)
    if user.role in ("veterinarian", "paravet"):
        vet = require_verified_professional(db, user)
    else:
        vet = get_vet_profile(db, user)
    if payload.case_id:
        case = get_case_for_user(db, user, payload.case_id)
        if case.animal_id != animal.id:
            raise AppError(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "animal_case_mismatch",
                "The case belongs to a different animal; records must stay consistent",
            )
    record = HealthRecord(
        animal_id=animal.id,
        case_id=payload.case_id,
        record_type=payload.record_type,
        title=payload.title,
        details=payload.details,
        professional_id=vet.id if vet else None,
        approved=True,
        recorded_at=payload.recorded_at or datetime.now(UTC),
        is_sample=animal.is_sample,
    )
    db.add(record)
    record_audit(db, actor=user, action="health_record.created", entity_type="health_record", entity_id=record.id)
    db.commit()
    db.refresh(record)
    return record


@router.get("/approvals", response_model=list[AgentApprovalOut])
def list_approvals(
    status_filter: str | None = Query(default="pending", alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet", "admin")),
) -> list[AgentApproval]:
    stmt = select(AgentApproval).order_by(AgentApproval.created_at.desc())
    if status_filter:
        stmt = stmt.where(AgentApproval.status == status_filter)
    if user.role != "admin":
        vet = get_vet_profile(db, user)
        case_ids = select(HealthCase.id).where(HealthCase.assigned_vet_id == (vet.id if vet else None))
        stmt = stmt.where(AgentApproval.case_id.in_(case_ids))
    return list(db.scalars(stmt).all())


@router.post("/approvals/{approval_id}/decision", response_model=AgentApprovalOut)
def decide_approval(
    approval_id: uuid.UUID,
    payload: AgentApprovalDecision,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("veterinarian", "paravet", "admin")),
) -> AgentApproval:
    approval = db.get(AgentApproval, approval_id)
    if not approval:
        raise AppError(status.HTTP_404_NOT_FOUND, "approval_not_found", "Approval request not found")
    if user.role in ("veterinarian", "paravet"):
        require_verified_professional(db, user)
    if approval.case_id:
        get_case_for_user(db, user, approval.case_id)
    approval.status = payload.decision
    approval.decided_by = user.id
    approval.decided_at = datetime.now(UTC)
    approval.reason = payload.reason
    record_audit(
        db,
        actor=user,
        action=f"agent_approval.{payload.decision}",
        entity_type="agent_approval",
        entity_id=approval.id,
        detail={"case_id": str(approval.case_id) if approval.case_id else None},
    )
    db.commit()
    db.refresh(approval)
    return approval
