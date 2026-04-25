# SceneOS — Backend

Hono on Node + TypeScript. Thin orchestration layer over Higgsfield (video gen), Cloudinary (media + concat), and CutOS (optional editor handoff).

> **Architecture spec lives in [`../docs/BACKEND_ARCHITECTURE.md`](../docs/BACKEND_ARCHITECTURE.md). Read that first.**

## Quick start

```bash
npm install

# Mock mode — no keys needed, instant realistic data
npm run dev:mock           # http://localhost:8787

# Real services — fill .env first
cp .env.example .env
npm run dev                # auto-detects: missing keys → mock; full keys → real
```

See [`../docs/MOCK_BACKEND.md`](../docs/MOCK_BACKEND.md) for the mock contract (what every endpoint returns, how auto-detect works, when to flip to real).

## Endpoints

| Method | Path | Owner | Purpose |
|---|---|---|---|
| POST | `/api/agent` | Ethan | Per-beat questionnaire turn (next question or sufficiency verdict) |
| POST | `/api/generate` | Vishnu | Kicks off a Higgsfield clip job |
| GET | `/api/status/:jobId` | Vishnu | Polls a job; returns Cloudinary URL when ready |
| POST | `/api/stitch/url` | Vishnu | Pure function — given a manifest, returns the `fl_splice` URL |
| POST | `/api/cutos/import` | Stretch | Hands manifest to CutOS for fine editing |

Full request/response shapes: [`../docs/SHARED_TYPES.md`](../docs/SHARED_TYPES.md).

## Layout

```
src/
├── index.ts             # Hono app + CORS + route mounting
├── routes/              # one file per endpoint group
├── services/            # higgsfield, cloudinary, cutos, agent
├── lib/                 # beat templates, sufficiency scoring
└── types/               # mirror of frontend/src/types
```

## Status

| Endpoint | State | Notes |
|---|---|---|
| `POST /api/stitch/url` | ✅ wired | pure `fl_splice` URL builder |
| `POST /api/generate` | ✅ wired | dispatches to active provider |
| `GET /api/status/:jobId` | ✅ wired | polls + uploads to Cloudinary on success |
| `POST /api/agent` | 🟡 stub | Ethan |
| `POST /api/cutos/import` | 🟡 stub | stretch |

### Generation provider

`services/higgsfield.ts` is a provider-agnostic dispatcher. It picks one of:

- `mock` — default. Returns one of a handful of public sample MP4s after a 12 s simulated latency. Lets you validate the pipeline without paid keys.
- `higgsfield` — real Higgsfield Cloud. Auto-selected when `HIGGSFIELD_API_KEY` is set. Endpoint paths are sketched in `services/providers/higgsfield-cloud.ts`; **confirm against the Higgsfield Cloud docs before relying on it**.

To add Segmind/Replicate/Fal: drop a `services/providers/<name>.ts` implementing `VideoProvider`, register it in `pickProvider()`.

### End-to-end test

```bash
# 1. Free Cloudinary signup → cloudinary.com → grab cloud name + API key + secret.
# 2. Fill backend/.env:
#      CLOUDINARY_CLOUD_NAME=...
#      CLOUDINARY_API_KEY=...
#      CLOUDINARY_API_SECRET=...
#    (Higgsfield key is optional; without it the mock provider runs.)
npm run dev                    # listens on :8787
./scripts/test-pipeline.sh     # default cinematic prompt
./scripts/test-pipeline.sh "your prompt here"
```

`test-pipeline.sh` POSTs `/api/generate`, polls `/api/status/:jobId` until `succeeded`, and `open`s the resulting Cloudinary URL in your browser. Requires `jq` (`brew install jq`).

Tunables (env at script invocation): `PORT`, `DURATION`, `PROJECT_ID`, `BEAT_ID`, `SCENE_ID`, `MAX_POLLS`, `MOCK_GENERATION_LATENCY_MS`.
