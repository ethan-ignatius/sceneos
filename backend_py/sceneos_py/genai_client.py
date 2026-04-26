"""
Google Gemini (Vertex AI) client for the SceneOS agent.

Two auth paths supported, in priority order:

  1. Vertex AI Express API key — set GOOGLE_GENAI_API_KEY (or GOOGLE_API_KEY).
     The new google-genai SDK accepts `Client(vertexai=True, api_key=...)`
     for Vertex Express mode; covers Gemini agent/decompose/editor +
     Imagen reference image generation. Does NOT cover Veo or Lyria
     (those use a separate vertex_veo.py / vertex_lyria.py module that
     still requires a service account for OAuth bearer tokens).

  2. Service account credentials — GOOGLE_APPLICATION_CREDENTIALS pointing
     at a JSON file + GOOGLE_PROJECT_ID. Full Vertex AI surface, including
     Veo and Lyria (since those modules read GOOGLE_APPLICATION_CREDENTIALS
     directly to mint OAuth tokens).

For the LA-Hacks demo, EITHER path keeps Gemini working. For Veo + Lyria,
you still need a service account file. Recommendation: keep both — API
key for fast Gemini-only iteration, SA file for full pipeline.

Returns None if neither path is configured (caller falls back to
mock_mode or raises a clear "Vertex unavailable" error).
"""
from __future__ import annotations

from typing import Any

from .config import env


def _project_id() -> str | None:
    return env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")


def _location() -> str:
    return env("GOOGLE_CLOUD_LOCATION") or env("GCP_LOCATION") or "us-central1"


def _api_key() -> str | None:
    """Vertex Express API key. Accepts a few env-var spellings so a
    standard `GOOGLE_API_KEY` from gcloud / Vertex Studio works without
    renaming."""
    return (
        env("GOOGLE_GENAI_API_KEY")
        or env("VERTEX_API_KEY")
        or env("GOOGLE_API_KEY")
    )


def make_genai_client() -> Any | None:
    """Returns a google.genai.Client, or None if no auth is configured.

    Tries API-key (Vertex Express) first, then service-account auth.
    The SDK falls back to its own ADC discovery if both project_id and
    creds path are present but malformed — callers see that as a
    runtime error rather than None.
    """
    try:
        from google import genai
    except ImportError:
        return None

    # Path 1 — Vertex Express API key. Project + location can usually be
    # omitted for the global publisher endpoints; if they're set we still
    # forward them so per-region quota applies.
    api_key = _api_key()
    if api_key:
        kwargs: dict[str, Any] = {"vertexai": True, "api_key": api_key}
        project = _project_id()
        if project:
            kwargs["project"] = project
            kwargs["location"] = _location()
        return genai.Client(**kwargs)

    # Path 2 — service-account credentials. Both the project id and the
    # GOOGLE_APPLICATION_CREDENTIALS path are required; without either,
    # we return None instead of letting the SDK throw at first call.
    project_id = _project_id()
    if not project_id:
        return None
    if not env("GOOGLE_APPLICATION_CREDENTIALS"):
        return None
    return genai.Client(vertexai=True, project=project_id, location=_location())


def default_gemini_model_for(kind: str) -> str:
    if kind == "agent":
        return env("GEMINI_AGENT_MODEL", "gemini-2.5-pro") or "gemini-2.5-pro"
    if kind == "decompose":
        return env("GEMINI_DECOMPOSE_MODEL", "gemini-2.5-pro") or "gemini-2.5-pro"
    return env("GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash"
