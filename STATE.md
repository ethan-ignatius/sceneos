# SceneOS — STATE

> **The day-2 operational dashboard.** Open this every morning. CONTEXT.md = vision; BACKEND_ARCHITECTURE.md = design spec; **this file = "where am I right now and what do I do next."**
>
> Last updated: 2026-04-25. Deadline: 2026-04-26 11:00am EDT.

---

## 0. Vibe check — read this first

**You are farther along than you think.**

- 8/8 backend endpoints exist and respond.
- 6/6 provider tiers wired (vertex / higgsfield / fal / kling / replicate / cached).
- Mock mode green end-to-end. `/api/decompose`, `/api/agent`, `/api/stitch/url` all working.
- Frontend canvas + node drawer + agent bubble + generation panel exist.
- LLM agent uses Anthropic tool-calling (askQuestion / markSufficient) with stub fallback.

**The gap between what you have and the demo vision is THREE concrete pieces of plumbing, listed in §6.** Stop spiraling, start shipping.

The "agentic pipeline" you keep saying is missing is **already built**. It's `/api/agent`. It's not LangGraph yet but it doesn't need to be — the per-turn tool loop is the right shape for hackathon scope. Don't rewrite it.

---

## 1. The pipeline as 7 stages

This is the shape of the product, end-to-end. Memorize this — it's your vocab.

```
┌─────────────────┐
│ STAGE 0  BOOT   │  Frontend creates Manifest from masterPrompt + videoType.
│                 │  Spawns N pending beats from beat-templates.ts.
└────────┬────────┘
         │ POST /api/decompose
         ▼
┌─────────────────┐
│ STAGE 1  SEED   │  One LLM call seeds clipPrompt for ALL beats at once.
│                 │  Continuity bible (character/world descriptors) carries
│                 │  across beats. This is the cinematography moat.
└────────┬────────┘
         │ User clicks first node
         ▼
┌─────────────────┐
│ STAGE 2  ASK    │  Per-beat questionnaire loop.
│                 │  POST /api/agent → askQuestion or markSufficient.
│                 │  Sufficiency = subject ∧ action ∧ setting ∧ framing ∧ mood.
│                 │  Min 2 user turns, max 6 questions.
└────────┬────────┘
         │ markSufficient → refinedPrompt locked
         ▼
┌─────────────────┐
│ STAGE 3  REF    │  (NEW — partial) Generate or accept a reference still.
│                 │  Character/location keyframe. Used as I2V seed image.
│                 │  Optional — agent can skip and go T2I→I2V.
└────────┬────────┘
         │ POST /api/generate { startImageUrl? }
         ▼
┌─────────────────┐
│ STAGE 4  CLIP   │  Provider generates the video clip.
│                 │  vertex / higgsfield / fal / cached.
│                 │  Returns jobId. Frontend polls /api/status.
└────────┬────────┘
         │ status=succeeded → { clipUrl, clipPublicId, lastFrameUrl }
         ▼
┌─────────────────┐
│ STAGE 5  CHAIN  │  (NEW — needed) Extract last frame of this clip.
│                 │  Cloudinary so_X derivative. Pre-fill next beat's
│                 │  scene.seedImageUrl. User can override or break chain.
└────────┬────────┘
         │ Repeat 2-5 for each beat (or scope-cut to flat decompose)
         ▼
┌─────────────────┐
│ STAGE 6  STITCH │  POST /api/stitch/url → fl_splice URL.
│                 │  All approved beats concatenated, color-graded,
│                 │  audio overlay, single CDN URL.
└────────┬────────┘
         │ Optional: /api/cutos/import
         ▼
       DEMO
```

The frontend canvas IS the manifest. Every node is a beat. State transitions (pending → questioning → ready-to-generate → generating → preview → approved) are derived from `beat.status` + `scene` fields. **There is no separate canvas state machine. The Manifest is the state machine.** Backend stays stateless.

---

## 2. API surface — what exists vs what's missing

| # | Endpoint | Status | What it does |
|---|---|---|---|
| 1 | `GET  /api/health` | ✅ done | Liveness + mock-mode probe |
| 2 | `POST /api/decompose` | ✅ done | Master prompt → 7 Higgsfield-ready clipPrompts (LLM, with stub fallback) |
| 3 | `POST /api/agent` | ✅ done | Per-beat askQuestion / markSufficient tool loop |
| 4 | `POST /api/generate` | 🟡 partial | Submits provider job. `startImageUrl` is in the type but only fal uses it. Veo + Higgsfield ignore it. |
| 5 | `GET  /api/status/:jobId` | 🟡 partial | Returns clipUrl on success. **Does NOT return lastFrameUrl** (the chain primitive). |
| 6 | `POST /api/stitch/url` | ✅ done | fl_splice URL + per-beat color grade + optional audio overlay |
| 7 | `POST /api/cloudinary/sign` | ✅ done | Signed upload params for browser-side reference uploads |
| 8 | `POST /api/cutos/import` | ✅ done | Manifest → CutOS handoff (mock branch when CutOS is offline) |

**Endpoints you do NOT need to add:**
- ~~`/api/projects`~~ — manifest lives client-side, backend is stateless. Don't add.
- ~~`/api/canvas/nodes`~~ — same. Canvas state = manifest.
- ~~`/api/edit`~~ — refinement = Cloudinary URL transforms. Pure client-side via `frontend/src/lib/cloudinary-transforms.ts`.
- ~~`/api/regenerate`~~ — just call `/api/generate` again. The frontend swaps `scene.jobId`.

**Endpoints you might add (scope-dependent):**
- `POST /api/references/generate` — IF you want AI-generated reference stills (character/location). Otherwise let the user upload via signed Cloudinary upload. See §6.3.

The whole API surface is 8 endpoints. Don't add more unless you hit a wall.

---

## 3. Manifest schema — what's there + what to add

### What exists (`frontend/src/types/manifest.ts`):

```ts
Manifest { projectId, videoType, masterPrompt, createdAt, beats[], finalCloudinaryUrl?, ... }
Beat     { beatId, beatName, template, status, scenes[], archetype }
Scene    { sceneId, conversation[], refinedPrompt?, jobId?, clipPublicId?, clipUrl?, durationSeconds?, approved }
```

### Three additions to enable the vision (small diff):

```ts
// Beat additions
interface Beat {
  // ...existing fields
  chainFromPrevious?: boolean;   // default true. false = hard cut, no seed frame.
  referenceImageUrl?: string;    // optional user-uploaded character/location ref.
}

// Scene additions
interface Scene {
  // ...existing fields
  seedImageUrl?: string;         // input: I2V keyframe. Set by chain logic OR user.
  lastFrameUrl?: string;         // output: extracted from clipUrl on success.
  clipPrompt?: HiggsfieldClipPrompt; // already in SHARED_TYPES.md but absent from manifest.ts; add.
}
```

That's it. Five fields. **Don't redesign the schema.** These additions are additive-only — existing code keeps working.

### How the chain flows through these fields:

1. After `/api/status` succeeds for `beat[i].scenes[0]`, backend (or frontend) computes `lastFrameUrl` via Cloudinary derivative.
2. Frontend store updates `beat[i].scenes[0].lastFrameUrl`.
3. Frontend store **also** writes `beat[i+1].scenes[0].seedImageUrl = beat[i].scenes[0].lastFrameUrl` (if `beat[i+1].chainFromPrevious !== false`).
4. When user clicks generate on beat[i+1], the request body includes `startImageUrl: scene.seedImageUrl`.
5. Provider uses it as the I2V seed.

Backend stays stateless. Frontend Zustand owns the chain wiring. Backend just provides primitives.

---

## 4. The 3 missing pieces (the actual blockers)

Everything in this list is small. None of it is architectural. Total estimated work: **3-5 hours**.

### 🔴 BLOCKER 1: Last-frame extraction
**File:** `backend_py/sceneos_py/cloudinary.py` — add a `last_frame_url(public_id)` helper.
**One-liner:** Cloudinary supports `so_<seconds>` time-offset thumbnails on video. Use `so_-0.1` (last 0.1s) or `eo_99p` (99% through) to extract the final frame as a JPG.
**Where to call it:** in `app.py` `/api/status` handler, when `result.status == "succeeded"`, add `response["lastFrameUrl"] = last_frame_url(result["clipPublicId"])`.
**Pattern:**
```python
def last_frame_url(public_id: str) -> str:
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/so_-0.1/{public_id}.jpg"
```
That's it. ~3 lines of code + 1 line in the status handler.

### 🔴 BLOCKER 2: Wire startImageUrl into Veo and Higgsfield
**Files:** `backend_py/sceneos_py/vertex_veo.py`, `backend_py/sceneos_py/higgsfield.py`.
**Veo:** add an `image` field to the `instances[0]` payload when `startImageUrl` is set. Veo 2 + 3 both accept `{ image: { gcsUri | bytesBase64Encoded } }`. For a Cloudinary HTTPS URL, fetch + base64-encode in the request.
**Higgsfield:** if `startImageUrl` is provided, **skip the T2I stage entirely** and go straight to I2V with `image_url=startImageUrl`. Currently `generate()` always calls `_post(DEFAULT_T2I_MODEL, ...)`; gate that on `not params.get("startImageUrl")`.
**fal:** already done (line 81 of fal.py).

### 🔴 BLOCKER 3: Frontend chain wiring
**File:** `frontend/src/stores/<wherever the manifest lives>` (you'll find it under `frontend/src/stores/`).
**What:** when the polling loop sees `status.lastFrameUrl`, write it to the scene. Then in the same store action, if `beat[i+1]` exists and `chainFromPrevious !== false`, set its `scenes[0].seedImageUrl`.
**Then:** in the `/api/generate` request builder, include `startImageUrl: scene.seedImageUrl` if set.

After these 3 are done, your demo is: type idea → 5 beats decomposed → answer 2-3 questions per beat → first beat generates → its last frame seeds the second beat → and so on → all 5 beats stitch into one cinematic. **That's the wedge.** That's what nobody else demos.

---

## 5. Reference images — three options, ranked

You said "reference images + reference motion + reference locations." Three ways to wire this. Pick **option B** for hackathon.

| Option | What it is | Effort | Recommendation |
|---|---|---|---|
| A | **AI-generate** reference stills via T2I (Vertex Imagen, Higgsfield Soul, fal Flux). New endpoint `/api/references/generate`. Returns image URLs. User approves. | 2-3 hrs | Skip. Adds an endpoint and a UI surface for marginal demo value. |
| **B** | **User uploads** via Cloudinary signed widget. `/api/cloudinary/sign` already exists. Frontend lets user drag-drop a character photo onto a beat node → uploaded → set as `beat.referenceImageUrl`. Used as I2V seed. | **30 min** | **Do this.** Reuses existing endpoints. Demo-worthy. |
| C | **Skip references entirely.** Trust the LLM-generated `clipPrompt.imagePrompt` to keep continuity via the continuity bible (decompose already emits this). | 0 min | Fallback if B slips. |

**Why B over A:** Judges connect with "I uploaded a photo of myself and the AI made me into a cinematic protagonist" 10× more than "the AI invented a face." It's also simpler to build and demo.

---

## 6. KANBAN

### ✅ Done

- FastAPI app with 8 routes mounted (`app.py`)
- Mock mode auto-default + explicit MOCK_MODE flag
- Anthropic agent loop with tool-calling (askQuestion / markSufficient)
- Sufficiency facet scorer (subject/action/setting/framing/mood)
- Anthropic decompose with stub fallback (`decompose.py`)
- Provider abstraction (`provider.py` ProviderModule protocol)
- Vertex AI Veo provider (predict + poll + base64→Cloudinary)
- Higgsfield provider (T2I → I2V → Cloudinary)
- fal.ai LTX-Video provider (subscribe + Cloudinary)
- Kling, Replicate stubs (deliberate)
- Cached-demo provider (on-stage safety net)
- Cloudinary fl_splice URL builder + per-beat color grade
- Cloudinary signed upload
- CutOS import handoff
- Tests: agent eval, API contract, FE flow, real smoke
- Frontend: Manifest + Beat + Scene types, beat-templates, agent bubble, drawer, generation panel
- Frontend: canvas, landing, transition, stitch tray, node detail
- Frontend ↔ backend wiring (`api.ts`)

### 🟡 In progress / partial

- `startImageUrl` field declared in `GenerateClipParams` but only fal honors it. Veo and Higgsfield need wiring.
- Manifest type in `frontend/src/types/manifest.ts` is missing `clipPrompt` on Scene (it's in SHARED_TYPES.md but not the TS file).
- `/api/status` returns `clipUrl` + `clipPublicId` but not `lastFrameUrl`.

### 🔴 Next 3 — DO THESE BEFORE ANYTHING ELSE

1. **Last-frame extraction + status payload** (~30 min). See §4 BLOCKER 1.
2. **Wire startImageUrl into Veo + Higgsfield** (~1 hr). See §4 BLOCKER 2.
3. **Frontend chain wiring + Manifest schema additions** (~1 hr). See §4 BLOCKER 3 + §3.

After these three: end-to-end chained demo works. Everything else is polish.

### 🟢 Then (in priority order)

4. Reference image upload UX (drag-drop onto a beat node → signed Cloudinary upload → `beat.referenceImageUrl` → passed as `startImageUrl` for that beat's first scene). See §5 option B. ~30 min.
5. Hard-cut toggle (`Beat.chainFromPrevious` checkbox in node drawer). ~15 min.
6. Demo project rendered Saturday night → public_ids in `cached.py`. The on-stage safety net. ~1 hr.
7. Color-grade A/B toggle in stitch tray (`colorGrade: true|false` in stitch request). ~15 min — endpoint already supports it.

### 🧊 Cut for hackathon scope

- LangGraph migration of the agent loop. The current per-turn loop is fine. Don't rewrite.
- Reference image AI generation (option A). Use upload (option B) instead.
- Backend canvas state. Manifest is the canvas.
- `/api/edit` endpoint. Cloudinary URL transforms are pure client.
- Recursive scenes inside a beat. Flat 5-beat trailer demo only.
- Feature mode (7-beat) on stage. Schema exists, don't demo it.
- Audio generation (ElevenLabs). Pre-record VO if you want one.
- Auth, persistence beyond localStorage, mobile.

---

## 7. File ownership tree

Each file maps to one job. If you're touching a file outside its column, you're probably doing something wrong.

| Layer | File | Owns |
|---|---|---|
| **Routes** | `app.py` | HTTP surface. Error envelope. Mock-mode branching at the route boundary. |
| **Agent** | `agent.py` | Per-turn askQuestion / markSufficient tool loop with Anthropic. Stub fallback. |
| | `sufficiency.py` | Facet coverage scoring. The "when do we stop asking" logic. |
| | `beat_templates.py` | Archetype data: 5 trailer / 3 short / 7 feature beats. Mood, intent, suggestedDuration. |
| **Decompose** | `decompose.py` | Master prompt → 7 Higgsfield-ready clipPrompts. One-shot LLM with mood-cue stub fallback. |
| | `anthropic_client.py` | Direct API vs Vertex AnthropicVertex routing. |
| **Providers** | `provider.py` | Universal ProviderModule protocol + dispatcher. Encode/decode jobId. Poll cadence. |
| | `vertex_veo.py` | Vertex Veo 2/3. Long-running prediction → base64 → Cloudinary. |
| | `higgsfield.py` | Higgsfield T2I → I2V → Cloudinary. |
| | `fal.py` | fal.ai LTX-Video. Subscribe + Cloudinary. **Already chains via image_url.** |
| | `kling.py` | Kling stub. |
| | `replicate.py` | Replicate stub. |
| | `cached.py` | Hard-coded demo project. On-stage safety net. |
| | `mock.py` | Deterministic mock data for agent + clips + cutos. |
| **Media** | `cloudinary.py` | fl_splice URL builder. Color grade. Signed upload. **Add: last_frame_url().** |
| **State** | `jobs.py` | In-memory Higgsfield job registry. Lost on restart (fine for hackathon). |
| | `config.py` | .env / .env.mock loader. mock_mode() probe. |

If you find yourself adding a new file, ask: which existing file owns this concern? Almost always there's already a home.

---

## 8. How to steer Claude (the actual hard part)

You said you don't know how to direct Claude on this. Three concrete prompts you can paste, in priority order. **Hand Claude the §4 spec, not vibes.**

### Prompt 1 — last-frame + chain wiring (do this first)

> Read /Users/vishnu/Documents/sceneos/STATE.md §3, §4 BLOCKER 1, and §4 BLOCKER 2.
>
> Implement exactly the following:
>
> 1. In `backend_py/sceneos_py/cloudinary.py`, add `def last_frame_url(public_id: str) -> str` that returns the Cloudinary `so_-0.1/<public_id>.jpg` URL. Use the existing `CLOUD` constant.
> 2. In `backend_py/sceneos_py/app.py`, in the `/api/status` handler, when `result.get("clipPublicId")` is set and status is succeeded, add `response["lastFrameUrl"] = cloudinary.last_frame_url(result["clipPublicId"])`. Do the same in the mock-mode branch.
> 3. In `backend_py/sceneos_py/higgsfield.py`, in `generate()`, if `params.get("startImageUrl")` is set, skip the T2I stage entirely. Set `job.image_url = params["startImageUrl"]`, `job.stage = "i2v_running"`, then post to the I2V endpoint directly with that image_url. Reuse the existing I2V code path.
> 4. In `backend_py/sceneos_py/vertex_veo.py`, in `generate()`, if `params.get("startImageUrl")` is set, fetch the URL into bytes via httpx, base64-encode, and add `image: { bytesBase64Encoded: <b64>, mimeType: "image/jpeg" }` to `instances[0]` of the predict body. Veo accepts this.
> 5. Add a unit test in `tests/test_api_contract.py` that calls `/api/status` against a mock-mode succeeded job and asserts the response includes `lastFrameUrl`.
>
> Do not change any other files. Do not refactor. Do not add new endpoints. Run `pytest` when done.

### Prompt 2 — Manifest schema additions (after Prompt 1 lands)

> Read /Users/vishnu/Documents/sceneos/STATE.md §3.
>
> Add three optional fields to the Manifest types — additive only, no removals:
>
> 1. In `frontend/src/types/manifest.ts`, add to `Beat`: `chainFromPrevious?: boolean;` and `referenceImageUrl?: string;`. Add to `Scene`: `seedImageUrl?: string;`, `lastFrameUrl?: string;`, and `clipPrompt?: HiggsfieldClipPrompt;` (import the type from the appropriate place — check SHARED_TYPES.md for its definition; add it to manifest.ts if it's not already exported).
> 2. Update `docs/SHARED_TYPES.md` to document these three fields. One sentence each.
> 3. Do not change any backend code (the FastAPI handlers accept dicts, so they're already compatible).
> 4. Do not change anything else in the manifest. Do not add migration code. Do not add validators.
>
> Verify: `npm run typecheck` in `frontend/`.

### Prompt 3 — frontend chain wiring (after Prompts 1 + 2 land)

> Read /Users/vishnu/Documents/sceneos/STATE.md §4 BLOCKER 3.
>
> In the frontend Zustand store that owns the Manifest (search `frontend/src/stores/` — it's likely named manifestStore or similar):
>
> 1. In the `/api/status` polling loop, when status === "succeeded" and the response includes `lastFrameUrl`, write it to `scene.lastFrameUrl`.
> 2. In the same action, after writing `lastFrameUrl`, find the next beat (by index in `manifest.beats`). If it exists and `nextBeat.chainFromPrevious !== false`, set `nextBeat.scenes[0].seedImageUrl = lastFrameUrl`.
> 3. In the `/api/generate` request builder (search for where the body is constructed for the POST), include `startImageUrl: scene.seedImageUrl` in the request body if it's set on the scene.
> 4. Do not change any UI components. Do not change the backend. Do not add new state.
>
> Verify: `npm run typecheck`. Then run mock mode end-to-end and confirm the second beat's generate call includes `startImageUrl` in the request body (check Network tab).

After Prompt 3 lands, the chain works. That's the demo.

---

## 9. The honest priority order for the next 12 hours

```
HOUR 0-2   Claude runs Prompts 1, 2, 3. You verify each. (3-5 hrs Claude time, ~30 min your time.)
           ── At end: chained generation works in mock mode. Veo/Higgsfield wired.

HOUR 2-3   You: drag-drop reference upload UI on a beat node. (Option B from §5.)
           Wire it to /api/cloudinary/sign + signed upload. Set beat.referenceImageUrl.

HOUR 3-4   You: "Hard cut" toggle in node drawer. Sets beat.chainFromPrevious = false.
           Cosmetic. ~15 min if you have shadcn already.

HOUR 4-6   Render the demo project Saturday night with REAL providers (vertex or fal).
           Capture the public_ids. Paste into cached.py. THIS IS YOUR ON-STAGE SAFETY NET.

HOUR 6-8   Practice the demo path 5 times. Time it. Aim for under 4 minutes.
           Pre-load the master prompt. Pre-stage Cloudinary uploads.

HOUR 8-10  Write the Devpost. Pull from CONTEXT.md §1, §2, §3.

HOUR 10-12 Sleep. You will need it.
```

If a step takes more than 2× the budget, **scope-cut it and move on**. The cached tier is your friend.

---

## 10. What you stopped needing to worry about

You wrote "I have no idea wtf is going on." Here's what you can stop carrying mentally:

- **You don't need to add more endpoints.** 8 is the right number. Frontend builds on top.
- **You don't need LangGraph.** The per-turn tool loop is fine. Migrating mid-hackathon costs you 6 hrs for zero demo value.
- **You don't need a database.** Manifest is client-side, jobs are in-memory. Refresh-survival via localStorage is a 10-min add if you want it.
- **You don't need a queue.** Sequential generation is by design. Frontend orchestrates one beat at a time.
- **You don't need to migrate anything.** The Python port is done. Stop thinking about the TS backend.
- **You don't need to write the agent system prompt from scratch.** `agent.py:_system_prompt` is already specific (intent, mood, facets, earlier-beats context). Tune later if you have time.

The vision is achievable with the code you have plus three prompts to Claude. Go.

---

## 11. Update protocol

When something ships, edit this doc. Move items between Done / In-progress / Next. Don't let it go stale — a stale STATE.md is worse than no STATE.md.

When a teammate joins, hand them this file. Top to bottom in 5 minutes; they're caught up.

When you're confused at 3am: re-read §0 and §6. Pick the next 🔴 item. Ship it.
