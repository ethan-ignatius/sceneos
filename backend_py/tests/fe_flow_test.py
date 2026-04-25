"""
Simulates the full frontend flow against the Python backend in mock mode.
Verifies: landing -> decompose -> agent (multi-turn) -> generate -> status -> stitch.

Run: MOCK_MODE=true uvicorn sceneos_py.app:app --port 8790 (in another shell)
     python tests/fe_flow_test.py
"""
from __future__ import annotations

import io
import json
import sys
import time

import httpx

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

BASE = "http://localhost:8787"


def must_ok(label: str, res: httpx.Response):
    if res.status_code != 200:
        print(f"FAIL {label}: HTTP {res.status_code} {res.text[:300]}")
        sys.exit(1)
    print(f"OK   {label}: {json.dumps(res.json())[:120]}")


def main():
    # 1. Landing: decompose master prompt into beat-shaped clip prompts
    decompose_req = {
        "masterPrompt": "A blind musician learns to see colors through sound on the edges of an unseen world.",
        "videoType": "trailer",
        "beats": [
            {"beatId": "establishing", "template": "trailer.establishing", "beatName": "Establishing",
             "archetype": {"intent": "Place the viewer in the world.", "mood": "wide-establish",
                           "suggestedDuration": 8, "directorNotes": "wide framing"}},
            {"beatId": "hook", "template": "trailer.hook", "beatName": "Hook",
             "archetype": {"intent": "First close-up.", "mood": "intimate-hook",
                           "suggestedDuration": 12, "directorNotes": "soft eye light"}},
        ],
    }
    must_ok("decompose", httpx.post(f"{BASE}/api/decompose", json=decompose_req, timeout=30))

    # 2. Agent loop: drive 2 user turns, expect first question
    manifest = {
        "projectId": "fe-flow-test",
        "videoType": "trailer",
        "masterPrompt": "A blind musician learns to see colors through sound.",
        "createdAt": "2026-04-25T00:00:00Z",
        "beats": [
            {
                "beatId": "hook",
                "beatName": "Hook",
                "template": "trailer.hook",
                "status": "questioning",
                "archetype": {"intent": "First close-up.", "mood": "intimate-hook",
                              "suggestedDuration": 12, "directorNotes": "soft eye light"},
                "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}],
            },
        ],
    }

    # Turn 1
    res = httpx.post(f"{BASE}/api/agent", json={"manifest": manifest, "beatId": "hook"}, timeout=30)
    must_ok("agent turn 1", res)
    body = res.json()
    if body["kind"] != "question":
        print(f"FAIL: expected question, got {body['kind']}"); sys.exit(1)

    # Add user reply, advance manifest
    manifest["beats"][0]["scenes"][0]["conversation"] = [
        {"role": "agent", "content": body["question"], "timestamp": "2026-04-25T00:00:01Z"},
    ]

    # Turn 2 with user message
    res = httpx.post(
        f"{BASE}/api/agent",
        json={"manifest": manifest, "beatId": "hook", "userMessage": "Soft golden light, hands on the keys, eyes closed."},
        timeout=30,
    )
    must_ok("agent turn 2", res)

    # 3. Generate clip for the hook beat
    gen_req = {
        "projectId": "fe-flow-test",
        "beatId": "hook",
        "sceneId": "scene-1",
        "refinedPrompt": "Close-up portrait. Blind musician at piano, soft golden light, hands on keys, eyes closed.",
        "durationSeconds": 5,
        "beatTemplate": "trailer.hook",
    }
    res = httpx.post(f"{BASE}/api/generate", json=gen_req, timeout=30)
    must_ok("generate", res)
    job_id = res.json()["jobId"]

    # 4. Status loop (mock backend resolves on poll 2)
    res = httpx.get(f"{BASE}/api/status/{job_id}", timeout=30)
    must_ok("status poll 1", res)
    if res.json()["status"] != "running":
        print(f"WARN: expected running on poll 1, got {res.json()['status']}")

    res = httpx.get(f"{BASE}/api/status/{job_id}", timeout=30)
    must_ok("status poll 2", res)
    if res.json()["status"] != "succeeded":
        print(f"FAIL: expected succeeded, got {res.json()['status']}"); sys.exit(1)
    clip_public_id = res.json()["clipPublicId"]

    # 5. Stitch the approved clips
    stitch_req = {
        "manifest": {
            "projectId": "fe-flow-test",
            "videoType": "trailer",
            "masterPrompt": "test",
            "createdAt": "2026-04-25T00:00:00Z",
            "beats": [
                {
                    "beatId": "hook",
                    "beatName": "Hook",
                    "template": "trailer.hook",
                    "status": "approved",
                    "archetype": {"intent": "First close-up.", "mood": "intimate-hook", "suggestedDuration": 12},
                    "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": True,
                                "clipPublicId": clip_public_id, "durationSeconds": 5}],
                },
            ],
        },
        "colorGrade": True,
    }
    must_ok("stitch", httpx.post(f"{BASE}/api/stitch/url", json=stitch_req, timeout=30))

    # 6. CutOS handoff (mock branch)
    must_ok("cutos import", httpx.post(f"{BASE}/api/cutos/import", json={"manifest": stitch_req["manifest"]}, timeout=30))

    print("\nALL FE FLOW STEPS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
