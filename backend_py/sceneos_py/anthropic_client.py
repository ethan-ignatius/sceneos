"""
Single source of truth for which Claude backend agent + decomposer use.

Mirrors backend/src/lib/anthropic-client.ts.
- ANTHROPIC_USE_VERTEX=true -> AnthropicVertex (auth via GOOGLE_APPLICATION_CREDENTIALS)
- otherwise -> direct API via ANTHROPIC_API_KEY
- both expose .messages.create(...) so callers don't need to branch.
"""
from __future__ import annotations

from typing import Any

from .config import env


def _is_vertex() -> bool:
    return (env("ANTHROPIC_USE_VERTEX", "") or "").strip().lower() == "true"


def make_claude_client() -> Any | None:
    if _is_vertex():
        project_id = env("GCP_PROJECT_ID")
        if not project_id:
            return None
        try:
            from anthropic import AnthropicVertex
        except ImportError:
            return None
        region = env("ANTHROPIC_VERTEX_REGION", "global") or "global"
        return AnthropicVertex(project_id=project_id, region=region)

    api_key = env("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    from anthropic import Anthropic
    return Anthropic(api_key=api_key)


def default_model_for(kind: str) -> str:
    if kind == "agent":
        return env("ANTHROPIC_AGENT_MODEL", "claude-opus-4-7") or "claude-opus-4-7"
    return env("ANTHROPIC_DECOMPOSE_MODEL", "claude-opus-4-7") or "claude-opus-4-7"
