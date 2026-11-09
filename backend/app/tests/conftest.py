"""Test harness: isolated SQLite database with the demonstration dataset."""

import os
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
TEST_DB = BACKEND_DIR / "test_guardian.db"
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB.as_posix()}")
os.environ.setdefault("SEED_DEMO_DATA", "true")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    from app.core.database import engine

    engine.dispose()
    try:
        TEST_DB.unlink(missing_ok=True)
    except PermissionError:
        # Windows keeps the SQLite handle briefly after dispose; the next run removes it.
        pass


def login(client: TestClient, email: str, password: str = "Demo@1234") -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def farmer_headers(client):
    return login(client, "ramesh@alg.demo")


@pytest.fixture(scope="session")
def vet_headers(client):
    return login(client, "dr.aarti@alg.demo")


@pytest.fixture(scope="session")
def admin_headers(client):
    return login(client, "admin@alg.demo")


@pytest.fixture(scope="session")
def coop_headers(client):
    return login(client, "coop.pune@alg.demo")
