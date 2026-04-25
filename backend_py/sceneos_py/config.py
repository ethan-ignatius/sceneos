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


def mock_mode() -> bool:
    explicit = os.getenv("MOCK_MODE")
    if explicit is not None:
        return explicit.lower() in {"1", "true", "yes", "on"}
    required = [
        "ANTHROPIC_API_KEY",
        "HIGGSFIELD_API_KEY",
        "HIGGSFIELD_API_SECRET",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ]
    return any(not os.getenv(name) for name in required)
