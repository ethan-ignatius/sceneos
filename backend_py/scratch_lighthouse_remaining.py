"""Bake the remaining 6 lighthouse beats one cluster at a time.

The 7-way parallel re-bake hit a Cloudinary upload concurrency limit.
This script:
  - Reuses the existing project refs (already uploaded under
    sceneos/lighthouse31/refs/...).
  - Uses the curated lighthouse beat facts from demo_prompts.
  - Runs Veo 3.1 + persist with a semaphore (2 concurrent jobs at most),
    so Cloudinary's data-URI upload step never overloads.
  - Retries each failed beat up to 2 more times.
  - Skips beat-1 if it's already on Cloudinary.
"""
from __future__ import annotations

import asyncio
import os
import time
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

import httpx  # noqa: E402

from sceneos_py import demo_prompts, vertex_veo  # noqa: E402
from sceneos_py.motion_presets import pick_motion_preset  # noqa: E402
from sceneos_py.orchestrator import compose_clip_prompt  # noqa: E402
from sceneos_py.beat_templates import STORY  # noqa: E402


PROJECT_ID = "lighthouse31"
CLOUD = "dghelx0al"
CHAR_REF = f"https://res.cloudinary.com/{CLOUD}/image/upload/sceneos/lighthouse31/refs/shared/character.png"
LOC_REF = f"https://res.cloudinary.com/{CLOUD}/image/upload/sceneos/lighthouse31/refs/shared/location.png"

# Concurrency cap. 2 keeps the data-URI upload from saturating Cloudinary's
# single-request size + connection limits.
MAX_CONCURRENT = 2


async def already_uploaded(public_id: str) -> bool:
    url = f"https://res.cloudinary.com/{CLOUD}/video/upload/{public_id}.mp4"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.head(url)
    return r.status_code == 200


def pick_seed_url(framing: str | None) -> str:
    f = (framing or "").lower()
    prefer_location = any(kw in f for kw in (
        "wide", "establish", "static", "locked off", "locked-off",
        "24mm", "god view", "pull-back", "pull back",
    ))
    return LOC_REF if prefer_location else CHAR_REF


async def bake_one(beat: dict, facts: dict, sem: asyncio.Semaphore) -> dict:
    beat_id = beat["beatId"]
    pid = f"sceneos/{PROJECT_ID}/{beat_id}/{beat_id}-scene-1"

    if await already_uploaded(pid):
        print(f"[{beat_id}] already on Cloudinary → skip", flush=True)
        return {
            "beatId": beat_id,
            "publicId": pid,
            "clipUrl": f"https://res.cloudinary.com/{CLOUD}/video/upload/{pid}.mp4",
            "durationSeconds": beat["archetype"]["suggestedDuration"],
            "template": beat["template"],
            "status": "skip",
        }

    motion = pick_motion_preset(facts.get("mood") or beat["archetype"]["mood"])
    clip_prompt = compose_clip_prompt(beat, facts, motion, "16:9")
    refined = (
        f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"
    )
    if facts.get("voiceLine"):
        refined += f" The narrator says: \"{facts['voiceLine']}\"."

    seed = pick_seed_url(facts.get("framing") or motion.get("composition"))

    for attempt in range(1, 4):
        async with sem:
            print(f"[{beat_id}] submitting (attempt {attempt}/3)...", flush=True)
            res = await vertex_veo.generate({
                "projectId": PROJECT_ID,
                "beatId": beat_id,
                "sceneId": f"{beat_id}-scene-1",
                "refinedPrompt": refined,
                "durationSeconds": clip_prompt["durationSeconds"],
                "clipPrompt": clip_prompt,
                "startImageUrl": seed,
            })
            job_id = res["jobId"]
            print(f"[{beat_id}] jobId={job_id}", flush=True)

            deadline = time.time() + 8 * 60
            while time.time() < deadline:
                await asyncio.sleep(5)
                st = await vertex_veo.status(job_id)
                if st["status"] == "succeeded":
                    print(f"[{beat_id}] OK → {st['clipPublicId']}", flush=True)
                    return {
                        "beatId": beat_id,
                        "publicId": st["clipPublicId"],
                        "clipUrl": st["clipUrl"],
                        "durationSeconds": clip_prompt["durationSeconds"],
                        "template": beat["template"],
                        "status": "ok",
                    }
                if st["status"] == "failed":
                    print(f"[{beat_id}] FAIL (attempt {attempt}): {st.get('error', '')[:300]}", flush=True)
                    break
            else:
                print(f"[{beat_id}] timed out waiting for veo", flush=True)
                break

    return {
        "beatId": beat_id,
        "publicId": pid,
        "clipUrl": None,
        "durationSeconds": clip_prompt["durationSeconds"],
        "template": beat["template"],
        "status": "fail",
    }


async def main() -> None:
    demo = demo_prompts.pick_demo_prompt("lighthouse-ship")
    beats = []
    for i, t in enumerate(STORY):
        beats.append({
            "beatId": f"beat-{i + 1}",
            "beatName": t["beatName"],
            "template": t["template"],
            "archetype": {
                "intent": t["intent"],
                "mood": t["mood"],
                "suggestedDuration": t["suggestedDuration"],
                "directorNotes": t["directorNotes"],
            },
            "scenes": [{"sceneId": f"beat-{i + 1}-scene-1"}],
        })

    sem = asyncio.Semaphore(MAX_CONCURRENT)
    facts_by_template = demo["beatFactsByTemplate"]
    tasks = [bake_one(b, facts_by_template[b["template"]], sem) for b in beats]
    results = await asyncio.gather(*tasks)

    print("\n" + "=" * 78)
    print("RESULTS")
    print("=" * 78)
    for r in results:
        marker = {"ok": "OK", "skip": "SKIP", "fail": "FAIL"}[r["status"]]
        print(f"  [{marker:4s}] {r['beatId']} ({r['template']}) → {r['publicId']}")

    print("\nPaste into cached.py LIGHTHOUSE_SHIP_CLIPS:")
    template_to_key = {t["template"]: t["template"] for t in STORY}
    for r in results:
        if r["status"] == "fail":
            continue
        key = template_to_key[r["template"]]
        dur = r["durationSeconds"]
        print(f'    "{key}": _Clip(\n        "{r["publicId"]}",\n        f"{{_LIGHTHOUSE_CLOUD}}/{r["publicId"]}.mp4",\n        {dur},\n    ),')


if __name__ == "__main__":
    asyncio.run(main())
