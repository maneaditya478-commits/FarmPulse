"""Intake, orchestration, animal-record and response agents."""

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.agents.state import GuardianState
from app.core.errors import AppError
from app.models import Animal, Farm
from app.services import language
from app.services.access import animal_query, get_animal_for_user, primary_farm
from app.services.llm import llm_service, safety_refusal, safety_scan
from app.services.triage import extract_duration_days, extract_symptoms, symptom_label


def _event(agent: str, detail: str, status: str = "ok") -> dict:
    return {"agent": agent, "status": status, "detail": detail, "at": datetime.now(UTC).isoformat()}


HEALTH_WORDS = [
    "sick", "ill", "fever", "not eating", "eating less", "diarrh", "cough", "vomit", "injury", "wound", "swelling",
    "lame", "milk reduced", "less milk", "weak", "lie down", "आजारी", "बुखार", "ताप", "दस्त", "जुलाब", "खोकला", "खांसी",
    "खात नाही", "खा रही नहीं", "दूध कम", "दूध कमी", "सूज", "जखम", "कमजोर", "अशक्त", "पडले", "दौरा", "आकडी", "श्वास", "सांस",
]
VACCINATION_WORDS = ["vaccin", "vaccine", "booster", "लस", "टीका", "टिका", "तपासणी लस"]
NUTRITION_WORDS = ["feed", "fodder", "nutrition", "water intake", "mineral", "चारा", "खाद्य", "खुराक", "पोषण", "भोजन", "पाणी", "पानी"]
ENVIRONMENT_WORDS = ["weather", "humidity", "temperature", "shed", "clean", "sanitation", "हवामान", "मौसम", "तापमान", "गोठा", "शेड", "स्वच्छता", "सफाई", "उकाडा", "गर्मी"]
VET_WORDS = ["veterinar", "doctor", "vet ", "पशुवैद्य", "वैद्य", "डॉक्टर", "चिकित्सक", "appointment"]
MARKET_WORDS = ["price", "market", "rate", "mandi", "बाजार", "भाव", "दर", "किंमत", "बाजारभाव"]
FINANCE_WORDS = ["income", "expense", "profit", "loss", "revenue", "earn", "उत्पन्न", "खर्च", "नफा", "तोटा", "आय", "व्यय", "मुनाफा"]
GREETING_WORDS = ["hello", "hi ", "hey", "namaste", "नमस्कार", "नमस्ते", "हॅलो", "जय"]


def _contains(text: str, words: list[str]) -> bool:
    return any(word in text for word in words)


def classify_intent(text: str, symptoms: list[str]) -> str:
    lowered = text.lower()
    if symptoms:
        return "health"
    if _contains(lowered, HEALTH_WORDS):
        return "health"
    if _contains(lowered, VACCINATION_WORDS):
        return "vaccination"
    if _contains(lowered, MARKET_WORDS):
        return "market"
    if _contains(lowered, FINANCE_WORDS):
        return "finance"
    if _contains(lowered, NUTRITION_WORDS):
        return "nutrition"
    if _contains(lowered, ENVIRONMENT_WORDS):
        return "environment"
    if _contains(lowered, VET_WORDS):
        return "veterinary"
    if any(re.fullmatch(rf"{re.escape(word.strip())}[.!\s]*", lowered) for word in GREETING_WORDS):
        return "greeting"
    if re.search(r"record|history|tag|नोंद|इतिहास|रिकॉर्ड", lowered):
        return "animal_record"
    return "health"


PLANS: dict[str, list[str]] = {
    "health": ["record", "health", "safety", "vet", "followup"],
    "vaccination": ["record", "vaccination"],
    "nutrition": ["record", "nutrition"],
    "environment": ["record", "environment"],
    "veterinary": ["record", "vet"],
    "market": ["market"],
    "finance": ["record", "finance"],
    "animal_record": ["record"],
    "greeting": [],
}


def intake_node(state: GuardianState) -> dict:
    text = (state.get("text") or "").strip()
    language_locked = bool(state.get("language"))
    lang = state.get("language") or language.detect_language(text, getattr(state["user"], "language", "en"))
    return {
        "text": text,
        "language": lang,
        "language_locked": language_locked,
        "input_mode": state.get("input_mode", "text"),
        "trace": [_event("intake", f"normalized input ({len(text)} chars), language={lang}")],
        "agents_used": ["intake"],
    }


def orchestrator_node(state: GuardianState) -> dict:
    text = state["text"]
    lang = state["language"]
    observation = state.get("observation") or {}
    from app.services.triage import SYMPTOMS

    symptoms = sorted(set(extract_symptoms(text)) | (set(observation.get("symptoms") or []) & SYMPTOMS.keys()))
    duration = extract_duration_days(text)
    safety_events: list[dict] = []
    structured = llm_service.structure_request(text, lang, on_block=safety_events.append)
    llm_note = "local rule engine"
    if structured:
        llm_note = f"gemini structured ({structured.get('intent')})"
        from app.services.triage import SYMPTOMS

        llm_symptoms = [item for item in structured.get("symptoms", []) if item in SYMPTOMS]
        symptoms = list(dict.fromkeys(symptoms + llm_symptoms))
    intent = classify_intent(text, symptoms)
    # Safety override: an explicit warning sign always routes to the health workflow.
    from app.services.triage import WARNING_SYMPTOMS

    if state.get("health_report") or set(symptoms) & WARNING_SYMPTOMS:
        intent = "health"
    plan = list(PLANS.get(intent, ["record"]))
    return {
        "intent": intent,
        "symptoms": symptoms,
        "duration_days": duration,
        "plan": plan,
        "llm_provider": llm_service.provider,
        "safety_events": safety_events,
        "trace": [_event("orchestrator", f"intent={intent}; plan={' -> '.join(plan) or 'direct answer'}; {llm_note}")]
        + [_event("orchestrator", event["reason"], "blocked") for event in safety_events],
        "agents_used": ["orchestrator"],
    }


def _resolve_animal(state: GuardianState) -> Animal | None:
    db = state["db"]
    user = state["user"]
    explicit = state.get("animal_id")
    if explicit:
        try:
            return get_animal_for_user(db, user, uuid.UUID(str(explicit)))
        except (AppError, ValueError):
            return None
    text = (state.get("text") or "").lower()
    candidates = db.scalars(animal_query(db, user)).all()
    for animal in candidates:
        if animal.tag_code.lower() in text or (animal.name and animal.name.lower() in text):
            return animal
    if len(candidates) == 1:
        return candidates[0]
    return None


def record_node(state: GuardianState) -> dict:
    db = state["db"]
    user = state["user"]
    animal = _resolve_animal(state)
    plan = list(state.get("plan") or [])
    if plan and plan[0] == "record":
        plan = plan[1:]

    db_animal_id = str(animal.id) if animal else None
    updates: dict = {
        "animal": animal,
        "animal_id": db_animal_id,
        "plan": plan,
        "trace": [_event("record", f"resolved animal={animal.name if animal else 'none'}")],
        "agents_used": ["record"],
    }

    if state.get("intent") == "health" and animal is None:
        updates["halt_reason"] = "animal_not_resolved"
        updates["trace"] = updates["trace"] + [_event("record", "no animal matched; urgency assessment continues without creating a case", "warning")]

    if animal is not None:
        farm = animal.farm or primary_farm(db, user)
        updates["farm"] = farm
        history = {
            "animal": {
                "id": str(animal.id),
                "name": animal.name,
                "species": animal.species.code if animal.species else None,
                "breed": animal.breed.name if animal.breed else None,
                "age_months": animal.age_months,
                "weight_kg": animal.weight_kg,
                "tag_code": animal.tag_code,
            },
            "farm": {"name": farm.name, "district": farm.district, "village": farm.village} if farm else None,
        }
        from app.models import HealthCase, Vaccination

        cases = db.scalars(
            select(HealthCase).where(HealthCase.animal_id == animal.id).order_by(HealthCase.opened_at.desc()).limit(5)
        ).all()
        vaccinations = db.scalars(
            select(Vaccination).where(Vaccination.animal_id == animal.id).order_by(Vaccination.due_on).limit(20)
        ).all()
        history["recent_cases"] = [
            {"case_code": case.case_code, "severity": case.severity, "status": case.status, "opened_at": case.opened_at.isoformat()}
            for case in cases
        ]
        history["vaccinations"] = [
            {"status": row.status, "due_on": row.due_on.isoformat(), "administered_on": row.administered_on.isoformat() if row.administered_on else None}
            for row in vaccinations
        ]
        updates["data"] = {"history": history}
    else:
        updates["farm"] = primary_farm(db, user)
    return updates


def _localized_halt(lang: str) -> str:
    return {
        "en": "I could not identify which animal this is about. Please select an animal or include its name/tag code, then try again.",
        "hi": "मैं यह नहीं पहचान सका कि यह किस पशु के बारे में है। कृपया पशु चुनें या उसका नाम/टैग कोड लिखें।",
        "mr": "ही माहिती कोणत्या पशूबद्दल आहे हे मला ओळखता आले नाही. कृपया पशू निवडा किंवा त्याचे नाव/टॅग कोड लिहा.",
    }.get(lang, "")


def _animal_record_text(state: GuardianState) -> str:
    lang = state["language"]
    animal = state.get("animal")
    if not animal:
        return {
            "en": "Your animal records are ready. Select an animal to see its health, vaccination and nutrition history.",
            "hi": "आपके पशु रिकॉर्ड तैयार हैं। स्वास्थ्य, टीकाकरण और पोषण इतिहास देखने के लिए पशु चुनें।",
            "mr": "तुमचे पशू रेकॉर्ड तयार आहेत. आरोग्य, लसीकरण आणि पोषण इतिहास पाहण्यासाठी पशू निवडा.",
        }.get(lang, "")
    history = (state.get("data") or {}).get("history", {})
    recent = history.get("recent_cases", [])
    lines = {
        "en": [
            f"{animal.name} ({animal.tag_code}) — {animal.species.name_en if animal.species else ''}, {animal.age_months or '?'} months, {animal.weight_kg or '?'} kg.",
            f"Health cases on record: {len(recent)}." + (f" Latest: {recent[0]['case_code']} ({recent[0]['status']})." if recent else ""),
            "I can help with health triage, vaccinations, feed records, environment checks, market prices and financial estimates.",
        ],
        "hi": [
            f"{animal.name} ({animal.tag_code}) — {animal.species.name_hi if animal.species else ''}, {animal.age_months or '?'} महीने, {animal.weight_kg or '?'} किग्रा।",
            f"दर्ज स्वास्थ्य केस: {len(recent)}।" + (f" नवीनतम: {recent[0]['case_code']} ({recent[0]['status']})।" if recent else ""),
            "मैं स्वास्थ्य, टीकाकरण, चारा, पर्यावरण, बाजार भाव और वित्तीय अनुमान में सहायता कर सकता हूँ।",
        ],
        "mr": [
            f"{animal.name} ({animal.tag_code}) — {animal.species.name_mr if animal.species else ''}, {animal.age_months or '?'} महिने, {animal.weight_kg or '?'} किलो.",
            f"नोंदवलेली आरोग्य प्रकरणे: {len(recent)}." + (f" अलीकडील: {recent[0]['case_code']} ({recent[0]['status']})." if recent else ""),
            "मी आरोग्य, लसीकरण, खाद्य, पर्यावरण, बाजारभाव आणि आर्थिक अंदाजासाठी मदत करू शकतो.",
        ],
    }.get(lang, [])
    return "\n".join(lines)


def respond_node(state: GuardianState) -> dict:
    lang = state["language"]
    intent = state.get("intent", "animal_record")
    data = dict(state.get("data") or {})

    if state.get("halt"):
        text = _localized_halt(lang)
    elif intent == "health":
        triage = state.get("triage") or {}
        case = state.get("case")
        vet = state.get("vet")
        vet_name = vet.user.full_name if vet and getattr(vet, "user", None) else None
        appointment_note = None
        if state.get("appointment_id"):
            appointment_note = {
                "en": f"A veterinary request has been created; your case reference is {case.case_code if case else ''}.",
                "hi": f"पशु चिकित्सा अनुरोध बनाया गया है; आपका केस संदर्भ {case.case_code if case else ''} है।",
                "mr": f"पशुवैद्यकीय विनंती तयार केली आहे; तुमचा केस संदर्भ {case.case_code if case else ''} आहे.",
            }.get(lang)
        if state.get("animal"):
            text = language.health_response(
                lang,
                animal_name=state["animal"].name,
                severity=triage.get("severity", "medium"),
                requires_vet=triage.get("requires_vet", True),
                findings=triage.get("findings", []),
                advice=triage.get("advice", []),
                case_code=case.case_code if case else None,
                vet_name=vet_name,
                appointment_note=appointment_note,
            )
        else:
            text = safety_refusal(lang, emergency=triage.get("severity") == "critical") + " " + _localized_halt(lang)
    elif intent == "vaccination":
        items = data.get("schedule", [])
        animal = state.get("animal")
        text = language.vaccination_response(lang, items, animal.name if animal else None)
    elif intent == "nutrition":
        text = _nutrition_text(state, data)
    elif intent == "environment":
        text = _environment_text(state, data)
    elif intent == "market":
        text = language.market_response(lang, data.get("prices", []), data.get("district", "your district"))
    elif intent == "finance":
        text = language.finance_response(lang, data.get("summary", {}))
    elif intent == "veterinary":
        text = _vet_text(state, data)
    elif intent == "greeting":
        text = {
            "en": "Namaskar. I am your livestock guardian. Tell me about an animal's health, vaccinations, feed, shed conditions, market prices or farm finances.",
            "hi": "नमस्ते। मैं आपका पशु सहायक हूँ। पशु के स्वास्थ्य, टीकाकरण, चारे, शेड, बाजार भाव या खेत के खर्च के बारे में बताएं।",
            "mr": "नमस्कार. मी तुमचा पशू सहाय्यक आहे. पशूचे आरोग्य, लसीकरण, चारा, गोठा, बाजारभाव किंवा शेताचा खर्च याबद्दल सांगा.",
        }.get(lang)
    else:
        text = _animal_record_text(state)

    safe, reason = safety_scan(text)
    safety_events = []
    if not safe:
        text = safety_refusal(lang, emergency=(state.get("triage") or {}).get("severity") == "critical")
        data["safety_override"] = reason
        safety_events.append({"stage": "response_output", "reason": reason})

    data["disclaimer"] = "Rule thresholds need vet review; clinical accuracy is not established. No diagnosis or prescription is provided."
    return {
        "response_text": text,
        "data": data,
        "safety_events": safety_events,
        "escalated": bool(state.get("escalated")),
        "trace": [_event("respond", reason if not safe else "composed localized response", "blocked" if not safe else "ok")],
        "agents_used": ["respond"],
    }


def _nutrition_text(state: GuardianState, data: dict) -> str:
    lang = state["language"]
    profile = data.get("profile")
    records = data.get("records", [])
    gap = data.get("gap")
    animal = state.get("animal")
    if lang == "mr":
        lines = [f"{animal.name if animal else 'पशू'} साठी गेल्या 14 दिवसांतील खाद्य नोंदी: {len(records)}."]
        if profile:
            lines.append(f"प्रजातीनुसार सामान्य मार्गदर्शन: {profile.get('feed_guidance')} (स्रोत: {profile.get('reference_source')}).")
        if gap:
            lines.append("अपूर्ण माहिती: " + gap + ".")
        lines.append("विशिष्ट आहार बदल पशुवैद्य किंवा पशु पोषण तज्ज्ञांच्या सल्ल्यानेच करा.")
        return " ".join(lines)
    if lang == "hi":
        lines = [f"{animal.name if animal else 'पशु'} के लिए पिछले 14 दिनों की चारा प्रविष्टियाँ: {len(records)}."]
        if profile:
            lines.append(f"प्रजाति-आधारित सामान्य मार्गदर्शन: {profile.get('feed_guidance')} (स्रोत: {profile.get('reference_source')}).")
        if gap:
            lines.append("अपूर्ण जानकारी: " + gap + ".")
        lines.append("विशेष आहार परिवर्तन पशु चिकित्सक या पशु पोषण विशेषज्ञ की सलाह से ही करें।")
        return " ".join(lines)
    lines = [f"Feed records for {animal.name if animal else 'this animal'} in the last 14 days: {len(records)}."]
    if profile:
        lines.append(f"Species-level general guidance: {profile.get('feed_guidance')} (source: {profile.get('reference_source')}).")
    if gap:
        lines.append(f"Information gap: {gap}.")
    lines.append("Specific dietary changes must be referred to a veterinarian or a qualified animal nutrition professional.")
    return " ".join(lines)


def _environment_text(state: GuardianState, data: dict) -> str:
    lang = state["language"]
    weather = data.get("weather") or {}
    flags = data.get("flags", [])
    label = {"en": "Environmental summary", "hi": "पर्यावरण सारांश", "mr": "पर्यावरण सारांश"}.get(lang)
    parts = [f"{label}:"]
    if weather.get("available"):
        parts.append(
            f"{weather.get('location')}: {weather.get('temperature_c')}°C, humidity {weather.get('humidity_pct')}%, {weather.get('weather')}. Source: {weather.get('source')}."
        )
    elif weather.get("note"):
        parts.append(weather["note"])
    if flags:
        parts.append("Alerts: " + "; ".join(flag["message"] for flag in flags) + ".")
    else:
        parts.append({"en": "No threshold-based environmental alerts were triggered by the latest observations.",
                      "hi": "नवीनतम अवलोकनों से कोई सीमा-आधारित चेतावनी नहीं मिली।",
                      "mr": "अलीकडील निरीक्षणांवरून कोणताही मर्यादा-आधारित इशारा मिळाला नाही."}.get(lang))
    parts.append({
        "en": "Environmental observations do not confirm a disease. Consult a veterinarian if animals show signs of illness.",
        "hi": "पर्यावरणीय अवलोकन किसी रोग की पुष्टि नहीं करते। लक्षण दिखने पर पशु चिकित्सक से सलाह लें।",
        "mr": "पर्यावरणीय निरीक्षण रोगाची पुष्टी करत नाहीत. लक्षणे दिसल्यास पशुवैद्यांचा सल्ला घ्या.",
    }.get(lang))
    return " ".join(parts)


def _vet_text(state: GuardianState, data: dict) -> str:
    lang = state["language"]
    nearby = data.get("nearby_vets", [])
    if not nearby:
        return {
            "en": "No registered veterinary professionals were found nearby. Please contact your district animal husbandry office.",
            "hi": "आसपास कोई पंजीकृत पशु चिकित्सक नहीं मिला। कृपया जिला पशुपालन कार्यालय से संपर्क करें।",
            "mr": "जवळपास कोणतेही नोंदणीकृत पशुवैद्य आढळले नाहीत. कृपया जिल्हा पशुसंवर्धन कार्यालयाशी संपर्क साधा.",
        }.get(lang)
    lines = [{"en": "Nearby veterinary professionals:", "hi": "आसपास के पशु चिकित्सक:", "mr": "जवळील पशुवैद्य:"}.get(lang)]
    for item in nearby[:4]:
        vet = item["vet"]
        lines.append(
            f"- {vet.user.full_name} ({vet.qualification}), {vet.clinic_name or vet.district}, "
            f"{vet.availability}, tel: {vet.user.phone or 'not listed'}"
        )
    lines.append({
        "en": "Veterinarian contact details are shown only from registered profiles. Diagnosis and treatment remain under veterinary supervision.",
        "hi": "पशु चिकित्सक की संपर्क जानकारी केवल पंजीकृत प्रोफ़ाइल से दी जाती है। निदान और उपचार पशु चिकित्सक की देखरेख में ही रहते हैं।",
        "mr": "पशुवैद्यांची संपर्क माहिती केवळ नोंदणीकृत प्रोफाइलमधून दिली जाते. निदान आणि उपचार पशुवैद्यांच्या देखरेखीतच राहतात.",
    }.get(lang))
    return "\n".join(lines)
