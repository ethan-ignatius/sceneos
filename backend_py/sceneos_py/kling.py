"""
Kling AI provider — live-demo tier. Stub mirroring backend/src/services/kling.ts.

TODO(vishnu): JWT sign with KLING_ACCESS_KEY/SECRET, POST text2video.
"""
from __future__ import annotations

from .provider import GenerateClipParams, StatusResult


async def generate(_params: GenerateClipParams) -> dict:
    raise RuntimeError("kling.py: generate not implemented")


async def status(_provider_job_id: str) -> StatusResult:
    raise RuntimeError("kling.py: status not implemented")
