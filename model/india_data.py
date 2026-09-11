"""
India-specific deterministic data for Sanjeevani.

Unlike the LLM-grounded knowledge base, everything here is curated,
versioned, and needs no network or model call:

- Emergency / health helplines (108, 102, 104, 1098, Tele-MANAS, PM-JAY…)
- Universal Immunization Programme (UIP) schedule for the teeka tracker
- Seasonal disease advisories mapped to India's mausam cycle
- Common-concern quick questions (bilingual) for the frontend grid
- Government scheme pointers (Ayushman Bharat PM-JAY, JSY/JSSK, IFA/ANC)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Helplines
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Helpline:
    name: str
    name_hi: str
    number: str
    tel: str
    desc: str
    desc_hi: str
    hours: str = "24×7"


HELPLINES: list[Helpline] = [
    Helpline("Ambulance (National)", "एम्बुलेंस", "108", "tel:108",
             "Medical, police & fire emergency ambulance — all states.",
             "चिकित्सा आपातकाल के लिए एम्बुलेंस — सभी राज्य।"),
    Helpline("Pregnancy & Child Ambulance", "गर्भवती व शिशु एम्बुलेंस", "102", "tel:102",
             "Free ambulance for pregnant women and sick newborns (JSSK).",
             "गर्भवती महिलाओं व बीमार नवजातों के लिए मुफ्त एम्बुलेंस।"),
    Helpline("Health Helpline", "स्वास्थ्य हेल्पलाइन", "104", "tel:104",
             "Medical advice by phone in most states/UTs.",
             "अधिकांश राज्यों में फोन पर चिकित्सा सलाह।"),
    Helpline("Childline", "चाइल्डलाइन", "1098", "tel:1098",
             "Emergency help for children in distress.",
             "मुसीबत में फँसे बच्चों के लिए आपात सहायता।"),
    Helpline("Tele-MANAS (Mental Health)", "टेली-मानस (मानसिक स्वास्थ्य)", "14416", "tel:14416",
             "Free counselling for stress, anxiety, depression — Hindi & regional languages.",
             "तनाव, चिंता, अवसाद के लिए मुफ्त परामर्श — हिंदी व क्षेत्रीय भाषाओं में।"),
    Helpline("Ayushman Bharat (PM-JAY)", "आयुष्मान भारत", "14555", "tel:14555",
             "Check eligibility & find empanelled hospitals for free treatment up to ₹5 lakh/year.",
             "₹5 लाख/वर्ष तक मुफ्त इलाज — पात्रता व अस्पताल जानें।"),
    Helpline("Health Ministry Helpline", "स्वास्थ्य मंत्रालय", "1075", "tel:1075",
             "National health helpline (erstwhile COVID helpline).",
             "राष्ट्रीय स्वास्थ्य हेल्पलाइन।"),
]


# ---------------------------------------------------------------------------
# UIP immunization schedule (due age in days from birth)
# Source: MoHFW Universal Immunization Programme.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class VaccineDose:
    key: str
    name: str
    name_hi: str
    due_days: int
    due_label: str
    note: str = ""


UIP_SCHEDULE: list[VaccineDose] = [
    VaccineDose("bcg", "BCG", "बीसीजी", 0, "at birth", "Single dose, left upper arm."),
    VaccineDose("opv0", "OPV-0", "ओपीवी-0", 0, "at birth", "Oral polio drops."),
    VaccineDose("hepb0", "Hepatitis-B (birth dose)", "हेपेटाइटिस-बी", 0, "at birth", "Within 24 hours of birth."),
    VaccineDose("opv1", "OPV-1", "ओपीवी-1", 42, "6 weeks", ""),
    VaccineDose("penta1", "Pentavalent-1", "पेंटावैलेंट-1", 42, "6 weeks", "DPT + HepB + Hib combined."),
    VaccineDose("rvv1", "Rotavirus-1", "रोटावायरस-1", 42, "6 weeks", "Oral drops."),
    VaccineDose("fipv1", "fIPV-1", "एफआईपीवी-1", 42, "6 weeks", ""),
    VaccineDose("pcv1", "PCV-1", "पीसीवी-1", 42, "6 weeks", "Pneumonia protection."),
    VaccineDose("opv2", "OPV-2", "ओपीवी-2", 70, "10 weeks", ""),
    VaccineDose("penta2", "Pentavalent-2", "पेंटावैलेंट-2", 70, "10 weeks", ""),
    VaccineDose("rvv2", "Rotavirus-2", "रोटावायरस-2", 70, "10 weeks", ""),
    VaccineDose("opv3", "OPV-3", "ओपीवी-3", 98, "14 weeks", ""),
    VaccineDose("penta3", "Pentavalent-3", "पेंटावैलेंट-3", 98, "14 weeks", ""),
    VaccineDose("rvv3", "Rotavirus-3", "रोटावायरस-3", 98, "14 weeks", ""),
    VaccineDose("fipv2", "fIPV-2", "एफआईपीवी-2", 98, "14 weeks", ""),
    VaccineDose("pcv2", "PCV-2", "पीसीवी-2", 98, "14 weeks", ""),
    VaccineDose("mr1", "Measles-Rubella 1", "खसरा-रूबेला 1", 270, "9–12 months", ""),
    VaccineDose("je1", "Japanese Encephalitis 1", "जापानी बुखार 1", 270, "9–12 months", "In endemic districts."),
    VaccineDose("pcvb", "PCV booster", "पीसीवी बूस्टर", 270, "9–12 months", ""),
    VaccineDose("vita1", "Vitamin A-1", "विटामिन ए-1", 270, "9–12 months", "With MR-1."),
    VaccineDose("dptb", "DPT booster", "डीपीटी बूस्टर", 480, "16–24 months", ""),
    VaccineDose("opvb", "OPV booster", "ओपीवी बूस्टर", 480, "16–24 months", ""),
    VaccineDose("mr2", "Measles-Rubella 2", "खसरा-रूबेला 2", 480, "16–24 months", ""),
    VaccineDose("je2", "Japanese Encephalitis 2", "जापानी बुखार 2", 480, "16–24 months", "In endemic districts."),
]


@dataclass
class DoseStatus:
    key: str
    name: str
    name_hi: str
    due_label: str
    due_date: str
    status: str  # "due_today" | "upcoming" | "overdue"
    note: str = ""


def immunization_status(birthdate: date, today: date | None = None) -> dict:
    """Maps a child's birthdate onto the UIP schedule.

    Status rule: within ±7 days of due date -> ``due_today`` ("lagne ka
    samay"); past due + 7 days -> ``overdue`` ("chhoot gaya — turant
    lagwayein"); otherwise ``upcoming``.
    """
    today = today or date.today()
    if birthdate > today:
        raise ValueError("Birthdate is in the future.")
    if (today - birthdate).days > 7 * 365:
        raise ValueError("Child is older than 7 years — UIP schedule covers 0–2 years.")
    age_days = (today - birthdate).days
    doses: list[DoseStatus] = []
    for v in UIP_SCHEDULE:
        due = birthdate + timedelta(days=v.due_days)
        delta = age_days - v.due_days
        status = "due_today" if abs(delta) <= 7 else ("overdue" if delta > 7 else "upcoming")
        doses.append(DoseStatus(v.key, v.name, v.name_hi, v.due_label, due.isoformat(), status, v.note))
    by = {"overdue": 0, "due_today": 0, "upcoming": 0}
    for d in doses:
        by[d.status] += 1
    return {"birthdate": birthdate.isoformat(), "age_days": age_days,
            "age_label": _age_label(age_days), "counts": by, "doses": doses}


def _age_label(age_days: int) -> str:
    if age_days < 30:
        return f"{age_days} din"
    months = age_days // 30
    if months < 24:
        return f"{months} mahine"
    return f"{age_days // 365} saal {months % 12} mahine"


# ---------------------------------------------------------------------------
# Seasonal advisories (India mausam cycle)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SeasonalAdvisory:
    title: str
    title_hi: str
    months: str
    body: str
    body_hi: str
    ask: str  # suggested follow-up question (Hindi)


def seasonal_for_month(month: int) -> SeasonalAdvisory:
    if month in (6, 7, 8, 9):
        return SeasonalAdvisory(
            "Monsoon health alert", "मानसून स्वास्थ्य चेतावनी", "June – September",
            "Stagnant water breeds dengue, malaria and chikungunya mosquitoes; eat fresh food and drink boiled/chlorinated water to avoid diarrhoea and typhoid.",
            "जमा पानी में डेंगू-मलेरिया के मच्छर पनपते हैं; ताज़ा भोजन खाएँ और उबला/क्लोरीनयुक्त पानी पिएँ।",
            "बारिश में मच्छरों से बचाव कैसे करें?")
    if month in (10, 11):
        return SeasonalAdvisory(
            "Post-monsoon dengue peak", "डेंगू का प्रकोप", "October – November",
            "Dengue peaks after the rains. Watch for high fever with body ache or rash lasting 2+ days — get a blood test at the nearest PHC.",
            "बारिश के बाद डेंगू चरम पर होता है। 2+ दिन तेज़ बुखार-बदन दर्द पर PHC में जाँच कराएँ।",
            "डेंगू के लक्षण क्या हैं और कब अस्पताल जाएँ?")
    if month in (12, 1, 2):
        return SeasonalAdvisory(
            "Winter care", "सर्दी में देखभाल", "December – February",
            "Cold air worsens asthma and pneumonia in children and elders. Keep newborns warm, continue breastfeeding, and seek care early for fast breathing.",
            "सर्द हवा से बच्चों-बुजुर्गों में निमोनिया/दमा बढ़ता है। नवजात को गर्म रखें, तेज़ साँस पर तुरंत देखभाल लें।",
            "बच्चे को सर्दी-खाँसी है, क्या करूँ?")
    return SeasonalAdvisory(
        "Summer heat alert", "गर्मी-लू चेतावनी", "March – May",
        "Heatstroke and diarrhoea rise in summer. Drink ORS/clean water often, cover your head outdoors 12–3 pm, and keep infants in shade.",
        "गर्मी में लू व दस्त बढ़ते हैं। ORS/साफ पानी पिएँ, दोपहर में सिर ढकें, शिशु को छाँव में रखें।",
        "लू लगने पर तुरंत क्या करना चाहिए?")


# ---------------------------------------------------------------------------
# Common concerns (bilingual quick questions for the frontend grid)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class QuickTopic:
    icon: str
    label: str
    label_hi: str
    question: str


QUICK_TOPICS: list[QuickTopic] = [
    QuickTopic("🤒", "Fever", "बुखार", "मुझे दो दिन से बुखार है, क्या करूँ?"),
    QuickTopic("💧", "Loose motions", "दस्त", "मेरे बच्चे को कल से दस्त हैं, ORS कैसे दूँ?"),
    QuickTopic("🤧", "Cold & cough", "सर्दी-खाँसी", "मुझे सर्दी-खाँसी और गले में दर्द है, क्या करूँ?"),
    QuickTopic("🍬", "Diabetes", "मधुमेह", "मधुमेह में खान-पान का ध्यान कैसे रखें?"),
    QuickTopic("❤️", "Blood pressure", "रक्तचाप", "उच्च रक्तचाप में नमक और दवा का ध्यान कैसे रखें?"),
    QuickTopic("🤰", "Pregnancy diet", "गर्भावस्था", "गर्भावस्था में खान-पान और जाँच कब-कब करानी चाहिए?"),
    QuickTopic("💉", "Vaccination", "टीकाकरण", "नवजात को कौन-कौन से टीके कब लगते हैं?"),
    QuickTopic("🐕", "Dog bite", "कुत्ता काटना", "कुत्ते के काटने पर तुरंत क्या करना चाहिए?"),
]


# ---------------------------------------------------------------------------
# Govt schemes pointer (static, informational)
# ---------------------------------------------------------------------------

SCHEMES: list[dict] = [
    {"name": "Ayushman Bharat PM-JAY", "name_hi": "आयुष्मान भारत",
     "body": "Free hospital treatment up to ₹5 lakh/year for eligible families. Check eligibility: 14555 or mera.pmjay.gov.in",
     "body_hi": "पात्र परिवारों को ₹5 लाख/वर्ष तक मुफ्त इलाज। पात्रता: 14555"},
    {"name": "Janani Suraksha / JSSK", "name_hi": "जननी सुरक्षा",
     "body": "Free delivery, drugs, transport (102 ambulance) and diet for pregnant women in govt facilities.",
     "body_hi": "सरकारी अस्पताल में मुफ्त प्रसव, दवा, 102 एम्बुलेंस व भोजन।"},
    {"name": "Take-home ration & IFA", "name_hi": "पोषण व आयरन",
     "body": "Pregnant women & children get IFA tablets and take-home ration at Anganwadi — ask your ASHA worker.",
     "body_hi": "आँगनबाड़ी से आयरन की गोली व पुष्टाहार — आशा कार्यकर्ता से पूछें।"},
]
