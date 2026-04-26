"""
Google Gemini (Vertex AI) client for the SceneOS agent.

Vertex Gemini is the only LLM SceneOS uses. Returns a `google.genai.Client`
configured for Vertex AI auth via GOOGLE_APPLICATION_CREDENTIALS. No API-key
path — Vertex SA only.

One auth surface, one billing surface (Veo + Imagen + Gemini share GCP
credentials), fewer keys to juggle.
"""
from __future__ import annotations

from typing import Any

from .config import env


def _project_id() -> str | None:
    return env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")


def _location() -> str:
    return env("GOOGLE_CLOUD_LOCATION") or env("GCP_LOCATION") or "us-central1"


def make_genai_client() -> Any | None:
    """Returns a google.genai.Client configured for Vertex AI, or None if creds are absent."""
    project_id = _project_id()
    if not project_id:
        return None
    if not env("GOOGLE_APPLICATION_CREDENTIALS"):
        return None
    try:
        from google import genai
    except ImportError:
        return None
    return genai.Client(vertexai=True, project=project_id, location=_location())


def default_gemini_model_for(kind: str) -> str:
    if kind == "agent":
        return env("GEMINI_AGENT_MODEL", "gemini-2.5-pro") or "gemini-2.5-pro"
    if kind == "decompose":
        return env("GEMINI_DECOMPOSE_MODEL", "gemini-2.5-pro") or "gemini-2.5-pro"
    return env("GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash"
