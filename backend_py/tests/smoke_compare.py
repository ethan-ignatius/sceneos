"""
Smoke parity test - hits identical endpoints on TS and Python backends
in mock mode and reports per-endpoint parity.

Run:  python tests/smoke_compare.py
"""

from __future__ import annotations

import io
import json
import sys
from typing import Any

import httpx

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)


TS = "http://localhost:8789"
PY = "http://localhost:8790"


GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[2m"
RESET = "\033[0m"


def call(base: str, method: str, path: str, body: Any | None = None) -> tuple[int, Any]:
    try:
        if method == "GET":
            r = httpx.get(base + path, timeout=20)
        else:
            r = httpx.post(base + path, json=body, timeout=20)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {"_text": r.text}
    except Exception as exc:
        return 0, {"_error": str(exc)}


def keys(o: Any) -> set[str]:
    return set(o.keys()) if isinstance(o, dict) else set()


def cmp_section(name: str, ts: tuple[int, Any], py: tuple[int, Any], notes: list[str]) -> bool:
    ts_code, ts_body = ts
    py_code, py_body = py
    print(f"\n{name}")
    print(f"  TS  {ts_code} {DIM}{json.dumps(ts_body)[:200]}{RESET}")
    print(f"  PY  {py_code} {DIM}{json.dumps(py_body)[:200]}{RESET}")
    if ts_code != py_code:
        print(f"  {RED}status code mismatch{RESET}: ts={ts_code} py={py_code}")
        return False
    if ts_code >= 400:
        # both errored — still counted as parity (same shape)
        print(f"  {YELLOW}both error{RESET} (status {ts_code})")
        return True
    ts_keys = keys(ts_body)
    py_keys = keys(py_body)
    only_ts = ts_keys - py_keys
    only_py = py_keys - ts_keys
    if only_ts or only_py:
        if only_ts:
            print(f"  {YELLOW}keys only in TS:{RESET} {sorted(only_ts)}")
        if only_py:
            print(f"  {YELLOW}keys only in PY:{RESET} {sorted(only_py)}")
        notes.append(f"{name}: shape diff (only_ts={sorted(only_ts)}, only_py={sorted(only_py)})")
        return False
    print(f"  {GREEN}same top-level keys{RESET}: {sorted(ts_keys)}")
    return True


def main() -> int:
    notes: list[str] = []
    ok = []

    # 1. Root
    ok.append(cmp_section("GET /", call(TS, "GET", "/"), call(PY, "GET", "/"), notes))

    # 2. Health
    ok.append(cmp_section("GET /api/health", call(TS, "GET", "/api/health"), call(PY, "GET", "/api/health"), notes))

    # 3. Decompose
    decompose_req = {
        "masterPrompt": "A lonely astronaut discovers a living ocean under the ice of Europa.",
        "videoType": "trailer",
        "beats": [
            {
                "beatId": "beat-1",
                "template": "trailer.establishing",
                "beatName": "Establishing",
                "archetype": {
                    "intent": "Reveal the world and the protagonist's isolation.",
                    "mood": "wide-establish",
                    "suggestedDuration": 5,
                    "directorNotes": "Use wide, lonely framing and a precise camera move.",
                },
            },
        ],
    }
    ok.append(cmp_section(
        "POST /api/decompose",
        call(TS, "POST", "/api/decompose", decompose_req),
        call(PY, "POST", "/api/decompose", decompose_req),
        notes,
    ))

    # 4. Generate (needs >=40 char refinedPrompt for Python)
    gen_req = {
        "projectId": "smoke-test",
        "beatId": "trailer.establishing",
        "sceneId": "scene-001",
        "refinedPrompt": "A lone astronaut at a porthole, Earth reflected in her visor, golden hour light, IMAX shallow DOF.",
        "durationSeconds": 8,
        "beatTemplate": "trailer.establishing",
    }
    ts_gen = call(TS, "POST", "/api/generate", gen_req)
    py_gen = call(PY, "POST", "/api/generate", gen_req)
    ok.append(cmp_section("POST /api/generate", ts_gen, py_gen, notes))

    # 5. Status — feed each backend its own jobId, poll twice to reach succeeded
    ts_job = (ts_gen[1] or {}).get("jobId") if isinstance(ts_gen[1], dict) else None
    py_job = (py_gen[1] or {}).get("jobId") if isinstance(py_gen[1], dict) else None

    if ts_job and py_job:
        # First poll
        cmp_section(
            "GET /api/status/{jobId} (poll 1)",
            call(TS, "GET", f"/api/status/{ts_job}"),
            call(PY, "GET", f"/api/status/{py_job}"),
            notes,
        )
        # Second poll — should be succeeded in both
        ok.append(cmp_section(
            "GET /api/status/{jobId} (poll 2 - expect succeeded)",
            call(TS, "GET", f"/api/status/{ts_job}"),
            call(PY, "GET", f"/api/status/{py_job}"),
            notes,
        ))
    else:
        print(f"\n{RED}skipping status — missing jobId{RESET} ts={ts_job} py={py_job}")
        ok.append(False)

    # 6. Stitch URL
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
                    "archetype": {"intent": "Place the viewer", "mood": "wide-establish", "suggestedDuration": 8},
                    "scenes": [
                        {"sceneId": "s1", "conversation": [], "approved": True,
                         "clipPublicId": "samples/sea-turtle", "durationSeconds": 8}
                    ],
                },
                {
                    "beatId": "hook",
                    "beatName": "Hook",
                    "template": "trailer.hook",
                    "status": "approved",
                    "archetype": {"intent": "Intro protagonist", "mood": "intimate-hook", "suggestedDuration": 12},
                    "scenes": [
                        {"sceneId": "s2", "conversation": [], "approved": True,
                         "clipPublicId": "samples/dance-2", "durationSeconds": 12}
                    ],
                },
            ],
        },
        "colorGrade": True,
    }
    ok.append(cmp_section(
        "POST /api/stitch/url",
        call(TS, "POST", "/api/stitch/url", stitch_req),
        call(PY, "POST", "/api/stitch/url", stitch_req),
        notes,
    ))

    # 7. Agent — fresh manifest with no userMessage → both should return a question
    agent_req = {
        "manifest": {
            "projectId": "smoke-agent",
            "videoType": "trailer",
            "masterPrompt": "A blind musician who discovers she can see color through sound.",
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
        "userMessage": "She lives in a converted lighthouse on the Oregon coast.",
    }
    ts_a = call(TS, "POST", "/api/agent", agent_req)
    py_a = call(PY, "POST", "/api/agent", agent_req)
    ok.append(cmp_section("POST /api/agent (single user turn)", ts_a, py_a, notes))
    # Also cross-check that 'kind' is the same value
    if isinstance(ts_a[1], dict) and isinstance(py_a[1], dict):
        ts_kind = ts_a[1].get("kind")
        py_kind = py_a[1].get("kind")
        if ts_kind == py_kind:
            print(f"  {GREEN}kind agrees{RESET}: {ts_kind}")
        else:
            print(f"  {RED}kind diverges{RESET}: ts={ts_kind} py={py_kind}")
            notes.append(f"agent: kind diverges ts={ts_kind} py={py_kind}")

    # 8. Cloudinary sign — without keys this should be a parity 5xx
    ok.append(cmp_section(
        "POST /api/cloudinary/sign (no keys -> expect 500)",
        call(TS, "POST", "/api/cloudinary/sign", {"folder": "sceneos/user-media"}),
        call(PY, "POST", "/api/cloudinary/sign", {"folder": "sceneos/user-media"}),
        notes,
    ))

    # 9. CutOS import — interesting parity check.
    cutos_req = {
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
                         "clipPublicId": "samples/sea-turtle",
                         "clipUrl": "https://res.cloudinary.com/demo/video/upload/samples/sea-turtle.mp4",
                         "durationSeconds": 8, "refinedPrompt": "..."}
                    ],
                },
            ],
        },
    }
    ok.append(cmp_section(
        "POST /api/cutos/import",
        call(TS, "POST", "/api/cutos/import", cutos_req),
        call(PY, "POST", "/api/cutos/import", cutos_req),
        notes,
    ))

    # Summary
    print()
    print("─" * 60)
    print(f"{sum(ok)}/{len(ok)} parity checks passed")
    if notes:
        print(f"\n{YELLOW}Notes:{RESET}")
        for n in notes:
            print(f"  - {n}")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
