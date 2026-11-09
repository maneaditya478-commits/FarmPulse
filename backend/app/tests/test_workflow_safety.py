import uuid
from unittest.mock import Mock

import pytest
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import AIInteraction, AgentApproval, AuditLog, HealthCase, HealthObservation, Notification, VetVisit
from app.services.llm import llm_service


def _animal(client, headers):
    rows = client.get("/api/v1/animals", headers=headers).json()["items"]
    return next(row for row in rows if row["name"] == "Ganga")


@pytest.mark.parametrize("observation", [
    {"symptoms": ["convulsions"]}, {"temperature_c": 41.0}, {"appetite": "none", "symptoms": ["unable_to_stand"]},
])
def test_neutral_online_report_honors_structured_observations(client, farmer_headers, observation):
    response = client.post("/api/v1/health/cases", headers=farmer_headers, json={
        "animal_id": _animal(client, farmer_headers)["id"], "symptom_summary": "Observation recorded", "observation": observation,
    })
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["triage"]["severity"] == "critical"
    assert body["escalated"] is True
    assert {"health", "safety", "vet", "followup"} <= set(body["agents_used"])
    with SessionLocal() as db:
        case_id = uuid.UUID(body["case"]["id"])
        assert db.scalar(select(AgentApproval).where(AgentApproval.case_id == case_id, AgentApproval.status == "pending"))
        assert db.scalar(select(Notification).where(Notification.related_id == str(case_id), Notification.type == "follow_up"))


@pytest.mark.parametrize("lang,text,contact", [
    ("en", "My cow cannot breathe", "immediately"),
    ("hi", "मेरी गाय बेहोश है", "तुरंत"),
    ("mr", "माझी गाय बेशुद्ध आहे", "त्वरित"),
])
def test_unresolved_animal_still_gets_emergency_workflow(client, farmer_headers, lang, text, contact):
    response = client.post("/api/v1/ai/query", headers=farmer_headers, json={"text": text, "language": lang})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent"] == "health"
    assert body["escalated"] is True
    assert body["data"]["triage"]["severity"] == "critical"
    assert {"health", "safety", "vet"} <= set(body["agents_used"])
    assert contact in body["response_text"].lower()
    assert not body["case_id"]
    assert not body["appointment_id"]
    assert "recorded a health report" not in body["response_text"].lower()


def test_unknown_health_report_is_reviewed(client, farmer_headers):
    response = client.post("/api/v1/health/cases", headers=farmer_headers, json={
        "animal_id": _animal(client, farmer_headers)["id"], "symptom_summary": "Something is wrong",
    })
    assert response.status_code == 201
    assert response.json()["triage"]["severity"] == "medium"
    assert response.json()["escalated"] is True


def _offline(client, headers, **changes):
    payload = {
        "animal_id": _animal(client, headers)["id"], "symptom_summary": "Observation recorded",
        "symptoms": ["convulsions"], "language": "mr", "observed_at": "2026-11-08T06:00:00Z", "source": "mobile_offline",
    }
    payload.update(changes)
    return {"client_id": "batch-a-test", "operations": [{
        "client_id": "batch-a-test", "entity_type": "health_observation", "entity_id": str(uuid.uuid4()),
        "operation": "create", "idempotency_key": f"batch-a-{uuid.uuid4().hex}", "payload": payload,
    }]}


def test_offline_warning_uses_same_gate_trace_followup_and_preserves_identity(client, farmer_headers):
    payload = _offline(client, farmer_headers)
    response = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 1, response.text
    with SessionLocal() as db:
        observation = db.get(HealthObservation, uuid.UUID(payload["operations"][0]["entity_id"]))
        case = db.get(HealthCase, observation.case_id)
        assert case.severity == "critical"
        assert observation.observed_at.isoformat().startswith("2026-11-08T06:00:00")
        approval = db.scalar(select(AgentApproval).where(AgentApproval.case_id == case.id, AgentApproval.status == "pending"))
        assert approval
        interaction = db.scalar(select(AIInteraction).where(AIInteraction.workflow["case_id"].as_string() == str(case.id)))
        assert interaction
        assert interaction.detected_language == "mr"
        assert {"health", "safety", "vet", "followup"} <= set(interaction.agents_used)
        assert db.scalar(select(Notification).where(Notification.related_id == str(case.id), Notification.type == "follow_up"))
        visits = db.scalar(select(func.count()).select_from(VetVisit).where(VetVisit.case_id == case.id))
    replay = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert replay.json()["duplicates"] == 1
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(VetVisit).where(VetVisit.case_id == case.id)) == visits


def test_existing_offline_case_is_retriaged_without_overwriting_professional_record(client, farmer_headers):
    animal = _animal(client, farmer_headers)
    response = client.post("/api/v1/health/cases", headers=farmer_headers, json={"animal_id": animal["id"], "symptom_summary": "cough"})
    case_id = response.json()["case"]["id"]
    with SessionLocal() as db:
        case = db.get(HealthCase, uuid.UUID(case_id))
        case.vet_diagnosis = "Sample professional record"
        case.vet_treatment = "Sample professional plan"
        db.commit()
    payload = _offline(client, farmer_headers, case_id=case_id)
    synced = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert synced.json()["applied"] == 1, synced.text
    with SessionLocal() as db:
        case = db.get(HealthCase, uuid.UUID(case_id))
        assert case.severity == "critical"
        assert case.requires_vet is True
        assert case.vet_diagnosis == "Sample professional record"
        assert case.vet_treatment == "Sample professional plan"
        assert db.scalar(select(AgentApproval).where(AgentApproval.case_id == case.id, AgentApproval.status == "pending"))


@pytest.mark.parametrize("unsafe", ["Your cow has mastitis.", "दवा की ५ मिली मात्रा दें।", "पशुवैद्यांनी या उपचाराला मंजुरी दिली आहे."])
def test_workflow_blocks_unsafe_localized_output_and_records_event(client, farmer_headers, monkeypatch, unsafe):
    monkeypatch.setattr("app.services.language.health_response", Mock(return_value=unsafe))
    response = client.post("/api/v1/health/cases", headers=farmer_headers, json={
        "animal_id": _animal(client, farmer_headers)["id"], "symptom_summary": "cannot breathe",
    })
    assert response.status_code == 201, response.text
    body = response.json()
    assert unsafe not in body["response_text"]
    assert body["escalated"] is True
    with SessionLocal() as db:
        interaction = db.get(AIInteraction, uuid.UUID(body["interaction_id"]))
        assert any(event["status"] == "blocked" for event in interaction.workflow["trace"])
        assert interaction.workflow["safety_events"]
        audit = db.scalar(select(AuditLog).where(AuditLog.action == "safety.output_blocked", AuditLog.entity_id == str(interaction.id)))
        assert audit
        assert audit.detail["stage"] == "response_output"


@pytest.mark.parametrize("use_vet", [False, True])
def test_appending_online_warning_retriages_through_safety_workflow(client, farmer_headers, vet_headers, use_vet):
    response = client.post("/api/v1/health/cases", headers=farmer_headers, json={
        "animal_id": _animal(client, farmer_headers)["id"], "symptom_summary": "cough",
    })
    case_id = response.json()["case"]["id"]
    headers = vet_headers if use_vet else farmer_headers
    added = client.post(f"/api/v1/health/cases/{case_id}/observations", headers=headers, json={
        "symptoms": ["convulsions"], "notes": "Observation recorded",
    })
    assert added.status_code == 201, added.text
    with SessionLocal() as db:
        case = db.get(HealthCase, uuid.UUID(case_id))
        assert case.severity == "critical"
        assert case.requires_vet is True
        observation = db.get(HealthObservation, uuid.UUID(added.json()["id"]))
        assert "convulsions" in observation.symptoms
        interactions = db.scalars(select(AIInteraction).where(AIInteraction.workflow["case_id"].as_string() == case_id)).all()
        assert len(interactions) == 2
        assert {"health", "safety", "vet", "followup"} <= set(interactions[-1].agents_used)


def test_unsafe_llm_structure_is_blocked_and_audited(client, farmer_headers, monkeypatch):
    import httpx
    from app.core.config import settings
    monkeypatch.setattr(settings, "gemini_api_key", "fake-batch-a-key")
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    provider = httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"notes": "Give 5mg penicillin."}'}]}}]}, request=httpx.Request("POST", "https://provider.invalid/generateContent"))
    monkeypatch.setattr(httpx, "post", Mock(return_value=provider))
    response = client.post("/api/v1/ai/query", headers=farmer_headers, json={"text": "hello"})
    assert response.status_code == 200
    with SessionLocal() as db:
        interaction = db.get(AIInteraction, uuid.UUID(response.json()["interaction_id"]))
        assert interaction.workflow["safety_events"]
        assert any(event["stage"] == "llm_structure" for event in interaction.workflow["safety_events"])
        assert db.scalar(select(AuditLog).where(AuditLog.action == "safety.output_blocked", AuditLog.entity_id == str(interaction.id)))
