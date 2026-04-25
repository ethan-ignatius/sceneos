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

### Generation provider tiers

`services/provider.ts` dispatches based on `GENERATION_PROVIDER`:

| Tier | When | Notes |
|---|---|---|
| `higgsfield` | recorded-demo (default) | best quality (Sora 2 / Veo 3.1), 60–180 s/clip — currently a stub |
| `kling` | live-demo | direct Kling 3.0, 15–30 s/clip — currently a stub |
| `replicate` | fallback | multi-model gateway — currently a stub |
| `cached` | on-stage safety net | reads pre-rendered Cloudinary public_ids from `services/cached-demo.ts` |

`MOCK_MODE` (auto-default when keys are missing) bypasses all of these and returns canned data from `mock/`. See `../docs/MOCK_BACKEND.md`.

### End-to-end tests

Mock mode works without any keys. The two scripts both require `jq` (`brew install jq`).

```bash
npm run dev:mock                 # one terminal — http://localhost:8787

# Generation pipeline: POST /api/generate → poll → open Cloudinary URL
./scripts/test-pipeline.sh
./scripts/test-pipeline.sh "your prompt"

# Stitch URL: POST /api/stitch/url → open the spliced result
./scripts/test-stitch.sh
./scripts/test-stitch.sh --color-grade
./scripts/test-stitch.sh --audio samples/audio/<your-public-id>
```

Both scripts use Cloudinary's public `demo` cloud, so they produce playable URLs regardless of whether you've configured your own Cloudinary creds. Tunable env: `PORT`.
