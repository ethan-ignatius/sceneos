"""
End-to-end pipeline smoke test.

Bypasses the questionnaire UI and directly:
  1. Submits 5 specific clip prompts to /api/generate (Veo 3.1).
  2. Polls /api/status/{jobId} for each in parallel until terminal.
  3. Builds an approved manifest with the resulting clipPublicIds.
  4. Calls /api/stitch/url to get the Cloudinary fl_splice concat URL.
  5. Calls /api/cutos/import to verify the editor handoff.
  6. Writes ../frontend/public/seed.html so opening
     http://localhost:5173/seed.html seeds the Zustand stores and forwards
     to /final with this freshly-rendered cinematic playing in the SceneOS UI.

Run: python smoke_pipeline.py
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import datetime, timezone

import httpx


BASE_URL = "http://localhost:8787"


# Five cinematic 5-second beats that share continuity (one astronaut, Mars,
# golden hour). Each beat archetype maps to a specific mood so per-clip color
# grading and the splice URL exercise the full path.
CLIPS = [
    {
        "beatId": "b1-establish",
        "sceneId": "s1",
        "beatName": "Establishing wide",
        "template": "trailer.establishing",
        "mood": "wide-establish",
        "duration": 5,
        "prompt": (
            "Slow aerial drone descent over rust-red Martian dunes at golden hour. "
            "A lone astronaut in a scuffed white suit with a red helmet stripe walks "
            "across the foreground, leaving a thin trail of footprints. Long shadows. "
            "Anamorphic 24mm lens, soft golden-hour key light from camera-left, "
            "drifting volumetric haze. Cinematic 35mm film grain."
        ),
    },
    {
        "beatId": "b2-hook",
        "sceneId": "s2",
        "beatName": "Intimate hook",
        "template": "trailer.hook",
        "mood": "intimate-hook",
        "duration": 5,
        "prompt": (
            "Tight close-up on the same astronaut's gold-tinted visor — twin pale "
            "moons rise reflected in the curved glass. Subtle, almost imperceptible "
            "dolly-in. Warm practical key catches the eyes inside the helmet; dust "
            "motes drift through the beam. 85mm portrait lens, shallow depth of field."
        ),
    },
    {
        "beatId": "b3-rising",
        "sceneId": "s3",
        "beatName": "Kinetic rising",
        "template": "trailer.rising",
        "mood": "kinetic-rising",
        "duration": 5,
        "prompt": (
            "Handheld tracking shot following the astronaut as he breaks into a run "
            "across cracked basalt. A dust devil whips up debris in the middle "
            "distance. 35mm lens, hard high-contrast light, snap whip-pan into the "
            "horizon. Wind-driven debris streaks past camera."
        ),
    },
    {
        "beatId": "b4-climax",
        "sceneId": "s4",
        "beatName": "Tense climax",
        "template": "trailer.climax-tease",
        "mood": "tense-climax",
        "duration": 5,
        "prompt": (
            "Slow push-in to an extreme close-up: the astronaut's eyes widen behind "
            "the visor as a colossal rust-orange dust storm rolls in behind him. "
            "Low-key chiaroscuro, single hard backlight from the storm. Smoke curling "
            "at the helmet edges. 50mm lens, oppressive negative space."
        ),
    },
    {
        "beatId": "b5-sting",
        "sceneId": "s5",
        "beatName": "Punchy sting",
        "template": "trailer.sting",
        "mood": "punchy-sting",
        "duration": 5,
        "prompt": (
            "Hard graphic silhouette: the astronaut stands on a ridge, a single hard "
            "rim light from a setting binary sun, deep blacks dominating the frame. "
            "Snap zoom and a hard cut beat — instant, percussive. Atmosphere abruptly "
            "silent then sudden detail of grit on the suit."
        ),
    },
]


PROJECT_ID = f"smoke-{int(time.time())}"


def log(stage: str, msg: str) -> None:
    print(f"[{stage}] {msg}", flush=True)


async def submit_clip(client: httpx.AsyncClient, clip: dict) -> dict:
    body = {
        "projectId": PROJECT_ID,
        "beatId": clip["beatId"],
        "sceneId": clip["sceneId"],
        "refinedPrompt": clip["prompt"],
        "durationSeconds": clip["duration"],
        "beatTemplate": clip["template"],
    }
    res = await client.post(f"{BASE_URL}/api/generate", json=body)
    res.raise_for_status()
    data = res.json()
    log("submit", f"{clip['beatName']:20s} -> jobId={data['jobId']} provider={data['provider']}")
    return data


async def poll_clip(client: httpx.AsyncClient, clip: dict, sub: dict, max_seconds: int = 600) -> dict:
    job_id = sub["jobId"]
    delay_ms = sub.get("pollAfterMs", 5000)
    start = time.time()
    last_status = None
    while True:
        if time.time() - start > max_seconds:
            return {"status": "failed", "error": f"local timeout after {max_seconds}s"}
        await asyncio.sleep(delay_ms / 1000)
        res = await client.get(f"{BASE_URL}/api/status/{job_id}")
        data = res.json()
        status = data.get("status")
        if status != last_status:
            log("poll", f"{clip['beatName']:20s} -> {status}")
            last_status = status
        if status in {"succeeded", "failed"}:
            return data
        delay_ms = data.get("pollAfterMs", 5000)


def build_manifest(results: list[dict]) -> dict:
    beats = []
    for clip, result in zip(CLIPS, results):
        beats.append(
            {
                "beatId": clip["beatId"],
                "beatName": clip["beatName"],
                "template": clip["template"],
                "status": "approved",
                "archetype": {
                    "intent": clip["beatName"],
                    "mood": clip["mood"],
                    "suggestedDuration": clip["duration"],
                    "directorNotes": "smoke pipeline",
                },
                "scenes": [
                    {
                        "sceneId": clip["sceneId"],
                        "conversation": [],
                        "refinedPrompt": clip["prompt"],
                        "approved": True,
                        "clipUrl": result["clipUrl"],
                        "clipPublicId": result["clipPublicId"],
                        "durationSeconds": clip["duration"],
                    }
                ],
            }
        )
    return {
        "projectId": PROJECT_ID,
        "videoType": "trailer",
        "masterPrompt": "A lone astronaut crosses the rust-red dunes of Mars at golden hour",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "beats": beats,
    }


async def main() -> int:
    log("start", f"projectId={PROJECT_ID}, {len(CLIPS)} clips, base={BASE_URL}")
    log("start", f"each clip: 5s; total expected output: ~25s")

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=600, write=30, pool=30)) as client:
        # Health check first.
        try:
            h = await client.get(f"{BASE_URL}/api/health")
            log("health", h.json())
        except Exception as exc:
            log("health", f"FAILED: {exc}")
            return 1

        # Phase 1: parallel submit.
        log("phase1", "submitting 5 generate calls in parallel")
        t0 = time.time()
        submissions = await asyncio.gather(*[submit_clip(client, c) for c in CLIPS])

        # Phase 2: parallel poll.
        log("phase2", "polling all 5 jobs in parallel (Veo 3.1 typically 1-3 min/clip)")
        results = await asyncio.gather(*[poll_clip(client, c, s) for c, s in zip(CLIPS, submissions)])
        elapsed = time.time() - t0
        log("phase2", f"all jobs settled in {elapsed:.1f}s")

        # Surface every clip's outcome.
        all_ok = True
        for clip, result in zip(CLIPS, results):
            status = result.get("status")
            if status == "succeeded":
                log("result", f"  [OK] {clip['beatName']:20s} -> {result['clipUrl']}")
            else:
                all_ok = False
                log("result", f"  [FAIL] {clip['beatName']:20s} -> status={status} error={result.get('error')}")

        if not all_ok:
            log("abort", "at least one clip failed; cannot stitch")
            return 2

        # Phase 3: stitch.
        manifest = build_manifest(results)
        log("phase3", "POST /api/stitch/url")
        stitch_res = await client.post(
            f"{BASE_URL}/api/stitch/url",
            json={"manifest": manifest, "colorGrade": True},
        )
        if stitch_res.status_code >= 400:
            log("stitch", f"FAILED: {stitch_res.status_code} {stitch_res.text[:400]}")
            return 3
        stitch = stitch_res.json()
        log("stitch", f"durationSeconds = {stitch['durationSeconds']}")
        log("stitch", f"thumbnailUrl    = {stitch['thumbnailUrl']}")
        print()
        print("--- FINAL CONCATENATED VIDEO URL -----------------------------")
        print(stitch["finalUrl"])
        print("--------------------------------------------------------------")
        print()

        # Phase 4: editing handoff.
        log("phase4", "POST /api/cutos/import (editing handoff)")
        try:
            cutos_res = await client.post(
                f"{BASE_URL}/api/cutos/import",
                json={"manifest": manifest},
            )
            log("cutos", f"status={cutos_res.status_code}")
            log("cutos", f"body={cutos_res.text[:400]}")
        except Exception as exc:
            log("cutos", f"network error: {exc}")

        # Per-clip URL cheat-sheet for manual editing.
        print()
        log("clips", "individual clip URLs (drop into your editor of choice):")
        for clip, result in zip(CLIPS, results):
            print(f"  {clip['beatName']:20s} {result['clipUrl']}")

        # Write seed.html so the user can view the result in the SceneOS UI
        # by opening one URL. The page seeds localStorage with the manifest
        # (so /final has the data) and forwards to /final.
        write_seed_html(manifest, stitch)
        print()
        log("seed", "wrote frontend/public/seed.html")
        log("seed", "open this URL to view the cinematic in the SceneOS /final UI:")
        log("seed", "  http://localhost:5173/seed.html")

        return 0


def write_seed_html(manifest: dict, stitch: dict) -> None:
    """
    Bake the freshly-generated manifest into a static HTML page that lives
    in frontend/public/. When the user opens it, it writes the same
    Zustand-persist keys the app uses, then forwards to /final.
    """
    import os
    import pathlib

    enriched = dict(manifest)
    enriched["finalCloudinaryUrl"] = stitch["finalUrl"]
    enriched["thumbnailUrl"] = stitch["thumbnailUrl"]
    enriched["durationSeconds"] = stitch["durationSeconds"]

    beat_graph_state = {
        "state": {"manifest": enriched, "activeBeatId": None},
        "version": 0,
    }
    prompt_state = {
        "state": {"masterPrompt": enriched["masterPrompt"], "videoType": enriched["videoType"]},
        "version": 0,
    }

    html = (
        "<!doctype html>\n"
        "<html><head><meta charset=\"utf-8\"><title>SceneOS — seeded final cut</title></head>\n"
        "<body style=\"background:#0a0908;color:#f0a868;font-family:monospace;display:grid;place-items:center;min-height:100vh;margin:0\">\n"
        "<div style=\"text-align:center\">\n"
        "<div style=\"opacity:0.6;font-size:11px;letter-spacing:0.18em;text-transform:uppercase\">SceneOS - seeded final cut</div>\n"
        "<div style=\"margin-top:8px\">Loading the editor...</div>\n"
        "</div>\n"
        "<script>\n"
        f"localStorage.setItem('sceneos:beat-graph', {json.dumps(json.dumps(beat_graph_state))});\n"
        f"localStorage.setItem('sceneos:prompt',     {json.dumps(json.dumps(prompt_state))});\n"
        "location.replace('/final');\n"
        "</script>\n"
        "</body></html>\n"
    )

    out = pathlib.Path(__file__).resolve().parent.parent / "frontend" / "public" / "seed.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
