# SceneOS — Backend

FastAPI on Python 3.11+. Thin orchestration layer over Higgsfield / Vertex AI Veo / Kling / fal / Replicate (video gen, switchable via `GENERATION_PROVIDER`), Cloudinary (media + `fl_splice` URL build), and CutOS (optional editor handoff). Agent + decomposer use Vertex Gemini 2.5. Anthropic was removed — Vertex Gemini is the only LLM SceneOS uses.

> **Architecture spec lives in [`../docs/BACKEND_ARCHITECTURE.md`](../docs/BACKEND_ARCHITECTURE.md). Read that first.**

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Mock mode — no keys needed, instant realistic data (loads .env.mock)
MOCK_MODE=true uvicorn sceneos_py.app:app --reload --port 8787

# Real services — fill .env first (see fields below), then:
uvicorn sceneos_py.app:app --reload --port 8787
```

See [`../docs/MOCK_BACKEND.md`](../docs/MOCK_BACKEND.md) for the mock contract.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | Liveness + mock-mode probe |
| POST | `/api/agent` | Per-beat questionnaire turn (askQuestion/markSufficient) |
| POST | `/api/decompose` | One-shot LLM that turns master prompt into Higgsfield-ready clip prompts per beat |
| POST | `/api/generate` | Kicks off a clip job via the active `GENERATION_PROVIDER` |
| GET  | `/api/status/:jobId` | Polls a job; returns Cloudinary URL on success |
| POST | `/api/stitch/url` | Pure function — given a manifest, returns the `fl_splice` URL |
| POST | `/api/cloudinary/sign` | Server-side signed-upload params (mock branch when MOCK_MODE) |
| POST | `/api/cutos/import` | Hands the manifest to CutOS for fine editing (mock branch when MOCK_MODE) |

Full request/response shapes: [`../docs/SHARED_TYPES.md`](../docs/SHARED_TYPES.md).

## Layout

```
sceneos_py/
├── app.py                  # FastAPI app, route mounting, error envelope
├── agent/                  # questionnaire submodule (Gemini dispatch + tool surface)
│   ├── __init__.py         # public re-exports (run_agent_turn, etc.)
│   ├── _constants.py       # tier-aware question caps, thinking budgets
│   ├── context.py          # mode + earlier/later beats blocks for the prompt
│   ├── gemini.py           # Vertex Gemini dispatch (non-streaming + streaming)
│   ├── messages.py         # Gemini message + config builder
│   ├── normalizer.py       # tool-call → AgentResponse shape
│   ├── prompt.py           # system prompt composition
│   ├── repair.py           # _repair_question_if_redundant defense-in-depth
│   ├── stub.py             # deterministic fallback when no Gemini client
│   └── tools.py            # askQuestion + markSufficient tool schemas
├── decompose.py            # one-shot Vertex Gemini decompose w/ mood-cue stub fallback
├── editor.py               # Stage 7 editor agent + edit-decisions baker
├── provider.py             # generation provider dispatcher (vertex/higgsfield/fal/...)
├── vertex_veo.py           # Google Cloud Vertex AI Veo
├── higgsfield.py           # Higgsfield text-to-image -> image-to-video
├── fal.py                  # fal.ai LTX-Video
├── kling.py                # Kling (stub)
├── replicate.py            # Replicate (stub)
├── cached.py               # cached-demo provider (on-stage safety net)
├── mock.py                 # mock agent + clips + cutos + jobIds
├── cloudinary.py           # fl_splice URL build, signing, upload, color grades
├── beat_templates.py       # archetype data
├── sufficiency.py          # facet coverage scoring for the agent
├── jobs.py                 # in-memory Higgsfield job registry
└── config.py               # env loader (.env or .env.mock)
```

## Provider dispatch

`provider.py` switches on `GENERATION_PROVIDER`:

| Tier | When | Notes |
|---|---|---|
| `vertex` | Google Cloud Veo | Long-running prediction → base64 video → Cloudinary upload |
| `higgsfield` | recorded-demo (best quality) | Two-stage T2I → I2V; in-memory job registry |
| `fal` | fast/cheap real-AI | LTX-Video via fal-client; subscribe wrapped in async task |
| `kling` | live-demo (TODO) | Stub |
| `replicate` | fallback (TODO) | Stub |
| `cached` | on-stage safety net | Replays pre-rendered Cloudinary clips |

`MOCK_MODE=true` short-circuits `/api/generate` + `/api/status` + `/api/agent` + `/api/cutos/import` to canned data, regardless of provider.

## Tests

```bash
pytest                                              # unit + contract
python tests/smoke_compare.py                       # cross-port parity (legacy)
python tests/fe_flow_test.py                        # full FE flow simulation
```

## Env vars

Same keys as the prior TS backend (`backend/.env.example`). The Vertex SA file lives at `.secrets/gcp-vertex-sa.json` and is git-ignored.
