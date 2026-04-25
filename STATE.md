# SceneOS — STATE

> **The day-2 operational dashboard.** Single source of truth. Open it every morning. CONTEXT.md = vision; BACKEND_ARCHITECTURE.md = legacy design spec; **this file = "where am I right now and what do I do next."**
>
> Last updated: 2026-04-25 (late night) — **live Veo end-to-end verified**, agent question loop loosened. Deadline: 2026-04-26 11:00am EDT.
>
> **What is true right now (verified end-to-end):**
> - **Mock mode: 39 green tests** + clean end-to-end smoke (session/start → agent/stream → orchestrate → status → stitch). Confirmed via direct `curl` against the mock server.
> - **Real mode boot: confirmed.** With the existing `.env` (Vertex + Cloudinary, no Anthropic, no Higgsfield), the backend self-resolves to `mockMode: false` and `GENERATION_PROVIDER=vertex`. `POST /api/session/start {mode:"normal"}` returns a fresh manifest with audio stamped, no provider calls fired (refs are lazy in normal mode).
> - **Real-mode image pipeline: end-to-end verified.** Live `/api/references/generate` produced a real PNG via Vertex Imagen 3 and uploaded to Cloudinary (`dghelx0al`). Vertex auth → Imagen → Cloudinary is hot.
> - **Real-mode video pipeline (Veo): end-to-end verified.** Live `/api/orchestrate/beat-1` against the real `.env` ran: Imagen 3 character ref + Imagen 3 location ref → Cloudinary upload → Veo job submission → polled `/api/status/{jobId}` → `status: succeeded` with a real `clipUrl` + `clipPublicId` + `lastFrameUrl` on the user's Cloudinary cloud. Sample baked clip: `sceneos/4593dc2e942b/beat-1/beat-1-scene-1` (still on Cloudinary). Whole call took ~50s for the orchestrate (most of it Imagen) + ~50s for the Veo job. Pipeline is hot.
> - **Agent question loop: loosened.** Removed the "Aim for 3 to 5" anchor in the system prompt — replaced with "no target number, you decide based on conversation texture" + an explicit anti-pattern block (don't walk facets in order, don't ask about lenses standalone). Normal-mode temperature bumped 0.8 → 1.0 for genuine variety across sessions. Demo mode unchanged (still hard-capped at `DEMO_MAX_QUESTIONS=2`).
> - **Module D (cached.py demo bake): not started.** Single biggest demo-day risk remaining. Now that Veo is verified, this is just a parallel run + manual `cached.py` populate.
> - **Frontend (`/frontend`) modern surface: types + api client shipped.** `frontend/src/lib/api.ts` now exposes `sessionStart`, `sessionGet`, `agentStream`, `orchestrate`, `referenceGenerate`. `frontend/src/types/api.ts` carries the full modern shapes (`BeatFacts`, `OrchestrateResponse`, `SpeculativeJob`, `ProjectRefs`). Teammate can rebuild canvas screens against the same contract `mock_frontend` ships against.

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
│  Question count is non-deterministic (1 to MAX_QUESTIONS=8). The agent  │
│  decides based on conversation texture, not a quota. Demo mode is the   │
│  exception — hard-capped at DEMO_MAX_QUESTIONS=2 for the timer.         │
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

## 5. API surface — current

12 routes, all functional in MOCK_MODE and against real providers when credentials are set.

| # | Endpoint | Status | Notes |
|---|---|---|---|
| 1 | `GET  /api/health` | ✅ | Liveness + mock probe. |
| 2 | `POST /api/decompose` | ✅ | Master prompt → all-beats clipPrompts. Fallback path; story flow uses orchestrator instead. |
| 3 | `POST /api/agent` | ✅ | Emits suggestedAnswers + beatFacts. Mode-aware (demo speed-mode caps at 1-2 questions). |
| 4 | `POST /api/agent/stream` | ✅ | SSE streaming with Gemini 2.5 thinking tokens. |
| 5 | `POST /api/generate` | ✅ | startImageUrl wired in fal + Veo + Higgsfield. |
| 6 | `GET  /api/status/:jobId` | ✅ | Returns lastFrameUrl on success (`so_99p` Cloudinary derivative). |
| 7 | `POST /api/stitch/url` | ✅ | fl_splice URL builder. Reads `manifest.audioPublicId`, falls back to `audio.pick_music`. |
| 8 | `POST /api/cloudinary/sign` | ✅ | Signed upload params. |
| 9 | `POST /api/cutos/import` | ✅ | CutOS handoff. |
| 10 | `POST /api/references/generate` | ✅ | Vertex Imagen 3 character/location T2I. |
| 11 | `POST /api/orchestrate/:beatId` | ✅ | Deterministic pipeline. Speculative-cache hit when /api/session/start primed it. Uses project-level shared refs. |
| 12 | `POST /api/session/start` | ✅ | Mode-aware boot (demo / normal). Auto-picks master prompt + audio + generates shared character + location refs. Demo mode also fans out all 7 video gens speculatively. |

**Stretch (post-LA-Hacks / agentic editing teammate):**
- `POST /api/edit/finalize` — Agentic edit pass: music selection from a richer library, caption overlays, final grade. The agent.py + audio.py primitives already exist; this would compose them.

**Endpoints we are NOT adding:**
- ~~`/api/projects`~~ — manifest is client-side, backend stateless except for short-lived `_SESSIONS`.
- ~~`/api/canvas/nodes`~~ — canvas state = manifest.
- ~~`/api/edit/apply`~~ — Cloudinary URL transforms are pure-client.

---

## 6. The DEFINITION OF DONE

Demo-ready means **all of the following** are true:

1. ✅ Backend running real (not mock). `GENERATION_PROVIDER=vertex` or `higgsfield`. (Plumbing complete — needs to be turned on for the demo bake.)
2. ✅ mock_frontend visualizes the entire pipeline end-to-end. Mode picker → 7 beats with shared character + location refs → questions + suggested answers → markSufficient → orchestrate (cache-hit in demo) → status polls → auto-stitch with audio overlay → playable final cut inline.
3. 🟡 Real frontend consumes `suggestedAnswers` + `beatFacts` + new `/api/session/start` shape. **Teammate's domain.** Backend hands off SHARED_TYPES.md.
4. ✅ Orchestrator runs deterministic pipeline per beat: motion preset + project-level shared char/location refs + framing-routed I2V seed + video gen submission.
5. ✅ Last-frame extraction wired in cloudinary.py + status handler (`so_99p`).
6. ✅ startImageUrl wired into vertex_veo.py + higgsfield.py (fal.py already chained).
7. ✅ Reference image gen (Vertex Imagen 3) at `/api/references/generate` AND `vertex_imagen.generate_project_refs()` for the once-per-project shared anchors.
8. ✅ Audio module: `audio.pick_music(videoType, mood)` + `audio.synthesize_narration(text)` (ElevenLabs, opt-in). Manifest auto-stamps `audioPublicId`. Stitch URL includes `l_audio:` overlay.
9. 🔴 Cached safety-net (Module D): render the demo project against real providers (Vertex + Imagen + Veo or Higgsfield), capture all 7 publicIds + the audio publicId, paste into `cached.py` so the on-stage failure mode is "instant replay" not "white screen."
10. 🔴 Practiced demo path under 4 minutes, 5 times.
11. 🟡 Voice narration (optional polish). `audio.synthesize_narration` is wired, ElevenLabs API key + a per-beat narration script need to be assembled. Agent could emit `voiceLine` per beat — see Stretch in §7.

Items 1-8 are SHIPPED. Items 9-10 are wallclock-only (no engineering blockers). Item 11 is genuinely optional for a demo that's already cinematic.

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

### ✅ Done this turn (round 2 — true agentic loop + visualizer overhaul)

- **Streaming agent.** New endpoint `POST /api/agent/stream` returns Server-Sent Events with Gemini 2.5's native thinking tokens. `agent.py:run_agent_turn_streaming()` runs `generate_content_stream` with `thinking_config(include_thoughts=True, thinking_budget=2048)` and yields `{type: "thought" | "text" | "tool_call" | "result" | "error" | "done"}` events. Real verified output: 4 substantive thinking chunks per turn, each visible to the user. (`run_agent_turn` non-streaming kept for tests + back-compat.)
- **Soft caps replace hard gates.** Removed `_forced_followup` and Python-side MIN/MAX enforcement on the live path. The system prompt encodes a 3-5 default with explicit "go shorter if you have it, go to 7 if texture is rich, never exceed 8" guidance. The agent decides. `MAX_QUESTIONS=8` is now a safety ceiling, not a behavior gate.
- **Thinking guidance in the system prompt.** Explicit `# Thinking` section tells the model to: trace facets → identify the most charged unresolved thing → draft and critique the question → decide on stop. Makes the thoughts substantive.
- **mock_frontend overhaul.** Full rewrite. Streams SSE via `fetch + ReadableStream`. Live cyan thinking panel that streams character-by-character with thought-fade-in animation. Typewriter on the question (22ms/char). Suggestion chips slide up in stagger. beatFacts cards populate one-at-a-time when markSufficient fires. Aurora-pulse background while thinking. JetBrains Mono for thoughts. Inter for everything else. Beat-strip glow animation on active node.
- **Mock-mode streaming parity.** `mock.run_mock_agent_streaming()` synthesizes thinking events around the canned result so the visualizer feels alive even without GCP creds.

### ✅ Done this turn (round 3 — demo/normal mode + shared refs + audio + auto-stitch)

**The core demo/normal mode split.** Two fundamentally different timing budgets, one shared backend.
- New `POST /api/session/start { mode: "demo" | "normal", promptId?, masterPromptOverride?, aspectRatio? }`.
- New `session.py` module with in-memory `_SESSIONS` + `_SPECULATIVE` stores keyed by `projectId` (12-char hex).
- New `demo_prompts.py` with 3 curated demo prompts (`monkey-banana`, `lighthouse-ship`, `drone-mall`) and 5 normal prompts. Demo prompts ship pre-curated `beatFactsByTemplate` for all 7 story beats with HAND-TUNED Imagen-quality character + location descriptions.
- Auto-selection: the system picks the master prompt; the user picks the mode. Override available via `masterPromptOverride`.

**Speculative kickoff (demo mode only).** The "how we hit 3-4 minutes" trick.
- At session start: 1 character ref + 1 location ref generated in parallel (~5-8s). Then all 7 beat pipelines fan out in parallel via `asyncio.gather` (~60-100s).
- The agent conversation runs in parallel as theatre. Demo speed-mode caps user turns at 1-2 per beat (`agent.py: DEMO_MAX_QUESTIONS=2`, `THINKING_BUDGET_DEMO=512`, dynamic system-prompt block instructing terseness).
- When the agent eventually calls `markSufficient`, the orchestrate route returns the cached job in O(1) — `speculativeReused: true`. Total wall-clock is dominated by provider time, not orchestration time.

**Project-level shared refs (THE visual-continuity fix).** Without this, each beat regenerates its own Imagen character + location → 7 different chimps, 7 different lighthouses. The most-noticed-by-humans correctness bug.
- `vertex_imagen.generate_project_refs(project_id, character_description, location_description)` generates ONE character ref + ONE location ref per project, in parallel.
- Orchestrator's seed-priority order is now: `project_refs > previous lastFrameUrl > fresh per-beat Imagen` (last is fallback only).
- Framing-aware seed routing: wide / establish / locked-off framings → location ref; close / medium / handheld / push-in → character ref. Both refs are still surfaced in the response so the visualizer + downstream consumers can render either.
- Demo mode: refs generated upfront at `/api/session/start`. Normal mode: refs generated lazily on the first `markSufficient` that ships descriptions, then cached project-wide via `session.ensure_project_refs()`. Subsequent beats reuse — same character, same world, every clip.
- Result: across all 7 speculative jobs, `characterRef.publicId` and `locationRef.publicId` are IDENTICAL. Verified in tests + live smoke.

**Audio module (`audio.py`).**
- `pick_music(videoType, mood)` — deterministic selection from a curated library, override-able via `SCENEOS_MUSIC_LIBRARY` env JSON. Default library uses `sceneos/audio/<id>` Cloudinary public_ids that customers can drop their own audio into.
- `synthesize_narration(text)` — ElevenLabs TTS → Cloudinary upload via new `cloudinary.upload_audio_from_bytes`. Auto-skipped when `ELEVEN_LABS_API_KEY` isn't set so demos don't break.
- `manifest.audioPublicId` is auto-stamped at session start (BOTH modes). `/api/stitch/url` reads it (or honors body override) so the final splice URL includes the `l_audio:<publicId>` overlay.

**Auto-stitch in mock_frontend.**
- New "Project refs" panel under the loop renders the shared character + location anchors so the user can see the visual-continuity contract.
- New "Final cut" panel — the moment all 7 beats land a `clipPublicId` (via either the speculative poller in demo mode OR the agent → orchestrate → status path in normal mode), the frontend POSTs `/api/stitch/url` automatically and renders the resulting MP4 inline with audio metadata + a Cloudinary deep link.
- Mode badge (DEMO / NORMAL) in the header. Demo timer (mm:ss countdown) live in the header during demo mode.

**Tests: 30 green** (was 22). New coverage:
- `test_session.py`: 8 tests including `test_demo_session_returns_shared_project_refs` (asserts publicId equality across all 7 beats), `test_demo_session_stamps_audio_on_manifest`, `test_orchestrate_normal_mode_lazily_generates_shared_refs` (drift-protection assertion).
- `test_audio_and_stitch.py`: 5 tests including `test_full_demo_flow_stitches_with_audio` (full session → poll-to-succeeded → stitch round trip; asserts the `l_audio:` segment is in the splice URL) and `test_pick_music_respects_env_override`.

**Live end-to-end smoke (Mock mode, no provider needed):**
1. `POST /api/session/start {"mode":"demo"}` → 7 speculative jobs + projectRefs + audioPublicId
2. Agent walks all 7 beats; every `/api/orchestrate` returns `speculativeReused: true`
3. `/api/status` polls drive every job to `succeeded` with `clipPublicId` + `lastFrameUrl`
4. `/api/stitch/url` returns a final URL with `l_audio:` overlay
5. Visual continuity asserted: 1 unique character publicId + 1 unique location publicId across all 7 clips.

### ✅ Modules A, B, C — done & verified live

**Module A: Last-frame + chain wiring** ✅
- `cloudinary.last_frame_url(public_id)` returns `…/so_99p/<public_id>.jpg` (99% time mark — reliable last-frame derivative).
- `/api/status` includes `lastFrameUrl` when status=succeeded AND clipPublicId is set (both mock branch and real-provider branch).
- `vertex_veo.generate()` fetches `startImageUrl` → base64 → adds to `instances[0].image` (Veo I2V mode).
- `higgsfield.generate()` skips T2I entirely when `startImageUrl` is set; goes straight to I2V with that image_url.
- `fal.py` already honored startImageUrl — no change.
- Cloudinary creds resolver now parses `CLOUDINARY_URL` combined form (`cloudinary://key:secret@cloud`) as a fallback for `CLOUDINARY_CLOUD_NAME`.

**Module B: Reference image generator** ✅
- New `vertex_imagen.py` — Vertex AI Imagen 3 (`imagen-3.0-generate-002`). Same SA auth as Veo + Gemini. Stylizes prompts per kind (`character` adds 35mm reference framing; `location` adds 24mm establishing shot).
- New endpoint `POST /api/references/generate` accepts `{ kind, description, projectId?, beatId?, aspectRatio? }` → uploads to Cloudinary at `sceneos/{projectId}/refs/{beatId}/{kind}` → returns `{ imageUrl, publicId, kind, prompt }`.
- Mock-mode short-circuits to a Cloudinary demo asset.
- New `cloudinary.upload_image_from_bytes()` accepts raw bytes (Imagen → data URI → Cloudinary).
- Live verified: chimpanzee character ref generated and uploaded to user's Cloudinary cloud.

**Module C: Orchestrator** ✅
- New `motion_presets.py` — extracted mood→cinematography table (lens, lighting, composition, camera move, pace, atmosphere) shared with decompose.
- New `orchestrator.py` — `run_beat_pipeline(manifest, beat_id, beat_facts, previous_last_frame_url?)`. Pure deterministic dispatcher: motion preset lookup → chain decision → reference image gen (when not chained or first beat) → clipPrompt composition → provider.generate() with seedImageUrl. Returns `{ sceneId, jobId, provider, chainFromPrevious, seedImageUrl, characterRef, locationRef, motionPreset, clipPrompt, refinedPrompt }`.
- New endpoint `POST /api/orchestrate/{beat_id}` mirrors the function signature. Mock branch returns deterministic stub.
- Tests cover: first-beat-no-chain (fresh refs path), subsequent-beat-with-chain (seeded from prev frame), hard-cut-overrides-chain (explicit `Beat.chainFromPrevious=false`).

**Bonus: visualizer extended**
- `mock_frontend/index.html` now calls `/api/orchestrate` after `markSufficient` and renders a "pipeline dispatch" panel with: chain-or-cut tag, character + location reference image thumbnails, motion preset (lens/lighting/cameraMove/pace), provider jobId. Polls `/api/status` for up to 8 seconds to capture `lastFrameUrl` for the next beat (chain primitive). Watch the full pipeline live.

### ✅ Done this turn (round 4 — real-mode boot audit + reliability)

**Module H: Real-mode boot defects, fixed.** Three latent bugs were silently forcing the system into mock mode even when the user had every credential set:
1. `config.mock_mode()` was Anthropic/Higgsfield-aware only. It now treats Vertex (`GOOGLE_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS`) + Cloudinary as a complete real-mode auth path. Result: setting `GENERATION_PROVIDER=vertex` with the `.env` already in place lights up real mode automatically.
2. `vertex_veo._read_config()` was reading `GCP_PROJECT_ID` only, but the `.env` ships `GOOGLE_PROJECT_ID`. Aliased both. Same fix on `GCP_VEO_LOCATION` ↔ `GOOGLE_CLOUD_LOCATION`. Same fix in `anthropic_client.py`.
3. `provider.active_provider_name()` defaulted to `higgsfield`. Switched to a Vertex-preferring resolver: if `GENERATION_PROVIDER` is unset BUT GCP creds are present, default to `vertex`; otherwise `cached` (so unsupervised real-mode boots can never crash on the first generate call).

**Module I: Resilience pass.**
- **Provider auto-fallback to `cached`.** New `_dispatch_with_fallback()` in `provider.py`. When the active provider fails to submit, the orchestrator + `/api/generate` automatically swap in the cached tier (if any clip is baked) and surface `provider: "cached"` + `fallbackReason: <error>` to the frontend. Result: a 502 from Veo on stage = "instant replay clip" instead of "white screen."
- **Speculative-kickoff timeout.** `session.kickoff_speculative_pipelines` now wraps the Imagen call + 7-way `asyncio.gather` in `asyncio.wait_for(timeout=90s)`. If anything hangs, `session/start` still returns within ~90s with whatever made it; the visualizer sees `error: timeout` on individual beats instead of a hung tab.
- **Graceful Imagen safety filter.** `vertex_imagen.generate_reference()` catches the empty-images case and falls back to the Cloudinary stub asset (logged warning, never raises). Demo continues even when Imagen blocks the prompt.

**Module J: Frontend handoff surface.**
- `docs/SHARED_TYPES.md` updated: full session/start request/response, agent/stream SSE event shape, orchestrate response (sharedRefs + projectRefs), audioPublicId on stitch response.
- `frontend/src/types/api.ts` extended with the modern types.
- `frontend/src/lib/api.ts` extended with `session.start`, `agent.stream`, `orchestrate`, `references.generate` — the teammate can now rebuild the canvas screens against the same contract `mock_frontend` ships against.
- `GET /api/session/{projectId}` added so a frontend refresh / late-joining client can reconcile its in-memory state with the backend's `_SESSIONS` cache without re-priming.

**Tests: 39 green** (was 30). Net new coverage in `tests/test_resilience.py`:
- pins the new `mock_mode()` Vertex-aware branch (3 cases: real-mode resolves, missing video provider stays mock, explicit override wins).
- pins `active_provider_name()` Vertex-default fallback (3 cases: GCP creds present → `vertex`, no creds → `cached`, explicit env var still wins).
- simulates a primary-provider failure and asserts `dispatch_with_fallback()` swaps in the cached tier with `originalProvider` + `fallbackReason` set.
- pins `GET /api/session/{projectId}` happy path (cached manifest + projectRefs + speculativeJobs returned) and 404 path.

**Real-mode end-to-end verification (live calls, all green this turn):**
- `GET /api/health` → `{"mockMode":false}` with the existing `.env` (no MOCK_MODE override).
- `POST /api/session/start {"mode":"normal"}` → 200, returns valid manifest, audio stamped, no provider calls fired.
- `POST /api/references/generate {"kind":"character",...}` → 200 in 15s, real PNG generated by Imagen 3 and uploaded to user's Cloudinary cloud `dghelx0al`.
- **Live Veo smoke (this turn):** `POST /api/orchestrate/beat-1` with hand-crafted beatFacts for "a lone diver finds an abandoned underwater observatory" → 200 in ~50s, returned `provider: vertex` + `sharedRefs: true` (Imagen ran live for both refs) + a real `jobId: vertex::f83d4f09-...`. Polled `/api/status/{jobId}` → `status: succeeded` after ~50s, with `clipUrl: https://res.cloudinary.com/dghelx0al/video/upload/v1777157073/sceneos/4593dc2e942b/beat-1/beat-1-scene-1.mp4` (verified HEAD 200, content-type video/mp4) + a derived `lastFrameUrl` (verified HEAD 200, image/jpeg). The full real-mode pipeline (Vertex auth → Imagen 3 char ref → Imagen 3 location ref → Cloudinary upload → Veo job submission → Veo polling → Cloudinary clip URL → derived chaining frame) is live.

**Module K: Agent question-loop nondeterminism (this turn).** Per user feedback: "the agent should ask a non deterministic set of questions and the questions themselves as well should be non deterministic — 3 shouldn't be the limit." Changed in `agent.py`:
- Removed the "Aim for 3 to 5 user answers per beat" anchor from the system prompt; replaced with "no target number, the right count is whatever the conversation needs — could be 1, could be 7."
- Added an explicit anti-pattern block: don't walk facets in order (subject→action→setting→framing→mood), don't ask about lenses standalone, don't repeat the same question shape, don't ask the user to invent things they haven't thought about, don't recap the entire story.
- Bumped normal-mode temperature 0.8 → 1.0 so the question pool actually varies across runs. Demo mode stays at 0.8 (timer matters more than variety on stage).
- Demo `DEMO_MAX_QUESTIONS=2` hard-cap unchanged. Normal-mode safety ceiling stays at `MAX_QUESTIONS=8`.

### 🔴 Next up

**Module D: Demo project bake (~1 hr) — IMMEDIATE NEXT** *(user-driven)*
- Veo is now verified live. The remaining work is just a multi-beat run + populate `cached.py`. Pick `monkey-banana` / `lighthouse-ship` / `drone-mall` from `demo_prompts.py`, OR reuse the diver one already partially baked (`projectId 4593dc2e942b`, beat-1 already done — could finish 2-7 to save quota).
- Capture all 7 `clipPublicId`s as they succeed + the project's `character` and `location` shared ref publicIds + the audio publicId.
- Hardcode into `cached.py` so the on-stage safety net replays the same cinematic instantly if wifi or quota dies.
- **Why this needs the user:** selecting the demo prompt + judging the visual quality is a creative call. The pipeline runs once you've picked.

**Module E: Audio polish — voice narration (stretch)**
- `audio.synthesize_narration` already wired. Needs:
  1. Per-beat `voiceLine` field added to `beatFacts` (agent emits a single 1-2 sentence narration line at `markSufficient`).
  2. ElevenLabs API key wired into env.
  3. Stitch URL extended to overlay TWO `l_audio:` layers (music underneath, narration on top, with mix levels via `e_volume:-30` on the music track).
- ~30-45 min of work. Skippable for the demo if cinematic music alone reads well.

**Module F: Real frontend handoff** *(teammate's domain)*
- Hand over SHARED_TYPES.md.
- Surfaces to consume: `POST /api/session/start` shape (mode buttons + `projectRefs` panel + `manifest.audioPublicId` + `speculativeJobs` map), `POST /api/agent/stream` SSE shape (already wired in mock_frontend; copy the parser), `POST /api/orchestrate/{beatId}` response (now includes `sharedRefs: bool`), `POST /api/stitch/url` (now returns `audioPublicId` for display).

**Module G: Agentic editing teammate's surface** *(teammate's domain)*
- The agent's per-beat `markSufficient` already lands structured `beatFacts`. The editing teammate's pass plugs in BETWEEN stitch and final delivery: ingest manifest + clipPublicIds → propose trims, captions (`l_text:`), volume curves, optional VO line per beat.
- Backend exposes `audio.synthesize_narration` + `cloudinary.upload_audio_from_bytes` + the existing `l_audio:` plumbing. No new backend routes needed — they consume the manifest and emit a transformed splice URL.

### 🟡 In progress (across project)

- Real frontend has the canvas + drawer + agent bubble shell but doesn't yet consume `/api/session/start` or `projectRefs` or `audioPublicId`. SHARED_TYPES.md update is the handoff.
- `decompose.py` still references the trailer-style mood cues. Works fine for trailer template; for story.* path, the orchestrator's deterministic clipPrompt composer takes over and decompose becomes a fallback only.
- `cached.py` provider exists but `cached.py` data file is empty. Module D fills it.

### 🧊 Cut for hackathon scope (revisit post-LA Hacks)

- Celery + Redis. `asyncio.gather` suffices for single-process FastAPI.
- Multi-user / auth / persistence beyond localStorage. (`_SESSIONS` is in-memory and process-local; that's fine for demo, not for prod.)
- LangGraph migration of the agent. Per-turn tool loop is fine; LangGraph adds value when you want multi-agent or visual graph debugging, neither needed for demo.
- Recursive scenes inside a beat.
- Mobile / responsive.
- True parallel video generation across processes. asyncio gives concurrency-on-one-thread, which is enough for 7 fan-out + speculative kickoff.

---

## 8. File ownership tree

| Layer | File | Owns | Status |
|---|---|---|---|
| **Routes** | `app.py` | HTTP surface, error envelope, mock-mode branching. 12 routes. | ✅ |
| **Sessions** | `session.py` | Mode-aware boot. `start_session(mode)` + speculative kickoff + `ensure_project_refs` (lazy normal-mode anchors) + manifest builder. In-memory `_SESSIONS` + `_SPECULATIVE` stores. | ✅ this turn |
| | `demo_prompts.py` | 3 curated demo prompts with hand-tuned `beatFactsByTemplate` for all 7 story beats; 5 normal prompts. Auto-selection. | ✅ this turn |
| **Agent** | `agent.py` | Per-turn askQuestion / markSufficient with suggestedAnswers + beatFacts. The voice. **Gemini via Vertex.** Demo-mode speed-mode (DEMO_MAX_QUESTIONS=2, THINKING_BUDGET_DEMO=512, dynamic prompt block). | ✅ |
| | `genai_client.py` | `make_genai_client()` for Gemini via Vertex AI. Defaults: `gemini-2.5-flash` for agent, `gemini-2.5-pro` for decompose. | ✅ |
| | `sufficiency.py` | Facet coverage scoring. MIN=3, MAX=5 (soft cap). | ✅ |
| | `beat_templates.py` | TRAILER + SHORT + FEATURE + STORY archetype lists. | ✅ |
| **Decompose** | `decompose.py` | Master → all-beats clipPrompts (one-shot LLM with stub fallback). Fallback path; orchestrator is the canonical one. | ✅ |
| | `anthropic_client.py` | Direct API vs Vertex routing (legacy — unused on the story path). | ✅ |
| **Orchestrator** | `orchestrator.py` | beatFacts → motion preset + project-ref-aware seed pick + clipPrompt + provider.generate dispatch. Returns `sharedRefs: bool`. | ✅ |
| **References** | `vertex_imagen.py` | Vertex Imagen 3 T2I. `generate_reference()` for ad-hoc + `generate_project_refs()` for once-per-project shared anchors. | ✅ |
| **Audio** | `audio.py` | `pick_music(videoType, mood)` + `synthesize_narration(text)` (ElevenLabs, opt-in). Manifest auto-stamps `audioPublicId`. | ✅ this turn |
| **Providers** | `provider.py` | Universal ProviderModule + dispatcher. | ✅ |
| | `vertex_veo.py` | Vertex Veo 2/3. startImageUrl wired. | ✅ |
| | `higgsfield.py` | T2I→I2V→Cloudinary. startImageUrl shortcut wired. | ✅ |
| | `fal.py` | LTX-Video. Native chaining. | ✅ |
| | `kling.py`, `replicate.py` | Stubs. | 🧊 |
| | `cached.py` | On-stage safety net. **Module D bakes the demo project here.** | 🔴 |
| | `mock.py` | Deterministic mock data + streaming agent parity. | ✅ |
| **Media** | `cloudinary.py` | fl_splice URL + color grade + signed upload + `last_frame_url` + `upload_image_from_bytes` + `upload_audio_from_bytes`. | ✅ |
| **State** | `jobs.py` | In-memory Higgsfield job registry. | ✅ |
| | `config.py` | env loader, mock_mode probe. | ✅ |
| **Editor** | `editor.py` | Agentic final pass — captions + per-beat trims + VO mixing. Stretch (Module E/G). | 🔴 |
| **Visualize** | `mock_frontend/index.html` | Standalone end-to-end visualizer with mode picker, demo timer, project refs panel, pipeline dispatch panel, auto-stitch + inline final-cut player. | ✅ |

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
1. **Mode picker.** Two big buttons: DEMO (3-4 min, auto-prompt, all 7 beats kicked off speculatively) and NORMAL (full agent loop, no time budget). Optional `masterPromptOverride` hidden behind a `<details>`.
2. **Header.** Mode badge + demo timer (mm:ss countdown when in demo mode).
3. **Beat strip.** 7 nodes: hook → exposition → inciting → rising → climax → falling → resolution. In demo mode, each shows a `▱ rendering…` badge that flips to `▰ pre-warmed` when its speculative clip is ready.
4. **Project refs panel.** Two stills, side by side: the SHARED character + location anchors used by every beat. Visual continuity contract.
5. **Conversation panel.** Agent bubbles streaming character-by-character; user bubbles. 3 suggested-answer chips below the latest question.
6. **Right rail.** Structured beatFacts as the agent extracts them (you see the architecture; the user doesn't).
7. **Pipeline dispatch panel.** After markSufficient for a beat: chain-or-cut tag, character/location ref thumbnails, motion preset, provider jobId. In demo mode shows `pre-warmed · cached` (instant); in normal mode shows the live orchestration.
8. **Final cut.** When all 7 beats land a `clipPublicId`, this panel auto-pops with a stitched MP4 + audio metadata + Cloudinary deep link.

To run against real providers (not mock):
```bash
# Terminal 1
cd backend_py
GOOGLE_PROJECT_ID=<your-project> \
GOOGLE_APPLICATION_CREDENTIALS=<path-to-sa.json> \
CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud> \
GENERATION_PROVIDER=vertex \
uvicorn sceneos_py.app:app --reload --port 8787
# Optional: ELEVEN_LABS_API_KEY=<key>  for narration
# Optional: SCENEOS_MUSIC_LIBRARY='{"story":{"auto":"sceneos/audio/your-track"}}'  for custom music
```

mock_frontend doesn't change. It just hits the same endpoints.

---

## 10. The honest priority order for the remaining ~16 hours

```
NOW            Open mock_frontend/index.html, point it at the running backend.
               Click DEMO. Verify: mode badge, demo timer, project refs panel
               populates, beat strip shows pre-warmed badges, agent walks 7 beats,
               final cut renders inline with audio. This is the proof. Backend
               is closed; everything from here is data + handoff + practice.

HOUR 0-1       Module D — the demo bake. Pick a demo prompt (monkey-banana,
               lighthouse-ship, drone-mall). Run /api/session/start with real
               providers (no MOCK_MODE). Wait ~3 min. Capture the projectRefs
               publicIds + all 7 clip publicIds + the chosen audioPublicId.
               Paste into cached.py. The on-stage failure mode goes from
               "white screen" to "instant replay."

HOUR 1-2       Hand SHARED_TYPES.md + a 1-page brief to the frontend teammate.
               The brief: "session/start gives you everything; just consume
               manifest + projectRefs + speculativeJobs + audioPublicId."

HOUR 2-3       Hand a 1-page brief to the agentic-editing teammate. Their pass
               sits between stitch and final delivery; backend exposes
               audio.synthesize_narration + l_audio: + l_text: primitives.

HOUR 3-4       (Optional) Module E — voice narration polish. Wire ELEVEN_LABS_API_KEY,
               extend agent.markSufficient to emit a voiceLine, double-overlay
               in stitch. Skippable if music alone reads well in practice.

HOUR 4-7       Practice the demo. Time it. Sub-4-minutes is the bar. Note
               where the agent slows down. Tune DEMO_MAX_QUESTIONS or the
               speed-mode block in agent.py if needed.

HOUR 7-10      Cushion + sleep.

HOUR 10-16     Show up. Run the demo from the cached tier as a warm-up. Run
               the live demo for the judges.
```

If anything takes more than 2x its budget: drop to the cached tier and ship.

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
