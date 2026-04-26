"""Re-bake the lighthouse demo with Veo 3.1.

Reuses the existing speculative-kickoff flow:
  1. Generate ONE character ref + ONE location ref (Imagen 3) — shared.
  2. Fan out 7 Veo 3.1 generate calls in parallel, each seeded with the
     project ref for its framing (wide → location, close → character).
  3. Poll each scene's provider job until terminal.
  4. Print the resulting publicIds + clipUrls so cached.py can be
     updated to the fresh bake.

Run from backend_py/:
    python3 scratch_lighthouse_rebake.py
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
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

# IMPORTANT: import sceneos_py only AFTER env is wired.
from sceneos_py import demo_prompts, session  # noqa: E402
from sceneos_py.provider import decode_job_id, get_named_provider  # noqa: E402


# Use a stable project_id so the resulting Cloudinary publicIds are
# predictable: sceneos/<project_id>/beat-N/beat-N-scene-1
PROJECT_ID = "lighthouse31"


async def poll_until_done(provider_name: str, provider_job_id: str, label: str) -> dict:
    provider = get_named_provider(provider_name)
    deadline = time.time() + 15 * 60  # 15-minute hard cap per beat
    last = "submitted"
    while time.time() < deadline:
        st = await provider.status(provider_job_id)
        status = st.get("status")
        if status != last:
            print(f"  [{label}] {status}", flush=True)
            last = status
        if status == "succeeded":
            return st
        if status == "failed":
            print(f"  [{label}] FAILED: {st.get('error')}", flush=True)
            return st
        await asyncio.sleep(5)
    return {"status": "failed", "error": "rebake polling deadline"}


async def main() -> None:
    demo = demo_prompts.pick_demo_prompt("lighthouse-ship")
    manifest = session.build_manifest(
        project_id=PROJECT_ID,
        master_prompt=demo["masterPrompt"],
        video_type=demo["videoType"],
        mode="demo",
    )

    print(f"Lighthouse re-bake — project {PROJECT_ID} (Veo 3.1)")
    print(f"  master prompt: {demo['masterPrompt']}")
    print(f"  beats: {len(manifest['beats'])}")

    print("Step 1: kickoff (Imagen project refs + 7 Veo 3.1 submissions)...", flush=True)
    started = time.time()
    speculative, project_refs = await session.kickoff_speculative_pipelines(
        manifest=manifest,
        demo_prompt=demo,
        aspect_ratio="16:9",
    )
    elapsed = time.time() - started
    print(f"  refs ready + 7 jobs submitted in {elapsed:.1f}s", flush=True)
    if project_refs:
        char = (project_refs.get("character") or {}).get("imageUrl")
        loc = (project_refs.get("location") or {}).get("imageUrl")
        print(f"  character ref: {char}")
        print(f"  location ref:  {loc}")

    print("\nStep 2: poll each beat to completion...", flush=True)
    poll_tasks = []
    labels: dict[str, str] = {}
    for beat in manifest["beats"]:
        beat_id = beat["beatId"]
        job = speculative.get(beat_id) or {}
        if "error" in job and not job.get("jobId"):
            print(f"  [{beat_id}] kickoff error: {job['error']}", flush=True)
            continue
        provider_name, provider_job_id = decode_job_id(job["jobId"])
        labels[beat_id] = beat_id
        poll_tasks.append(poll_until_done(provider_name, provider_job_id, beat_id))

    statuses = await asyncio.gather(*poll_tasks)

    print("\nStep 3: results", flush=True)
    print("=" * 78)
    rows = []
    for beat, st in zip(manifest["beats"], statuses):
        beat_id = beat["beatId"]
        if st.get("status") == "succeeded":
            rows.append({
                "beatId": beat_id,
                "template": beat["template"],
                "publicId": st["clipPublicId"],
                "clipUrl": st["clipUrl"],
            })
            print(f"  {beat_id} ({beat['template']}) → {st['clipPublicId']}")
            print(f"    {st['clipUrl']}")
        else:
            print(f"  {beat_id} FAILED: {st.get('error')}")

    print("=" * 78)
    print(f"\nProject ID for cached.py:  {PROJECT_ID}")
    print(f"Cloudinary cloud:  dghelx0al")
    print("\nPaste these into cached.py LIGHTHOUSE_SHIP_CLIPS:")
    template_to_key = {
        "story.hook": "story.hook",
        "story.exposition": "story.exposition",
        "story.inciting": "story.inciting",
        "story.rising": "story.rising",
        "story.climax": "story.climax",
        "story.falling": "story.falling",
        "story.resolution": "story.resolution",
    }
    for r in rows:
        key = template_to_key.get(r["template"], r["template"])
        dur = next(
            (b["archetype"]["suggestedDuration"] for b in manifest["beats"] if b["beatId"] == r["beatId"]),
            6,
        )
        print(f'    "{key}": _Clip("{r["publicId"]}", f"{{_LIGHTHOUSE_CLOUD}}/{r["publicId"]}.mp4", {dur}),')


if __name__ == "__main__":
    asyncio.run(main())
