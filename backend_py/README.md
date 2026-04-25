# SceneOS — Backend

FastAPI on Python 3.11+. Thin orchestration layer over Higgsfield / Vertex AI Veo / Kling / fal / Replicate (video gen, switchable via `GENERATION_PROVIDER`), Cloudinary (media + `fl_splice` URL build), and CutOS (optional editor handoff). Agent + decomposer use Anthropic Claude (direct API or via Vertex AI).

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
├── agent.py                # questionnaire (askQuestion/markSufficient tool pattern)
├── decompose.py            # one-shot Anthropic decompose with mood-cue stub fallback
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
├── anthropic_client.py     # Vertex / direct API routing for Claude
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
