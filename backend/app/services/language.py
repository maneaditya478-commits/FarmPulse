"""Language detection and localized response templates (English / Hindi / Marathi)."""

import re
from typing import Any

DEVANAGARI = re.compile(r"[\u0900-\u097F]")

MARATHI_MARKERS = {
    "माझी",
    "माझ्या",
    "दिवसांपासून",
    "आहे",
    "नाही",
    "दूध",
    "गाय",
    "म्हैस",
    "बकरी",
    "कोंबडी",
    "लस",
    "वैद्य",
    "औषध",
    "चारा",
    "पशु",
    "निरोगी",
    "कृपया",
}
HINDI_MARKERS = {
    "मेरी",
    "मेरे",
    "दिनों",
    "से",
    "है",
    "नहीं",
    "दूध",
    "गाय",
    "भैंस",
    "बकरी",
    "मुर्गी",
    "टीका",
    "डॉक्टर",
    "दवा",
    "चारा",
    "पशु",
    "कृपया",
    "समय",
}


def detect_language(text: str, fallback: str = "en") -> str:
    if not DEVANAGARI.search(text):
        return "en"
    tokens = set(re.findall(r"[\u0900-\u097F]+", text))
    marathi_hits = len(tokens & MARATHI_MARKERS)
    hindi_hits = len(tokens & HINDI_MARKERS)
    # "आहे" and "माझी" are strongly Marathi; "है"/"मेरी" strongly Hindi.
    if marathi_hits > hindi_hits:
        return "mr"
    if hindi_hits > marathi_hits:
        return "hi"
    return "hi" if fallback == "en" else fallback


SEVERITY_LABEL = {
    "en": {"low": "low", "medium": "moderate", "high": "high", "critical": "critical"},
    "hi": {"low": "कम", "medium": "मध्यम", "high": "अधिक", "critical": "गंभीर"},
    "mr": {"low": "कमी", "medium": "मध्यम", "high": "जास्त", "critical": "गंभीर"},
}


def _tr(lang: str, en: str, hi: str, mr: str) -> str:
    return {"en": en, "hi": hi, "mr": mr}.get(lang, en)


def health_response(
    lang: str,
    *,
    animal_name: str,
    severity: str,
    requires_vet: bool,
    findings: list[str],
    advice: list[str],
    case_code: str | None,
    vet_name: str | None,
    appointment_note: str | None,
) -> str:
    sev = SEVERITY_LABEL.get(lang, SEVERITY_LABEL["en"]).get(severity, severity)
    lines: list[str] = [_tr(
        lang,
        "Rule thresholds: needs vet review. Clinical accuracy is not established.",
        "नियमों की सीमाओं की पशु चिकित्सक द्वारा समीक्षा आवश्यक है। चिकित्सकीय सटीकता स्थापित नहीं है।",
        "नियमांच्या मर्यादांचे पशुवैद्यांकडून पुनरावलोकन आवश्यक आहे. वैद्यकीय अचूकता सिद्ध झालेली नाही.",
    )]
    if severity == "critical":
        lines.append(_tr(
            lang,
            "Emergency warning: contact a veterinarian immediately; do not wait for an app request or follow-up. Do not force water or feed into the mouth.",
            "आपात चेतावनी: तुरंत पशु चिकित्सक से संपर्क करें; ऐप अनुरोध या फॉलो-अप का इंतजार न करें। जबरदस्ती मुंह में पानी या चारा न दें।",
            "धोक्याचा इशारा: त्वरित पशुवैद्यांशी संपर्क करा; ॲप विनंती किंवा पाठपुराव्याची वाट पाहू नका. तोंडात जबरदस्तीने पाणी किंवा चारा देऊ नका.",
        ))

    if lang == "mr":
        lines.append(f"{animal_name} साठी {'नोंद घेतली आहे' if case_code else 'प्राथमिक मार्गदर्शन'}. प्राथमिकता पातळी: {sev}.")
        if findings:
            lines.append("आढळलेली लक्षणे: " + "; ".join(findings) + ".")
        if requires_vet:
            lines.append("⚠️ ही स्थिती पशुवैद्यकीय तपासणीची आवश्यकता दर्शवते. कृपया पशुवैद्यांशी संपर्क साधा.")
        else:
            lines.append("सध्या गंभीर धोक्याची चिन्हे आढळली नाहीत. लक्षणे वाढल्यास किंवा 24 तासांत सुधारणा न झाल्यास पशुवैद्यांशी संपर्क साधा.")
        if advice:
            lines.append("काळजी: " + "; ".join(advice) + ".")
        if case_code:
            lines.append(f"आरोग्य नोंद क्रमांक: {case_code}.")
        if vet_name:
            lines.append(f"पशुवैद्यकीय मदत विनंती {vet_name} यांना पाठवली आहे.")
        if appointment_note:
            lines.append(appointment_note)
        lines.append("टीप: हा सल्ला पशुवैद्यकीय निदान किंवा औषधोपचार नाही. औषधांचा वापर फक्त पशुवैद्यांच्या सल्ल्याने करा.")
        return " ".join(lines)

    if lang == "hi":
        lines.append(f"{animal_name} के लिए {'रिकॉर्ड दर्ज किया गया है' if case_code else 'प्राथमिक मार्गदर्शन'}। प्राथमिकता स्तर: {sev}.")
        if findings:
            lines.append("दर्ज लक्षण: " + "; ".join(findings) + ".")
        if requires_vet:
            lines.append("⚠️ इस स्थिति में पशु चिकित्सक की जाँच आवश्यक है। कृपया पशु चिकित्सक से संपर्क करें।")
        else:
            lines.append("अभी गंभीर चेतावनी संकेत नहीं मिले हैं। लक्षण बढ़ने या 24 घंटे में सुधार न होने पर पशु चिकित्सक से संपर्क करें।")
        if advice:
            lines.append("देखभाल: " + "; ".join(advice) + ".")
        if case_code:
            lines.append(f"स्वास्थ्य केस संख्या: {case_code}.")
        if vet_name:
            lines.append(f"पशु चिकित्सा सहायता अनुरोध {vet_name} को भेजा गया है।")
        if appointment_note:
            lines.append(appointment_note)
        lines.append("नोट: यह पशु-चिकित्सकीय निदान या उपचार नहीं है। पशु चिकित्सक की सलाह के बिना कोई दवा न दें।")
        return " ".join(lines)

    lines.append(f"{'Recorded a health report' if case_code else 'Urgency guidance'} for {animal_name}. Priority: {sev}.")
    if findings:
        lines.append("Observed signs: " + "; ".join(findings) + ".")
    if requires_vet:
        lines.append("⚠️ These signs need veterinary assessment. Please contact a veterinarian.")
    else:
        lines.append("No emergency warning signs were identified. If signs worsen or do not improve within 24 hours, contact a veterinarian.")
    if advice:
        lines.append("Care guidance: " + "; ".join(advice) + ".")
    if case_code:
        lines.append(f"Health case: {case_code}.")
    if vet_name:
        lines.append(f"A veterinary assistance request has been sent to {vet_name}.")
    if appointment_note:
        lines.append(appointment_note)
    lines.append("Note: this is not a veterinary diagnosis or prescription. Medicines must only be used under veterinary supervision.")
    return " ".join(lines)


def vaccination_response(lang: str, items: list[dict], animal_name: str | None) -> str:
    if not items:
        return _tr(
            lang,
            "No upcoming or overdue vaccinations were found for the selected animals based on the verified schedule.",
            "सत्यापित अनुसूची के अनुसार चयनित पशुओं के लिए कोई आगामी या विलंबित टीकाकरण नहीं मिला।",
            "सत्यापित वेळापत्रकानुसार निवडलेल्या पशुंसाठी कोणतीही आगामी किंवा रखडलेली लस आढळली नाही.",
        )
    lines = [
        _tr(lang, "Vaccination status:", "टीकाकरण स्थिति:", "लसीकरण स्थिती:"),
    ]
    for item in items[:6]:
        status = item["status"]
        label = {
            "overdue": _tr(lang, "overdue", "विलंबित", "रखडलेली"),
            "due": _tr(lang, "due soon", "जल्द देय", "लवकर देय"),
            "scheduled": _tr(lang, "scheduled", "निर्धारित", "नियोजित"),
        }.get(status, status)
        lines.append(
            f"- {item['animal_name']}: {item['vaccine_name']} ({label}, {item['due_on']}) — {item['source_reference']}"
        )
    lines.append(
        _tr(
            lang,
            "Confirm the schedule and administer vaccines only with a veterinarian or trained paravet.",
            "अनुसूची की पुष्टि करें और टीका केवल पशु चिकित्सक या प्रशिक्षित पैरावेट के साथ लगवाएं।",
            "वेळापत्रकाची पुष्टी करा आणि लस केवळ पशुवैद्य किंवा प्रशिक्षित पॅराव्हेटसोबतच द्या.",
        )
    )
    return "\n".join(lines)


def market_response(lang: str, rows: list[dict], district: str) -> str:
    if not rows:
        return _tr(
            lang,
            f"No verified market prices are available for {district} at the moment. No price was estimated.",
            f"{district} के लिए अभी कोई सत्यापित बाजार भाव उपलब्ध नहीं है। कोई अनुमानित भाव नहीं दिखाया गया।",
            f"{district} साठी सध्या कोणताही सत्यापित बाजारभाव उपलब्ध नाही. कोणताही अंदाजित भाव दाखवलेला नाही.",
        )
    lines = [_tr(lang, f"Market information for {district}:", f"{district} के लिए बाजार जानकारी:", f"{district} साठी बाजार माहिती:")]
    for row in rows[:8]:
        demo = _tr(lang, " (demonstration data)", " (प्रदर्शन डेटा)", " (प्रात्यक्षिक डेटा)") if row.get("is_demo") else ""
        lines.append(
            f"- {row['category']}: ₹{row['price_per_unit']:.0f} {row['unit']}, {row['market_name'] or row['district']}, "
            f"{row['observed_on']} — {row['source']}{demo}"
        )
    lines.append(
        _tr(
            lang,
            "Prices include source and date. Always verify at the local market before any transaction.",
            "भाव के साथ स्रोत और तारीख दी गई है। लेन-देन से पहले स्थानीय बाजार में पुष्टि करें।",
            "भावासोबत स्रोत आणि तारीख दिली आहे. व्यवहारापूर्वी स्थानिक बाजारात खात्री करा.",
        )
    )
    return "\n".join(lines)


def finance_response(lang: str, summary: dict) -> str:
    lines: list[str] = []
    if lang == "mr":
        lines.append(
            f"गेल्या {summary['period_days']} दिवसांतील अंदाज: दूध उत्पन्न ₹{summary['milk_revenue']:.0f}, अंडी उत्पन्न ₹{summary['egg_revenue']:.0f}, खाद्य खर्च ₹{summary['feed_expense']:.0f}, पशुवैद्यकीय खर्च ₹{summary['vet_expense']:.0f}."
        )
        lines.append(f"अंदाजित निव्वळ उत्पन्न: ₹{summary['net']:.0f}.")
        lines.append(f"आजारामुळे अंदाजित उत्पन्नातील फरक: ₹{summary['estimated_loss']:.0f} (हा प्रत्यक्ष नुकसान नाही).")
        lines.append("गणनेची गृहीते: " + "; ".join(summary["assumptions"]))
        return " ".join(lines)
    if lang == "hi":
        lines.append(
            f"पिछले {summary['period_days']} दिनों का अनुमान: दूध आय ₹{summary['milk_revenue']:.0f}, अंडा आय ₹{summary['egg_revenue']:.0f}, चारा खर्च ₹{summary['feed_expense']:.0f}, पशु चिकित्सा खर्च ₹{summary['vet_expense']:.0f}."
        )
        lines.append(f"अनुमानित शुद्ध आय: ₹{summary['net']:.0f}.")
        lines.append(f"बीमारी के कारण अनुमानित आय अंतर: ₹{summary['estimated_loss']:.0f} (यह वास्तविक नुकसान नहीं है)।")
        lines.append("गणना की मान्यताएँ: " + "; ".join(summary["assumptions"]))
        return " ".join(lines)
    lines.append(
        f"Estimate for the last {summary['period_days']} days: milk income ₹{summary['milk_revenue']:.0f}, "
        f"egg income ₹{summary['egg_revenue']:.0f}, feed cost ₹{summary['feed_expense']:.0f}, veterinary cost ₹{summary['vet_expense']:.0f}."
    )
    lines.append(f"Estimated net: ₹{summary['net']:.0f}.")
    lines.append(f"Estimated production revenue difference attributed to illness: ₹{summary['estimated_loss']:.0f} (this is not a confirmed net loss).")
    lines.append("Assumptions: " + "; ".join(summary["assumptions"]))
    return " ".join(lines)


def generic_response(lang: str, data: dict[str, Any]) -> str:
    if data.get("text_en") or data.get("text_hi") or data.get("text_mr"):
        return data.get(f"text_{lang}") or data.get("text_en") or ""
    return _tr(lang, "How can I help with your livestock today?", "आज मैं आपके पशुओं की किस प्रकार सहायता कर सकता हूँ?", "आज मी तुमच्या पशूंच्या बाबतीत कशी मदत करू शकतो?")
