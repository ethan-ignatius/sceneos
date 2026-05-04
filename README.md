# SceneOS

> Powerful filmmaking, reimagined for one. SceneOS turns one idea into a finished cinematic, collapsing a film crew, 24 hours of editing, and a cinematographer's vocabulary into one creator's hands.

Built at LA Hacks 2026 by Alex, Vishnu, and Ethan.

---

## What it does

You type one idea. SceneOS:

1. Decomposes it into a 7-beat dramatic arc (hook → resolution).
2. Talks to you in a director's voice, beat by beat, asking the most charged question your story needs (no checklist, no multiple choice unless each option is genuinely a different movie).
3. Generates each clip with Higgsfield / Veo, lets you approve / regenerate / refine.
4. Stitches the cut as a **single Cloudinary `fl_splice` URL** — that URL IS the cinematic. Edit it in the agentic editor and the URL re-bakes on the CDN.
5. Ships you an MP4 download or a share link. Done.

The whole flow is the demo video — under 90 seconds end to end.

---

## Stack

**Frontend** — Vite 7 · React 19 · TypeScript 5.7 · Tailwind v4 · Motion · GSAP · React Three Fiber · drei · Zustand · @cloudinary/react · cmdk · Sonner.

**Backend** — FastAPI · Python 3.11+ · LangGraph · Vertex Gemini 2.5 (only LLM) · google-genai · fal-client · httpx · pydantic.

**External** — Cloudinary (media + `fl_splice` + delivery) · Vertex Veo / Higgsfield / fal / Kling (clip gen, provider toggle) · ElevenLabs (voiceover for the demo).

---

## Quick start

Two terminals.

```bash
# terminal 1 — backend
cd backend_py
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
# Create .env with the keys listed below ↓
uvicorn sceneos_py.app:app --reload --port 8787

# terminal 2 — frontend
cd frontend
cp .env.example .env
pnpm install                  # or: npm install
pnpm dev                      # http://localhost:5173
```

Required env keys (backend):
- `GOOGLE_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS` — Vertex Gemini agent + Veo video.
- `CLOUDINARY_URL` (or the explicit triple) — media + `fl_splice` URL bake.
- `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` — optional alt video lane.
- `ALLOWED_ORIGIN` — comma-separated CORS origins for prod (the deployed frontend domain).

If creds are missing, the backend auto-flips to `MOCK_MODE` so the canvas/editor stay walkable in dev — the visual flow is the same, the URLs are real Cloudinary `demo` cloud assets.

---

## Repo layout

```
sceneos/
├── README.md
├── frontend/                 # Vite + React 19 + TS
│   ├── src/routes/           # landing · transition · canvas · edit · final · projects
│   ├── src/components/       # canvas, drawer, agent, editor, stitch, ui
│   ├── src/stores/           # zustand v5 with persist
│   └── src/lib/              # cloudinary, motion-presets, api
├── backend_py/               # FastAPI + Python 3.11+
│   ├── sceneos_py/agent/     # Vertex Gemini agent (tools + prompt + repair)
│   ├── sceneos_py/editor.py  # /api/editor/{init,apply,turn,stream}
│   ├── sceneos_py/cloudinary.py  # the fl_splice URL builder
│   └── sceneos_py/orchestrator.py
├── docs/                     # architecture, design system, lesson reflections
└── examples-locked/          # gitignored — clones / HARs / inspiration only
```

---

## Demo + deploy

- 60-second walkthrough script + shot list: [`docs/DEMO_VIDEO.md`](docs/DEMO_VIDEO.md). Drop the YouTube URL there once recorded.
- Deploy guide (Vercel + Cloud Run + custom domain + CORS): [`docs/DEPLOY.md`](docs/DEPLOY.md).
- Live: `https://sceneos.us` (frontend) · `https://api.sceneos.us` (backend).

---

## License

Built for LA Hacks 2026. Currently unlicensed (all rights reserved). License decision tabled until post-hackathon.
