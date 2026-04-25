# SceneOS — Master Context

> Living document. Append, refine, do not delete history. Last updated: 2026-04-25.

SceneOS is a frontend-led, full-stack project for **LA Hacks 2026** that turns a creative-but-non-expert user's idea into an award-winning cinematic video. It chains **Higgsfield AI** for generation, **Cloudinary** for media storage + URL-based stitching, and (optionally) **CutOS** as a power-user editor on top.

**Team:** Alex (frontend lead), Vishnu, Ethan.
**Repo:** https://github.com/ethan-ignatius/sceneos.git
**Deadline:** 2026-04-26, 11:00am EDT.
**Tracks:** Flicker to Flow (productivity) + Cloudinary Company Challenge.

This file is the entry point. Sub-documents live in `docs/`:

- [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) — service design, API contract, integrations
- [`docs/FRONTEND_PHILOSOPHY.md`](docs/FRONTEND_PHILOSOPHY.md) — design language, motion system, component patterns
- [`docs/HACKATHON_STRATEGY.md`](docs/HACKATHON_STRATEGY.md) — track selection, judging map, day plan
- [`docs/STITCH_PROMPTS.md`](docs/STITCH_PROMPTS.md) — Google Stitch prompts per screen for prototyping
- [`docs/DEMO_PHILOSOPHY.md`](docs/DEMO_PHILOSOPHY.md) — how we shoot the 2-minute demo video
- [`docs/DEVPOST_DRAFT.md`](docs/DEVPOST_DRAFT.md) — Devpost submission draft
- [`docs/SHARED_TYPES.md`](docs/SHARED_TYPES.md) — TypeScript contracts shared across frontend & backend

---

## 1. Vision

The cinematic-video industry has a **knowledge bottleneck, not a generation bottleneck**. Models like Sora 2, Veo 3.1, and Kling 3.0 (all aggregated by Higgsfield) can already render film-quality shots from prompts. What's still scarce is the human knowledge needed to *direct* those models — three-act structure, beats, conflict-resolution shape, framing language, pacing. That's why companies are paying premiums for "AI video specialists."

SceneOS encodes that directorial knowledge into the product itself. The user supplies creativity. SceneOS supplies cinematography. The output is a polished cinematic the user could not have made alone.

> **One-line pitch:** "Tesla ordering, but for cinematic videos." Pizza-simple input → award-winning render.

---

## 2. Market thesis & validation

| Claim | Verdict | Source |
|---|---|---|
| Pro cinematic trailers cost ~$10K | **Validated, conservative.** Industry rates run $10K–$100K **per finished minute**. Game trailers $5K–$50K. Voiceover alone $1K–$5K/min. | [Animost](https://animost.com/uncategorized/how-much-does-it-cost-to-make-a-cinematic-trailer/), [Pixune](https://pixune.com/blog/how-much-does-a-video-game-trailer-cost/), [MU2 commercial guide 2026](https://www.mu2pro.com/2026/02/14/commercial-video-cost-2026-guide) |
| AI video creators are in demand | **Validated.** Storyboard/agent platforms have exploded in 2026 — Invideo Agent, LTX, Higgsfield Popcorn, Katalist, Novi, DeeVid. | [Invideo Agent review](https://resource.digen.ai/invideo-ai-video-agent-review-2026/), [LTX](https://ltx.studio/blog/best-ai-video-generators) |
| "Nothing like SceneOS exists" | **Partially true.** Linear prompt→storyboard→video pipelines exist. A *node-canvas exploration interface organised around cinematography theory*, with Cloudinary-stitched delivery and an optional CutOS editor handoff, does not. | See competitor table in `docs/HACKATHON_STRATEGY.md`. |
| Higgsfield is callable from a frontend-friendly stack | **Yes.** Cloud console at [cloud.higgsfield.ai](https://cloud.higgsfield.ai/), official Python SDK, third-party API gateways (Segmind, Unifically). Public API maturity is uneven — backend team must confirm auth + rate limits. | [Higgsfield client SDK](https://github.com/higgsfield-ai/higgsfield-client), [Segmind I2V](https://www.segmind.com/models/higgsfield-image2video/api) |

**Net:** the user/business value is real and quantifiable. SceneOS that gets a non-pro to a credible 1-minute cinematic in <15 minutes is replacing tens of thousands of dollars of human production time.

---

## 3. The wedge

We are not the first AI-video tool. We are the first to ship a **node-canvas exploration UI organised around cinematography theory**, paired with a delivery pipeline that hides every operational detail (storage, concat, transcoding, CDN) behind a Cloudinary URL.

| Tool | What it does | Where it falls short |
|---|---|---|
| **LTX Studio** | End-to-end: script → storyboard → timeline → render | Linear timeline, no spatial/beat-tree exploration |
| **Higgsfield Popcorn** | Multi-frame consistent storyboards | Image-layer only, no narrative agent, no beat structure |
| **Invideo Agent** | Autonomous prompt → final video | Optimised for SEO/stock content, not cinematic narrative |
| **Katalist / Novi AI** | Story → storyboard → produced video | Linear, no theory-driven scaffolding |

**SceneOS wedge:** *the canvas is the product*. Cinematography (acts, beats, conflict shape) becomes a navigable spatial map. The user explores instead of being interviewed in a linear funnel.

---

## 4. UX flow (v0)

1. **Landing** — single, almost-empty page. One input: the master prompt. Heavy typographic statement.
2. **Transition** — page-crumple/burn into the canvas. **Showpiece moment** — judging hook.
3. **Canvas** — full-viewport spatial map. SceneOS auto-spawns N nodes based on:
   - **Video type** (trailer / short / feature) — sets a base node count and beat template
   - **Prompt richness** — vague prompts spawn the canonical template; rich prompts pre-fill more nodes
4. **Node traversal** — Forza-style camera glides between nodes; nodes "breathe."
5. **Per-node questionnaire** — agent asks questions through choreographed chat bubbles. Stops at the *information sufficiency threshold*. Shorter for users who already gave specifics.
6. **Generation preview** — once a node has enough info, Higgsfield generates a still + clip. User approves inline.
7. **Stitch tray** — approved clips queue. Once all beats are green, a single Cloudinary URL is built (`fl_splice`) — that's the final cinematic. No separate stitching server.
8. **Optional editor handoff** — power users can click "Open in CutOS" to fine-edit (split/trim/effects/dubbing/transitions/semantic search).

### Beat templates

- **Trailer** (60–90s): 5 beats — *Establishing → Hook → Rising tension → Climax tease → Sting/CTA*
- **Short-form** (15–30s): 3 beats — *Hook → Turn → Payoff*
- **Feature/long** (≥3 min): three-act with optional second-level scenes per beat — *Setup → Inciting → Rising → Midpoint → Crisis → Climax → Denouement*

Recursive nodes (scenes inside beats) are an optional "deep mode" — feature mode only for hackathon scope. Trailer + short-form stay flat.

### Information sufficiency

Adaptive question count per node. Threshold is backend-owned; frontend renders state cues:
- Soft progress meter inside the node
- "Locked-in" visual state (node glows, settles)
- User can override and continue early

---

## 5. System architecture (one-page summary)

Detailed diagrams in [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md).

```
┌────────────────────────────────────────────────────────────────┐
│  SceneOS Frontend  (Vite + React 19 + TS, deployed standalone)  │
│   • Landing → Crumple → Canvas (R3F beat-map)                   │
│   • Per-node agent questionnaire                                │
│   • Cloudinary upload widget for raw clip ingest                │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS
       ┌───────▼────────────────────────────┐
       │  SceneOS Backend (Hono + Node TS)   │
       │   • POST /api/agent (questionnaire) │
       │   • POST /api/generate (Higgsfield) │
       │   • POST /api/cutos/import (handoff)│
       │   • GET  /api/status/:jobId          │
       └───┬─────────┬────────────┬──────────┘
           │         │            │
   ┌───────▼─┐  ┌────▼─────┐  ┌───▼──────────┐
   │Higgsfield│  │Cloudinary│  │   CutOS API   │
   │ (clip   │  │(storage +│  │ (Next.js editor│
   │ gen)    │  │ fl_splice│  │  + agent +     │
   │         │  │ concat + │  │  Kling/E11/T12)│
   │         │  │ CDN)     │  │                │
   └─────────┘  └──────────┘  └────────────────┘
```

Key decisions:
- **Cloudinary `fl_splice`** is the stitching engine. The "final video URL" is just a transformation URL — no server-side concat job, no waiting.
- **Higgsfield is server-side only** (we proxy because of API-key handling and rate limits).
- **CutOS handoff is optional**. The hackathon happy-path delivers a final cinematic without ever entering CutOS. Editor mode is a "wow" surface for the demo.

---

## 6. Repo layout

```
sceneos/
├── CONTEXT.md                  ← you are here
├── README.md
├── docs/                       ← architecture & strategy
├── frontend/                   ← Vite + React 19 + TS app
│   ├── package.json
│   └── src/
└── backend/                    ← Hono + Node TS skeleton
    ├── package.json
    └── src/
```

Mirror of the FlowBoard layout (`frontend/` + `backend/`) so teammates feel at home.

---

## 7. Stack at a glance

Detailed rationale in `docs/FRONTEND_PHILOSOPHY.md` and `docs/BACKEND_ARCHITECTURE.md`.

**Frontend**
- Vite 7 + React 19 + TypeScript 5.7
- Tailwind CSS v4 (engine-rewritten, fast)
- shadcn/ui via 21st.dev registry — owned components
- **Motion** (formerly Framer Motion) — UI animation
- **GSAP** — page-crumple showpiece
- **React Three Fiber + drei + postprocessing** — 3D beat-map canvas
- **@cloudinary/react + @cloudinary/url-gen** — media + URL transforms
- Zustand (state, mirrors CutOS pattern)
- TanStack Query (async)
- Radix UI primitives + Lucide icons + Sonner toasts

**Backend**
- Hono on Node + TypeScript (lightweight, fast, hackathon-friendly)
- `cloudinary` SDK (server signing)
- `zod` (request validation)
- `openai` or `@ai-sdk/openai` (agent questionnaire LLM — mirrors CutOS choice)

---

## 8. Working agreements

- **No Claude attribution** on commits or PRs. `.claude/settings.json` has `"includeCoAuthoredBy": false`. Don't manually re-add it.
- **Quality bar:** every screen reviewed against godly.website / awwwards / dribbble / 21st.dev. If something looks generic, redesign before merging.
- **Pizza-ordering simplicity** is the tie-breaker rule when designing flow.
- **Conventional Commits**: `feat(scope): subject`, `fix(scope): subject`. Mirrors Cloudinary kit + CutOS convention.

---

## 9. Open questions (need team confirmation)

1. **Higgsfield API auth** — do we have keys? If not, secure them ASAP. Without them, switch to Segmind or Replicate as fallback.
2. **Cloudinary cloud name / upload preset** — needs a free-tier account; whoever sets it up adds `cloud_name` and `upload_preset` to `frontend/.env`.
3. **Recursive nodes** — feature mode only for hackathon, or skip entirely?
4. **Audio** — does v0 include ambient + generated VO via ElevenLabs (through CutOS), or video-only?
5. **CutOS handoff** — if we implement, who builds CutOS's `POST /api/projects/import-manifest`? It doesn't exist yet.

---

## 10. Changelog

- **2026-04-25** — Doc seeded; market validated; competitor scan complete; stack chosen; **track decided (Flicker to Flow + Cloudinary)**; CutOS recon complete (Next.js 16 / React 19.2 / Supabase / Kling-ElevenLabs-TwelveLabs; no Higgsfield, no Cloudinary — those are SceneOS's contribution); FlowBoard reviewed for design inspiration (tldraw + Radix + glassmorphism); Cloudinary `fl_splice` URL-based stitching identified as the stitch engine. Repo layout (`frontend/` + `backend/` + `docs/`) mirrors FlowBoard.
