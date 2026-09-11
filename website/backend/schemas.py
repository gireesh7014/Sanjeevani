"""Request/response schemas for the Sanjeevani website API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TextAskRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: Optional[str] = Field(
        default="auto", description="Language code, e.g. 'hi', or 'auto' to detect"
    )
    session_id: Optional[str] = Field(
        default=None, description="Omit on the first message; reuse the returned id to continue the conversation"
    )
    mode: Optional[str] = Field(
        default="patient", description="Persona mode: 'patient' or 'asha_worker'"
    )
    lat: Optional[float] = None
    lng: Optional[float] = None
    # -- optional intake details (improve triage; never required) --
    age_group: Optional[str] = Field(
        default=None, description="One of: infant, child, adult, elderly"
    )
    pregnant: Optional[bool] = Field(
        default=None, description="Whether the patient is pregnant"
    )
    duration: Optional[str] = Field(
        default=None, max_length=80, description="How long symptoms have lasted, in the user's own words"
    )
    fever: Optional[str] = Field(
        default=None, max_length=40, description="Temperature/reading if fever, e.g. '101F'"
    )


class Facility(BaseModel):
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    maps_url: Optional[str] = None
    kind: str = "hospital"


class AskResponse(BaseModel):
    session_id: str
    transcript: str
    detected_language: str
    detected_language_name: str
    english_text: str
    answer: str
    native_answer: str
    is_grounded: bool
    sources: list[str]

    # -- Gemma reasoning/triage detail --
    triage: str
    confidence: float
    possible_conditions: list[str]
    red_flags: list[str]
    is_emergency: bool
    function_note: Optional[str] = None
    used_fallback: bool

    # -- nearby health facilities (when Gemma triggers hospital lookup) --
    facilities: list[Facility] = Field(default_factory=list)


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=600,
                      description="Answer text in the user's language to speak aloud")
    description: Optional[str] = Field(
        default=None, max_length=200,
        description="Optional English voice-style prompt for Parler-TTS",
    )


class Helpline(BaseModel):
    name: str
    name_hi: str
    number: str
    tel: str
    desc: str
    desc_hi: str
    hours: str = "24×7"


class ImmunizationDose(BaseModel):
    key: str
    name: str
    name_hi: str
    due_label: str
    due_date: str
    status: str  # upcoming | due_today | overdue
    note: str = ""


class ImmunizationResponse(BaseModel):
    birthdate: str
    age_days: int
    age_label: str
    counts: dict[str, int]
    doses: list[ImmunizationDose]


class SeasonalResponse(BaseModel):
    month: int
    title: str
    title_hi: str
    months: str
    body: str
    body_hi: str
    ask: str


class QuickTopic(BaseModel):
    icon: str
    label: str
    label_hi: str
    question: str


class SchemeInfo(BaseModel):
    name: str
    name_hi: str
    body: str
    body_hi: str


class LanguageOption(BaseModel):
    code: str
    name: str
    native_name: str


class ErrorResponse(BaseModel):
    detail: str
