"""Contract tests for the Expo mobile client request payloads."""


def _first_animal(client, headers):
    payload = client.get("/api/v1/animals?page_size=1", headers=headers).json()
    assert payload["items"]
    return payload["items"][0]


def test_mobile_feed_and_water_records(client, farmer_headers):
    animal = _first_animal(client, farmer_headers)
    feed = client.post(
        "/api/v1/nutrition/feed",
        headers=farmer_headers,
        json={
            "animal_id": animal["id"],
            "feed_type": "green_fodder",
            "quantity_kg": 12.5,
            "cost": 180,
            "mineral_supplement": "Mineral mix",
            "notes": "mobile contract",
        },
    )
    assert feed.status_code == 201, feed.text
    assert feed.json()["quantity_kg"] == 12.5
    assert feed.json()["cost"] == 180

    water = client.post(
        "/api/v1/nutrition/water",
        headers=farmer_headers,
        json={
            "animal_id": animal["id"],
            "litres": 45,
            "source": "Borewell",
            "quality_note": "mobile contract",
        },
    )
    assert water.status_code == 201, water.text
    assert water.json()["litres"] == 45
    assert water.json()["source"] == "Borewell"


def test_mobile_qr_issue_and_lookup(client, farmer_headers):
    animal = _first_animal(client, farmer_headers)
    issued = client.post(f"/api/v1/animals/{animal['id']}/qr", headers=farmer_headers)
    assert issued.status_code == 200, issued.text
    payload = issued.json()
    assert payload["animal_id"] == animal["id"]
    assert payload["identifier_value"]
    assert payload["qr_payload"]

    lookup = client.get(f"/api/v1/animals/qr/{payload['identifier_value']}", headers=farmer_headers)
    assert lookup.status_code == 200, lookup.text
    assert lookup.json()["id"] == animal["id"]


def test_mobile_nearby_vets_sort_by_device_location(client, farmer_headers):
    baseline = client.get("/api/v1/veterinarians/nearby", headers=farmer_headers)
    assert baseline.status_code == 200
    assert baseline.json()

    response = client.get(
        "/api/v1/veterinarians/nearby?latitude=18.52&longitude=73.85", headers=farmer_headers
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert all(item["distance_km"] is not None for item in items)
    distances = [item["distance_km"] for item in items]
    assert distances == sorted(distances)


def test_mobile_language_preference_roundtrip(client, farmer_headers):
    patched = client.patch("/api/v1/users/me", headers=farmer_headers, json={"language": "hi"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["language"] == "hi"
    me = client.get("/api/v1/auth/me", headers=farmer_headers)
    assert me.json()["language"] == "hi"

    restored = client.patch("/api/v1/users/me", headers=farmer_headers, json={"language": "mr"})
    assert restored.status_code == 200
    assert restored.json()["language"] == "mr"
