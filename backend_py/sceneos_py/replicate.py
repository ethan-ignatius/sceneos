"""
Replicate fallback — multi-model gateway. Stub mirroring backend/src/services/replicate.ts.
"""
from __future__ import annotations

from .provider import GenerateClipParams, StatusResult


async def generate(_params: GenerateClipParams) -> dict:
    raise RuntimeError("replicate.py: generate not implemented")


async def status(_provider_job_id: str) -> StatusResult:
    raise RuntimeError("replicate.py: status not implemented")
