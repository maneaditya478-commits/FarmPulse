"""Shared LangGraph workflow state."""

import operator
from typing import Annotated, Any, TypedDict


class GuardianState(TypedDict, total=False):
    # runtime context
    db: Any
    user: Any
    request_id: str

    # input
    text: str
    input_mode: str
    language: str
    language_locked: bool
    session_id: str
    animal_id: str | None

    # resolved context
    animal: Any
    farm: Any
    intent: str
    symptoms: list[str]
    duration_days: int | None
    observation: dict
    health_report: bool
    observation_id: str | None
    existing_case_id: str | None
    safety_events: Annotated[list[dict], operator.add]
    triage: dict
    case: Any
    case_id: str | None
    vet: Any
    appointment_id: str | None
    halt: bool
    halt_reason: str | None

    # orchestration
    plan: list[str]
    trace: Annotated[list[dict], operator.add]
    agents_used: Annotated[list[str], operator.add]

    # output
    response_text: str
    data: dict
    escalated: bool
    llm_provider: str
