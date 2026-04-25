# SceneOS

> Direct your idea into a cinematic.
> Pizza-ordering simplicity for cinematic video.

SceneOS is a **LA Hacks 2026** project that turns a creative-but-non-expert user's idea into an award-winning cinematic. It chains **Higgsfield AI** for clip generation, **Cloudinary** for storage + URL-based stitching, and (optionally) **CutOS** as a power-user editor.

**Tracks:** Flicker to Flow (productivity) · Cloudinary Company Challenge.
**Team:** Alex (frontend lead), Vishnu, Ethan.

---

## Where to start

Read in this order:

1. [`CONTEXT.md`](CONTEXT.md) — the master overview. Vision, market thesis, UX flow, stack.
2. [`docs/HACKATHON_STRATEGY.md`](docs/HACKATHON_STRATEGY.md) — track choices, day-by-day plan, judging criteria map.
3. [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) — service design, API contract, integrations.
4. [`docs/FRONTEND_PHILOSOPHY.md`](docs/FRONTEND_PHILOSOPHY.md) — design language, motion system, component patterns.
5. [`docs/SHARED_TYPES.md`](docs/SHARED_TYPES.md) — TypeScript contracts shared between frontend and backend.
6. [`docs/STITCH_PROMPTS.md`](docs/STITCH_PROMPTS.md) — Google Stitch prompts per screen for prototyping.
7. [`docs/DEMO_PHILOSOPHY.md`](docs/DEMO_PHILOSOPHY.md) — how we shoot the 2-minute demo video.
8. [`docs/DEVPOST_DRAFT.md`](docs/DEVPOST_DRAFT.md) — Devpost submission draft.

---

## Repo layout

```
sceneos/
├── CONTEXT.md             # master overview
├── docs/                  # architecture & strategy
├── frontend/              # Vite + React 19 + TS
└── backend/               # Hono + Node TS skeleton
```

## Quick start

```bash
# Frontend
cd frontend
cp .env.example .env       # fill in Cloudinary cloud_name + preset
npm install
npm run dev                # http://localhost:5173

# Backend (separate terminal)
cd backend
cp .env.example .env       # fill in Cloudinary, Higgsfield, OpenAI keys
npm install
npm run dev                # http://localhost:8787
```

---

## Stack at a glance

**Frontend:** Vite 7 · React 19 · TypeScript 5.7 · Tailwind v4 · Motion · GSAP · React Three Fiber · drei · postprocessing · Zustand · TanStack Query · @cloudinary/react · @cloudinary/url-gen · Radix UI · Lucide · Sonner.

**Backend:** Hono on Node · TypeScript · cloudinary SDK · openai SDK · zod.

**External services:** Higgsfield (clip gen) · Cloudinary (media + concat + CDN) · OpenAI/Anthropic (questionnaire agent) · CutOS (optional editor handoff).

---

## License

This project was built for LA Hacks 2026 and is currently unlicensed (all rights reserved). License decision tabled until post-hackathon.
