"""Conservative urgency rules and thresholds: needs vet review, not clinical validation."""

import re
from datetime import date
from typing import Any

NORMAL_TEMPERATURE = {
    "cattle": 38.5,
    "buffalo": 38.3,
    "goat": 39.1,
    "sheep": 39.0,
    "chicken": 41.2,
    "dog": 38.5,
    "cat": 38.6,
    "horse": 37.8,
}

# canonical symptom -> localized labels + multilingual keywords
SYMPTOMS: dict[str, dict[str, Any]] = {
    "no_appetite": {
        "en": "not eating",
        "hi": "कुछ नहीं खा रहा",
        "mr": "काहीच खात नाही",
        "keywords": ["not eating", "no appetite", "refuses food", "खात नाही", "कुछ नहीं खा", "खाना बंद"],
    },
    "reduced_appetite": {
        "en": "reduced appetite",
        "hi": "भूख कम",
        "mr": "भूक कमी",
        "keywords": ["reduced appetite", "eating less", "not eating well", "नीट खात नाही", "कम खा", "भूख कम", "कमी खात"],
    },
    "fever": {
        "en": "fever",
        "hi": "बुखार",
        "mr": "ताप",
        "keywords": ["fever", "high temperature", "hot body", "बुखार", "ताप", "शरीर गरम"],
    },
    "reduced_milk": {
        "en": "reduced milk yield",
        "hi": "दूध उत्पादन कम",
        "mr": "दूध उत्पादन कमी",
        "keywords": ["milk reduced", "less milk", "milk down", "दूध कम", "दूध कमी", "कम दूध"],
    },
    "diarrhea": {
        "en": "diarrhoea",
        "hi": "दस्त",
        "mr": "जुलाब",
        "keywords": ["diarrhea", "diarrhoea", "loose motion", "scours", "दस्त", "जुलाब", "पातळ संड"],
    },
    "cough": {
        "en": "cough",
        "hi": "खांसी",
        "mr": "खोकला",
        "keywords": ["cough", "coughing", "खांसी", "खोकला"],
    },
    "breathing_difficulty": {
        "en": "difficulty breathing",
        "hi": "सांस लेने में कठिनाई",
        "mr": "श्वास घेण्यास त्रास",
        "keywords": ["difficulty breathing", "breathing difficulty", "breathing problem", "cannot breathe", "can't breathe", "unable to breathe", "choking", "panting", "gasping", "सांस लेने में तकलीफ", "सांस लेने में कठिनाई", "सांस नहीं ले पा", "साँस नहीं ले पा", "श्वास घेण्यास त्रास", "श्वास घेऊ शकत नाही"],
    },
    "lameness": {
        "en": "lameness",
        "hi": "लंगड़ापन",
        "mr": "लंगडेपणा",
        "keywords": ["lameness", "limping", "lame", "cannot walk", "लंगड़", "लंगड", "चालत नाही"],
    },
    "swelling": {
        "en": "swelling",
        "hi": "सूजन",
        "mr": "सूज",
        "keywords": ["swelling", "swollen", "sujan", "सूजन", "सूज"],
    },
    "skin_lesions": {
        "en": "skin lesions",
        "hi": "त्वचा पर घाव",
        "mr": "त्वचेवर जखमा",
        "keywords": ["skin lesion", "sores", "rash", "itching", "खुजली", "खरुज", "त्वचा", "जखम"],
    },
    "eye_discharge": {
        "en": "eye discharge",
        "hi": "आंख से स्राव",
        "mr": "डोळ्यातून स्राव",
        "keywords": ["eye discharge", "watery eyes", "आंख", "डोळ"],
    },
    "nasal_discharge": {
        "en": "nasal discharge",
        "hi": "नाक से स्राव",
        "mr": "नाकातून स्राव",
        "keywords": ["nasal discharge", "runny nose", "नाक", "शिंक"],
    },
    "convulsions": {
        "en": "convulsions",
        "hi": "दौरे",
        "mr": "आकडी",
        "keywords": ["convulsion", "convulsions", "seizure", "seizures", "fits", "दौरा", "दौरे", "ऐंठन", "आकडी", "पेटके येणे"],
    },
    "unable_to_stand": {
        "en": "unable to stand",
        "hi": "खड़ा नहीं हो पा रहा",
        "mr": "उभे राहू शकत नाही",
        "keywords": ["unable to stand", "cannot stand", "can't stand", "recumbent", "खड़ा नहीं हो पा", "खड़े नहीं हो पा", "खड़ी नहीं हो पा", "उभे राहू शकत नाही", "उभी राहू शकत नाही", "जमिनीवर पडले"],
    },
    "bloat": {
        "en": "bloat",
        "hi": "पेट फूलना",
        "mr": "पोट फुगणे",
        "keywords": ["bloat", "tympany", "swollen belly", "पेट फूल", "पोट फुग"],
    },
    "bleeding": {
        "en": "bleeding",
        "hi": "रक्तस्राव",
        "mr": "रक्तस्राव",
        "keywords": ["bleeding", "blood", "खून", "रक्तस्राव"],
    },
    "isolation": {
        "en": "separating from herd",
        "hi": "झुंड से अलग",
        "mr": "कळपापासून वेगळे",
        "keywords": ["isolated", "separate from herd", "sitting alone", "अलग", "वेगळ"],
    },
    "weight_loss": {
        "en": "weight loss",
        "hi": "वजन कमी",
        "mr": "वजन कमी",
        "keywords": ["weight loss", "losing weight", "weak", "कमजोर", "वजन कमी", "अशक्त"],
    },
    "water_refusal": {
        "en": "not drinking water",
        "hi": "पानी नहीं पी रहा",
        "mr": "पाणी पीत नाही",
        "keywords": ["not drinking", "refuses water", "पानी नहीं", "पाणी पीत नाही"],
    },
    "unconscious": {
        "en": "unconscious", "hi": "बेहोश", "mr": "बेशुद्ध",
        "keywords": ["unconscious", "unresponsive", "बेहोश", "बेशुद्ध"],
    },
    "sudden_death": {
        "en": "sudden death", "hi": "अचानक मृत्यु", "mr": "अचानक मृत्यू",
        "keywords": ["sudden death", "died suddenly", "अचानक मृत्यु", "अचानक मृत्यू"],
    },
    "high_fever": {
        "en": "high fever", "hi": "तेज़ बुखार", "mr": "तीव्र ताप",
        "keywords": ["high fever", "very high temperature", "तेज़ बुखार", "तेज बुखार", "तीव्र ताप", "खूप ताप"],
    },
    "heat_stress": {
        "en": "heat stress",
        "hi": "गर्मी से तनाव",
        "mr": "उकाड्याचा ताण",
        "keywords": ["heat stress", "very hot", "गर्मी", "उकाडा"],
    },
}

WARNING_SYMPTOMS = {
    "breathing_difficulty",
    "convulsions",
    "unable_to_stand",
    "bloat",
    "bleeding",
    "water_refusal",
    "unconscious",
    "sudden_death",
    "high_fever",
}

DEVA_DIGITS = {"one": 1, "two": 2, "three": 3, "एक": 1, "दो": 2, "दोन": 2, "तीन": 3, "चार": 4, "पाच": 5, "पाँच": 5, "सहा": 6, "छह": 6, "सात": 7, "आठ": 8, "नऊ": 9, "नौ": 9}

ADVICE = {
    "en": [
        "Provide clean drinking water and shade",
        "Keep a written record of temperature and feed intake",
        "Do not start any medicine without veterinary advice",
    ],
    "hi": [
        "साफ पीने का पानी और छाया उपलब्ध कराएं",
        "तापमान और चारे का लिखित रिकॉर्ड रखें",
        "पशु चिकित्सक की सलाह के बिना कोई दवा न दें",
    ],
    "mr": [
        "स्वच्छ पिण्याचे पाणी आणि सावली उपलब्ध करा",
        "तापमान आणि खाद्याची लिखित नोंद ठेवा",
        "पशुवैद्यांच्या सल्ल्याशिवाय कोणतेही औषध देऊ नका",
    ],
}


def symptom_label(key: str, lang: str = "en") -> str:
    entry = SYMPTOMS.get(key)
    if not entry:
        return key.replace("_", " ")
    return entry.get(lang) or entry["en"]


CLAUSES = re.compile(r"[.!?;।\n]+|\b(?:but|however|and)\b|लेकिन|परंतु|पण|आणि|और", re.IGNORECASE)


def _symptom_matches(text: str):
    for clause in CLAUSES.split(text.lower()):
        for key, entry in SYMPTOMS.items():
            for keyword in entry["keywords"]:
                pattern = re.escape(keyword.lower())
                if keyword.isascii():
                    pattern = rf"\b{pattern}\b"
                for match in re.finditer(pattern, clause):
                    before = clause[:match.start()]
                    after = clause[match.end():]
                    denied = bool(
                        re.search(r"\b(?:no|not(?!\s+(?:only|just)\b)|without|denies)\s+(?:\w+\s+){0,3}$", before)
                        or re.search(r"^\s*(?:is\s+)?(?:absent|not present)\b", after)
                        or re.search(r"^\s*(?:(?:हो|है|आहे)\s*)?(?:नहीं|नाही|नसून|नसले)", after)
                    )
                    yield key, denied


def extract_symptoms(text: str) -> list[str]:
    found = {key for key, denied in _symptom_matches(text) if not denied}
    if "no_appetite" in found:
        found.discard("reduced_appetite")
    return sorted(found)


def extract_duration_days(text: str) -> int | None:
    lowered = text.lower()
    match = re.search(r"(\d+)\s*(day|days|दिन|दिवस)", lowered)
    if match:
        return min(int(match.group(1)), 60)
    match = re.search(r"(\d+)\s*(दिवसांपासून|दिवसापासून)", text)
    if match:
        return min(int(match.group(1)), 60)
    for word, value in DEVA_DIGITS.items():
        if re.search(rf"(?<!\w){re.escape(word)}\s*(?:days?|दिन|दिवस)", lowered):
            return value
    if "कल" in text or "yesterday" in lowered:
        return 1
    return None


def triage(
    *,
    species_code: str,
    text: str,
    symptoms: list[str] | None = None,
    temperature_c: float | None = None,
    appetite: str | None = None,
    milk_change: str | None = None,
    duration_days: int | None = None,
    lang: str = "en",
) -> dict[str, Any]:
    detected = (set(symptoms or []) & SYMPTOMS.keys()) | set(extract_symptoms(text))
    if appetite == "none":
        detected.add("no_appetite")
    elif appetite == "reduced":
        detected.add("reduced_appetite")
    if milk_change and any(word in milk_change.lower() for word in ("reduced", "less", "down", "कमी", "कम")):
        detected.add("reduced_milk")

    duration = duration_days or extract_duration_days(text)
    normal_temp = NORMAL_TEMPERATURE.get(species_code, 38.5)
    reasons: list[str] = []
    severity = "low"

    if detected & WARNING_SYMPTOMS:
        severity = "critical"
        reasons.extend(f"warning sign: {symptom_label(s, 'en')}" for s in sorted(detected & WARNING_SYMPTOMS))

    if temperature_c is not None:
        if temperature_c >= normal_temp + 1.5 or temperature_c <= normal_temp - 2.0:
            severity = "critical"
            reasons.append(f"temperature {temperature_c}°C is far outside the normal range for this species")
        elif temperature_c >= normal_temp + 0.7 and severity != "critical":
            severity = "high"
            reasons.append(f"temperature {temperature_c}°C indicates possible fever")

    rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    symptom_severity = "low"
    if len(detected) >= 3 or (detected & {"no_appetite", "reduced_appetite"} and "reduced_milk" in detected) or {"diarrhea", "fever"} <= detected:
        symptom_severity = "high"
        reasons.append("several signs reported together require prompt veterinary assessment")
    elif detected:
        symptom_severity = "medium"
        reasons.append("reported signs require veterinary review")
    else:
        matches = list(_symptom_matches(text))
        normal_report = bool(matches) and all(denied for _, denied in matches)
        normal_report = normal_report or bool(re.search(r"breathing normally|सामान्य सांस|सामान्य श्वास", text.lower()))
        if not normal_report:
            symptom_severity = "medium"
            reasons.append("unclear or unrecognized report requires veterinary review")
    severity = max((severity, symptom_severity), key=rank.get)

    if duration and duration >= 2:
        severity = max((severity, "medium"), key=rank.get)
        reasons.append(f"signs lasting {duration} day(s)")

    requires_vet = severity != "low"

    advice = list(ADVICE.get(lang, ADVICE["en"]))
    if "diarrhea" in detected:
        advice.append(
            {
                "en": "Prevent dehydration; oral rehydration must be advised by a veterinarian",
                "hi": "निर्जलीकरण रोकें; ओआरएस की सलाह पशु चिकित्सक से लें",
                "mr": "निर्जलीकरण टाळा; ओआरएसचा सल्ला पशुवैद्यांकडून घ्या",
            }.get(lang, "")
        )
    if "fever" in detected or (temperature_c and temperature_c > normal_temp):
        advice.append(
            {
                "en": "Monitor temperature twice daily and record it",
                "hi": "दिन में दो बार तापमान मापें और रिकॉर्ड करें",
                "mr": "दिवसातून दोन वेळा तापमान मोजा आणि नोंद करा",
            }.get(lang, "")
        )
    advice = [a for a in advice if a]

    return {
        "severity": severity,
        "requires_vet": requires_vet,
        "symptoms": sorted(detected),
        "findings": [symptom_label(s, lang) for s in sorted(detected)],
        "reasons": reasons,
        "advice": advice,
        "duration_days": duration,
        "normal_temp_c": normal_temp,
        "temperature_c": temperature_c,
        "rule_status": "needs vet review",
        "needs_vet_review": requires_vet,
        "disclaimer": "Rule thresholds need vet review; clinical accuracy is not established. Not a diagnosis or prescription.",
        "generated_on": date.today().isoformat(),
    }
