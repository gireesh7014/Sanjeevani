"""
Sanjeevani end-to-end pipeline.

Orchestrates one consultation turn:

    audio bytes / typed text
      -> ASR (IndicConformer, voice only)
      -> translation to English (IndicTrans2)
      -> Gemma 4 multi-stage reasoning (extract & plan -> WHO-grounded
         clinical reasoning + triage + next_action)
      -> function dispatch (emergency escalation / nearby-hospital lookup)
      -> translation of the answer back into the user's language
      -> conversation memory append

On any failure of the multi-stage reasoning path (unparseable Gemma
JSON, Ollama outage, WHO fetch failure mid-reasoning), it falls back
to the single-call ``OllamaAnswerer`` so the user still gets a
cautious answer — flagged with ``used_fallback=True`` and without
structured triage.

All heavy models lazy-load on first use inside their own wrapper
classes, so constructing ``SanjeevaniPipeline`` is cheap (the backend
does it once at startup).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from model.asr import IndicASR
from model.config import (
    AUTO_DETECT_SHORTLIST,
    LANGUAGE_BY_CODE,
    Settings,
    settings as default_settings,
)
from model.llm import (
    ConversationStore,
    GemmaReasoner,
    OllamaAnswerer,
    ReasoningParseError,
    dispatch_function,
    match_topics,
    retrieve_context,
)
from model.translation import IndicTranslator

logger = logging.getLogger(__name__)

VALID_MODES = {"patient", "asha_worker"}

# Unicode script ranges used to guess the language of *typed* text when
# the caller passes language="auto". Voice auto-detection is handled by
# IndicASR.detect_and_transcribe; this is only for the text path, where
# IndicTrans2 still needs an explicit source language.
_SCRIPT_TO_LANG: list[tuple[str, str]] = [
    ("\u0900-\u097f", "hi"),  # Devanagari (Hindi/Marathi — default to Hindi)
    ("\u0980-\u09ff", "bn"),  # Bengali/Assamese — default to Bengali
    ("\u0b80-\u0bff", "ta"),  # Tamil
    ("\u0c00-\u0c7f", "te"),  # Telugu
    ("\u0a80-\u0aff", "gu"),  # Gujarati
    ("\u0c80-\u0cff", "kn"),  # Kannada
    ("\u0d00-\u0d7f", "ml"),  # Malayalam
    ("\u0a00-\u0a7f", "pa"),  # Gurmukhi (Punjabi)
    ("\u0b00-\u0b7f", "or"),  # Oriya (Odia)
    ("\u0600-\u06ff", "ur"),  # Arabic script (Urdu)
]


def _detect_text_language(text: str) -> str:
    """Best-effort script-based language guess for typed text.

    Returns an ``en`` fallback for Latin-only input.
    """
    for script_range, code in _SCRIPT_TO_LANG:
        if re.search(f"[{script_range}]", text):
            return code
    return "en"


@dataclass
class PipelineResult:
    session_id: str
    transcript: str
    detected_language: str
    detected_language_name: str
    english_text: str
    answer: str
    native_answer: str
    is_grounded: bool
    sources: list[str] = field(default_factory=list)
    triage: str = "unknown"
    confidence: float = 0.0
    possible_conditions: list[str] = field(default_factory=list)
    red_flags: list[str] = field(default_factory=list)
    is_emergency: bool = False
    function_note: str | None = None
    used_fallback: bool = False


class SanjeevaniPipeline:
    """Cheap to construct; heavy models load lazily on first request."""

    def __init__(self, cfg: Settings = default_settings):
        self.cfg = cfg
        self.asr = IndicASR(cfg)
        self.translator = IndicTranslator(cfg)
        self.reasoner = GemmaReasoner(cfg)
        self.fallback_answerer = OllamaAnswerer(cfg)
        self.store = ConversationStore(max_turns=cfg.max_history_turns)

    # -- public API (called by website/backend/main.py) --------------------

    def process_text(
        self,
        text: str,
        language: str = "auto",
        session_id: str | None = None,
        mode: str = "patient",
        lat: float | None = None,
        lng: float | None = None,
    ) -> PipelineResult:
        text = (text or "").strip()
        if not text:
            raise ValueError("Text must not be empty.")
        if len(text) > 2000:
            raise ValueError("Text is too long (max 2000 characters).")
        mode = self._validate_mode(mode)
        session_id = session_id or self.store.new_session_id()

        if language in (None, "", "auto"):
            detected = _detect_text_language(text)
            logger.info("text auto-detect -> %s", detected)
        else:
            detected = self._validate_language(language)

        english = self.translator.translate_to_english(text, detected) if detected != "en" else text.strip()
        logger.info("process_text session=%s lang=%s en_chars=%d", session_id, detected, len(english))
        return self._reason_and_respond(
            session_id=session_id,
            transcript=text,
            detected_language=detected,
            english_text=english,
            mode=mode,
            lat=lat,
            lng=lng,
        )

    def process_audio(
        self,
        audio_bytes: bytes,
        language: str = "auto",
        session_id: str | None = None,
        mode: str = "patient",
        lat: float | None = None,
        lng: float | None = None,
    ) -> PipelineResult:
        if not audio_bytes:
            raise ValueError("Audio data is empty.")
        mode = self._validate_mode(mode)
        session_id = session_id or self.store.new_session_id()

        if language in (None, "", "auto"):
            result = self.asr.detect_and_transcribe(audio_bytes, candidates=list(AUTO_DETECT_SHORTLIST))
            logger.info("audio auto-detect -> %s text=%r", result.language, result.text[:80])
        else:
            lang = self._validate_language(language)
            result = self.asr.transcribe(audio_bytes, lang)

        transcript = result.text.strip()
        if not transcript:
            raise ValueError("Could not transcribe any speech from the audio. Please try again, speaking clearly.")
        detected = result.language

        english = self.translator.translate_to_english(transcript, detected) if detected != "en" else transcript
        logger.info("process_audio session=%s lang=%s en_chars=%d", session_id, detected, len(english))
        return self._reason_and_respond(
            session_id=session_id,
            transcript=transcript,
            detected_language=detected,
            english_text=english,
            mode=mode,
            lat=lat,
            lng=lng,
        )

    def reset_session(self, session_id: str) -> None:
        self.store.reset(session_id)

    # -- internals ---------------------------------------------------------

    @staticmethod
    def _validate_language(language: str) -> str:
        if language not in LANGUAGE_BY_CODE:
            raise ValueError(
                f"Unsupported language '{language}'. Supported: {sorted(LANGUAGE_BY_CODE)} or 'auto'."
            )
        return language

    @staticmethod
    def _validate_mode(mode: str | None) -> str:
        mode = (mode or "patient").strip().lower()
        if mode not in VALID_MODES:
            raise ValueError(f"Unsupported mode '{mode}'. Expected one of {sorted(VALID_MODES)}.")
        return mode

    def _reason_and_respond(
        self,
        *,
        session_id: str,
        transcript: str,
        detected_language: str,
        english_text: str,
        mode: str,
        lat: float | None,
        lng: float | None,
    ) -> PipelineResult:
        lang_info = LANGUAGE_BY_CODE.get(detected_language)
        lang_name = lang_info.name if lang_info else detected_language
        history = self.store.get_history(session_id)

        try:
            extraction = self.reasoner.extract_and_plan(english_text, history=history, mode=mode)
            contexts = match_topics(extraction.possible_topics) if extraction.possible_topics else []
            if not contexts:
                # No Gemma-planned topic matched — try a direct keyword match
                # on the query itself before giving up on grounding.
                direct = retrieve_context(english_text)
                contexts = [direct] if direct.is_grounded else []
            triage = self.reasoner.clinical_reasoning(
                english_text, extraction, contexts, history=history, mode=mode
            )
            if not triage.answer:
                raise ReasoningParseError("Gemma returned an empty answer.")

            sources = sorted({s for c in contexts for s in c.sources})
            is_grounded = any(c.is_grounded and c.context for c in contexts)

            fn_result = dispatch_function(triage.next_action, lat=lat, lng=lng) if triage.next_action else None
            function_note = fn_result.note if fn_result else None
            is_emergency = triage.triage == "emergency" or (
                fn_result is not None and fn_result.action == "emergency_escalation"
            )

            answer_en = triage.answer
            result = PipelineResult(
                session_id=session_id,
                transcript=transcript,
                detected_language=detected_language,
                detected_language_name=lang_name,
                english_text=english_text,
                answer=answer_en,
                native_answer="",  # filled below
                is_grounded=is_grounded,
                sources=sources,
                triage=triage.triage,
                confidence=float(triage.confidence or 0.0),
                possible_conditions=list(triage.possible_conditions or []),
                red_flags=list(triage.red_flags or []),
                is_emergency=is_emergency,
                function_note=function_note,
                used_fallback=False,
            )
            logger.info(
                "reasoned session=%s triage=%s grounded=%s action=%s",
                session_id, triage.triage, is_grounded, triage.next_action,
            )
        except (ReasoningParseError, RuntimeError) as exc:
            logger.warning("Multi-stage reasoning failed (%s); using fallback answerer.", exc)
            kb = retrieve_context(english_text)
            try:
                answer_en = self.fallback_answerer.answer(english_text, kb_result=kb, history=history)
            except RuntimeError as exc2:
                raise RuntimeError(f"Answer generation failed: {exc2}") from exc2
            result = PipelineResult(
                session_id=session_id,
                transcript=transcript,
                detected_language=detected_language,
                detected_language_name=lang_name,
                english_text=english_text,
                answer=answer_en,
                native_answer="",
                is_grounded=kb.is_grounded,
                sources=list(kb.sources),
                triage="unknown",
                confidence=0.0,
                possible_conditions=[],
                red_flags=[],
                is_emergency=False,
                function_note=None,
                used_fallback=True,
            )

        # Translate the English answer back into the user's language.
        try:
            result.native_answer = (
                self.translator.translate_from_english(result.answer, detected_language)
                if detected_language != "en"
                else result.answer
            )
        except Exception as exc:  # noqa: BLE001 — never fail the whole turn on back-translation
            logger.warning("Back-translation to %s failed; returning English answer: %s", detected_language, exc)
            result.native_answer = result.answer

        self.store.append_turn(session_id, english_text, result.answer)
        return result
