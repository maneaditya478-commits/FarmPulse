"""LangGraph workflow wiring and execution entry point."""

import time
import uuid
from datetime import UTC, datetime
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.agents.advisory import environment_node, finance_node, market_node, nutrition_node, vaccination_node
from app.agents.clinical import followup_node, health_node, safety_node, vet_node
from app.agents.intake import intake_node, orchestrator_node, record_node, respond_node
from app.agents.state import GuardianState
from app.core.audit import record_audit
from app.models import AIInteraction, User
from app.services.llm import llm_service

AGENT_NODES = [
    "record",
    "health",
    "safety",
    "vet",
    "followup",
    "vaccination",
    "nutrition",
    "environment",
    "market",
    "finance",
]
NODE_MAP = {name: name for name in [*AGENT_NODES, "respond"]}


def route_next(state: GuardianState) -> str:
    plan = state.get("plan") or []
    if plan and plan[0] in AGENT_NODES:
        return plan[0]
    return "respond"


def build_graph():
    builder = StateGraph(GuardianState)
    builder.add_node("intake", intake_node)
    builder.add_node("orchestrator", orchestrator_node)
    for name, node in {
        "record": record_node,
        "health": health_node,
        "safety": safety_node,
        "vet": vet_node,
        "followup": followup_node,
        "vaccination": vaccination_node,
        "nutrition": nutrition_node,
        "environment": environment_node,
        "market": market_node,
        "finance": finance_node,
        "respond": respond_node,
    }.items():
        builder.add_node(name, node)

    builder.add_edge(START, "intake")
    builder.add_edge("intake", "orchestrator")
    builder.add_conditional_edges("orchestrator", route_next, NODE_MAP)
    for name in AGENT_NODES:
        builder.add_conditional_edges(name, route_next, NODE_MAP)
    builder.add_edge("respond", END)
    return builder.compile()


guardian_graph = build_graph()


def run_agent_workflow(
    db,
    user: User,
    *,
    text: str,
    input_mode: str = "text",
    language: str | None = None,
    animal_id: uuid.UUID | str | None = None,
    session_id: str | None = None,
    observation: dict[str, Any] | None = None,
    observation_id: uuid.UUID | None = None,
    existing_case_id: uuid.UUID | None = None,
    commit: bool = True,
) -> dict:
    started = time.perf_counter()
    session = session_id or uuid.uuid4().hex
    initial: dict[str, Any] = {
        "db": db,
        "user": user,
        "text": text,
        "input_mode": input_mode,
        "language": language or "",
        "session_id": session,
        "animal_id": str(animal_id) if animal_id else None,
        "observation": observation or {},
        "health_report": observation is not None,
        "observation_id": str(observation_id) if observation_id else None,
        "existing_case_id": str(existing_case_id) if existing_case_id else None,
        "safety_events": [],
        "plan": [],
        "trace": [],
        "agents_used": [],
        "data": {},
        "escalated": False,
        "halt": False,
        "llm_provider": llm_service.provider,
    }
    result = guardian_graph.invoke(initial, config={"recursion_limit": 50})
    latency_ms = int((time.perf_counter() - started) * 1000)

    audio_animal = result.get("animal_id")
    interaction = AIInteraction(
        user_id=user.id,
        animal_id=uuid.UUID(audio_animal) if audio_animal else None,
        session_id=session,
        input_text=text,
        input_mode=input_mode,
        detected_language=result.get("language", "en"),
        intent=result.get("intent"),
        response_text=result.get("response_text", ""),
        workflow={
            "trace": result.get("trace", []),
            "case_id": result.get("case_id"),
            "appointment_id": result.get("appointment_id"),
            "halt_reason": result.get("halt_reason"),
            "safety_events": result.get("safety_events", []),
        },
        agents_used=result.get("agents_used", []),
        escalated=bool(result.get("escalated")),
        latency_ms=latency_ms,
        is_sample=bool(getattr(user, "is_sample", False)),
    )
    db.add(interaction)
    db.flush()
    for event in result.get("safety_events", []):
        record_audit(
            db, actor=user, action="safety.output_blocked", entity_type="ai_interaction",
            entity_id=interaction.id, detail=event,
        )
    record_audit(
        db,
        actor=user,
        action="ai.workflow_completed",
        entity_type="ai_interaction",
        entity_id=interaction.id,
        detail={
            "intent": result.get("intent"),
            "agents": result.get("agents_used", []),
            "escalated": bool(result.get("escalated")),
            "latency_ms": latency_ms,
        },
    )
    if commit:
        db.commit()
        db.refresh(interaction)
    else:
        db.flush()

    result["interaction_id"] = str(interaction.id)
    result["latency_ms"] = latency_ms
    result["session_id"] = session
    result["language"] = result.get("language", "en")
    result["llm_provider"] = llm_service.provider
    result.pop("db", None)
    result.pop("user", None)
    return result
