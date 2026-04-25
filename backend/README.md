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

## Stub status

All routes return `501 Not Implemented` with a clear stub message. Implementation order recommended in `BACKEND_ARCHITECTURE.md` §10:

1. `services/cloudinary.ts` + `POST /api/stitch/url` (easiest, pure)
2. `services/higgsfield.ts` + `POST /api/generate` + `GET /api/status/:jobId`
3. `services/agent.ts` + `POST /api/agent`
4. `services/cutos.ts` + `POST /api/cutos/import` (stretch)
