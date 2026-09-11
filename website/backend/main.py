"""
Sanjeevani website backend.

Serves the static frontend (website/frontend/) and the API that
drives it: speech-or-text in any supported Indian language in, a
Gemma-4-drafted, WHO-grounded-where-possible answer out — as both
text and, on request, spoken audio (Indic Parler-TTS). Conversations
carry a session_id so Gemma 4 has memory of earlier turns.

India-specific deterministic endpoints (no model calls): helplines,
UIP immunization schedule, seasonal advisories, quick topics, schemes.

Run from the repository root:
    uvicorn website.backend.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import sys
from datetime import date
from pathlib import Path

# Make the repo root importable so `import model...` (the sibling
# top-level package) works regardless of the working directory this
# is launched from.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from model.config import SUPPORTED_LANGUAGES  # noqa: E402
from model import india_data  # noqa: E402
from model.logging_config import setup_logging  # noqa: E402
from model.pipeline import PipelineResult, SanjeevaniPipeline  # noqa: E402

from .schemas import (  # noqa: E402
    AskResponse,
    Facility,
    Helpline,
    ImmunizationDose,
    ImmunizationResponse,
    LanguageOption,
    QuickTopic,
    SchemeInfo,
    SeasonalResponse,
    SpeakRequest,
    TextAskRequest,
)

setup_logging(log_dir=REPO_ROOT / "logs", level="INFO")
logger = logging.getLogger(__name__)

FRONTEND_DIR = REPO_ROOT / "website" / "frontend"

app = FastAPI(title="Sanjeevani", description="Speak or type. Understand your health.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your real deployment origin(s) in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Logs every request that hits the API — method, path, status code,
    and duration — so logs/sanjeevani.log has a full audit trail of
    every action performed, not just the ones with custom logging
    inside a route. Unhandled exceptions are logged with a traceback
    before being re-raised so FastAPI's own error handling still runs."""
    import time

    start = time.time()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.time() - start) * 1000
        logger.exception(
            "UNHANDLED ERROR  %s %s  (%.0fms)", request.method, request.url.path, duration_ms
        )
        raise

    duration_ms = (time.time() - start) * 1000
    log_fn = logger.warning if response.status_code >= 400 else logger.info
    log_fn(
        "%s %s -> %d  (%.0fms)",
        request.method, request.url.path, response.status_code, duration_ms,
    )
    return response


_state: dict = {"pipeline": None}

MAX_AUDIO_BYTES = 15 * 1024 * 1024  # ~15MB, generous for a short voice note
ALLOWED_AUDIO_EXTENSIONS = {"wav", "mp3", "flac", "ogg", "webm", "m4a"}


@app.on_event("startup")
def startup_event() -> None:
    # Models are lazy-loaded on first request inside SanjeevaniPipeline's
    # own components, so this is cheap — it does not pull any weights.
    _state["pipeline"] = SanjeevaniPipeline()
    logger.info("Sanjeevani pipeline initialized (models load lazily on first request).")


def _get_pipeline() -> SanjeevaniPipeline:
    pipeline = _state.get("pipeline")
    if pipeline is None:
        logger.warning("Request received before pipeline finished initializing.")
        raise HTTPException(status_code=503, detail="Service is starting up; try again shortly.")
    return pipeline


def _to_response(result: PipelineResult) -> AskResponse:
    return AskResponse(
        session_id=result.session_id,
        transcript=result.transcript,
        detected_language=result.detected_language,
        detected_language_name=result.detected_language_name,
        english_text=result.english_text,
        answer=result.answer,
        native_answer=result.native_answer,
        is_grounded=result.is_grounded,
        sources=result.sources,
        triage=result.triage,
        confidence=result.confidence,
        possible_conditions=result.possible_conditions,
        red_flags=result.red_flags,
        is_emergency=result.is_emergency,
        function_note=result.function_note,
        used_fallback=result.used_fallback,
        facilities=[Facility(**f) for f in (result.facilities or [])],
    )


def _parse_optional_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes", "y", "ha", "haan")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/languages", response_model=list[LanguageOption])
def languages() -> list[LanguageOption]:
    return [
        LanguageOption(code=lang.code, name=lang.name, native_name=lang.native_name)
        for lang in SUPPORTED_LANGUAGES
    ]


@app.post("/api/ask/text", response_model=AskResponse)
def ask_text(payload: TextAskRequest) -> AskResponse:
    pipeline = _get_pipeline()
    logger.info(
        "ask/text  session=%s language=%s chars=%d",
        payload.session_id or "new", payload.language, len(payload.text),
    )
    try:
        result = pipeline.process_text(payload.text, language=payload.language, session_id=payload.session_id, mode=payload.mode, lat=payload.lat, lng=payload.lng, age_group=payload.age_group, pregnant=payload.pregnant, duration=payload.duration, fever=payload.fever)
    except ValueError as exc:
        logger.warning("ask/text rejected: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("ask/text failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    logger.info(
        "ask/text  session=%s -> triage=%s emergency=%s fallback=%s",
        result.session_id, result.triage, result.is_emergency, result.used_fallback,
    )
    return _to_response(result)


@app.post("/api/ask/audio", response_model=AskResponse)
async def ask_audio(
    audio: UploadFile = File(...),
    language: str = Form(default="auto"),
    session_id: str | None = Form(default=None),
    mode: str = Form(default="patient"),
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    age_group: str | None = Form(default=None),
    pregnant: str | None = Form(default=None),
    duration: str | None = Form(default=None),
    fever: str | None = Form(default=None),
) -> AskResponse:
    pipeline = _get_pipeline()

    ext = (audio.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        logger.warning("ask/audio rejected: unsupported format '%s'", ext)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Supported: {sorted(ALLOWED_AUDIO_EXTENSIONS)}",
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        logger.warning("ask/audio rejected: file too large (%d bytes)", len(audio_bytes))
        raise HTTPException(status_code=400, detail="Audio file too large.")

    logger.info(
        "ask/audio  session=%s language=%s bytes=%d format=%s",
        session_id or "new", language, len(audio_bytes), ext,
    )
    try:
        result = pipeline.process_audio(audio_bytes, language=language, session_id=session_id, mode=mode, lat=lat, lng=lng, age_group=age_group or None, pregnant=_parse_optional_bool(pregnant), duration=duration or None, fever=fever or None)
    except ValueError as exc:
        logger.warning("ask/audio rejected: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("ask/audio failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    logger.info(
        "ask/audio  session=%s -> language=%s triage=%s emergency=%s fallback=%s",
        result.session_id, result.detected_language, result.triage, result.is_emergency, result.used_fallback,
    )
    return _to_response(result)



@app.post("/api/conversation/{session_id}/reset")
def reset_conversation(session_id: str) -> dict:
    pipeline = _get_pipeline()
    pipeline.reset_session(session_id)
    logger.info("conversation reset  session=%s", session_id)
    return {"status": "ok"}


@app.post("/api/speak")
def speak(payload: SpeakRequest) -> Response:
    """Speaks answer text aloud with Indic Parler-TTS; returns WAV bytes.

    The TTS model lazy-loads on first call (slow once, fast after). The
    frontend falls back to browser speech synthesis if this fails.
    """
    pipeline = _get_pipeline()
    logger.info("speak  chars=%d", len(payload.text))
    try:
        from model.tts.indic_tts import DEFAULT_VOICE_DESCRIPTION

        wav, _ = pipeline.synthesize_speech(payload.text)
        _ = payload.description or DEFAULT_VOICE_DESCRIPTION
    except ValueError as exc:
        logger.warning("speak rejected: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("speak failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(content=wav, media_type="audio/wav")


@app.get("/api/helplines", response_model=list[Helpline])
def helplines() -> list[Helpline]:
    return [Helpline(**h.__dict__) for h in india_data.HELPLINES]


@app.get("/api/immunization", response_model=ImmunizationResponse)
def immunization(birthdate: str = Query(..., description="Child's birthdate as YYYY-MM-DD")) -> ImmunizationResponse:
    try:
        year, month, day = (int(p) for p in birthdate.split("-"))
        born = date(year, month, day)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail="birthdate must be YYYY-MM-DD.") from exc
    try:
        status = india_data.immunization_status(born)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ImmunizationResponse(
        birthdate=status["birthdate"],
        age_days=status["age_days"],
        age_label=status["age_label"],
        counts=status["counts"],
        doses=[ImmunizationDose(**d.__dict__) for d in status["doses"]],
    )


@app.get("/api/seasonal", response_model=SeasonalResponse)
def seasonal(month: int | None = Query(default=None, ge=1, le=12)) -> SeasonalResponse:
    month = month or date.today().month
    adv = india_data.seasonal_for_month(month)
    return SeasonalResponse(month=month, title=adv.title, title_hi=adv.title_hi,
                            months=adv.months, body=adv.body, body_hi=adv.body_hi, ask=adv.ask)


@app.get("/api/topics", response_model=list[QuickTopic])
def quick_topics() -> list[QuickTopic]:
    return [QuickTopic(**t.__dict__) for t in india_data.QUICK_TOPICS]


@app.get("/api/schemes", response_model=list[SchemeInfo])
def schemes() -> list[SchemeInfo]:
    return [SchemeInfo(**s) for s in india_data.SCHEMES]


# -- Static frontend --------------------------------------------------------
# Mounted last so it doesn't shadow the /api/* routes above.
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")


@app.get("/manifest.json")
def manifest() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "sw.js"), media_type="application/javascript")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))
