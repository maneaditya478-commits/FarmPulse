import uuid


def _payload(client, headers):
    farm = client.get("/api/v1/farms", headers=headers).json()[0]
    species = client.get("/api/v1/animals/species", headers=headers).json()
    goat = next(item for item in species if item["code"] == "goat")
    tag = f"SYNC-{uuid.uuid4().hex[:6].upper()}"
    return farm, species, goat, {
        "client_id": "pytest-device",
        "operations": [
            {
                "client_id": "pytest-device",
                "entity_type": "animal",
                "entity_id": str(uuid.uuid4()),
                "operation": "create",
                "idempotency_key": f"pytest-{uuid.uuid4().hex}",
                "payload": {
                    "farm_id": farm["id"],
                    "species_id": goat["id"],
                    "name": "Offline Goat",
                    "tag_code": tag,
                    "sex": "female",
                },
            }
        ],
    }


def test_offline_animal_sync_and_idempotent_replay(client, farmer_headers):
    _, _, _, payload = _payload(client, farmer_headers)
    first = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["applied"] == 1
    assert first.json()["results"][0]["status"] == "applied"

    replay = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert replay.status_code == 200
    assert replay.json()["duplicates"] == 1
    assert replay.json()["results"][0]["status"] == "duplicate"


def test_sync_rejects_foreign_farm(client, farmer_headers):
    payload = _payload(client, farmer_headers)[3]
    payload["operations"][0]["payload"]["farm_id"] = "00000000-0000-0000-0000-000000000000"
    response = client.post("/api/v1/sync/batch", headers=farmer_headers, json=payload)
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "error"
    assert response.json()["errors"] == 1


def test_sync_operation_ledger(client, farmer_headers):
    response = client.get("/api/v1/sync/operations", headers=farmer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert response.json()
