# SceneOS — STATE

> **The day-2 operational dashboard.** Single source of truth. Open it every morning. CONTEXT.md = vision; BACKEND_ARCHITECTURE.md = legacy design spec; **this file = "where am I right now and what do I do next."**
>
> Last updated: 2026-04-25. Deadline: 2026-04-26 11:00am EDT.

---

## 0. The actual product, in one paragraph

A user types a one-line idea — *"a monkey steals a banana from a zoo"* — and clicks Begin. SceneOS opens an agentic chat. A director-voice AI quietly walks them through the canonical 7-beat dramatic arc (hook, exposition, inciting incident, rising action, climax, falling action, resolution) by asking 3-5 questions per beat. **Each question comes with 3 AI-generated suggested answers** — the user can click one, edit one, or type their own. The user never sees the structure. They feel like they're just telling someone their movie.

After each beat, the agent calls `markSufficient` and hands off a structured `beatFacts` object — *not* a freeform prompt — to a **deterministic pipeline** that runs without the LLM in the loop:
1. Maps mood + archetype → motion preset (deterministic table)
2. Generates a character reference image (T2I)
3. Generates a location reference image (T2I)
4. Decides chain-from-previous vs hard cut (deterministic, based on beat archetype)
5. Submits to the active video provider (Veo3 or Higgsfield)

The 7 clips render — sequential where chained, parallel where not. They stitch via Cloudinary `fl_splice`. An optional final agentic editing pass adds music/captions/grading. Export.

**The wedge:** the agent is contained to conversation. The pipeline is deterministic. The user experiences a film director asking smart questions. The system experiences a structured fact-extraction loop driving a queue.

---

## 1. The pipeline, end-to-end, with module ownership

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 0  BOOT                                                            │
│  Frontend creates Manifest from masterPrompt + videoType=story.          │
│  Spawns 7 pending story.* beats from beat_templates.STORY.               │
│  Optionally calls /api/decompose to seed continuity bible (NOT needed    │
│  for the agent path — only used as a fallback if the agent loop fails).  │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1  AGENT — AI Q&A LOOP   ← THE CORE. Owns: agent.py.              │
│                                                                          │
│  LLM: Gemini 2.5 Flash via Vertex AI (genai_client.py).                 │
│  Auth: GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS. No keys to   │
│        juggle — same GCP service account as Veo and Imagen.             │
│                                                                          │
│  For each beat, repeat:                                                  │
│   POST /api/agent { manifest, beatId, userMessage? }                    │
│     → askQuestion(question, suggestedAnswers[3], reasoning, est)        │
│        OR                                                                │
│     → markSufficient(refinedPrompt, sceneSummary, beatFacts, duration) │
│                                                                          │
│  Voice: see agent.py system prompt — encoded from the framework spec.   │
│  Min 3 / max 5 user turns per beat.                                     │
│  Agent never reveals which beat it's filling. Maps internally.          │
│                                                                          │
│  beatFacts = {                                                           │
│    subject, action, setting, framing, mood,                             │
│    characterDescription, locationDescription                            │
│  }                                                                       │
│  ← This is what the deterministic pipeline consumes. The LLM is done.   │
└────────┬─────────────────────────────────────────────────────────────────┘
         │ markSufficient → beatFacts handed off
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 2  ORCHESTRATOR — DETERMINISTIC PIPELINE  ← To build. orchestrator.py │
│                                                                          │
│  Input: beat + beatFacts                                                 │
│  Steps (no LLM in the loop):                                             │
│   1. Pick motion preset from mood + archetype (lookup table)            │
│   2. Decide chainFromPrevious (deterministic — see Beat archetype)      │
│   3. If !chained or first beat: generate character ref image (T2I)      │
│   4. If !chained or first beat: generate location ref image (T2I)       │
│   5. Compose final clipPrompt { imagePrompt, motionPrompt, ... }        │
│   6. Submit /api/generate with startImageUrl from prev lastFrameUrl     │
│      OR generated character/location ref                                │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3  REFERENCE IMAGES   ← Owns: vertex_imagen.py (NEW) + signed upload │
│                                                                          │
│   POST /api/references/generate { kind: "character"|"location", ... }   │
│     → Vertex Imagen 3 / fal Flux / Higgsfield Soul                      │
│     → Returns image URL (uploaded to Cloudinary for stable public_id)   │
│                                                                          │
│   POST /api/cloudinary/sign  ← already exists. Frontend can also drag-  │
│     drop user-supplied character/location refs.                         │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 4  VIDEO GENERATION   ← Owns: provider.py + vertex_veo.py + higgsfield.py + fal.py │
│                                                                          │
│   POST /api/generate { refinedPrompt, startImageUrl?, clipPrompt? }     │
│     → Active provider (env GENERATION_PROVIDER): vertex / higgsfield /  │
│       fal / kling / replicate / cached                                  │
│     → Returns jobId. Frontend polls /api/status.                        │
│                                                                          │
│   GET /api/status/:jobId                                                 │
│     → Returns clipUrl + clipPublicId + lastFrameUrl on success          │
│       (lastFrameUrl extracted via Cloudinary so_-0.1)                   │
│                                                                          │
│   Async via asyncio.create_task() (already in fal.py + vertex_veo.py).  │
│   Concurrency where chainFromPrevious=false, sequential where true.     │
│   Celery+Redis upgrade is post-hackathon.                                │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 5  CHAIN     ← Owns: cloudinary.py last_frame_url() + frontend   │
│                                                                          │
│   When clip i succeeds: lastFrameUrl extracted.                         │
│   If beat i+1 chainFromPrevious !== false: nextScene.seedImageUrl =     │
│     prevScene.lastFrameUrl. Provider uses it as I2V seed.               │
│                                                                          │
│   Hard cuts (chainFromPrevious=false): no seed propagation. The         │
│   character image gen gives the next beat its own keyframe.             │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 6  STITCH    ← Owns: cloudinary.py build_splice_url()             │
│                                                                          │
│   POST /api/stitch/url { manifest, audioPublicId?, colorGrade? }        │
│     → fl_splice URL: all approved beats concatenated, per-beat color    │
│       graded, audio overlay. Single CDN URL. No server-side concat job. │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 7  AGENTIC EDIT  ← To build. editor.py (stretch)                  │
│                                                                          │
│   Optional final pass: agent picks music, suggests trims, adds          │
│   captions. Or POST /api/cutos/import for power-user editing.           │
│                                                                          │
│   For hackathon scope: cosmetic. The fl_splice URL from Stage 6 is     │
│   already a finished cinematic.                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The agent voice — non-negotiable spec

**Source:** the framework you wrote ("SceneOS Agent Question Framework"). Encoded verbatim in `agent.py:_system_prompt()`.

**Hard rules (the agent ALWAYS):**
- Reflects the story so far back to the user before asking anything new.
- Asks the most charged, naturally curious thing about the premise — what *anyone* would want to know next, not what the structure needs.
- Asks one thing at a time.
- Provides exactly 3 suggested answers per question, covering meaningfully different directions.
- Stops at 3-5 questions per beat. Never extends.
- Maps internally; never reveals "now we're at the inciting incident" or "for the hook of your story."

**Hard rules (the agent NEVER):**
- Em dashes. Lowercase affectation. Ellipses for affect.
- Performed enthusiasm: "Great choice!" / "Interesting!" / "I love that!"
- Abstract questions: "What tone?" / "What genre?" / "How should the audience feel?"
- Asks the user to invent things they haven't already thought about.
- Asks more than one thing per question.
- Generates suggested answers that are minor variations of the same direction.

**Suggested-answer quality bar:**
> Bad: ["He starts to feel guilty", "He feels bad about it", "He has remorse"]
> Good: ["He genuinely starts to love them, which is the problem", "He tells himself it's just the job but it's clearly becoming something more", "He doesn't feel anything for them, he's just trapped by circumstances"]

Each suggestion implies a different movie. That's the test.

---

## 3. The 7-beat structure (story.* template)

Stored in `beat_templates.STORY`. This is the canonical path for the demo.

| # | Template | Beat | Intent | Mood | Duration |
|---|---|---|---|---|---|
| 1 | `story.hook` | Hook | Establish the false equilibrium. The premise. | intimate-hook | 5s |
| 2 | `story.exposition` | Exposition | Establish the world, the protagonist, what they want. | wide-establish | 8s |
| 3 | `story.inciting` | Inciting Incident | The disruption. The protagonist must act. | intimate-hook | 6s |
| 4 | `story.rising` | Rising Action | Stakes escalate. Obstacles compound. | kinetic-rising | 10s |
| 5 | `story.climax` | Climax | The apex. The dramatic question is answered. | tense-climax | 8s |
| 6 | `story.falling` | Falling Action | The aftermath. Consequences land. | still-resolve | 6s |
| 7 | `story.resolution` | Resolution | The new normal. Last frame is the emotional register. | still-resolve | 5s |

Total ~48s. Existing trailer (5-beat) and short (3-beat) templates remain available; story.* is now the default.

---

## 4. Manifest schema additions

Five additive fields (no removals, no breaking changes):

```ts
interface Beat {
  // ...existing fields
  chainFromPrevious?: boolean;   // default true. false = hard cut, no seed.
  referenceImageUrl?: string;    // user-uploaded OR pipeline-generated.
}

interface Scene {
  // ...existing fields
  seedImageUrl?: string;         // input: I2V keyframe.
  lastFrameUrl?: string;         // output: extracted on clip success.
  clipPrompt?: HiggsfieldClipPrompt;  // already in SHARED_TYPES.md, missing from manifest.ts.
  beatFacts?: {                  // NEW — what the agent extracted at markSufficient.
    subject: string;
    action: string;
    setting: string;
    framing?: string;
    mood: string;
    characterDescription?: string;
    locationDescription?: string;
  };
}
```

The `beatFacts` field is what the **deterministic pipeline reads**. Without it, the orchestrator has nothing to dispatch on. This is why the agent's `markSufficient` tool was extended to emit it.

---

## 5. API surface — current + planned

### Current (8 routes, all functional):
| # | Endpoint | Status | Notes |
|---|---|---|---|
| 1 | `GET  /api/health` | ✅ | Liveness + mock probe. |
| 2 | `POST /api/decompose` | ✅ | Master prompt → all-beats clipPrompts. Optional fallback. |
| 3 | `POST /api/agent` | 🟡 → ✅ this turn | **Now emits suggestedAnswers + beatFacts.** |
| 4 | `POST /api/generate` | 🟡 | startImageUrl is in type but only fal honors it. Veo + Higgsfield need wiring. |
| 5 | `GET  /api/status/:jobId` | 🟡 | Doesn't return lastFrameUrl yet. |
| 6 | `POST /api/stitch/url` | ✅ | fl_splice URL builder. |
| 7 | `POST /api/cloudinary/sign` | ✅ | Signed upload params. |
| 8 | `POST /api/cutos/import` | ✅ | CutOS handoff. |

### Planned (orchestrator + reference gen):
| # | Endpoint | Owner | Notes |
|---|---|---|---|
| 9 | `POST /api/references/generate` | NEW: `vertex_imagen.py` | Generates character or location ref via T2I. |
| 10 | `POST /api/orchestrate/:beatId` | NEW: `orchestrator.py` | Reads beatFacts, runs deterministic pipeline, kicks off /api/generate. |
| 11 | `POST /api/edit/finalize` | NEW: `editor.py` (stretch) | Agentic edit pass — music, captions, grading hints. |

**Endpoints we are NOT adding:**
- ~~`/api/projects`~~ — manifest is client-side, backend stateless.
- ~~`/api/canvas/nodes`~~ — canvas state = manifest.
- ~~`/api/edit/apply`~~ — Cloudinary URL transforms are pure-client (`frontend/src/lib/cloudinary-transforms.ts`).

---

## 6. The DEFINITION OF DONE

Demo-ready means **all of the following** are true:

1. ✅ Backend running real (not mock). `GENERATION_PROVIDER=vertex` or `higgsfield`.
2. 🟡 mock_frontend visualizes the agent loop end-to-end. Master prompt → 7 beats → 3-5 questions/beat → 3 suggested answers/question → markSufficient → beatFacts logged.
3. 🔴 Real frontend (Alex) consumes the new agent shape (suggestedAnswers + beatFacts). **You are NOT doing this — you are not touching the real frontend.**
4. 🔴 Orchestrator runs deterministic pipeline per beat: motion preset + char/location refs + video gen submission.
5. 🔴 Last-frame extraction wired in cloudinary.py + status handler.
6. 🔴 startImageUrl wired into vertex_veo.py + higgsfield.py (fal.py done).
7. 🔴 Reference image gen (Vertex Imagen 3) at `/api/references/generate`.
8. 🔴 Cached safety-net: render the demo project Saturday night with real providers, paste public_ids into cached.py.
9. 🔴 Practiced demo path under 4 minutes, 5 times.

After (1)+(2) ship this turn, the agent is verifiable. Items 3-9 are concrete next steps with clear handoffs.

---

## 7. KANBAN

### ✅ Done before this turn

- FastAPI app, 8 routes, error envelope.
- Mock mode auto-default.
- Anthropic agent tool-loop (askQuestion / markSufficient) with stub fallback.
- Sufficiency facet scorer.
- Anthropic decompose with stub fallback.
- Provider abstraction (vertex / higgsfield / fal / kling / replicate / cached).
- Vertex Veo provider (predict + poll + base64 → Cloudinary).
- Higgsfield T2I → I2V → Cloudinary.
- fal.ai LTX-Video — **already chains via startImageUrl**.
- Cloudinary fl_splice + per-beat color grade + signed upload.
- CutOS handoff.
- Tests: agent eval, API contract, FE flow, real smoke.
- Real frontend: canvas + drawer + agent bubble + generation panel.
- All ENV plumbing for keys.

### ✅ Done this turn

- **`STATE.md` rewritten** to reflect the canonical 7-beat / deterministic-pipeline architecture.
- **`beat_templates.STORY`** — 7-beat dramatic arc added alongside trailer/short/feature.
- **`agent.py` rewritten** with the framework voice spec, suggestedAnswers, and beatFacts extraction. **LLM is Gemini 2.5 Flash via Vertex AI** (`genai_client.py`) — uses the same GCP creds as Veo/Imagen. No Anthropic key required for the agent.
- **`mock.py`** updated with story.* questions + suggested-answer mocks.
- **`mock_frontend/index.html`** — single-file standalone visualization. Open in a browser, point at localhost:8787, watch the agent ask questions with chip-style suggested answers.
- **`SHARED_TYPES.md`** updated (additive) for suggestedAnswers + beatFacts.
- `sufficiency.py` MIN_USER_TURNS bumped to 3, MAX_QUESTIONS to 5.

### 🔴 Next up — module by module

**Module A: Last-frame + chain wiring (~1 hr)**
- `cloudinary.py:last_frame_url(public_id)` returns `https://res.cloudinary.com/{CLOUD}/video/upload/so_-0.1/{public_id}.jpg`.
- `app.py` /api/status: include `lastFrameUrl` in succeeded response.
- `vertex_veo.py:generate()`: when `params["startImageUrl"]`, fetch URL → base64 → add to predict body's `instances[0].image`.
- `higgsfield.py:generate()`: when `params["startImageUrl"]`, skip T2I stage, post directly to I2V with that image_url.

**Module B: Reference image generator (~1.5 hr)**
- New file `vertex_imagen.py` — Vertex AI Imagen 3 client using same SA auth as Veo.
- New endpoint `POST /api/references/generate` accepts `{ kind: "character" | "location", description, projectId, beatId }`.
- Returns `{ imageUrl, publicId }` (uploaded to Cloudinary for stable public_id).
- Defer fal Flux + Higgsfield Soul as alternate providers.

**Module C: Orchestrator (~2 hr)**
- New file `orchestrator.py` exposing `run_beat_pipeline(beat, beatFacts) -> { sceneId, jobId }`.
- Step 1: motion-preset lookup from `(mood, archetype)` — pure function.
- Step 2: chainFromPrevious lookup from beat archetype (story.hook=false, story.exposition=true, etc).
- Step 3: if !chained, call `references.generate(character)` and `references.generate(location)`.
- Step 4: compose `clipPrompt`.
- Step 5: call `provider.generate(...)`.
- Frontend triggers via new `POST /api/orchestrate/:beatId` (or inlines the steps).

**Module D: Demo project bake (~1 hr)**
- Run the full pipeline against ONE master prompt with real providers.
- Capture all 7 clip publicIds.
- Hardcode into `cached.py` so the on-stage safety net replays the same demo instantly.

**Module E: Editing pass (stretch)**
- Music selection (canned library for hackathon scope).
- Caption overlays via `l_text:`.
- Final color grade pass.
- All Cloudinary URL-only — no server-side render.

### 🟡 In progress (across project)

- Real frontend (Alex) has the canvas + drawer + agent bubble shell but doesn't yet consume `suggestedAnswers` or `beatFacts`. Hand him SHARED_TYPES.md after this turn.
- `decompose.py` still references the trailer-style mood cues. Works fine for trailer template; for story.* path, the orchestrator's deterministic clipPrompt composer takes over and decompose becomes a fallback.

### 🧊 Cut for hackathon scope (revisit post-LA Hacks)

- Celery + Redis. asyncio.create_task() suffices for single-process FastAPI.
- Multi-user / auth / persistence beyond localStorage.
- LangGraph migration of the agent. Per-turn tool loop is fine; LangGraph adds value when you want multi-agent or visual graph debugging, neither needed for demo.
- Recursive scenes inside a beat.
- Mobile / responsive.
- Audio generation (ElevenLabs). Pre-record VO if needed.
- True parallel video generation across processes. asyncio gives concurrency-on-one-thread, which is enough.

---

## 8. File ownership tree

| Layer | File | Owns | Status |
|---|---|---|---|
| **Routes** | `app.py` | HTTP surface, error envelope, mock-mode branching. | ✅ |
| **Agent** | `agent.py` | Per-turn askQuestion / markSufficient with suggestedAnswers + beatFacts. The voice. **Gemini via Vertex.** | ✅ this turn |
| | `genai_client.py` | `make_genai_client()` for Gemini via Vertex AI. Defaults: `gemini-2.5-flash` for agent, `gemini-2.5-pro` for decompose. | ✅ this turn |
| | `sufficiency.py` | Facet coverage scoring. MIN=3, MAX=5. | ✅ this turn |
| | `beat_templates.py` | TRAILER + SHORT + FEATURE + **STORY** archetype lists. | ✅ this turn |
| **Decompose** | `decompose.py` | Master → all-beats clipPrompts (one-shot LLM with stub fallback). Used as fallback path. | ✅ |
| | `anthropic_client.py` | Direct API vs Vertex routing. | ✅ |
| **Orchestrator** | `orchestrator.py` | **NEW.** beatFacts → motion preset + refs + clipPrompt + /api/generate dispatch. | 🔴 |
| **References** | `vertex_imagen.py` | **NEW.** Vertex Imagen 3 T2I for character + location refs. | 🔴 |
| **Providers** | `provider.py` | Universal ProviderModule + dispatcher. | ✅ |
| | `vertex_veo.py` | Vertex Veo 2/3. **Needs startImageUrl wiring.** | 🟡 |
| | `higgsfield.py` | T2I→I2V→Cloudinary. **Needs startImageUrl shortcut.** | 🟡 |
| | `fal.py` | LTX-Video. Already chains. | ✅ |
| | `kling.py`, `replicate.py` | Stubs. | 🧊 |
| | `cached.py` | On-stage safety net. **Bake the demo project here.** | 🔴 |
| | `mock.py` | Deterministic mock data. **suggestedAnswers added.** | ✅ this turn |
| **Media** | `cloudinary.py` | fl_splice URL + color grade + signed upload. **Needs last_frame_url().** | 🟡 |
| **State** | `jobs.py` | In-memory Higgsfield job registry. | ✅ |
| | `config.py` | env loader, mock_mode probe. | ✅ |
| **Editor** | `editor.py` | **NEW (stretch).** Agentic final pass: music + captions + grade. | 🔴 |
| **Visualize** | `mock_frontend/index.html` | **NEW.** Standalone agent-loop visualizer. Don't touch real frontend. | ✅ this turn |

---

## 9. How to use mock_frontend

```bash
# Terminal 1: run the backend in mock mode (no API keys needed).
cd backend_py
MOCK_MODE=true uvicorn sceneos_py.app:app --reload --port 8787

# Terminal 2: open mock_frontend in a browser.
open mock_frontend/index.html        # macOS
# or just double-click the file. No build step. No npm install. No server.
```

What you'll see:
- Master prompt input at the top.
- 7 nodes in a horizontal strip: hook → exposition → inciting → rising → climax → falling → resolution. Active one glows.
- Conversation panel: agent bubble (with character-by-character feel) → user bubble.
- Below the latest agent question: 3 suggested-answer chips + a free-text input.
- Right rail: structured beatFacts as the agent extracts them. **You** can see the structure even though the user wouldn't.
- When markSufficient fires for a beat, it visually completes (green tick), the next beat activates, the conversation continues.

To test against real Anthropic (not mock):
```bash
# Terminal 1
cd backend_py
ANTHROPIC_API_KEY=<your-key> uvicorn sceneos_py.app:app --reload --port 8787
# (or set ANTHROPIC_USE_VERTEX=true + GCP_PROJECT_ID for Vertex.)
```

mock_frontend doesn't change. It just hits /api/agent.

---

## 10. The honest priority order for the next 12 hours

```
NOW            Verify mock_frontend renders the agent loop end-to-end. Type a master
               prompt, click Begin, answer 3 questions, watch the next node activate.
               This is the proof the agent works.

HOUR 0-1       Module A: last-frame + chain wiring. Three files, ~30 lines.
               After: fal already chains, Veo + Higgsfield now also chain.

HOUR 1-2.5     Module B: vertex_imagen.py + /api/references/generate.
               After: character + location refs are programmatic.

HOUR 2.5-4.5   Module C: orchestrator.py.
               After: agent calls markSufficient → orchestrator dispatches everything
               deterministically. Demo path is conceptually closed.

HOUR 4.5-5.5   Module D: bake the demo project. Render all 7 beats with real Vertex
               or Higgsfield. Paste public_ids into cached.py.

HOUR 5.5-7     Hand SHARED_TYPES.md to Alex. He wires the real frontend to consume
               suggestedAnswers + beatFacts. (Not your work — your work is plumbing.)

HOUR 7-9       Practice the demo. Time it. Sub-4-minutes is the bar.

HOUR 9-10      Stretch: editor.py for the final agentic pass, OR rest.

HOUR 10-12     Sleep.
```

If a step takes more than 2x its budget: scope-cut to the cached tier and ship.

---

## 11. What you stopped needing to worry about

- Migrating backend back to TS. **No.** The Python port is done.
- LangGraph rewrite. The per-turn tool loop is the right shape.
- Celery + Redis. asyncio gives concurrency on a single FastAPI process. That's enough for 7 sequential beats with optional concurrent non-chained branches.
- Adding a database. Manifest is client-side, jobs are in-memory.
- Touching the real frontend. Alex's domain.
- Whether the agent system prompt is "good enough." It now encodes the framework spec verbatim. If it sounds wrong, edit `agent.py:_system_prompt()` directly.

---

## 12. The directives I will resist (because the user said go HAM, not abandon discipline)

These are real temptations under deadline that I will push back on, even when the user is frustrated:

- **Adding endpoints because a feature feels missing.** 80% of the time the existing endpoints + a frontend change cover it. Verify first.
- **Rewriting the agent loop in LangGraph.** Adds complexity, no demo lift.
- **Generating reference images via the LLM agent's tool calls instead of the deterministic orchestrator.** Slower, less reliable, harder to cache. The architecture you arrived at — agent extracts → pipeline runs deterministically — is the correct boundary.
- **Skipping the cached-tier demo bake.** This is your safety net on stage. Do not skip it.
- **Adding ambition AT THE SAME TIME as fixing existing bugs.** Build → demo-test → expand. Not in parallel.

---

## 13. Update protocol

When something ships, edit this file. Move items between Done / In-progress / Next. A stale STATE.md is worse than no STATE.md.

When a teammate joins, hand them this file top to bottom. Five minutes; they're caught up.

When you're confused at 3am: re-read §0, §1, §6. Pick the next 🔴 item. Ship it.
