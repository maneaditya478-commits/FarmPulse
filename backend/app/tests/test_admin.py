def test_admin_overview(client, admin_headers):
    response = client.get("/api/v1/admin/overview", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_users"] >= 6
    assert body["animals"] >= 25  # Ramesh 20 + Savitri 5 (+ any test-created animals)
    assert body["unverified_veterinarians"] >= 0
    assert body["demo_data_enabled"] is True


def test_audit_trail_contains_demo_and_actions(client, admin_headers):
    response = client.get("/api/v1/admin/audit-logs?page_size=100", headers=admin_headers)
    assert response.status_code == 200
    actions = [item["action"] for item in response.json()["items"]]
    assert "demo.seeded" in actions
    assert any(action.startswith("health_case") for action in actions)


def test_agent_monitor_reports_guardrails(client, admin_headers):
    response = client.get("/api/v1/admin/agent-monitor", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_interactions"] >= 1
    assert body["agent_usage_recent"]
    assert body["llm_provider"]


def test_vet_verification(client, admin_headers):
    vets = client.get("/api/v1/admin/veterinarians", headers=admin_headers).json()
    vet = next(item for item in vets if item["registration_no"].startswith("MVC-PUN-2018"))
    response = client.post(
        f"/api/v1/admin/veterinarians/{vet['id']}/verify",
        headers=admin_headers,
        json={"verified": True, "note": "Verified for demonstration"},
    )
    assert response.status_code == 200
    assert response.json()["verified"] is True


def test_system_guardrails(client, admin_headers):
    body = client.get("/api/v1/admin/system", headers=admin_headers).json()
    assert body["guardrails"]
    assert any("diagnos" in item.lower() for item in body["guardrails"])
