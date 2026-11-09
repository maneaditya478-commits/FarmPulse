import itertools

import pytest

from app.core.constants import URGENT_WARNING_SIGNS_BY_LANGUAGE
from app.services.triage import extract_duration_days, extract_symptoms, triage


AUDIT_PHRASES = [
    ("en", "My cow cannot breathe"), ("en", "My cow is choking"),
    ("en", "My cow is unconscious"), ("en", "sudden death"),
    ("en", "My cow has seizures"), ("en", "My cow cannot stand"),
    ("en", "My cow has high fever"), ("en", "very high temperature"),
    ("hi", "मेरी गाय को दौरे पड़ रहे हैं"), ("hi", "मेरी गाय बेहोश है"),
    ("hi", "मेरी गाय सांस नहीं ले पा रही है"), ("hi", "मेरी गाय खड़ी नहीं हो पा रही"),
    ("hi", "तेज बुखार"), ("hi", "बहुत तेज़ बुखार"),
    ("mr", "माझी गाय उभी राहू शकत नाही"), ("mr", "माझी गाय बेशुद्ध आहे"),
    ("mr", "माझी गाय श्वास घेऊ शकत नाही"), ("mr", "खूप ताप"),
    ("mr", "पेटके येणे"), ("mr", "अचानक मृत्यू"),
]
URGENT_PHRASES = [(lang, phrase) for lang, phrases in URGENT_WARNING_SIGNS_BY_LANGUAGE.items() for phrase in phrases] + AUDIT_PHRASES


@pytest.mark.parametrize("lang,text", URGENT_PHRASES)
def test_all_audit_and_shipped_warning_phrases_escalate(lang, text):
    result = triage(species_code="cattle", text=text, lang=lang)
    assert extract_symptoms(text), text
    assert result["severity"] == "critical", text
    assert result["requires_vet"] is True
    assert result["rule_status"] == "needs vet review"


@pytest.mark.parametrize("text", [
    "no breathing problem", "No bleeding and no seizures", "The cow is breathing normally",
    "मेरी गाय सामान्य सांस ले रही है", "सांस लेने में तकलीफ नहीं है", "कोई दौरा नहीं है",
    "माझी गाय सामान्य श्वास घेत आहे", "श्वास घेण्यास त्रास नाही", "रक्तस्राव नाही",
])
def test_negated_and_normal_signs_do_not_trigger_critical(text):
    result = triage(species_code="cattle", text=text)
    assert result["severity"] != "critical"
    assert not extract_symptoms(text)


@pytest.mark.parametrize("text", [
    "No bleeding but the cow has seizures", "सांस लेने में तकलीफ नहीं है लेकिन दौरे पड़ रहे हैं",
    "रक्तस्राव नाही पण गाय बेशुद्ध आहे", "Not only bleeding but also seizures",
    "The cow is not only unconscious", "No bleeding, however the cow cannot breathe",
])
def test_negation_does_not_hide_positive_warning_in_another_clause(text):
    assert triage(species_code="cattle", text=text)["severity"] == "critical"


@pytest.mark.parametrize("text", ["vomiting", "something is wrong", "अजीब हालत", "काहीतरी बरे नाही"])
def test_unknown_reports_require_review_not_low(text):
    result = triage(species_code="cattle", text=text)
    assert result["severity"] == "medium"
    assert result["requires_vet"] is True
    assert result["needs_vet_review"] is True


@pytest.mark.parametrize("observation", [{"temperature_c": 38.5}, {"appetite": "normal"}])
def test_normal_observation_does_not_dismiss_unknown_complaint(observation):
    result = triage(species_code="cattle", text="Something is wrong", **observation)
    assert result["severity"] == "medium"
    assert result["requires_vet"] is True


@pytest.mark.parametrize("text", ["two days", "दो दिन", "दो दिनों से", "दोन दिवस", "२ दिवस"])
def test_audited_duration_variants(text):
    assert extract_duration_days(text) == 2


def test_temperature_urgency_is_not_lowered_by_cough():
    before = triage(species_code="cattle", text="", temperature_c=39.3)
    after = triage(species_code="cattle", text="cough", temperature_c=39.3)
    assert before["severity"] == "high"
    assert after["severity"] == "high"
    assert after["requires_vet"] is True


@pytest.mark.parametrize("temperature", [None, 39.3, 41.0])
def test_adding_symptoms_never_lowers_urgency(temperature):
    rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    signs = ["cough", "fever", "reduced_appetite", "reduced_milk", "convulsions"]
    for size in range(len(signs)):
        for subset in itertools.combinations(signs, size):
            previous = triage(species_code="cattle", text="", symptoms=list(subset), temperature_c=temperature)
            for extra in set(signs) - set(subset):
                result = triage(species_code="cattle", text="", symptoms=[*subset, extra], temperature_c=temperature)
                assert rank[result["severity"]] >= rank[previous["severity"]]


def test_stronger_appetite_sign_never_reduces_combination_urgency():
    before = triage(species_code="cattle", text="eating less and less milk")
    after = triage(species_code="cattle", text="eating less and less milk and not eating")
    assert before["severity"] == "high"
    assert after["severity"] == "high"
    assert "no_appetite" in after["symptoms"]


def test_structured_warning_wins_over_text_denial():
    result = triage(species_code="cattle", text="no seizures", symptoms=["convulsions"])
    assert result["severity"] == "critical"
