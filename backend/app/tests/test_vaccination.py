def test_catalogue_has_sourced_protocols(client, farmer_headers):
    response = client.get("/api/v1/vaccinations/catalog", headers=farmer_headers)
    assert response.status_code == 200
    rows = response.json()
    assert rows
    for row in rows:
        assert row["source_reference"]
        assert row["is_verified"] is True


def test_schedule_and_overdue(client, farmer_headers):
    schedule = client.get("/api/v1/vaccinations/schedule", headers=farmer_headers)
    overdue = client.get("/api/v1/vaccinations/overdue", headers=farmer_headers)
    assert schedule.status_code == 200
    assert overdue.status_code == 200
    items = schedule.json()["items"] if isinstance(schedule.json(), dict) else schedule.json()
    assert items
    for item in items:
        assert item["note"] == "Verify with a veterinarian before administration"
        assert item["source_reference"]


def test_farmer_report_is_unverified_and_cannot_self_verify(client, farmer_headers, vet_headers):
    animal = client.get("/api/v1/animals", headers=farmer_headers).json()["items"][0]
    catalog = client.get("/api/v1/vaccinations/catalog", headers=farmer_headers).json()
    vaccine = next(item for item in catalog if item["species_id"] == animal["species"]["id"])
    reported = client.post(
        "/api/v1/vaccinations",
        headers=farmer_headers,
        json={"animal_id": animal["id"], "vaccine_id": vaccine["id"], "administered_by": "Farmer report"},
    )
    assert reported.status_code == 201, reported.text
    assert reported.json()["verified_by"] is None

    forbidden = client.post(
        f"/api/v1/vaccinations/{reported.json()['id']}/verify",
        headers=farmer_headers,
        json={"verified": True},
    )
    assert forbidden.status_code == 403


def test_reminders_are_created_once(client, farmer_headers):
    first = client.post("/api/v1/vaccinations/reminders", headers=farmer_headers)
    second = client.post("/api/v1/vaccinations/reminders", headers=farmer_headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["created"] == 0
