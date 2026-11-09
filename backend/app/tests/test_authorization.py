"""Batch B regression tests: authorization findings H01-H06, M02, M03.

Each test reproduces one audited defect. Fresh accounts are registered per test
so the shared demonstration dataset and session fixtures stay untouched.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import jwt

from app.core.config import settings
from app.tests.conftest import login

PASSWORD = "Demo@1234"


def _register(client, role="farmer", admin_headers=None, **overrides):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"batchb.{suffix}@example.com",
        "password": PASSWORD,
        "full_name": f"Batch B {role} {suffix}",
        "role": role,
        "district": "Pune",
        "village": "Khed",
        "language": "en",
    }
    if role in ("veterinarian", "paravet"):
        payload["registration_no"] = f"REG-{suffix.upper()}"
        payload["qualification"] = "BVSc"
    payload.update(overrides)
    if role in ("farmer", "veterinarian"):
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 201, response.text
        body = response.json()
        return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]
    assert admin_headers is not None, "non-self-registerable roles need admin creation"
    created = client.post("/api/v1/users", headers=admin_headers, json=payload)
    assert created.status_code == 201, created.text
    user = created.json()
    return login(client, user["email"]), user


def _headers_from_token(token):
    return {"Authorization": f"Bearer {token}"}


def _create_animal(client, headers, name="Batch B cow"):
    species = client.get("/api/v1/animals/species", headers=headers).json()
    cattle = next(item for item in species if item["code"] == "cattle")
    response = client.post(
        "/api/v1/animals",
        headers=headers,
        json={"species_id": cattle["id"], "name": name, "sex": "female"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _report_case(client, headers, animal_id, summary="The cow has seizures and cannot stand"):
    response = client.post(
        "/api/v1/health/cases",
        headers=headers,
        json={"animal_id": animal_id, "symptom_summary": summary, "language": "en"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _sync_op(entity_type, payload, operation="create", entity_id=None):
    return {
        "client_id": "batch-b-test",
        "entity_type": entity_type,
        "entity_id": entity_id or str(uuid.uuid4()),
        "operation": operation,
        "idempotency_key": f"batchb-{uuid.uuid4().hex}",
        "payload": payload,
    }


def _sync(client, headers, operations):
    response = client.post(
        "/api/v1/sync/batch",
        headers=headers,
        json={"client_id": "batch-b-test", "operations": operations},
    )
    assert response.status_code == 200, response.text
    return response.json()["results"]


# ---------------------------------------------------------------- H01
def test_h01_unlinked_cooperative_sees_no_medical_records(client, admin_headers):
    coop, _ = _register(client, role="cooperative", admin_headers=admin_headers)
    response = client.get("/api/v1/health/records", headers=coop)
    assert response.status_code == 200
    assert response.json() == [], "unlinked cooperative must not read global medical records"


def test_h01_linked_cooperative_records_scoped_to_members(client, coop_headers, farmer_headers):
    member_animals = client.get("/api/v1/animals?page_size=100", headers=coop_headers).json()
    member_ids = {item["id"] for item in member_animals["items"]}
    assert member_ids, "demo cooperative should have member animals"
    records = client.get("/api/v1/health/records", headers=coop_headers).json()
    assert records
    assert all(record["animal_id"] in member_ids for record in records), (
        "cooperative medical records must stay within consented member animals"
    )


# ---------------------------------------------------------------- H02
def test_h02_membership_requires_farmer_consent(client, admin_headers):
    farmer, farmer_user = _register(client)
    animal = _create_animal(client, farmer)
    coop, _ = _register(client, role="cooperative", admin_headers=admin_headers)

    invited = client.post(
        "/api/v1/users/cooperative/members",
        headers=coop,
        json={"farmer_email": farmer_user["email"]},
    )
    assert invited.status_code == 201, invited.text
    membership = invited.json()
    assert membership["status"] == "pending", "membership must await farmer consent, not self-activate"

    before = client.get(f"/api/v1/animals/{animal['id']}", headers=coop)
    assert before.status_code == 404, "pending membership must not grant animal access"

    invitations = client.get("/api/v1/users/cooperative/invitations", headers=farmer)
    assert invitations.status_code == 200, invitations.text
    assert any(item["id"] == membership["id"] for item in invitations.json())

    accepted = client.post(
        f"/api/v1/users/cooperative/invitations/{membership['id']}/decision",
        headers=farmer,
        json={"decision": "accept"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "active"

    after = client.get(f"/api/v1/animals/{animal['id']}", headers=coop)
    assert after.status_code == 200, "consented membership grants member-animal access"


def test_h02_farmer_can_decline_membership(client, admin_headers):
    farmer, farmer_user = _register(client)
    animal = _create_animal(client, farmer)
    coop, _ = _register(client, role="cooperative", admin_headers=admin_headers)
    invited = client.post(
        "/api/v1/users/cooperative/members",
        headers=coop,
        json={"farmer_email": farmer_user["email"]},
    )
    assert invited.status_code == 201, invited.text
    membership = invited.json()

    declined = client.post(
        f"/api/v1/users/cooperative/invitations/{membership['id']}/decision",
        headers=farmer,
        json={"decision": "decline"},
    )
    assert declined.status_code == 200, declined.text
    still_denied = client.get(f"/api/v1/animals/{animal['id']}", headers=coop)
    assert still_denied.status_code == 404
    members = client.get("/api/v1/users/cooperative/members", headers=coop).json()
    assert all(item["id"] != membership["id"] for item in members)


def test_h02_other_farmer_cannot_decide_invitation(client, admin_headers):
    farmer, farmer_user = _register(client)
    other, _ = _register(client)
    coop, _ = _register(client, role="cooperative", admin_headers=admin_headers)
    invited = client.post(
        "/api/v1/users/cooperative/members",
        headers=coop,
        json={"farmer_email": farmer_user["email"]},
    )
    membership = invited.json()
    response = client.post(
        f"/api/v1/users/cooperative/invitations/{membership['id']}/decision",
        headers=other,
        json={"decision": "accept"},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------- H03
def test_h03_record_case_must_belong_to_same_animal(client, admin_headers, vet_headers):
    vet_cases = client.get("/api/v1/health/cases?page_size=100", headers=vet_headers).json()["items"]
    assert vet_cases
    accessible = client.get("/api/v1/animals?page_size=100", headers=vet_headers).json()["items"]
    assert len(accessible) >= 2
    case = vet_cases[0]
    other_animal = next(animal for animal in accessible if animal["id"] != case["animal_id"])
    response = client.post(
        "/api/v1/health/records",
        headers=vet_headers,
        json={
            "animal_id": other_animal["id"],
            "case_id": case["id"],
            "record_type": "note",
            "title": "Cross-animal linkage attempt",
        },
    )
    assert response.status_code == 422, "record must not link an accessible animal to another animal's case"
    assert response.json()["error"]["code"] == "animal_case_mismatch"


def test_h03_record_case_must_be_accessible(client, vet_headers):
    other_farmer = login(client, "savitri@alg.demo")
    foreign_cases = client.get("/api/v1/health/cases", headers=other_farmer).json()["items"]
    foreign_animals = client.get("/api/v1/animals?page_size=100", headers=other_farmer).json()["items"]
    vet_animal_ids = {item["id"] for item in client.get("/api/v1/animals?page_size=100", headers=vet_headers).json()["items"]}
    pair = next(
        (case for case in foreign_cases if case["animal_id"] not in vet_animal_ids),
        None,
    )
    assert pair is not None
    assert pair["animal_id"] in {item["id"] for item in foreign_animals}
    response = client.post(
        "/api/v1/health/records",
        headers=vet_headers,
        json={
            "animal_id": pair["animal_id"],
            "case_id": pair["id"],
            "record_type": "note",
            "title": "Inaccessible case attempt",
        },
    )
    assert response.status_code == 404


def test_h03_sync_observation_rejects_mismatched_case(client, farmer_headers, admin_headers):
    other_farmer = login(client, "savitri@alg.demo")
    foreign_case = client.get("/api/v1/health/cases", headers=other_farmer).json()["items"][0]
    own_animal = client.get("/api/v1/animals?page_size=1", headers=farmer_headers).json()["items"][0]
    results = _sync(
        client,
        farmer_headers,
        [
            _sync_op(
                "health_observation",
                {
                    "animal_id": own_animal["id"],
                    "case_id": foreign_case["id"],
                    "symptom_summary": "The cow has seizures",
                    "symptoms": ["convulsions"],
                    "language": "en",
                    "observed_at": "2026-11-08T06:00:00Z",
                    "source": "mobile_offline",
                },
            )
        ],
    )
    assert results[0]["status"] == "error"


def test_h03_offline_observation_reopens_resolved_case(client, admin_headers):
    farmer, _ = _register(client)
    animal = _create_animal(client, farmer)
    report = _report_case(client, farmer, animal["id"])
    case_id = report["case"]["id"]
    resolved = client.patch(
        f"/api/v1/health/cases/{case_id}",
        headers=admin_headers,
        json={"status": "resolved"},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"

    results = _sync(
        client,
        farmer,
        [
            _sync_op(
                "health_observation",
                {
                    "animal_id": animal["id"],
                    "case_id": case_id,
                    "symptom_summary": "The cow cannot breathe",
                    "symptoms": ["breathing_difficulty"],
                    "language": "en",
                    "observed_at": datetime.now(UTC).isoformat(),
                    "source": "mobile_offline",
                },
            )
        ],
    )
    assert results[0]["status"] == "applied", results
    refreshed = client.get(f"/api/v1/health/cases/{case_id}", headers=farmer).json()
    assert refreshed["status"] != "resolved", "new urgent observation must reopen a resolved case"
    assert refreshed["severity"] == "critical"


# ---------------------------------------------------------------- H04
def _assigned_unverified_vet(client, admin_headers):
    farmer, _ = _register(client)
    animal = _create_animal(client, farmer)
    report = _report_case(client, farmer, animal["id"])
    case_id = report["case"]["id"]
    vet, _ = _register(client, role="veterinarian")
    located = client.post(
        "/api/v1/veterinarians/me",
        headers=vet,
        json={
            "registration_no": f"REG-{uuid.uuid4().hex[:8].upper()}",
            "qualification": "BVSc",
            "district": "Pune",
            "latitude": 18.52,
            "longitude": 73.85,
        },
    )
    assert located.status_code == 201, located.text
    profile = client.get("/api/v1/veterinarians/me", headers=vet).json()
    assert profile["verified"] is False
    assigned = client.post(
        f"/api/v1/health/cases/{case_id}/assign",
        headers=admin_headers,
        json={"vet_id": profile["id"]},
    )
    assert assigned.status_code == 200, assigned.text
    return vet, profile, animal, case_id


def test_h04_unverified_vet_cannot_confirm_assessment(client, admin_headers):
    vet, _, _, case_id = _assigned_unverified_vet(client, admin_headers)
    response = client.patch(
        f"/api/v1/health/cases/{case_id}",
        headers=vet,
        json={"vet_diagnosis": "Unverified claim", "vet_treatment": "Unverified plan", "status": "in_progress"},
    )
    assert response.status_code == 403, "unverified professional must not confirm assessments"
    case = client.get(f"/api/v1/health/cases/{case_id}", headers=admin_headers).json()
    assert not case.get("approved_at")


def test_h04_unverified_vet_cannot_create_approved_record(client, admin_headers):
    vet, _, animal, _ = _assigned_unverified_vet(client, admin_headers)
    response = client.post(
        "/api/v1/health/records",
        headers=vet,
        json={"animal_id": animal["id"], "record_type": "diagnosis", "title": "Unverified diagnosis"},
    )
    assert response.status_code == 403


def test_h04_unverified_vet_cannot_decide_approval(client, admin_headers):
    vet, _, _, case_id = _assigned_unverified_vet(client, admin_headers)
    approvals = client.get("/api/v1/health/approvals", headers=vet).json()
    pending = [item for item in approvals if item["case_id"] == case_id and item["status"] == "pending"]
    assert pending, "critical case should raise a pending safety approval"
    response = client.post(
        f"/api/v1/health/approvals/{pending[0]['id']}/decision",
        headers=vet,
        json={"decision": "approved", "reason": "unverified attempt"},
    )
    assert response.status_code == 403


def test_h04_unverified_vet_cannot_verify_vaccination(client, admin_headers):
    vet, _, animal, _ = _assigned_unverified_vet(client, admin_headers)
    rows = client.get(f"/api/v1/vaccinations?animal_id={animal['id']}", headers=vet).json()
    assert rows
    response = client.post(
        f"/api/v1/vaccinations/{rows[0]['id']}/verify",
        headers=vet,
        json={"verified": True, "batch_no": "FAKE-BATCH", "certificate_ref": "FAKE-CERT"},
    )
    assert response.status_code == 403


def test_h04_unverified_vet_recording_gets_no_attestation(client, admin_headers):
    vet, _, animal, _ = _assigned_unverified_vet(client, admin_headers)
    rows = client.get(f"/api/v1/vaccinations?animal_id={animal['id']}", headers=vet).json()
    target = next(row for row in rows if row["status"] != "given")
    response = client.post(
        "/api/v1/vaccinations",
        headers=vet,
        json={
            "animal_id": animal["id"],
            "vaccine_id": target["vaccine_id"],
            "administered_on": date.today().isoformat(),
            "batch_no": "UNVERIFIED-BATCH",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["verified_by"] is None, "unverified professional must not attest vaccinations"
    assert response.json()["certificate_ref"] is None


def test_h04_credential_change_resets_verification(client, admin_headers):
    vet, profile, _, _ = _assigned_unverified_vet(client, admin_headers)
    verified = client.post(
        f"/api/v1/admin/veterinarians/{profile['id']}/verify",
        headers=admin_headers,
        json={"verified": True, "note": "batch B test"},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified"] is True
    changed = client.post(
        "/api/v1/veterinarians/me",
        headers=vet,
        json={
            "registration_no": f"NEW-{uuid.uuid4().hex[:8].upper()}",
            "qualification": "BVSc",
            "district": "Pune",
            "latitude": 18.52,
            "longitude": 73.85,
        },
    )
    assert changed.status_code == 201, changed.text
    assert changed.json()["verified"] is False, "changed registration must require re-verification"


# ---------------------------------------------------------------- H05
def test_h05_farmer_edit_invalidates_professional_attestation(client, admin_headers, vet_headers):
    farmer, _ = _register(client)
    animal = _create_animal(client, farmer)
    _report_case(client, farmer, animal["id"])
    vet_profile = client.get("/api/v1/veterinarians/me", headers=vet_headers).json()
    cases = client.get("/api/v1/health/cases", headers=farmer).json()["items"]
    case_id = cases[0]["id"]
    assigned = client.post(
        f"/api/v1/health/cases/{case_id}/assign",
        headers=admin_headers,
        json={"vet_id": vet_profile["id"]},
    )
    assert assigned.status_code == 200, assigned.text

    rows = client.get(f"/api/v1/vaccinations?animal_id={animal['id']}", headers=farmer).json()
    target = next(row for row in rows if row["status"] != "given")
    attested = client.post(
        "/api/v1/vaccinations",
        headers=vet_headers,
        json={
            "animal_id": animal["id"],
            "vaccine_id": target["vaccine_id"],
            "administered_on": date.today().isoformat(),
            "batch_no": "VET-BATCH-1",
        },
    )
    assert attested.status_code == 201, attested.text
    assert attested.json()["verified_by"] == vet_profile["id"]
    assert attested.json()["certificate_ref"]

    changed = client.post(
        "/api/v1/vaccinations",
        headers=farmer,
        json={
            "animal_id": animal["id"],
            "vaccine_id": target["vaccine_id"],
            "administered_on": (date.today() - timedelta(days=3)).isoformat(),
            "batch_no": "FARMER-CHANGED",
        },
    )
    assert changed.status_code == 201, changed.text
    body = changed.json()
    assert body["verified_by"] is None, "farmer-edited administration must invalidate the professional attestation"
    assert body["certificate_ref"] is None, "certificate must not survive unverified edits"


# ---------------------------------------------------------------- H06
def test_h06_cooperative_sync_write_matches_online_forbidden(client, coop_headers, farmer_headers):
    animal = client.get("/api/v1/animals?page_size=1", headers=coop_headers).json()["items"][0]
    online = client.post(
        "/api/v1/nutrition/feed",
        headers=coop_headers,
        json={"animal_id": animal["id"], "feed_type": "green_fodder", "quantity_kg": 5},
    )
    assert online.status_code == 403
    results = _sync(
        client,
        coop_headers,
        [_sync_op("feed_record", {"animal_id": animal["id"], "feed_type": "green_fodder", "quantity_kg": 5})],
    )
    assert results[0]["status"] == "error", "sync must enforce the same role gate as the online route"


def test_h06_sync_rejects_out_of_range_payloads(client, farmer_headers):
    animal = client.get("/api/v1/animals?page_size=1", headers=farmer_headers).json()["items"][0]
    farm_id = animal["farm_id"]
    operations = [
        _sync_op("environmental_record", {"farm_id": farm_id, "temperature_c": 999}),
        _sync_op("feed_record", {"animal_id": animal["id"], "feed_type": "silage", "quantity_kg": -5}),
        _sync_op("feed_record", {"animal_id": animal["id"], "feed_type": "silage", "quantity_kg": 5, "cost": -1}),
        _sync_op("water_record", {"animal_id": animal["id"], "litres": -10}),
    ]
    results = _sync(client, farmer_headers, operations)
    assert all(result["status"] == "error" for result in results), results


def test_h06_sync_update_operation_only_supported_for_animals(client, farmer_headers):
    animal = client.get("/api/v1/animals?page_size=1", headers=farmer_headers).json()["items"][0]
    results = _sync(
        client,
        farmer_headers,
        [
            _sync_op(
                "feed_record",
                {"animal_id": animal["id"], "feed_type": "silage", "quantity_kg": 5},
                operation="update",
                entity_id=animal["id"],
            )
        ],
    )
    assert results[0]["status"] == "error", "non-animal entities have no online update route; sync must not create instead"


def test_h06_sync_animal_create_role_parity(client, coop_headers):
    species = client.get("/api/v1/animals/species", headers=coop_headers).json()
    cattle = next(item for item in species if item["code"] == "cattle")
    results = _sync(
        client,
        coop_headers,
        [_sync_op("animal", {"species_id": cattle["id"], "name": "Coop sync animal", "sex": "female"})],
    )
    assert results[0]["status"] == "error", "online animal creation is farmer/admin only"


# ---------------------------------------------------------------- M02
def test_m02_unlinked_cooperative_appointment_count_zero(client, admin_headers):
    coop, _ = _register(client, role="cooperative", admin_headers=admin_headers)
    overview = client.get("/api/v1/analytics/overview", headers=coop).json()
    assert overview["upcoming_appointments"] == 0


def test_m02_farmer_without_farm_sees_no_foreign_alerts(client, admin_headers):
    created = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "email": f"batchb.nofarm.{uuid.uuid4().hex[:8]}@example.com",
            "password": PASSWORD,
            "full_name": "No Farm Farmer",
            "role": "farmer",
        },
    )
    assert created.status_code == 201, created.text
    headers = login(client, created.json()["email"])
    overview = client.get("/api/v1/analytics/overview", headers=headers).json()
    assert overview["total_animals"] == 0
    assert not [alert for alert in overview["alerts"] if alert["type"] == "environment"], (
        "farmer without a farm must not see other farms' environmental alerts"
    )


def test_m02_vet_case_trends_scoped_to_assignments(client):
    vet = login(client, "dr.vikram@alg.demo")
    since = (date.today() - timedelta(days=29)).isoformat()
    assigned = client.get("/api/v1/health/cases?page_size=100", headers=vet).json()["items"]
    expected_total = sum(1 for case in assigned if case["opened_at"][:10] >= since)
    trends = client.get("/api/v1/analytics/trends?days=30", headers=vet).json()
    actual_total = sum(entry["total"] for entry in trends["health_cases"])
    assert actual_total == expected_total, "vet case trends must cover only assigned cases"


def test_m02_vet_finance_excludes_unassigned_animals(client):
    vet = login(client, "dr.aarti@alg.demo")
    milk_rows = client.get("/api/v1/finance/milk?days=30", headers=vet).json()
    expected = round(sum(row["litres"] * (row["price_per_litre"] if row["price_per_litre"] is not None else 35.0) for row in milk_rows), 2)
    summary = client.get("/api/v1/finance/summary?days=30", headers=vet).json()
    assert summary["milk_revenue"] == expected, "vet finance must not include unassigned sibling-animal revenue"


# ---------------------------------------------------------------- M03
def test_m03_password_change_invalidates_old_tokens(client):
    headers, user = _register(client)
    old_token = headers["Authorization"].split(" ", 1)[1]
    wrong = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "wrong-password", "new_password": "NewPass@1234"},
    )
    assert wrong.status_code == 400
    changed = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": PASSWORD, "new_password": "NewPass@1234"},
    )
    assert changed.status_code == 200, changed.text
    body = changed.json()
    assert body.get("access_token"), "password change should return a fresh token"

    stale = client.get("/api/v1/auth/me", headers=_headers_from_token(old_token))
    assert stale.status_code == 401, "tokens issued before the password change must be rejected"
    fresh = client.get("/api/v1/auth/me", headers=_headers_from_token(body["access_token"]))
    assert fresh.status_code == 200
    relogin = login(client, user["email"], "NewPass@1234")
    assert client.get("/api/v1/auth/me", headers=relogin).status_code == 200


def test_m03_profile_patch_cannot_change_password(client):
    headers, user = _register(client)
    response = client.patch("/api/v1/users/me", headers=headers, json={"password": "Sneaky@12345"})
    assert response.status_code == 400, "self-service password change must require the current password via /auth/change-password"
    assert client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": "Sneaky@12345"}
    ).status_code == 401


def test_m03_admin_password_reset_invalidates_tokens(client, admin_headers):
    headers, user = _register(client)
    reset = client.patch(
        f"/api/v1/users/{user['id']}",
        headers=admin_headers,
        json={"password": "AdminReset@123"},
    )
    assert reset.status_code == 200, reset.text
    stale = client.get("/api/v1/auth/me", headers=headers)
    assert stale.status_code == 401


def test_m03_token_without_expiry_rejected(client):
    headers, user = _register(client)
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "iat": int(datetime.now(UTC).timestamp()),
        "iss": "ai-livestock-guardian",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    response = client.get("/api/v1/auth/me", headers=_headers_from_token(token))
    assert response.status_code == 401, "tokens without an exp claim must be rejected"