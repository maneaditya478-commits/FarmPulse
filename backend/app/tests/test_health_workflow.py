def _ganga(client, headers):
    animals = client.get("/api/v1/animals", headers=headers).json()["items"]
    return next(animal for animal in animals if animal["name"] == "Ganga")


def test_farmer_health_workflow_escalates(client, farmer_headers, vet_headers):
    ganga = _ganga(client, farmer_headers)
    response = client.post(
        "/api/v1/health/cases",
        headers=farmer_headers,
        json={
            "animal_id": ganga["id"],
            "symptom_summary": "गायीला दोन दिवसांपासून ताप आहे आणि ती उभी राहू शकत नाही.",
            "language": "mr",
            "observation": {"source": "voice", "temperature_c": 40.6, "appetite": "reduced"},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["triage"]["severity"] == "critical"
    assert body["escalated"] is True
    assert body["case"]["id"]
    assert body["case"]["case_code"].startswith(("ALG-CASE", "HC-"))
    assert "safety" in body["agents_used"]
    assert "vet" in body["agents_used"]
    assert body["response_text"]

    cases = client.get("/api/v1/health/cases", headers=vet_headers).json()
    codes = [case["case_code"] for case in cases["items"]]
    assert body["case"]["case_code"] in codes


def test_vet_records_diagnosis_and_treatment(client, farmer_headers, vet_headers):
    cases = client.get("/api/v1/health/cases?severity=critical", headers=vet_headers).json()["items"]
    case = next(item for item in cases if item["assigned_vet_id"])
    update = client.patch(
        f"/api/v1/health/cases/{case['id']}",
        headers=vet_headers,
        json={
            "vet_diagnosis": "Clinical assessment confirmed by attending veterinarian (sample).",
            "vet_treatment": "Treatment plan recorded by attending veterinarian (sample).",
            "status": "in_progress",
        },
    )
    assert update.status_code == 200, update.text
    payload = update.json()
    assert payload["vet_diagnosis"]
    assert payload["vet_treatment"]
    assert payload["approved_at"] is not None


def test_incomplete_assessment_rejected(client, vet_headers):
    cases = client.get("/api/v1/health/cases?status=assigned", headers=vet_headers).json()["items"]
    if not cases:
        return
    case = cases[0]
    response = client.patch(
        f"/api/v1/health/cases/{case['id']}",
        headers=vet_headers,
        json={"vet_diagnosis": "Only diagnosis without a plan"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "incomplete_assessment"


def test_farmer_cannot_edit_clinical_assessment(client, farmer_headers):
    cases = client.get("/api/v1/health/cases", headers=farmer_headers).json()["items"]
    assert cases
    response = client.patch(
        f"/api/v1/health/cases/{cases[0]['id']}",
        headers=farmer_headers,
        json={"vet_diagnosis": "Not allowed"},
    )
    assert response.status_code == 403


def test_health_agents_catalogue(client, farmer_headers):
    body = client.get("/api/v1/ai/agents", headers=farmer_headers).json()
    text = str(body).lower()
    for agent in ("orchestrator", "health", "vaccination", "safety", "veterinary", "market", "financial"):
        assert agent in text


def test_ai_query_marathi_creates_trace(client, farmer_headers):
    ganga = _ganga(client, farmer_headers)
    response = client.post(
        "/api/v1/ai/query",
        headers=farmer_headers,
        json={
            "text": "माझी गाय दोन दिवसांपासून नीट खात नाही आणि दूध कमी देत आहे.",
            "animal_id": ganga["id"],
            "language": "mr",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent"] == "health"
    assert body["language"] == "mr"
    assert body["trace"]
    assert body["escalated"] is True
    assert body["llm_provider"]


def test_warning_signs_are_localized(client, farmer_headers):
    english = client.get("/api/v1/health/warning-signs", headers=farmer_headers).json()
    marathi = client.get("/api/v1/health/warning-signs?language=mr", headers=farmer_headers).json()

    assert len(english["warning_signs"]) == 8
    assert len(marathi["warning_signs"]) == 8
    assert "difficulty breathing" in english["warning_signs"]
    assert "श्वास घेण्यास त्रास" in marathi["warning_signs"]
    assert english["warning_signs"] != marathi["warning_signs"]
    assert marathi["note"] != english["note"]
