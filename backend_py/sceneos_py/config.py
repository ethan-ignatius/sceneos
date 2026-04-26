from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
# Mock-mode dev: when MOCK_MODE=true is set, load .env.mock and SKIP .env.
# This mirrors TS's `npm run dev:mock` (which uses --env-file=.env.mock).
# Real mode: load .env normally.
if os.getenv("MOCK_MODE", "").lower() in {"1", "true", "yes", "on"}:
    load_dotenv(ROOT / ".env.mock")
else:
    load_dotenv(ROOT / ".env")


def env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def _has_cloudinary_creds() -> bool:
    """True if either explicit triple or CLOUDINARY_URL is present."""
    explicit = all(
        os.getenv(name)
        for name in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")
    )
    return explicit or bool(os.getenv("CLOUDINARY_URL"))


def _has_vertex_creds() -> bool:
    """True if GCP project id + service account credentials are configured."""
    project_id = os.getenv("GOOGLE_PROJECT_ID") or os.getenv("GCP_PROJECT_ID")
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(project_id and creds)


def _has_higgsfield_creds() -> bool:
    """The public Higgsfield API uses a single bearer key. The legacy
    platform.higgsfield.ai endpoint required a key+secret pair; we no
    longer call that surface, so the secret is optional."""
    return bool(os.getenv("HIGGSFIELD_API_KEY"))


def _has_mongo_creds() -> bool:
    """True if a MongoDB connection string is configured."""
    return bool(os.getenv("MONGODB_URI"))


def mock_mode() -> bool:
    """
    Determine whether the backend should run in MOCK_MODE.

    Resolution order:
      1. Explicit MOCK_MODE env override always wins. Set MOCK_MODE=false
         in production to force real backend even on partial creds.
      2. Real mode requires Cloudinary creds AND Vertex creds (the only
         LLM/video stack — Vertex Gemini for the agent + decompose +
         editor, Vertex Veo for video). Higgsfield is an optional
         alternate video lane.
      3. Anything missing → MOCK_MODE on, so the dev never sees a silent
         NoneType crash deep in a provider call.
    """
    explicit = os.getenv("MOCK_MODE")
    if explicit is not None:
        return explicit.lower() in {"1", "true", "yes", "on"}

    if not _has_cloudinary_creds():
        return True

    has_agent = _has_vertex_creds()
    has_video = _has_vertex_creds() or _has_higgsfield_creds()
    return not (has_agent and has_video)
