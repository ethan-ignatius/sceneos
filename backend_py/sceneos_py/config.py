from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "backend" / ".env")


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
