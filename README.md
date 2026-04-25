# SceneOS

> Direct your idea into a cinematic.
> Pizza-ordering simplicity for cinematic video.

SceneOS is a **LA Hacks 2026** project that turns a creative-but-non-expert user's idea into an award-winning cinematic. It chains **Higgsfield AI** for clip generation, **Cloudinary** for storage + URL-based stitching, and (optionally) **CutOS** as a power-user editor.

**Tracks:** Flicker to Flow (productivity) · Cloudinary Company Challenge.
**Team:** Alex (frontend lead), Vishnu, Ethan.

---

## Where to start

Read in this order:

1. [`CONTEXT.md`](CONTEXT.md) — master overview: vision, market thesis, UX flow, stack.
2. [`docs/HACKATHON_STRATEGY.md`](docs/HACKATHON_STRATEGY.md) — track choices, day-by-day plan, judging-criteria map.
3. [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) — service design, API contract, integrations.
4. [`docs/FRONTEND_PHILOSOPHY.md`](docs/FRONTEND_PHILOSOPHY.md) — design language, motion system, component patterns.
5. [`docs/MASTER_FRONTEND_DEV.md`](docs/MASTER_FRONTEND_DEV.md) — **the synthesis bible.** Decoded site exemplars, tools-vs-tools decisions, full pattern library, component bestiary, snippet library. Read this before anything else frontend-related.
6. [`docs/MOTION_LANGUAGE.md`](docs/MOTION_LANGUAGE.md) — motion philosophy, timing/easing system, anti-patterns, cohesion checklist.
7. [`docs/FRONTEND_TODO.md`](docs/FRONTEND_TODO.md) — ranked, motion-rich execution list with acceptance criteria.
8. [`docs/FRONTEND_BUILDOUT.md`](docs/FRONTEND_BUILDOUT.md) — surface-by-surface buildout guide.
9. [`docs/MOCK_BACKEND.md`](docs/MOCK_BACKEND.md) — mock backend contract: how the FE always talks to a real backend, even with no keys.
10. [`docs/SHARED_TYPES.md`](docs/SHARED_TYPES.md) — TypeScript contracts shared between frontend and backend.
11. [`docs/STITCH_PROMPTS.md`](docs/STITCH_PROMPTS.md) — Google Stitch prompts per screen for prototyping.
12. [`docs/DEMO_PHILOSOPHY.md`](docs/DEMO_PHILOSOPHY.md) — how we shoot the 2-minute demo video.
13. [`docs/DEVPOST_DRAFT.md`](docs/DEVPOST_DRAFT.md) — Devpost submission draft.

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

Two terminals, always.

```bash
# terminal 1 — backend (mock mode, no keys needed)
cd backend
npm install
npm run dev:mock           # http://localhost:8787

# terminal 2 — frontend
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

The frontend is **never** mocked itself — it always makes real HTTP calls to a real backend. In mock mode, the **backend** returns canned realistic data. Flip to real services later by populating `backend/.env` and running `npm run dev` (auto-detects keys).

---

## Stack at a glance

**Frontend:** Vite 7 · React 19 · TypeScript 5.7 · Tailwind v4 · Motion · GSAP · React Three Fiber · drei · postprocessing · Zustand · TanStack Query · @cloudinary/react · @cloudinary/url-gen · Radix UI · Lucide · Sonner.

**Backend:** Hono on Node · TypeScript · cloudinary SDK · openai SDK · zod.

**External services:** Higgsfield (clip gen) · Cloudinary (media + concat + CDN) · OpenAI/Anthropic (questionnaire agent) · CutOS (optional editor handoff).

---

## License

This project was built for LA Hacks 2026 and is currently unlicensed (all rights reserved). License decision tabled until post-hackathon.
