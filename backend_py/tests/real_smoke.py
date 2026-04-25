"""
Real-mode smoke. Verifies the Python backend can talk to live providers
exactly as TS does. Cheaper checks only — no Veo/Higgsfield video gen
(those burn credits + take minutes).
"""
from __future__ import annotations

import io
import json
import sys

import httpx

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

TS = "http://localhost:8787"
PY = "http://localhost:8790"


def call(base: str, method: str, path: str, body=None):
    try:
        if method == "GET":
            r = httpx.get(base + path, timeout=120)
        else:
            r = httpx.post(base + path, json=body, timeout=120)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {"_text": r.text}
    except Exception as exc:
        return 0, {"_error": str(exc)}


def section(name: str, ts, py):
    ts_code, ts_body = ts
    py_code, py_body = py
    print(f"\n{name}")
    print(f"  TS  {ts_code} {json.dumps(ts_body)[:300]}")
    print(f"  PY  {py_code} {json.dumps(py_body)[:300]}")
    if ts_code != py_code:
        print(f"  [STATUS DIFF] ts={ts_code} py={py_code}")
    if isinstance(ts_body, dict) and isinstance(py_body, dict):
        ts_keys = set(ts_body.keys())
        py_keys = set(py_body.keys())
        if ts_keys != py_keys:
            print(f"  [KEY DIFF] only_ts={sorted(ts_keys-py_keys)} only_py={sorted(py_keys-ts_keys)}")


def main() -> int:
    # 1. Health
    section("/api/health", call(TS, "GET", "/api/health"), call(PY, "GET", "/api/health"))

    # 2. Cloudinary sign
    section(
        "/api/cloudinary/sign",
        call(TS, "POST", "/api/cloudinary/sign", {"folder": "sceneos/user-media"}),
        call(PY, "POST", "/api/cloudinary/sign", {"folder": "sceneos/user-media"}),
    )

    # 3. Stitch URL — pure CPU function
    stitch_req = {
        "manifest": {
            "projectId": "smoke",
            "videoType": "trailer",
            "masterPrompt": "test",
            "createdAt": "2026-04-25T00:00:00Z",
            "beats": [
                {
                    "beatId": "establishing",
                    "beatName": "Establishing",
                    "template": "trailer.establishing",
                    "status": "approved",
                    "archetype": {"intent": "open", "mood": "wide-establish", "suggestedDuration": 8},
                    "scenes": [
                        {"sceneId": "s1", "conversation": [], "approved": True,
                         "clipPublicId": "samples/sea-turtle", "durationSeconds": 8}
                    ],
                },
            ],
        },
        "colorGrade": True,
    }
    section(
        "/api/stitch/url",
        call(TS, "POST", "/api/stitch/url", stitch_req),
        call(PY, "POST", "/api/stitch/url", stitch_req),
    )

    # 4. Agent — will hit Anthropic via Vertex on both sides
    agent_req = {
        "manifest": {
            "projectId": "smoke-agent",
            "videoType": "trailer",
            "masterPrompt": "A solitary lighthouse keeper hears a voice from the sea.",
            "createdAt": "2026-04-25T00:00:00Z",
            "beats": [
                {
                    "beatId": "hook",
                    "beatName": "Hook",
                    "template": "trailer.hook",
                    "status": "questioning",
                    "archetype": {
                        "intent": "First close-up of the protagonist.",
                        "mood": "intimate-hook",
                        "suggestedDuration": 12,
                        "directorNotes": "Soft key on the eyes; let the rest fall away.",
                    },
                    "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}],
                },
            ],
        },
        "beatId": "hook",
        "userMessage": "She's middle-aged, hands rough from rope work, eyes pale grey.",
    }
    section("/api/agent", call(TS, "POST", "/api/agent", agent_req), call(PY, "POST", "/api/agent", agent_req))

    # 5. Decompose — also hits Anthropic via Vertex
    decompose_req = {
        "masterPrompt": "A blind musician learns to see colors through sound.",
        "videoType": "trailer",
        "beats": [
            {
                "beatId": "hook",
                "template": "trailer.hook",
                "beatName": "Hook",
                "archetype": {
                    "intent": "First close-up of the protagonist.",
                    "mood": "intimate-hook",
                    "suggestedDuration": 12,
                    "directorNotes": "Soft key on the eyes.",
                },
            },
        ],
    }
    section("/api/decompose", call(TS, "POST", "/api/decompose", decompose_req), call(PY, "POST", "/api/decompose", decompose_req))

    return 0


if __name__ == "__main__":
    sys.exit(main())
