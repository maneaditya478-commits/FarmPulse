from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import DEVELOPMENT_JWT_SECRET, Settings


@pytest.mark.parametrize("environment", ["production", " PRODUCTION ", "prod", "staging"])
def test_nonlocal_environments_reject_demo_seeding(environment):
    with pytest.raises(ValidationError, match="SEED_DEMO_DATA must be false"):
        Settings(_env_file=None, environment=environment, seed_demo_data=True, jwt_secret="a" * 48)


@pytest.mark.parametrize(
    "secret",
    ["", "short", "x" * 31, DEVELOPMENT_JWT_SECRET, " " + DEVELOPMENT_JWT_SECRET + " ",
     "replace-with-a-long-random-secret", "change-this-in-production"],
)
def test_production_rejects_default_and_short_signing_keys(secret):
    with pytest.raises(ValidationError, match="JWT_SECRET must be a generated secret"):
        Settings(_env_file=None, environment="production", seed_demo_data=False, jwt_secret=secret)


@pytest.mark.parametrize("environment", ["development", "test", "testing"])
def test_local_environments_keep_explicit_demo_support(environment):
    settings = Settings(
        _env_file=None, environment=environment, seed_demo_data=True, jwt_secret=DEVELOPMENT_JWT_SECRET,
    )
    assert settings.seed_demo_data is True
    assert settings.jwt_secret == DEVELOPMENT_JWT_SECRET


def test_startup_validation_errors_do_not_expose_secret_values():
    secret = "sample-test-secret-never-print-this-value"
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, environment="production", seed_demo_data=True, jwt_secret=secret)
    assert secret not in str(error.value)


def test_safe_production_configuration_is_accepted():
    settings = Settings(
        _env_file=None, environment="production", seed_demo_data=False, jwt_secret="a" * 48,
    )
    assert settings.seed_demo_data is False


def test_render_blueprint_disables_demo_seeding_and_generates_signing_key():
    blueprint = (Path(__file__).resolve().parents[3] / "render.yaml").read_text(encoding="utf-8")
    assert '- key: SEED_DEMO_DATA\n        value: "false"' in blueprint
    assert "- key: JWT_SECRET\n        generateValue: true" in blueprint


def test_compose_requires_credentials_and_defaults_to_unseeded_production():
    compose = (Path(__file__).resolve().parents[3] / "docker-compose.yml").read_text(encoding="utf-8")
    assert "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?" in compose
    assert "JWT_SECRET: ${JWT_SECRET:?" in compose
    assert "ENVIRONMENT: ${ENVIRONMENT:-production}" in compose
    assert "SEED_DEMO_DATA: ${SEED_DEMO_DATA:-false}" in compose
    assert "postgresql+psycopg2://guardian:guardian" not in compose


def test_compose_does_not_publish_database_or_cache_ports():
    compose = (Path(__file__).resolve().parents[3] / "docker-compose.yml").read_text(encoding="utf-8")
    assert '"5432:5432"' not in compose
    assert '"6379:6379"' not in compose
