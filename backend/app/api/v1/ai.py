"""Agentic AI assistant endpoints."""

import re
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.graph import run_agent_workflow
from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import Pagination, get_current_user, page_result
from app.core.errors import AppError
from app.models import AIInteraction, User
from app.schemas.domain import AIInteractionOut, AIQueryRequest, AIResponse, AITranslateRequest
from app.services.llm import llm_service, safety_refusal, safety_scan
from app.services.triage import WARNING_SYMPTOMS, extract_symptoms

router = APIRouter(prefix="/ai", tags=["AI Assistant"])

AGENT_CATALOG = [
    ("orchestrator", "Central Orchestrator Agent", "Understands requests, plans the workflow and coordinates specialist agents."),
    ("intake", "Intake Agent", "Detects language, normalizes voice/text input and extracts structured symptoms."),
    ("health", "Animal Health Monitoring Agent", "Collects symptoms and assesses urgency using rule thresholds that need vet review; clinical accuracy is not established."),
    ("vaccination", "Vaccination Management Agent", "Maintains records, computes due dates from the verified catalogue and creates reminders."),
    ("nutrition", "Nutrition Agent", "Tracks feed, water and minerals, flags missing data and refers dietary decisions to professionals."),
    ("environment", "Environmental Monitoring Agent", "Combines live weather with farm observations and threshold-based risk rules."),
    ("vet", "Veterinary Coordination Agent", "Finds registered professionals, creates assistance requests and assigns cases."),
    ("record", "Animal Record Management Agent", "Retrieves animal profiles, medical history, vaccinations and production records."),
    ("market", "Livestock Market Intelligence Agent", "Returns district price data with source, unit and observation date."),
    ("finance", "Financial Impact Agent", "Estimates revenue, expenses and production differences with explicit assumptions."),
    ("followup", "Follow-up and Notification Agent", "Schedules vaccination and veterinary follow-up notifications."),
    ("safety", "Safety and Approval Agent", "Enforces escalation, blocks prescriptions and requires veterinary approval for diagnosis and treatment."),
]


@router.post("/query", response_model=AIResponse)
def query(
    payload: AIQueryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIResponse:
    result = run_agent_workflow(
        db,
        user,
        text=payload.text,
        input_mode=payload.input_mode,
        language=payload.language,
        animal_id=payload.animal_id,
        session_id=payload.session_id,
    )
    return AIResponse(
        interaction_id=uuid.UUID(result["interaction_id"]),
        session_id=result["session_id"],
        language=result.get("language", "en"),
        intent=result.get("intent") or "animal_record",
        response_text=result.get("response_text", ""),
        agents_used=result.get("agents_used", []),
        escalated=bool(result.get("escalated")),
        case_id=uuid.UUID(result["case_id"]) if result.get("case_id") else None,
        appointment_id=uuid.UUID(result["appointment_id"]) if result.get("appointment_id") else None,
        data=result.get("data") or {},
        trace=result.get("trace") or [],
        llm_provider=result.get("llm_provider", llm_service.provider),
        latency_ms=result.get("latency_ms", 0),
    )


@router.get("/agents")
def agents(_: User = Depends(get_current_user)) -> dict:
    return {
        "orchestration": "LangGraph StateGraph",
        "agents": [
            {"key": key, "name": name, "responsibility": description, "status": "active"}
            for key, name, description in AGENT_CATALOG
        ],
    }


@router.get("/status")
def ai_status(_: User = Depends(get_current_user)) -> dict:
    return {
        "provider": llm_service.provider,
        "gemini_configured": bool(settings.gemini_api_key),
        "model": settings.gemini_model if settings.gemini_api_key else None,
        "fallback": "Deterministic expert rules for intent, urgency and multilingual advisories",
        "guardrails": [
            "No disease diagnosis",
            "No medicine names or dosages",
            "Urgent warning signs always escalate",
            "Vaccination schedules come only from the verified catalogue",
            "Diagnosis and treatment require an authorised veterinary professional",
        ],
    }


@router.get("/interactions", response_model=dict)
def list_interactions(
    pagination: Pagination = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    stmt = select(AIInteraction)
    if user.role != "admin":
        stmt = stmt.where(AIInteraction.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AIInteraction.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).all()
    return page_result([AIInteractionOut.model_validate(row) for row in rows], int(total), pagination)


@router.get("/interactions/{interaction_id}", response_model=AIInteractionOut)
def get_interaction(
    interaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AIInteraction:
    interaction = db.get(AIInteraction, interaction_id)
    if not interaction or (user.role != "admin" and interaction.user_id != user.id):
        raise AppError(404, "interaction_not_found", "AI interaction not found")
    return interaction


@router.post("/translate")
def translate(
    payload: AITranslateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    translated = llm_service.translate(payload.text, payload.target_language)
    output = translated if translated else payload.text
    safe, reason = safety_scan(output)
    if not safe:
        record_audit(
            db,
            actor=user,
            action="safety.output_blocked",
            entity_type="ai_translation",
            entity_id=None,
            detail={"stage": "translation_output", "reason": reason or "unsafe_output"},
            commit=True,
        )
        emergency = bool(
            (set(extract_symptoms(payload.text)) | set(extract_symptoms(output))) & WARNING_SYMPTOMS
            or re.search(r"\bemergency\b|\bimmediately\b|तुरंत|त्वरित|आपात", payload.text, re.IGNORECASE)
        )
        return {
            "translated": safety_refusal(payload.target_language, emergency=emergency),
            "provider": "safety-policy",
        }
    if translated:
        return {"translated": translated, "provider": "gemini"}
    return {
        "translated": output,
        "provider": "local-templates",
        "note": "LLM translation is not configured. Standard advisories are already localized; free-form translation requires an LLM provider key.",
    }
