"""Logging setup for Sanjeevani.

Configures the root logger with a console handler and a rotating-ish
file handler under ``logs/sanjeevani.log``. Idempotent: calling it
twice (e.g. under uvicorn's reloader) does not attach duplicate handlers.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path


def setup_logging(log_dir: Path | str = "logs", level: str | int = "INFO") -> logging.Logger:
    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    if isinstance(level, str):
        level = getattr(logging, level.upper(), logging.INFO)
    root.setLevel(level)

    formatter = logging.Formatter(
        "%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler (stderr) — add once.
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        console = logging.StreamHandler(sys.stderr)
        console.setFormatter(formatter)
        root.addHandler(console)

    # File handler — add once per log file path.
    log_file = log_dir / "sanjeevani.log"
    if not any(
        isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", "") == str(log_file)
        for h in root.handlers
    ):
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    # uvicorn's own loggers propagate to root by default; keep them at the
    # same level so requests and model-load messages land in the same file.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level)

    return logging.getLogger("sanjeevani")
