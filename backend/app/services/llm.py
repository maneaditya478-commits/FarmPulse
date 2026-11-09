"""Bounded LLM adapters and output-policy screening, not clinical validation."""

import json
import logging
import re
import unicodedata
from collections.abc import Callable
from typing import Any

import httpx

from app.core.config import settings
from app.services.triage import extract_duration_days, extract_symptoms

logger = logging.getLogger("alg.llm")

VALID_INTENTS = {"health", "vaccination", "nutrition", "environment", "veterinary", "market", "finance", "animal_record", "greeting"}
VALID_LANGUAGES = {"en", "hi", "mr"}
_STRUCTURE_FIELDS = {"intent", "symptoms", "animal_code", "language", "duration_days"}

# NFKC folds compatibility units (㎎, ｍｇ); decimal digits also cover Devanagari.
_DOSE = re.compile(
    r"(?<!\w)\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|ml|cc|iu|"
    r"milligrams?|micrograms?|millilit(?:er|re)s?|units?|tablets?|drops?|"
    r"मिली(?:ग्राम|लीटर)?|मिलि(?:ग्राम|लीटर)?|मिग्रा|मि\s*ली|डोस|गोळ्या|बूंद|थेंब)"
    r"(?:\s*/\s*(?:kg|किग्रा|किलो))?(?!\w)",
)
_DISEASE = re.compile(
    r"\b(?:mastitis|rabies|anthrax|brucellosis|pneumonia|tuberculosis|"
    r"foot[\s-]*and[\s-]*mouth(?: disease)?|fmd|lumpy skin disease|"
    r"haemorrhagic septicaemia|hemorrhagic septicemia|black quarter)\b|"
    r"थनैला|स्तनदाह|रेबीज|रेबिज|खुरपका[\s-]*मुंहपका|खुरपका[\s-]*मुँहपका|"
    r"लाळ्या[\s-]*खुरकूत|लाळ्या[\s-]*खुरखुरे|अँथ्रॅक्स|एन्थ्रेक्स",
)
_DIAGNOSIS = re.compile(
    r"\b(?:diagnos(?:is|e|es|ed|ing)|confirmed disease|definitely (?:a |the )?disease)\b|"
    r"निदान|रोग की पुष्टि|रोगाची पुष्टी",
)
_DRUG = re.compile(
    r"\b(?:amoxicillin|penicillin|oxytetracycline|tetracycline|ivermectin|"
    r"enrofloxacin|dexamethasone|paracetamol|antibiotics?)\b|"
    r"अमोक्सिसिलिन|अमॉक्सिसिलिन|पेनिसिलिन|एंटीबायोटिक|अँटिबायोटिक|प्रतिजैविक",
)
_PRESCRIPTION = re.compile(
    r"\b(?:prescrib(?:e|es|ed|ing)|prescriptions?|dosages?|dose of)\b|"
    r"प्रिस्क्रिप्शन|पर्चा|खुराक|डोस|"
    r"\b(?:give|inject|administer|start|take|use|recommend)\b[^;.!?।\n]{0,65}"
    r"\b(?:medicines?|medications?|drugs?|treatment|injections?)\b|"
    r"(?:दवा|औषध|इंजेक्शन)[^;.!?।\n]{0,65}(?:दें|देना|दीजिए|द्या|द्यावे|घ्या|सुरू|शुरू)(?![\w\u0900-\u097f])",
)
_APPROVAL = re.compile(
    r"\b(?:approved|approval|cleared|authori[sz]ed(?!\s+(?:veterinary|veterinarian|vet|doctor|professional)\b))\b|"
    r"मंजूरी|मंजुरी|मंजूर|स्वीकृति|मान्यता",
)
_NEGATION = re.compile(
    r"\b(?:no|never|cannot|can't|can not|do not|don't|does not|doesn't|did not|didn't|"
    r"will not|won't|is not|isn't|are not|aren't|was not|wasn't|not)\b(?!\s+(?:only|just)\b)|"
    r"(?<![\w\u0900-\u097f])(?:नहीं|नाही|नका|मत|न)(?![\w\u0900-\u097f])",
)
_REQUIREMENT = re.compile(
    r"\b(?:required|requires?|needed|must (?:be|come)|under (?:veterinary |vet )?supervision)\b|"
    r"आवश्यक|जरूरी|ज़रूरी|गरजेची|गरजेचे|देखरेख|सल्ल्याने|सल्ल्याशिवाय",
)
# Split independent assertions, not decimal points or a negated clinical noun list.
_CLAUSES = re.compile(
    r"[;!?।\n\r]|(?<!\d)\.|\.(?!\d)|"
    r"\b(?:but|however|yet|nevertheless)\b|लेकिन|परंतु|मगर|तथापि|"
    r"(?:,|\b(?:and|or)\b)\s*(?=(?:i|we|you|your|this|that|it|the|"
    r"a (?:cow|animal|vet|doctor))\b)|"
    r",\s*(?=(?:give|inject|start|administer|take|use|prescribe|recommend)\b)|"
    r"(?:और|आणि)\s*(?=(?:यह|ये|आप|पशु|डॉक्टर|हे|तुम|पशू))|"
    r"(?:,|और|आणि)\s*(?=(?:दवा|औषध|एंटीबायोटिक|प्रतिजैविक)"
    r"[^,;!?।\n]{0,65}(?:दें|देना|दीजिए|द्या|द्यावे|घ्या|सुरू|शुरू))",
)


def _normalized(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold().replace("’", "'")
    normalized = "".join(
        str(unicodedata.decimal(char)) if char.isdecimal() else char
        for char in normalized if unicodedata.category(char) != "Cf"
    )
    return re.sub(r"मि\s*\.\s*ली\s*\.?", "मिली", normalized)


def _negated(clause: str, match: re.Match[str]) -> bool:
    """Negation cannot cross another assertion or an adversative boundary."""
    # Independent positive predicates also delimit scope when punctuation is absent.
    prefix = clause[:match.start()]
    suffix = clause[match.end():]
    boundaries = list(re.finditer(
        r"\b(?:i|we|you|your|this|that|it|the (?:cow|animal|vet|doctor))\b|"
        r"आपकी|तुमच्या|पशु को|पशूला", prefix,
    ))
    if boundaries:
        prefix = prefix[boundaries[-1].start():]
    prefix = re.split(r"\b(?:provided|given|offered|confirmed)\b\s*(?:,|and|or)\s*", prefix)[-1]
    suffix = re.split(
        r"\b(?:and|or)\s+(?:i|we|you|your|this|the)\b|और|आणि", suffix, maxsplit=1,
    )[0]
    # 'No veterinarian has approved' must retain the subject's leading negation.
    if re.match(r"\s*no\s+(?:veterinarian|vet|doctor)\b", clause):
        prefix = clause[:match.start()]
    if _NEGATION.search(prefix + match.group()):
        return True
    if re.search(r"[\u0900-\u097f]", match.group()):
        # Hindi/Marathi negation is often postposed, even after a noun list.
        # An earlier affirmative finite verb closes that scope.
        suffix = re.split(r"(?<!\w)(?:है|हैं|आहे|आहेत)(?!\w)", suffix, maxsplit=1)[0]
        return bool(_NEGATION.search(suffix))
    # A later 'no medicine' does not negate an earlier disease/approval claim.
    return bool(re.match(
        r"\s*(?:(?:is|are|was|were|has|have|will|can)\s+)?"
        r"(?:not\b(?!\s+(?:only|just)\b)|never\b|cannot\b|can't\b|isn't\b|aren't\b|wasn't\b)",
        suffix,
    ))


def safety_scan(text: str) -> tuple[bool, str | None]:
    """Return a generic policy code without echoing unsafe content."""
    if not isinstance(text, str):
        return False, "invalid_output_type"
    normalized = _normalized(text)
    if _DOSE.search(normalized):
        return False, "unsafe_dosage"
    for clause in _CLAUSES.split(normalized):
        for pattern, reason in (
            (_DISEASE, "unsafe_diagnosis"),
            (_DIAGNOSIS, "unsafe_diagnosis"),
            (_DRUG, "unsafe_prescription"),
            (_PRESCRIPTION, "unsafe_prescription"),
            (_APPROVAL, "unsafe_approval"),
        ):
            for match in pattern.finditer(clause):
                if _negated(clause, match):
                    continue
                # Referral/required approval is not an assertion of completed approval.
                if pattern in (_DIAGNOSIS, _APPROVAL) and match.group() in {
                    "diagnosis", "निदान", "approval", "मंजूरी", "मंजुरी", "स्वीकृति", "मान्यता",
                }:
                    tail = clause[match.end():]
                    requirement = _REQUIREMENT.search(tail)
                    if requirement and not re.search(
                        r"[:=]|\b(?:approved|confirmed|diagnosed|has|have|granted|given)\b|"
                        r"मंजूर|दिली|दी|झाला", tail[:requirement.start()],
                    ):
                        continue
                return False, reason
    return True, None


def safety_refusal(lang: str, emergency: bool = False) -> str:
    """Localized, non-clinical replacement; critical escalation is never dropped."""
    messages = {
        "en": "I can help record observations and connect you with a veterinarian. I cannot provide a diagnosis, prescription or dosage.",
        "hi": "मैं जानकारी दर्ज करने और पशु चिकित्सक से जोड़ने में मदद कर सकता हूँ। मैं निदान, दवा का पर्चा या खुराक नहीं दे सकता।",
        "mr": "मी नोंदी करण्यास आणि पशुवैद्यांशी जोडण्यास मदत करू शकतो. मी निदान, प्रिस्क्रिप्शन किंवा डोस देऊ शकत नाही.",
    }
    urgent = {
        "en": "Contact a veterinarian immediately.",
        "hi": "पशु चिकित्सक से तुरंत संपर्क करें।",
        "mr": "पशुवैद्यांशी त्वरित संपर्क करा.",
    }
    language = lang if lang in VALID_LANGUAGES else "en"
    return f"{urgent[language]} {messages[language]}" if emergency else messages[language]


def _unsafe_field(value: Any) -> tuple[str, str] | None:
    """Inspect every raw field, including keys, nested extras and other candidates."""
    if isinstance(value, str):
        safe, reason = safety_scan(value)
        return (value, reason) if not safe and reason else None
    if isinstance(value, dict):
        for key, item in value.items():
            blocked = _unsafe_field(key) or _unsafe_field(item)
            if blocked:
                return blocked
    elif isinstance(value, list):
        for item in value:
            blocked = _unsafe_field(item)
            if blocked:
                return blocked
    return None


def _provider_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise ValueError("invalid_provider_envelope")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("invalid_provider_envelope")
    candidate = candidates[0]
    if not isinstance(candidate, dict) or not isinstance(candidate.get("content"), dict):
        raise ValueError("invalid_provider_envelope")
    parts = candidate["content"].get("parts")
    if not isinstance(parts, list) or not parts:
        raise ValueError("invalid_provider_envelope")
    if any(not isinstance(part, dict) or not isinstance(part.get("text"), str) for part in parts):
        raise ValueError("invalid_provider_envelope")
    return "".join(part["text"] for part in parts)


def _block(on_block: Callable[[dict[str, str]], Any] | None, reason: str) -> None:
    if on_block is not None:
        on_block({"stage": "llm_structure", "reason": reason})


def _validate_structure(parsed: Any, text: str, language: str) -> str | None:
    if not isinstance(parsed, dict) or set(parsed) != _STRUCTURE_FIELDS:
        return "invalid_schema"
    intent, symptoms = parsed["intent"], parsed["symptoms"]
    code, lang, duration = parsed["animal_code"], parsed["language"], parsed["duration_days"]
    if not isinstance(intent, str) or intent not in VALID_INTENTS:
        return "invalid_schema"
    if not isinstance(lang, str) or lang not in VALID_LANGUAGES or lang != language:
        return "invalid_schema"
    if not isinstance(symptoms, list) or len(symptoms) > 20 or any(
        not isinstance(item, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,59}", item) for item in symptoms
    ):
        return "invalid_schema"
    if code is not None and (not isinstance(code, str) or not re.fullmatch(r"[\w-]{1,64}", code)):
        return "invalid_schema"
    if duration is not None and (type(duration) is not int or not 0 <= duration <= 60):
        return "invalid_schema"
    if not set(symptoms).issubset(extract_symptoms(text)):
        return "ungrounded_symptoms"
    normalized = _normalized(text)
    if code is not None and not re.search(r"(?<![\w-])" + re.escape(_normalized(code)) + r"(?![\w-])", normalized):
        return "ungrounded_animal_code"
    if duration is not None:
        if duration != extract_duration_days(normalized):
            return "ungrounded_duration"
        reported = re.search(r"(?<!\d)(\d+)\s*(?:days?|दिन|दिवस)", normalized)
        if reported and int(reported.group(1)) != duration:
            # The rule extractor may cap long durations; the LLM must not rewrite metadata.
            return "ungrounded_duration"
    return None


class _ProviderUnavailable(Exception):
    pass


class LLMService:
    @property
    def provider(self) -> str:
        return "gemini" if self.enabled else "local-expert-rules"

    @property
    def enabled(self) -> bool:
        return bool(settings.gemini_api_key) and settings.llm_provider == "gemini"

    def _request(self, body: dict[str, Any]) -> Any:
        """At most two calls, without sleep; malformed output is never retried."""
        for attempt in range(2):
            try:
                response = httpx.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
                    params={"key": settings.gemini_api_key},
                    json=body,
                    timeout=settings.llm_timeout_seconds,
                )
                response.raise_for_status()
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                if attempt == 0:
                    continue
                logger.warning("gemini_request_unavailable error=%s", type(exc).__name__)
                raise _ProviderUnavailable from None
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if attempt == 0 and (status == 429 or 500 <= status < 600):
                    continue
                logger.warning("gemini_request_unavailable status=%s", status)
                raise _ProviderUnavailable from None
            except Exception as exc:  # noqa: BLE001 - permanent/unknown transport failures
                logger.warning("gemini_request_unavailable error=%s", type(exc).__name__)
                raise _ProviderUnavailable from None
            return response.json()
        raise _ProviderUnavailable

    def structure_request(
        self, text: str, language: str, *, on_block: Callable[[dict[str, str]], Any] | None = None,
    ) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        prompt = (
            "You are the intake classifier for a livestock management system. "
            "Return ONLY strict JSON with exactly five keys: intent (one of health, vaccination, nutrition, environment, "
            "veterinary, market, finance, animal_record, greeting), symptoms (array of short English snake_case "
            "signs explicitly reported in the message), animal_code (exact reported tag string or null), "
            "language (en, hi or mr, matching the hint), duration_days (reported integer from 0 to 60 or null). "
            "Never invent metadata or add diagnosis, medicine, dosage, approval or treatment advice.\n"
            f"Farmer language hint: {language}.\nMessage: {text}"
        )
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
        }
        try:
            payload = self._request(body)
            blocked = _unsafe_field(payload)
            if blocked:
                _block(on_block, blocked[1])
                return None
            text_out = _provider_text(payload)
            safe, reason = safety_scan(text_out)
            if not safe:
                _block(on_block, reason or "unsafe_output")
                return None
            parsed = json.loads(_strip_fences(text_out), object_pairs_hook=_unique_object)
            blocked = _unsafe_field(parsed)
            reason = blocked[1] if blocked else _validate_structure(parsed, text, language)
            if reason:
                _block(on_block, reason)
                return None
            return parsed
        except _ProviderUnavailable:
            return None
        except Exception as exc:  # noqa: BLE001 - malformed output falls back without retry
            logger.warning("gemini_structured_output_invalid error=%s", type(exc).__name__)
            _block(on_block, "invalid_schema")
            return None

    def translate(self, text: str, target_language: str) -> str | None:
        if not self.enabled:
            return None
        prompt = (
            f"Translate the following livestock advisory into {target_language}. Keep numbers, dates and warnings intact. "
            f"Do not add diagnosis, medicine names, dosage or approval claims. Return only the translation.\n{text}"
        )
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
        try:
            payload = self._request(body)
            # Keep unsafe raw fields visible to the route's scanner and attributed audit.
            # Never turn a blocked provider output into None (which would silently echo).
            blocked = _unsafe_field(payload)
            if blocked:
                return blocked[0]
            translated = _provider_text(payload)
            return translated if translated.strip() else None
        except _ProviderUnavailable:
            return None
        except Exception as exc:  # noqa: BLE001 - no retry for invalid output
            logger.warning("gemini_translate_output_invalid error=%s", type(exc).__name__)
            return None


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def _strip_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip()).strip()


llm_service = LLMService()
