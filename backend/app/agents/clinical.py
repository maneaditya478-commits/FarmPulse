"""Clinical workflow agents: health triage, safety gate, veterinary coordination, follow-up."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.agents.state import GuardianState
from app.core.audit import record_audit
from app.core.errors import AppError
from app.services.access import get_case_for_user
from app.models import AgentApproval, HealthCase, HealthObservation, Notification, VetVisit
from app.services.notifications import create_notification
from app.services.triage import triage
from app.services.vets import nearby_vets, select_assignee


def _event(agent: str, detail: str, status: str = "ok") -> dict:
    return {"agent": agent, "status": status, "detail": detail, "at": datetime.now(UTC).isoformat()}


def _pop(plan: list[str], name: str) -> list[str]:
    return plan[1:] if plan and plan[0] == name else plan


def _case_code() -> str:
    return f"HC-{datetime.now(UTC):%y%m%d}-{uuid.uuid4().hex[:6].upper()}"


def health_node(state: GuardianState) -> dict:
    db = state["db"]
    user = state["user"]
    plan = _pop(list(state.get("plan") or []), "health")
    animal = state.get("animal")
    observation = state.get("observation") or {}
    result = triage(
        species_code=animal.species.code if animal and animal.species else "unknown",
        text=state["text"],
        symptoms=state.get("symptoms"),
        temperature_c=observation.get("temperature_c"),
        appetite=observation.get("appetite"),
        milk_change=observation.get("milk_change"),
        duration_days=state.get("duration_days"),
        lang=state["language"],
    )

    case = None
    data = dict(state.get("data") or {})
    data["triage"] = result
    if animal and (user.role in ("farmer", "paravet", "admin") or state.get("existing_case_id")):
        if state.get("existing_case_id"):
            case = get_case_for_user(db, user, uuid.UUID(state["existing_case_id"]))
            if case.animal_id != animal.id:
                raise AppError(422, "animal_case_mismatch", "Case and observation must refer to the same animal")
            rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            result["severity"] = max((case.severity, result["severity"]), key=rank.get)
            result["requires_vet"] = case.requires_vet or result["requires_vet"]
            result["needs_vet_review"] = result["requires_vet"]
            result["symptoms"] = sorted(set((case.triage or {}).get("symptoms", [])) | set(result["symptoms"]))
            result["reasons"] = list(dict.fromkeys((case.triage or {}).get("reasons", []) + result["reasons"]))
            case.severity = result["severity"]
            case.requires_vet = result["requires_vet"]
            case.triage = result
            case.escalation_reason = "; ".join(result["reasons"]) or None
        else:
            case = HealthCase(
                animal_id=animal.id,
                farmer_id=animal.farm.owner_id if animal.farm else user.id,
                reported_by=user.id,
                case_code=_case_code(),
                symptom_summary=state["text"][:2000],
                severity=result["severity"],
                status="triaged",
                requires_vet=result["requires_vet"],
                escalation_reason="; ".join(result["reasons"]) or None,
                triage=result,
                is_sample=animal.is_sample,
            )
            db.add(case)
        db.flush()
        observed_at = observation.get("observed_at")
        if isinstance(observed_at, str):
            observed_at = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
        db.add(
            HealthObservation(
                id=uuid.UUID(state["observation_id"]) if state.get("observation_id") else uuid.uuid4(),
                case_id=case.id,
                animal_id=animal.id,
                observed_at=observed_at or datetime.now(UTC),
                appetite=observation.get("appetite"),
                temperature_c=observation.get("temperature_c"),
                milk_change=observation.get("milk_change"),
                symptoms=result["symptoms"],
                notes=observation.get("notes") or state["text"][:1000],
                photo_url=observation.get("photo_url"),
                source=state.get("input_mode", "text"),
                recorded_by=user.id,
            )
        )
        record_audit(
            db,
            actor=user,
            action="health_case.retriaged" if state.get("existing_case_id") else "health_case.created",
            entity_type="health_case",
            entity_id=case.id,
            detail={"severity": result["severity"], "requires_vet": result["requires_vet"], "agent": "health_agent"},
        )
        data["case_id"] = str(case.id)
        data["case_code"] = case.case_code
    else:
        data["note"] = "A health case is created by the farmer or an authorised field worker; this user receives triage information only."

    return {
        "triage": result,
        "case": case,
        "case_id": str(case.id) if case else None,
        "plan": plan,
        "data": data,
        "escalated": result["requires_vet"],
        "trace": [
            _event(
                "health",
                f"severity={result['severity']}, requires_vet={result['requires_vet']}, signs={len(result['symptoms'])}",
            )
        ],
        "agents_used": ["health"],
    }


def safety_node(state: GuardianState) -> dict:
    db = state["db"]
    user = state["user"]
    plan = _pop(list(state.get("plan") or []), "safety")
    case = state.get("case")
    triage_result = state.get("triage") or {}
    escalated = bool(triage_result.get("requires_vet"))

    detail = "no clinical record to gate"
    if case is not None:
        case.status = "assigned" if escalated else "triaged"
        if case.vet_diagnosis or case.vet_treatment:
            detail = "existing veterinarian-authored record preserved; AI cannot modify diagnosis or treatment"
        if escalated:
            existing = db.scalar(
                select(AgentApproval).where(
                    AgentApproval.case_id == case.id,
                    AgentApproval.agent_name == "safety_agent",
                    AgentApproval.status == "pending",
                )
            )
            if not existing:
                db.add(
                    AgentApproval(
                        case_id=case.id,
                        agent_name="safety_agent",
                        action="Veterinary diagnosis and treatment approval required",
                        status="pending",
                        requested_by=user.id,
                        reason="Urgency rules require a registered veterinarian to confirm diagnosis and treatment.",
                    )
                )
            detail = "escalated for veterinary approval; no diagnosis or prescription generated"
        record_audit(
            db,
            actor=user,
            action="agent.safety_validated",
            entity_type="health_case",
            entity_id=case.id,
            detail={"escalated": escalated, "detail": detail},
        )

    return {
        "plan": plan,
        "escalated": escalated or bool(state.get("escalated")),
        "trace": [_event("safety", detail)],
        "agents_used": ["safety"],
    }


def _notify_farmer_case(db, case: HealthCase, lang: str) -> None:
    animal = case.animal
    title = {
        "en": "Veterinary assistance requested",
        "hi": "पशु चिकित्सा सहायता अनुरोध",
        "mr": "पशुवैद्यकीय मदत विनंती",
    }.get(lang, "Veterinary assistance requested")
    body = {
        "en": f"Case {case.case_code} for {animal.name if animal else 'your animal'} has been sent to a veterinarian. You will be notified when it is reviewed.",
        "hi": f"{animal.name if animal else 'आपके पशु'} के लिए केस {case.case_code} पशु चिकित्सक को भेजा गया है। समीक्षा होने पर सूचना मिलेगी।",
        "mr": f"{animal.name if animal else 'तुमच्या पशू'} साठी केस {case.case_code} पशुवैद्यांना पाठवला आहे. तपासणी झाल्यावर कळवले जाईल.",
    }.get(lang, "")
    create_notification(
        db,
        user_id=case.farmer_id,
        title=title,
        body=body,
        type="health_case_update",
        language=lang,
        related_type="health_case",
        related_id=case.id,
    )


def vet_node(state: GuardianState) -> dict:
    db = state["db"]
    user = state["user"]
    plan = _pop(list(state.get("plan") or []), "vet")
    animal = state.get("animal")
    farm = state.get("farm")
    case: HealthCase | None = state.get("case")
    triage_result = state.get("triage") or {}
    data = dict(state.get("data") or {})

    options = nearby_vets(db, farm, limit=8) if farm else []
    data["nearby_vets"] = [
        {
            "vet_id": str(item["vet"].id),
            "name": item["vet"].user.full_name if item["vet"].user else "Veterinarian",
            "qualification": item["vet"].qualification,
            "clinic": item["vet"].clinic_name,
            "district": item["vet"].district,
            "availability": item["vet"].availability,
            "distance_km": item["distance_km"],
            "phone": item["vet"].user.phone if item["vet"].user else None,
        }
        for item in options
    ]

    vet = None
    appointment = None
    if case is not None and triage_result.get("requires_vet"):
        if case.assigned_vet_id:
            from app.models import Veterinarian

            vet = db.get(Veterinarian, case.assigned_vet_id)
        else:
            vet = select_assignee(db, animal) if animal else None
            if vet:
                case.assigned_vet_id = vet.id
                case.status = "assigned"
        if vet:
            appointment = db.scalar(select(VetVisit).where(
                VetVisit.case_id == case.id, VetVisit.vet_id == vet.id,
                VetVisit.status.in_(["requested", "scheduled"]),
            ))
            if not appointment:
                appointment = VetVisit(
                    case_id=case.id,
                    vet_id=vet.id,
                    visit_type="teleconsult",
                    status="requested",
                    requested_at=datetime.now(UTC),
                    location=farm.village if farm else None,
                    notes=f"AI-assisted triage: severity={triage_result.get('severity')}; thresholds need vet review. No appointment time confirmed.",
                    is_sample=case.is_sample,
                )
                db.add(appointment)
                db.flush()
                if vet.user:
                    create_notification(
                        db,
                        user_id=vet.user.id,
                        title=f"New case request: {case.case_code}",
                        body=(
                            f"{animal.name if animal else 'Animal'} reported: {case.symptom_summary[:220]}. "
                            f"Priority: {case.severity}. Open the case to review observations and record your assessment."
                        ),
                        type="case_request",
                        language=vet.user.language,
                        related_type="health_case",
                        related_id=case.id,
                    )
                _notify_farmer_case(db, case, state["language"])
            data["appointment_id"] = str(appointment.id)
            data["assigned_vet"] = {
                "id": str(vet.id),
                "name": vet.user.full_name if vet.user else "Veterinarian",
                "phone": vet.user.phone if vet.user else None,
            }
            record_audit(
                db,
                actor=user,
                action="vet_request.created",
                entity_type="vet_visit",
                entity_id=appointment.id,
                detail={"case_id": str(case.id), "vet_id": str(vet.id)},
            )
        else:
            data["vet_assignment_note"] = "No registered veterinarian is currently available; the case remains open for district coordination."

    return {
        "vet": vet,
        "appointment_id": str(appointment.id) if appointment else None,
        "data": data,
        "plan": plan,
        "trace": [
            _event(
                "vet",
                f"nearby_professionals={len(options)}; request_created={bool(appointment)}"
                + (f"; assigned={vet.user.full_name}" if vet and vet.user else ""),
            )
        ],
        "agents_used": ["vet"],
    }


def followup_node(state: GuardianState) -> dict:
    db = state["db"]
    user = state["user"]
    plan = _pop(list(state.get("plan") or []), "followup")
    case: HealthCase | None = state.get("case")
    lang = state["language"]
    data = dict(state.get("data") or {})
    created = False

    if case is not None:
        existing = db.scalar(
            select(Notification).where(
                Notification.type == "follow_up",
                Notification.related_id == str(case.id),
                Notification.created_at >= datetime.now(UTC) - timedelta(hours=6),
            )
        )
        if not existing:
            scheduled = datetime.now(UTC) + timedelta(hours=24)
            title = {"en": "Follow-up check", "hi": "फॉलो-अप जाँच", "mr": "फॉलो-अप तपासणी"}.get(lang, "Follow-up check")
            body = {
                "en": f"Check {state['animal'].name if state.get('animal') else 'the animal'} for case {case.case_code}. If signs have not improved, contact the veterinarian.",
                "hi": f"केस {case.case_code} के लिए {state['animal'].name if state.get('animal') else 'पशु'} की जाँच करें। सुधार न होने पर पशु चिकित्सक से संपर्क करें।",
                "mr": f"केस {case.case_code} साठी {state['animal'].name if state.get('animal') else 'पशू'} तपासा. सुधारणा न झाल्यास पशुवैद्यांशी संपर्क साधा.",
            }.get(lang, "")
            note = create_notification(
                db,
                user_id=case.farmer_id,
                title=title,
                body=body,
                type="follow_up",
                language=lang,
                scheduled_at=scheduled,
                related_type="health_case",
                related_id=case.id,
            )
            created = note is not None
            data["follow_up_at"] = scheduled.isoformat()

    return {
        "data": data,
        "plan": plan,
        "trace": [_event("followup", f"scheduled={created}")],
        "agents_used": ["followup"],
    }
