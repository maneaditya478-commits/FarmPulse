from app.tests.conftest import login


def test_login_and_me(client):
    headers = login(client, "ramesh@alg.demo")
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "farmer"
    assert body["language"] == "mr"
    assert body["is_sample"] is True


def test_invalid_credentials(client):
    response = client.post("/api/v1/auth/login", json={"email": "ramesh@alg.demo", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_farmer_cannot_access_admin(client, farmer_headers):
    response = client.get("/api/v1/admin/overview", headers=farmer_headers)
    assert response.status_code == 403


def test_missing_token_rejected(client):
    response = client.get("/api/v1/animals")
    assert response.status_code == 401


def test_farmer_data_is_isolated(client):
    farmer = login(client, "ramesh@alg.demo")
    other = login(client, "savitri@alg.demo")
    ramesh_animals = client.get("/api/v1/animals", headers=farmer).json()
    savitri_animals = client.get("/api/v1/animals", headers=other).json()
    assert ramesh_animals["total"] == 20
    assert savitri_animals["total"] == 5
    savitri_ids = {item["id"] for item in savitri_animals["items"]}
    ramesh_ids = {item["id"] for item in ramesh_animals["items"]}
    assert not (savitri_ids & ramesh_ids)
    crossing = client.get(f"/api/v1/animals/{next(iter(savitri_ids))}", headers=farmer)
    assert crossing.status_code == 404
