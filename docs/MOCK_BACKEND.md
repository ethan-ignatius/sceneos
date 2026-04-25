# SceneOS — Mock Backend Contract

> Last updated: 2026-04-25.

The frontend is **never** mocked. It always talks to a real Hono server on `http://localhost:8787`. What's "mock" is the **data the server returns** — when the backend is in mock mode, every endpoint replies with realistic canned data instead of hitting Higgsfield, OpenAI, or Cloudinary.

This means:
- Alex can build the entire frontend without any provider keys.
- Vishnu / Ethan flip a single env var to switch the same backend to real services.
- The HTTP contract is exercised in dev exactly the way it will be in production.

---

## How to run

```bash
# from backend/
npm install
npm run dev:mock      # forces mock mode via .env.mock
# or
npm run dev           # auto-detect: missing keys → mock; full keys → real
```

The server prints a banner at startup when mock is active:

```
╔══════════════════════════════════════════════════════════╗
║  SceneOS backend is running in MOCK MODE.                ║
║  All endpoints respond with realistic canned data.       ║
║  Set MOCK_MODE=false in .env to use real providers.      ║
╚══════════════════════════════════════════════════════════╝
```

---

## What the mock returns

| Endpoint | Mock behaviour |
|---|---|
| `GET /` | `{ name, status: "ok", mock: true }` |
| `POST /api/agent` | Beat-template-specific directorial questions from `mock/agent.ts`. Sufficient after 2 user turns. Final `markSufficient` synthesizes a refined prompt from the conversation. |
| `POST /api/generate` | Returns `{ jobId, provider: "cached", pollAfterMs: 800 }` immediately. No real model is called. |
| `GET /api/status/:jobId` | First poll → `running`. Second poll → `succeeded` with a real, playable Cloudinary demo URL (e.g. `https://res.cloudinary.com/demo/video/upload/dog.mp4`). |
| `POST /api/stitch/url` | Real implementation — pure function over public_ids. Works the same in both modes. |
| `POST /api/cutos/import` | Returns `{ projectId, editUrl }` pointing at a fake CutOS project URL. The URL won't open a real CutOS, but the deep-link UX is exercised. |

---

## How auto-detect works

The backend reads four key sets:

```
HIGGSFIELD_API_KEY  or  (KLING_ACCESS_KEY + KLING_SECRET_KEY)
OPENAI_API_KEY
CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
```

If **any** are missing AND `MOCK_MODE` is unset, mock is on by default. Set `MOCK_MODE=true` or `MOCK_MODE=false` in your `.env` to override.

---

## Realistic — not lazy

The mock agent uses the **same `directorNotes` field** that the real agent uses, and emits questions like:

> *"For this opening wide, do you want a 24mm sweep across a full vista, or an 85mm compression on a single distant figure dwarfed by environment?"*

If a question reads like a generic chatbot ("describe your scene") the mock is wrong — fix it. The mock is the cheapest way to keep the cinematography moat sharp during development.

Mock clip URLs use Cloudinary's public `demo` cloud (`dog.mp4`, `elephants.mp4`) — they're CORS-friendly and play in `<video>` without any account setup.

---

## Switching to real services

When Vishnu / Ethan land a real implementation:

1. Add the provider's env vars to `backend/.env`.
2. Run `MOCK_MODE=false npm run dev` (or omit if all key sets are populated — auto-detect will pick real).
3. Hit `GET /` and confirm `mock: false` in the response.
4. The same frontend, with no changes, now exercises the real pipeline.

---

## Gotchas

- **The frontend's `VITE_API_BASE_URL` doesn't change between modes.** Always `http://localhost:8787`. The frontend has no concept of "is the backend mocked?" — that's the point.
- **`/api/stitch/url` is the same code in both modes.** It's a pure function. Mock public_ids work because the demo cloud actually has those assets.
- **Mock jobs are in-memory.** Restart the server and old `jobId`s die. That's fine for dev.
- **Don't add provider keys to `.env.mock`.** That file is committed; it's intentionally key-less.
