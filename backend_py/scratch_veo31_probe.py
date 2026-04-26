"""One-shot probe: does veo-3.1-generate-001 answer on our project?

Submits a 4-second test clip, polls until done, prints the resulting
Cloudinary URL. Throws away the clip — this is just a model-availability
check before we kick off the full 7-beat re-bake.
"""
from __future__ import annotations

import asyncio
import os

# Wire env from .env file before importing sceneos_py.
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
env_file = BACKEND_DIR / ".env"
if env_file.is_file():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"'))

os.environ.setdefault("GENERATION_PROVIDER", "vertex")
# Resolve relative GOOGLE_APPLICATION_CREDENTIALS against backend dir.
gac = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if gac and not os.path.isabs(gac):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str((BACKEND_DIR / gac).resolve())

from sceneos_py import vertex_veo  # noqa: E402


async def main() -> None:
    print(f"Model in use: {vertex_veo._read_config()['modelId']}")
    print(f"Project: {vertex_veo._read_config()['projectId']}")
    print(f"Location: {vertex_veo._read_config()['location']}")

    res = await vertex_veo.generate({
        "projectId": "veo31-probe",
        "beatId": "probe",
        "sceneId": "probe-1",
        "refinedPrompt": (
            "Cinematic close-up of a single white candle flame on a wooden table, "
            "deep blacks behind, slow gentle drift of smoke. 50mm prime, shallow "
            "depth of field, warm key light, 35mm grain."
        ),
        "durationSeconds": 4,
        "clipPrompt": {
            "imagePrompt": "candle flame",
            "motionPrompt": "slow gentle drift",
            "voiceLine": "",
            "captionLine": "",
            "aspectRatio": "16:9",
            "resolution": "1080p",
            "durationSeconds": 4,
        },
    })

    job_id = res["jobId"]
    print(f"submitted jobId={job_id}")

    for i in range(60):
        await asyncio.sleep(5)
        st = await vertex_veo.status(job_id)
        print(f"[{(i + 1) * 5:>3}s] status={st['status']}", flush=True)
        if st["status"] == "succeeded":
            print(f"clipUrl: {st['clipUrl']}")
            print(f"clipPublicId: {st['clipPublicId']}")
            return
        if st["status"] == "failed":
            print(f"ERROR: {st.get('error')}")
            return

    print("timed out waiting for veo")


if __name__ == "__main__":
    asyncio.run(main())
