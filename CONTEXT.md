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
| "First cinematic-theory-as-UI tool" | **True and defensible.** Linear prompt→storyboard→video pipelines exist. A node canvas where cinematography theory IS the interface, an agent speaking directorial language, and a Cloudinary-URL delivery pipeline — that combination is novel. | See competitor table in `docs/HACKATHON_STRATEGY.md`. |
| Higgsfield is callable from a frontend-friendly stack | **Yes.** Cloud console at [cloud.higgsfield.ai](https://cloud.higgsfield.ai/), official Python SDK, third-party API gateways (Segmind, Unifically). Public API maturity is uneven — backend team must confirm auth + rate limits. | [Higgsfield client SDK](https://github.com/higgsfield-ai/higgsfield-client), [Segmind I2V](https://www.segmind.com/models/higgsfield-image2video/api) |

**Net:** the user/business value is real and quantifiable. SceneOS that gets a non-pro to a credible 1-minute cinematic in <15 minutes is replacing tens of thousands of dollars of human production time.

---

## 3. The wedge — cinematic theory as UI

**SceneOS is the first cinematic-theory-as-UI tool.** Other AI-video products treat generation as the product. We treat *direction* as the product — the canvas of beats, the directorial questions, the per-beat archetypes (lens, movement, light, blocking, pace) — and use generation models as commodity primitives we route between (Higgsfield / Kling / Replicate). Storage, concat, transcoding, and CDN collapse into a single Cloudinary `fl_splice` URL.

The questions our agent asks are not "what mood?" — they are "for the establishing wide, do you want a 24mm sweep across the dunes, or an 85mm compression on a lone figure against the horizon?" That difference is the moat. Generic questions make us a wrapper. Directorial questions make us a tool a real director would respect.

| Tool | What it does | Where it falls short |
|---|---|---|
| **LTX Studio** | End-to-end: script → storyboard → timeline → render | Linear timeline; no theory-driven scaffolding |
| **Higgsfield Popcorn** | Multi-frame consistent storyboards | Image-layer only; no directorial questioning |
| **Invideo Agent** | Autonomous prompt → final video | Optimised for SEO/stock content; no cinematography opinion |
| **Katalist / Novi AI** | Story → storyboard → produced video | Linear funnels; chat-style instead of canvas |

**SceneOS wedge:** the canvas is the product. Cinematography (acts, beats, conflict shape) becomes a navigable spatial map; the agent speaks in directorial language; the delivery pipeline is one URL. None of the above ship all three.

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
       │  SceneOS Backend (FastAPI + Python) │
       │   • POST /api/agent (questionnaire) │
       │   • POST /api/decompose (LLM)       │
       │   • POST /api/generate (provider)   │
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
- **Generation provider is configurable via `GENERATION_PROVIDER` env var**: `higgsfield` (recorded-demo tier, best quality) → `kling` (live-demo tier, faster) → `replicate` (multi-model fallback) → `cached` (pre-rendered demo project, on-stage safety net). Switch tiers without code changes. See `docs/BACKEND_ARCHITECTURE.md` §6.5.
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
└── backend_py/                 ← FastAPI + LangGraph + Python 3.11+
    ├── pyproject.toml
    └── sceneos_py/
```

Mirrors the `frontend/` + `backend_py/` split so teammates feel at home.

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
- FastAPI + Uvicorn on Python 3.11+
- LangGraph (agent state machine scaffolding)
- Anthropic SDK with Vertex AI routing (questionnaire agent + prompt decomposer)
- `google-auth` (Vertex AI Veo + AnthropicVertex SA auth)
- `fal-client` (fal.ai LTX-Video provider)
- `httpx` (Higgsfield, CutOS, Cloudinary upload)
- `pydantic` (request validation)

---

## 8. Working agreements

- **No Claude attribution** on commits or PRs. `.claude/settings.json` has `"includeCoAuthoredBy": false`. Don't manually re-add it.
- **Quality bar:** every screen reviewed against godly.website / awwwards / dribbble / 21st.dev. If something looks generic, redesign before merging.
- **Pizza-ordering simplicity** is the tie-breaker rule when designing flow.
- **Conventional Commits**: `feat(scope): subject`, `fix(scope): subject`. Mirrors Cloudinary kit + CutOS convention.

---

## 9. Scope decisions (locked 2026-04-25 after critique)

**Shipping (ranked by criticality):**
1. The **page-crumple → 3D canvas hook** (the first 30 seconds of the demo). This is the visual that wins the room.
2. **One complete cinematic playing on stage**, end-to-end (master prompt → 5 trailer beats → Cloudinary `fl_splice` URL).
3. **Trailer mode only.** 5 flat beats. No recursion.
4. **Provider tiering** (higgsfield / kling / cached) so the live render survives whatever Sunday throws at us.
5. **Cinematography moat** — the agent asks directorial questions (lens, movement, light, blocking, pace), not generic ones. See `BeatArchetype.directorNotes` in `frontend/src/lib/beat-templates.ts`.

**Explicitly cut:**
- **Recursive nodes** — too risky for 36-hour scope. Flat 5-beat trailer only.
- **Feature mode** in the live demo — schema exists, but we don't demo it.
- **CutOS handoff** as core flow — only implement if endpoint lands by Sunday noon. Otherwise: pitch as roadmap.
- **ElevenLabs dubbing** as core flow — same as CutOS handoff: only if free.
- **Multi-user / auth / persistence beyond localStorage**.
- **Mobile / responsive** — desktop-only at MVP.

**Still open (need team confirmation):**
1. **Higgsfield API auth** — do we have keys? If not, secure them ASAP. Live demo can run on `kling` or `cached` tier without them.
2. **Cloudinary cloud name / upload preset** — whoever sets up the free-tier account fills `cloud_name` + `upload_preset` in `frontend/.env`.
3. **Demo project prompt** — confirm `DEMO_PROMPT` in `frontend/src/lib/demo-project.ts` Saturday before rendering.

---

## 10. Changelog

- **2026-04-25** — Doc seeded; market validated; competitor scan complete; stack chosen; **track decided (Flicker to Flow + Cloudinary)**; CutOS recon complete (Next.js 16 / React 19.2 / Supabase / Kling-ElevenLabs-TwelveLabs; no Higgsfield, no Cloudinary — those are SceneOS's contribution); FlowBoard reviewed for design inspiration (tldraw + Radix + glassmorphism); Cloudinary `fl_splice` URL-based stitching identified as the stitch engine. Repo layout (`frontend/` + `backend/` + `docs/`) mirrors FlowBoard.
- **2026-04-25 (rev 2)** — Reviewer critique applied. Reframed wedge from "nothing like SceneOS exists" to "first cinematic-theory-as-UI." Added **GENERATION_PROVIDER** dispatch (higgsfield/kling/replicate/cached) so we can flip tiers between recorded demo, live demo, and on-stage cached fallback. Added rich `directorNotes` to every beat archetype (lens, movement, light, blocking, pace) — this is the moat. Cut recursive nodes and feature-mode demo from scope. Locked happy path on trailer mode only.
