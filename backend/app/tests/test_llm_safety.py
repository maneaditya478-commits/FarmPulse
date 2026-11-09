"""Batch A software-policy regressions, not assertions of clinical accuracy.

Run serially with the existing conftest SQLite fixtures, never a live database.
These intentionally fail until output screening and strict LLM validation exist.
"""

import json
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest

from app.agents.intake import safety_scan
from app.core.config import settings
from app.services.llm import LLMService, llm_service


UNSAFE_OUTPUTS = [
    pytest.param("Your cow has mastitis.", id="en-diagnosis"),
    pytest.param("This is definitely foot-and-mouth disease.", id="en-confirmed-disease"),
    pytest.param("Diagnosis: rabies.", id="en-diagnosis-label"),
    pytest.param("आपकी गाय को थनैला है।", id="hi-diagnosis"),
    pytest.param("यह खुरपका-मुंहपका रोग है।", id="hi-confirmed-disease"),
    pytest.param("पशु को रेबीज है।", id="hi-rabies"),
    pytest.param("तुमच्या गायीला स्तनदाह झाला आहे.", id="mr-diagnosis"),
    pytest.param("हे लाळ्या खुरकूत रोगाचे निदान आहे.", id="mr-confirmed-disease"),
    pytest.param("तुमच्या पशूला रेबीज आहे.", id="mr-rabies"),
    pytest.param("Give 5mg of medicine now.", id="attached-ascii-mg"),
    pytest.param("Give 5 mg of medicine now.", id="spaced-ascii-mg"),
    pytest.param("Inject 2 ml of medicine.", id="spaced-ascii-ml"),
    pytest.param("Inject 2mL of medicine.", id="attached-ascii-ml"),
    pytest.param("Give 5 mg/kg of medicine.", id="weight-based-dose"),
    pytest.param("Give 0.5 ml of medicine.", id="decimal-dose"),
    pytest.param("Give ५mg of medicine.", id="attached-devanagari-mg"),
    pytest.param("Give 5㎎ of medicine.", id="unicode-square-mg"),
    pytest.param("Give 5ｍｇ of medicine.", id="unicode-fullwidth-mg"),
    pytest.param("दवा की ५ मिली मात्रा दें।", id="hi-devanagari-milli"),
    pytest.param("दवा की ५ मि.ली. मात्रा दें।", id="hi-devanagari-abbreviated-ml"),
    pytest.param("औषधाचे ५ मिली द्या.", id="mr-devanagari-milli"),
    pytest.param("औषधाचे ५ मि.ली. द्या.", id="mr-devanagari-abbreviated-ml"),
    pytest.param("औषधाचे ५मिली द्या.", id="attached-devanagari-milli"),
    pytest.param("औषधाचे ५मि.ली. द्या.", id="attached-devanagari-abbreviated-ml"),
    pytest.param("Give amoxicillin twice daily.", id="en-medicine"),
    pytest.param("Start an antibiotic course now.", id="en-antibiotic-instruction"),
    pytest.param("I prescribe penicillin.", id="en-prescription"),
    pytest.param("पशु को अमोक्सिसिलिन दें।", id="hi-medicine"),
    pytest.param("एंटीबायोटिक शुरू करें।", id="hi-antibiotic-instruction"),
    pytest.param("यह दवा दिन में दो बार दें।", id="hi-prescription-instruction"),
    pytest.param("पशूला अमॉक्सिसिलिन द्या.", id="mr-medicine"),
    pytest.param("प्रतिजैविक सुरू करा.", id="mr-antibiotic-instruction"),
    pytest.param("हे औषध दिवसातून दोनदा द्या.", id="mr-prescription-instruction"),
    pytest.param("A veterinarian has approved this treatment.", id="en-fake-vet-approval"),
    pytest.param("Vet approval is confirmed.", id="en-fake-approval-confirmation"),
    pytest.param("The prescription has been approved by the doctor.", id="en-fake-doctor-approval"),
    pytest.param("पशु चिकित्सक ने इस उपचार को मंजूरी दे दी है।", id="hi-fake-vet-approval"),
    pytest.param("डॉक्टर ने इस दवा को स्वीकृति दे दी है।", id="hi-fake-doctor-approval"),
    pytest.param("पशुवैद्यांनी या उपचाराला मंजुरी दिली आहे.", id="mr-fake-vet-approval"),
    pytest.param("डॉक्टरांनी हे औषध मंजूर केले आहे.", id="mr-fake-doctor-approval"),
]

SAFE_ADVISORIES = [
    pytest.param("en", "Provide clean drinking water and shade. Contact a veterinarian.", id="en"),
    pytest.param("hi", "साफ पीने का पानी और छाया उपलब्ध कराएं। पशु चिकित्सक से संपर्क करें।", id="hi"),
    pytest.param("mr", "स्वच्छ पिण्याचे पाणी आणि सावली उपलब्ध करा. पशुवैद्यांशी संपर्क करा.", id="mr"),
]

UNSAFE_TRANSLATIONS = [
    pytest.param(
        "en",
        "Your cow has mastitis. Give 5mg penicillin. A veterinarian has approved this treatment.",
        ("mastitis", "5mg", "penicillin", "has approved"),
        id="en",
    ),
    pytest.param(
        "hi",
        "आपकी गाय को थनैला है। दवा की ५ मिली मात्रा दें। पशु चिकित्सक ने इस उपचार को मंजूरी दे दी है।",
        ("थनैला", "५ मिली", "मंजूरी दे दी"),
        id="hi",
    ),
    pytest.param(
        "mr",
        "तुमच्या गायीला स्तनदाह झाला आहे. औषधाचे ५ मि.ली. द्या. पशुवैद्यांनी या उपचाराला मंजुरी दिली आहे.",
        ("स्तनदाह", "५ मि.ली.", "मंजुरी दिली"),
        id="mr",
    ),
]


@pytest.fixture(scope="session", autouse=True)
def _require_test_database():
    # Fail closed before this module's client requests if DATABASE_URL bypassed
    # conftest's setdefault. Inspect the URL only; do not connect or create a DB.
    from app.core.database import engine

    expected = Path(__file__).resolve().parents[2] / "test_guardian.db"
    assert engine.url.get_backend_name() == "sqlite", "Batch A requires the isolated SQLite test DB"
    assert Path(engine.url.database or "").resolve() == expected.resolve(), (
        "Refusing Batch A against a database other than conftest's test_guardian.db"
    )


@pytest.fixture(autouse=True)
def http_post(monkeypatch):
    post = Mock(side_effect=AssertionError("Live provider HTTP is forbidden in Batch A"))
    monkeypatch.setattr(httpx, "post", post)
    return post


@pytest.fixture
def provider_post(monkeypatch, http_post):
    monkeypatch.setattr(settings, "gemini_api_key", "batch-a-fake-provider-key")
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "llm_timeout_seconds", 0.25)
    http_post.side_effect = None
    return http_post


def _structured(**changes):
    result = {
        "intent": "health",
        "symptoms": ["fever"],
        "animal_code": "COW-001",
        "language": "en",
        "duration_days": 2,
    }
    result.update(changes)
    return result


def _http_response(payload, status=200):
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request("POST", "https://provider.invalid/generateContent"),
    )


def _gemini_text(text):
    return _http_response({"candidates": [{"content": {"parts": [{"text": text}]}}]})


def _gemini_structure(structure):
    return _gemini_text(json.dumps(structure, ensure_ascii=False))


def _assert_provider_calls(post, expected):
    assert post.call_count == expected
    for call in post.call_args_list:
        assert call.kwargs["timeout"] == settings.llm_timeout_seconds
        assert call.kwargs["params"]["key"] == "batch-a-fake-provider-key"


def _transient_failure(kind):
    if kind == "timeout":
        return httpx.ReadTimeout("mock provider timeout")
    if kind == "connection":
        return httpx.ConnectError("mock provider connection failure")
    return _http_response({"error": {"message": "mock transient failure"}}, status=kind)


def _blocked_audit_rows(client, admin_headers):
    response = client.get(
        "/api/v1/admin/audit-logs",
        headers=admin_headers,
        params={"action": "safety.output_blocked", "page_size": 100},
    )
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _assert_translation_blocked(response, unsafe_text, forbidden_fragments):
    assert response.status_code == 200, response.text
    translated = response.json()["translated"]
    assert isinstance(translated, str) and translated.strip(), "Return a conservative advisory"
    assert unsafe_text not in response.text
    decoded_body = json.dumps(response.json(), ensure_ascii=False).casefold()
    for fragment in forbidden_fragments:
        assert fragment.casefold() not in decoded_body, "Unsafe content leaked in the response"
    assert safety_scan(translated) == (True, None)


def _assert_translation_audited(client, farmer_headers, admin_headers, before_ids):
    me = client.get("/api/v1/auth/me", headers=farmer_headers)
    assert me.status_code == 200, me.text
    rows = _blocked_audit_rows(client, admin_headers)
    matching = [
        row for row in rows
        if row["id"] not in before_ids
        and row["action"] == "safety.output_blocked"
        and (row.get("detail") or {}).get("stage") == "translation_output"
        and row["actor_id"] == me.json()["id"]
        and row["actor_role"] == "farmer"
    ]
    assert matching, "Translation blocking must persist an attributed translation_output audit event"


@pytest.mark.parametrize("language", ["en", "hi", "mr"])
def test_standard_health_advisory_passes_output_screen(language):
    from app.services.language import health_response
    text = health_response(language, animal_name="Sample animal", severity="critical", requires_vet=True,
        findings=[], advice=[], case_code="SAMPLE-CASE", vet_name=None, appointment_note=None)
    assert safety_scan(text) == (True, None)


@pytest.mark.parametrize("text", UNSAFE_OUTPUTS)
def test_safety_scan_blocks_unsafe_output(text):
    safe, reason = safety_scan(text)
    assert safe is False, f"Unsafe software-policy output was accepted: {text}"
    assert isinstance(reason, str) and reason.strip()


@pytest.mark.parametrize(
    "text",
    [
        pytest.param("No diagnosis or prescription is provided.", id="en-disclaimer"),
        pytest.param("I cannot confirm a diagnosis.", id="en-diagnosis-negation"),
        pytest.param("I cannot prescribe medicines or recommend a dosage.", id="en-prescription-negation"),
        pytest.param(
            "I can help record observations and connect you with a veterinarian, but I cannot provide medicine names, dosages or a diagnosis.",
            id="en-existing-safety-replacement",
        ),
        pytest.param(
            "AI-assisted guidance under veterinary supervision. No diagnosis or prescription is provided.",
            id="en-existing-response-disclaimer",
        ),
        pytest.param("This is not a diagnosis and not a prescription.", id="en-triage-disclaimer"),
        pytest.param("Do not give any medicine without veterinary advice.", id="en-medicine-negation"),
        pytest.param("Veterinary approval is required before treatment.", id="en-approval-required"),
        pytest.param("No veterinarian has approved this treatment.", id="en-approval-negation"),
        pytest.param("कोई निदान या दवा का पर्चा नहीं दिया जाता है।", id="hi-disclaimer"),
        pytest.param("मैं दवा, खुराक या निदान नहीं दे सकता।", id="hi-clinical-negation"),
        pytest.param("पशु चिकित्सक की सलाह के बिना कोई दवा न दें।", id="hi-medicine-negation"),
        pytest.param("पशु चिकित्सक की मंजूरी आवश्यक है।", id="hi-approval-required"),
        pytest.param("पशु चिकित्सक ने इस उपचार को मंजूरी नहीं दी है।", id="hi-approval-negation"),
        pytest.param("हे निदान किंवा औषधाचे प्रिस्क्रिप्शन नाही.", id="mr-disclaimer"),
        pytest.param("मी औषध, डोस किंवा निदान देऊ शकत नाही.", id="mr-clinical-negation"),
        pytest.param("पशुवैद्यांच्या सल्ल्याशिवाय कोणतेही औषध देऊ नका.", id="mr-medicine-negation"),
        pytest.param("उपचारासाठी पशुवैद्यांची मंजुरी आवश्यक आहे.", id="mr-approval-required"),
        pytest.param("पशुवैद्यांनी या उपचाराला मंजुरी दिलेली नाही.", id="mr-approval-negation"),
    ],
)
def test_safety_scan_allows_disclaimers_and_negations(text):
    assert safety_scan(text) == (True, None)


@pytest.mark.parametrize("language,text", SAFE_ADVISORIES)
def test_safety_scan_allows_safe_advisories(language, text):
    assert safety_scan(text) == (True, None)


@pytest.mark.parametrize(
    "text",
    [
        pytest.param("I cannot diagnose. Your cow has mastitis.", id="en"),
        pytest.param("मैं निदान नहीं दे सकता। दवा की ५ मिली मात्रा दें।", id="hi"),
        pytest.param("हे प्रिस्क्रिप्शन नाही. औषधाचे ५ मि.ली. द्या.", id="mr"),
    ],
)
def test_disclaimer_does_not_whitelist_unsafe_clause(text):
    safe, reason = safety_scan(text)
    assert safe is False
    assert reason


@pytest.mark.parametrize(
    "language,text",
    [
        pytest.param("en", "Cow COW-001 has fever for 2 days.", id="en"),
        pytest.param("hi", "गाय COW-001 को 2 दिन से बुखार है।", id="hi"),
        pytest.param("mr", "गाय COW-001 ला 2 दिवस ताप आहे.", id="mr"),
    ],
)
def test_structure_request_accepts_grounded_structure(provider_post, language, text):
    structure = _structured(language=language)
    provider_post.return_value = _gemini_structure(structure)
    assert LLMService().structure_request(text, language) == structure
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("language", ["en", "hi", "mr"])
def test_structure_request_accepts_empty_grounded_greeting(provider_post, language):
    structure = _structured(
        intent="greeting", symptoms=[], animal_code=None, language=language, duration_days=None,
    )
    provider_post.return_value = _gemini_structure(structure)
    assert LLMService().structure_request("hello", language) == structure
    _assert_provider_calls(provider_post, 1)


def test_structure_request_accepts_duration_at_rule_engine_bound(provider_post):
    structure = _structured(duration_days=60)
    provider_post.return_value = _gemini_structure(structure)
    assert LLMService().structure_request("Cow COW-001 has fever for 60 days.", "en") == structure
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("field", ["notes", "confidence", "diagnosis", "approved"])
def test_structure_request_rejects_unknown_fields_without_retry(provider_post, field):
    provider_post.return_value = _gemini_structure(_structured(**{field: "extra field"}))
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize(
    "field,value",
    [
        pytest.param("intent", 1, id="integer-intent"),
        pytest.param("intent", ["health"], id="array-intent"),
        pytest.param("intent", {"value": "health"}, id="object-intent"),
        pytest.param("intent", None, id="null-intent"),
        pytest.param("symptoms", "fever", id="string-symptoms"),
        pytest.param("symptoms", {"fever": True}, id="object-symptoms"),
        pytest.param("symptoms", None, id="null-symptoms"),
        pytest.param("symptoms", 1, id="integer-symptoms"),
        pytest.param("symptoms", [1], id="integer-symptom-item"),
        pytest.param("symptoms", [None], id="null-symptom-item"),
        pytest.param("symptoms", [{"name": "fever"}], id="object-symptom-item"),
        pytest.param("animal_code", 123, id="integer-animal-code"),
        pytest.param("animal_code", True, id="boolean-animal-code"),
        pytest.param("animal_code", ["COW-001"], id="array-animal-code"),
        pytest.param("animal_code", {"tag": "COW-001"}, id="object-animal-code"),
        pytest.param("language", None, id="null-language"),
        pytest.param("language", 1, id="integer-language"),
        pytest.param("language", ["en"], id="array-language"),
        pytest.param("duration_days", "2", id="string-duration"),
        pytest.param("duration_days", 2.0, id="float-duration"),
        pytest.param("duration_days", True, id="boolean-duration"),
        pytest.param("duration_days", [2], id="array-duration"),
        pytest.param("duration_days", {"days": 2}, id="object-duration"),
    ],
)
def test_structure_request_rejects_wrong_types_without_coercion(provider_post, field, value):
    provider_post.return_value = _gemini_structure(_structured(**{field: value}))
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize(
    "field,value",
    [
        pytest.param("intent", "diagnosis", id="unsupported-intent"),
        pytest.param("intent", "HEALTH", id="noncanonical-intent"),
        pytest.param("intent", "", id="empty-intent"),
        pytest.param("language", "fr", id="unsupported-language"),
        pytest.param("language", "EN", id="noncanonical-language"),
        pytest.param("language", "", id="empty-language"),
        pytest.param("duration_days", -1, id="negative-duration"),
        pytest.param("duration_days", 61, id="duration-above-rule-engine-bound"),
        pytest.param("duration_days", 10000, id="unbounded-duration"),
        pytest.param("symptoms", ["mastitis"], id="diagnosis-as-symptom"),
        pytest.param("symptoms", ["invented_symptom"], id="unknown-symptom"),
    ],
)
def test_structure_request_rejects_invalid_values(provider_post, field, value):
    provider_post.return_value = _gemini_structure(_structured(**{field: value}))
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("field", ["intent", "symptoms", "animal_code", "language", "duration_days"])
def test_structure_request_rejects_missing_fields(provider_post, field):
    structure = _structured()
    del structure[field]
    provider_post.return_value = _gemini_structure(structure)
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("symptom", ["fever", "breathing_difficulty", "convulsions"])
def test_structure_request_rejects_allowlisted_but_ungrounded_symptoms(provider_post, symptom):
    provider_post.return_value = _gemini_structure(
        _structured(symptoms=[symptom], animal_code=None, duration_days=None),
    )
    assert LLMService().structure_request("hello", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("unsafe_text", UNSAFE_OUTPUTS)
def test_structure_request_rejects_unsafe_string_in_allowed_field(provider_post, unsafe_text):
    # animal_code is a valid string slot, so screening must not rely solely on
    # schema types or discard unsafe raw fields before inspecting them.
    provider_post.return_value = _gemini_structure(_structured(animal_code=unsafe_text))
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize(
    "changes",
    [
        pytest.param({"diagnosis": "Your cow has mastitis."}, id="raw-diagnosis"),
        pytest.param({"medicine": "Give penicillin."}, id="raw-medicine"),
        pytest.param({"dosage": "5mg"}, id="raw-dose"),
        pytest.param({"notes": {"advice": ["Inject 2 ml of medicine."]}}, id="nested-unsafe-extra"),
        pytest.param({"symptoms": {"fever": "Give 5mg penicillin."}}, id="unsafe-object-symptoms"),
        pytest.param({"symptoms": ["fever", "औषधाचे ५ मि.ली. द्या."]}, id="unsafe-symptom-item"),
        pytest.param({"intent": "A veterinarian has approved this treatment."}, id="unsafe-intent"),
        pytest.param({"language": "दवा की ५ मिली मात्रा दें।"}, id="unsafe-language"),
        pytest.param({"duration_days": "Give 5mg penicillin."}, id="unsafe-duration"),
    ],
)
def test_structure_request_rejects_entire_unsafe_raw_structure(provider_post, changes):
    provider_post.return_value = _gemini_structure(_structured(**changes))
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("raw", ["", "{", "not JSON", "[]", "null", "true", '"hello"', "{}"])
def test_structure_request_malformed_json_falls_back_without_retry(provider_post, raw):
    provider_post.return_value = _gemini_text(raw)
    assert LLMService().structure_request("hello", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({}, id="missing-candidates"),
        pytest.param({"candidates": []}, id="empty-candidates"),
        pytest.param({"candidates": [{}]}, id="missing-content"),
        pytest.param({"candidates": [{"content": {"parts": []}}]}, id="empty-parts"),
        pytest.param({"candidates": [{"content": {"parts": [{"text": 123}]}}]}, id="nontext-part"),
    ],
)
def test_structure_request_malformed_provider_envelope_falls_back(provider_post, payload):
    provider_post.return_value = _http_response(payload)
    assert LLMService().structure_request("hello", "en") is None
    _assert_provider_calls(provider_post, 1)


@pytest.mark.parametrize("failure", ["timeout", "connection", 429, 500, 503])
def test_structure_request_retries_transient_failure_once(provider_post, failure):
    structure = _structured()
    provider_post.side_effect = [_transient_failure(failure), _gemini_structure(structure)]
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") == structure
    _assert_provider_calls(provider_post, 2)


@pytest.mark.parametrize("failure", ["timeout", "connection", 429, 503])
def test_structure_request_persistent_transient_failure_has_two_call_bound(provider_post, failure):
    provider_post.side_effect = [
        _transient_failure(failure),
        _transient_failure(failure),
        _gemini_structure(_structured()),  # A third call must never reach this response.
    ]
    result = LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en")
    _assert_provider_calls(provider_post, 2)
    assert result is None


@pytest.mark.parametrize("status", [400, 401, 403, 422])
def test_structure_request_does_not_retry_permanent_http_failure(provider_post, status):
    provider_post.side_effect = [
        _http_response({"error": {"message": "mock permanent failure"}}, status=status),
        _gemini_structure(_structured()),
    ]
    assert LLMService().structure_request("Cow COW-001 has fever for 2 days.", "en") is None
    _assert_provider_calls(provider_post, 1)


def test_structure_request_missing_provider_falls_back_without_http(monkeypatch, http_post):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    assert LLMService().structure_request("hello", "en") is None
    http_post.assert_not_called()


@pytest.mark.parametrize("language,unsafe_text,forbidden_fragments", UNSAFE_TRANSLATIONS)
def test_translation_blocks_unsafe_provider_output_and_persists_audit(
    client, farmer_headers, admin_headers, monkeypatch, language, unsafe_text, forbidden_fragments,
):
    before_ids = {row["id"] for row in _blocked_audit_rows(client, admin_headers)}
    translate = Mock(return_value=unsafe_text)
    monkeypatch.setattr(llm_service, "translate", translate)
    source = "Provide clean drinking water and shade. Contact a veterinarian."
    response = client.post(
        "/api/v1/ai/translate",
        headers=farmer_headers,
        json={"text": source, "target_language": language},
    )
    translate.assert_called_once_with(source, language)
    _assert_translation_blocked(response, unsafe_text, forbidden_fragments)
    _assert_translation_audited(client, farmer_headers, admin_headers, before_ids)


@pytest.mark.parametrize("language,warning,contact", [
    ("en", "The cow cannot breathe. Contact a veterinarian immediately.", "immediately"),
    ("hi", "गाय बेहोश है। तुरंत पशु चिकित्सक से संपर्क करें।", "तुरंत"),
    ("mr", "गाय बेशुद्ध आहे. त्वरित पशुवैद्यांशी संपर्क करा.", "त्वरित"),
])
def test_translation_block_preserves_emergency_guidance(client, farmer_headers, monkeypatch, language, warning, contact):
    monkeypatch.setattr(llm_service, "translate", Mock(return_value="Give 5mg penicillin."))
    response = client.post("/api/v1/ai/translate", headers=farmer_headers, json={"text": warning, "target_language": language})
    assert response.status_code == 200
    assert contact in response.json()["translated"]
    assert "5mg" not in response.text


@pytest.mark.parametrize("language,unsafe_text,forbidden_fragments", UNSAFE_TRANSLATIONS)
def test_translation_missing_provider_blocks_unsafe_source_echo_and_persists_audit(
    client, farmer_headers, admin_headers, monkeypatch, http_post,
    language, unsafe_text, forbidden_fragments,
):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    before_ids = {row["id"] for row in _blocked_audit_rows(client, admin_headers)}
    response = client.post(
        "/api/v1/ai/translate",
        headers=farmer_headers,
        json={"text": unsafe_text, "target_language": language},
    )
    http_post.assert_not_called()
    _assert_translation_blocked(response, unsafe_text, forbidden_fragments)
    _assert_translation_audited(client, farmer_headers, admin_headers, before_ids)


@pytest.mark.parametrize("language,advisory", SAFE_ADVISORIES)
@pytest.mark.parametrize("provider", ["gemini", "missing"])
def test_translation_safe_advisory_is_unchanged_and_not_block_audited(
    client, farmer_headers, admin_headers, monkeypatch, http_post, language, advisory, provider,
):
    before_ids = {row["id"] for row in _blocked_audit_rows(client, admin_headers)}
    if provider == "gemini":
        translate = Mock(return_value=advisory)
        monkeypatch.setattr(llm_service, "translate", translate)
    else:
        monkeypatch.setattr(settings, "gemini_api_key", None)
    response = client.post(
        "/api/v1/ai/translate",
        headers=farmer_headers,
        json={"text": advisory, "target_language": language},
    )
    assert response.status_code == 200, response.text
    assert response.json()["translated"] == advisory
    assert response.json()["provider"] == ("gemini" if provider == "gemini" else "local-templates")
    if provider == "gemini":
        translate.assert_called_once_with(advisory, language)
    http_post.assert_not_called()
    assert {row["id"] for row in _blocked_audit_rows(client, admin_headers)} == before_ids
