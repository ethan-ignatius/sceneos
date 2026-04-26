"""Single-beat Veo 3.1 + Cloudinary upload diagnostic.

The 7-beat re-bake all 7 beats failed with `persist error:` (empty
exc message). This isolates the failure: one beat, full traceback.
"""
from __future__ import annotations

import asyncio
import os
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
gac = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if gac and not os.path.isabs(gac):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str((BACKEND_DIR / gac).resolve())

from sceneos_py import vertex_veo  # noqa: E402


async def main() -> None:
    res = await vertex_veo.generate({
        "projectId": "lighthouse31",
        "beatId": "beat-1",
        "sceneId": "beat-1-scene-1",
        "refinedPrompt": (
            "Cinematic still of an aged Pacific-Northwest lighthouse keeper standing "
            "at a rain-streaked window, breath fogging the glass. 50mm tight close-up, "
            "lantern room of a lighthouse during a storm. Mood: intimate-hook. "
            "35mm film grain, shallow depth of field. Slow micro push-in."
        ),
        "durationSeconds": 6,
        "clipPrompt": {
            "imagePrompt": "lighthouse keeper at rain window",
            "motionPrompt": "slow micro push-in",
            "voiceLine": "There are two kinds of light at sea. The kind that warns. And the kind that calls.",
            "captionLine": "Cape Disappointment Light. November 1957.",
            "aspectRatio": "16:9",
            "resolution": "1080p",
            "durationSeconds": 6,
        },
        # Use the existing character ref Imagen produced 5 minutes ago.
        "startImageUrl": "https://res.cloudinary.com/dghelx0al/image/upload/v1777168359/sceneos/lighthouse31/refs/shared/character.png",
    })
    job_id = res["jobId"]
    print(f"submitted jobId={job_id}", flush=True)

    while True:
        await asyncio.sleep(5)
        st = await vertex_veo.status(job_id)
        print(f"status={st['status']}", flush=True)
        if st["status"] == "succeeded":
            print(f"clipUrl: {st['clipUrl']}")
            print(f"clipPublicId: {st['clipPublicId']}")
            return
        if st["status"] == "failed":
            print(f"\nFAILURE DETAIL:\n{st.get('error')}")
            return


if __name__ == "__main__":
    asyncio.run(main())
