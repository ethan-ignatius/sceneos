# SceneOS Video Editor — architecture

> Stage 7 of the pipeline. The user has approved the seven beats; the cinematic
> is stitched. They walk into `/edit` to refine. This document is the complete
> map of what exists at the backend level and what frontend components surface
> it.
>
> **The wedge:** every edit — agent-led or direct-manipulation — produces a
> single Cloudinary delivery URL. No render server. No ffmpeg. Cloudinary's
> CDN evaluates the transform pipeline on demand and caches the resulting MP4.
> The URL **is** the artifact. This is the prize-winning property.

---

## 1. The big picture

```
┌───────────────────────────────────────────────────────────────────────────┐
│  /edit (frontend)                                                          │
│   ┌─────────────────────────────┐    ┌────────────────────────────────┐   │
│   │ Preview (VideoPlayer)        │    │ EditorToolbar (global)         │   │
│   │ Cloudinary URL strip + chips │    │  · look LUT                    │   │
│   │ EditorTimeline (per-beat)    │    │  · music bed + ducking         │   │
│   │ EditorClipDetail (selected)  │    │  · caption position            │   │
│   └────────────┬────────────────┘    │  · watermark                   │   │
│                │                      └────────────────────────────────┘   │
│                │                      ┌────────────────────────────────┐   │
│                │                      │ EditorAgentPanel (conversation)│   │
│                │                      │  · proposeEdit / commitEdit    │   │
│                │                      │  · 3 follow-up suggestions     │   │
│                │                      └─────────────┬──────────────────┘   │
│                ▼                                    ▼                      │
│          ┌─────────────────────────────────────────────────┐               │
│          │           EditDecisions (single state)          │               │
│          └─────────────────────────────────────────────────┘               │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ POST /api/editor/apply
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  backend_py/sceneos_py                                                     │
│   editor.py        — agent (Gemini), trust boundary, deterministic apply   │
│   cloudinary.py    — build_editor_url() turns EditDecisions → CDN URL      │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
                     https://res.cloudinary.com/<cloud>/video/upload/<...transforms.../>
                     <basePublicId>.mp4
```

Three surfaces, one state. The agent panel proposes whole-decisions deltas;
the timeline patches per-clip fields; the toolbar patches global fields.
All three converge on the same `EditDecisions` object, which deterministically
bakes into one Cloudinary URL.

---

## 2. Backend reference

### 2.1 `backend_py/sceneos_py/editor.py`

The editor agent module. Voice-twin of `agent.py`, but for the post-stitch pass.

**Public functions:**

| Function | Purpose | Used by |
|---|---|---|
| `initial_decisions(manifest)` | Produce the opening cut as an `EditDecisions` from the approved beats. | `/api/editor/init`, `apply_edit_decisions` baseline. |
| `run_editor_turn(req)` | One-shot agent turn (no streaming). Returns `proposeEdit` or `commitEdit`. | `/api/editor/turn`. |
| `run_editor_turn_streaming(req)` | Async iterator yielding `ready` → `thought` → `tool_call` → `result`. | `/api/editor/stream` (SSE). |
| `apply_edit_decisions(manifest, decisions, *, cloud_name=None)` | Deterministic. Validates + bakes the Cloudinary URL. Returns `{finalUrl, thumbnailUrl, durationSeconds, decisions}`. | `/api/editor/apply`, baked-cut paths. |

**Constants:**

- `THINKING_BUDGET = 1024` — Gemini thinking budget for streaming turns.
- `DEFAULT_TRANSITION_MS = 240` — initial cross-fade duration on every overlay clip.
- `MAX_TRANSITION_MS = 2400` — clamp ceiling. Anything higher is dropped.
- `MAX_CAPTION_CHARS = 120` — caption length cap before Cloudinary's `l_text:` parser starts truncating.
- `LOOK_NAMES` — list of allowed global LUT names (mirrors `cloudinary.LOOK_PRESETS`).

**Trust boundary — `_normalize_decisions(decisions, baseline)`**

This is the single chokepoint between LLM-emitted `decisions` and the
deterministic Cloudinary URL builder. It enforces:

- **Beat order is pinned to the manifest.** The LLM cannot insert, drop, or
  reorder clips. We walk the baseline clip list and look up the LLM's patch by
  `publicId` → `beatId` → positional index. The emitted URL always uses the
  manifest's real `publicId`.
- **Allowed per-beat keys:** `trimStart`, `trimEnd`, `colorGrade`,
  `transitionMs`, `caption`. Anything else from the LLM is ignored.
- **`trimStart` / `trimEnd`** clamped to `[0, durationSeconds]` with `trimEnd ≥ trimStart`.
- **`colorGrade`** runs through `cloudinary.sanitize_color_grade`. Drops
  unknown effect names; clamps values to `[-100, 100]`.
- **`transitionMs`** clamped to `[0, MAX_TRANSITION_MS=2400]`.
- **`caption`** stripped of control chars, length-bounded at `MAX_CAPTION_CHARS=120`.
- **`look`** must be a key in `LOOK_PRESETS`; falls back to `neutral`.
- **`captionPosition`** must be `"south"` or `"north"`; falls back to `"south"`.
- **`duckOriginalAudioDb`** clamped to `[-60, 0]`.

If any of these fail, the LLM's choice is silently coerced or dropped. The
URL never 400s on stage. Pinned by tests in `test_editor_security.py` and
`test_apply_edit_decisions_rejects_hallucinated_publicid`.

**Stub fallback.** When `make_genai_client()` returns `None` (no Vertex
client), `_stub_editor_turn` walks three canned proposals:
1. Tighten the hook by 0.5s.
2. Add a 240ms cross-fade into beat 4.
3. Apply the `cool-modern` global look.
After the third, it commits.

### 2.2 `backend_py/sceneos_py/cloudinary.py` (editor-relevant exports)

The deterministic URL builder. The full vocabulary the editor uses:

| Function | Output shape | What it does |
|---|---|---|
| `build_editor_url(decisions, cloud_name=None)` | `https://res.cloudinary.com/<cloud>/video/upload/<...transforms.../><basePublicId>.mp4` | Turns an `EditDecisions` into the master cut URL. |
| `build_thumbnail_url(public_id)` | `https://res.cloudinary.com/<cloud>/video/upload/so_auto/<id>.jpg` | Poster-frame derivative. Same publicId, different transform tail. |
| `build_splice_url(clips, audio_public_id, normalize, music_volume)` | Same shape as editor URL. | Simpler `/api/stitch/url` path. The editor URL builder is the superset. |
| `color_grade_for(mood)` | `"e_brightness:-15,e_contrast:10,..."` | Mood → per-beat grade lookup. Used to seed `colorGrade` per clip in `initial_decisions`. |
| `sanitize_color_grade(grade)` | Cleaned effect string | Allowlist gate on LLM-emitted grade strings. |
| `look_grade(look)` | LUT effect string | Resolves `look:"warm-archive"` → its `e_*` segment. |
| `edit_decisions_total_duration(decisions)` | float seconds | Sum of `(trimEnd - trimStart)` across clips. |
| `LOOK_PRESETS: dict[str, str]` | `{name: e_*-string}` | The global LUT registry. Keep in sync with frontend `EditLook`. |

**`_ALLOWED_VIDEO_EFFECTS`** — the allowlist for `sanitize_color_grade`:
`{brightness, contrast, saturation, vibrance, hue, gamma, blue, red, green,
sepia, blur, sharpen, noise, vignette, fade, pixelate, art, grayscale,
negate}`. Anything outside this set is dropped from the URL.

**`LOOK_PRESETS` — the six global LUTs:**

| Look | Effect string | Reads as |
|---|---|---|
| `neutral` | `""` | No LUT. |
| `warm-archive` | `e_brightness:-3,e_contrast:8,e_saturation:-8,e_sepia:20` | Memoir, sepia bias. |
| `cool-modern` | `e_brightness:-5,e_contrast:14,e_saturation:-18,e_blue:10` | Thriller, blue cast. |
| `high-contrast-mono` | `e_brightness:-4,e_contrast:32,e_saturation:-100` | High contrast B&W. |
| `punchy-trailer` | `e_brightness:0,e_contrast:24,e_saturation:14,e_vibrance:30` | Trailer punch. |
| `soft-romance` | `e_brightness:6,e_contrast:-4,e_saturation:6,e_blur:30` | Haze, warmth. |

**The URL bake order — `build_editor_url` layers, in order:**

1. **`c_fill,w_1920,h_1080`** — `_NORMALIZE`. Every clip squared into the same
   1920×1080 frame so mixed provider outputs splice cleanly.
2. **Base trim** — `so_<in>,eo_<out>`.
3. **Base color grade** — per-beat `e_brightness/contrast/...`.
4. **`e_volume:<duck>`** — original-audio ducking, applied to base before splice.
5. **For each overlay clip:**
   - `l_video:<id>,fl_splice` (the opener; **`fl_splice` MUST be co-located
     with `l_video:`**, not the closer — putting it on the closer silently
     drops the overlay).
   - Transform sub-segment: `c_fill,w_1920,h_1080` + trim + grade + `e_fade:<ms>` if transition.
   - `fl_layer_apply` (the closer).
6. **Global look LUT** — one of `LOOK_PRESETS`.
7. **`l_audio:<id>`** — music bed with `e_volume`, `e_fade:<in>`, `e_fade:-<out>`.
8. **Captions, timeline-anchored** — one `l_text:` overlay per captioned beat,
   each at its absolute `so_<offset>,du_<duration>`. Captions:
   `Arial_48_bold`, `co_white`, `e_outline:2:000000`, `g_<position>,y_140`
   (positioning lives in `fl_layer_apply`, **not** `l_text:` — same syntax
   trap as `fl_splice`).
9. **Watermark** — `l_<id>,g_south_east,x_24,y_24`. Last so it survives the LUT.

### 2.3 API endpoints — `backend_py/sceneos_py/app.py`

| Method | Path | Purpose | Request body | Response shape |
|---|---|---|---|---|
| POST | `/api/editor/init` | Seed the editor session. Builds `initial_decisions` from the manifest, bakes the opening cut. | `{manifest}` | `EditorInitResponse` (alias of `EditorApplyResponse`): `{finalUrl, thumbnailUrl, durationSeconds, decisions}`. |
| POST | `/api/editor/turn` | One-shot agent turn. | `EditorTurnRequest`: `{manifest, decisions?, conversation?, userMessage?}` | `EditorTurnResponse` discriminated by `kind`: `propose` (`{decisions, rationale, suggestedFollowups[3]}`) or `commit` (`{decisions, rationale, summary}`). |
| POST | `/api/editor/stream` | SSE stream of an agent turn. Same body as `/turn`. | Same as `/turn`. | SSE events: `{type:"ready"}`, `{type:"thought", chunk}`, `{type:"text", chunk}`, `{type:"tool_call", name, args}`, `{type:"result", ...EditorTurnResponse}`, `{type:"error", message}`, `{type:"done"}`. |
| POST | `/api/editor/apply` | **Deterministic.** No LLM. Bakes a given `EditDecisions` into the Cloudinary URL. | `EditorApplyRequest`: `{manifest, decisions}` | `EditorApplyResponse`: `{finalUrl, thumbnailUrl, durationSeconds, decisions}` (decisions is the post-trust-boundary normalized version). |

`/api/editor/turn` and `/api/editor/stream` go through the agent. `/api/editor/apply`
is what every direct-manipulation control on the frontend hits — debounced 250ms.

### 2.4 The `EditDecisions` shape (the contract)

Defined identically in `frontend/src/types/api.ts` and consumed as `dict` on
the backend. Source of truth: this document + `editor.py:_EDIT_DECISIONS_SCHEMA`.

```ts
type EditLook =
  | "neutral"
  | "warm-archive"
  | "cool-modern"
  | "high-contrast-mono"
  | "punchy-trailer"
  | "soft-romance";

interface EditClipDecision {
  beatId?: string;
  publicId: string;          // load-bearing — pinned to the manifest
  durationSeconds: number;   // load-bearing — source clip duration
  trimStart?: number;        // [0, durationSeconds]
  trimEnd?: number;          // [trimStart, durationSeconds]
  colorGrade?: string;       // "e_brightness:-15,e_contrast:10" (allowlisted)
  transitionMs?: number;     // [0, 2400]; cross-fade INTO this clip
  caption?: string;          // ≤ 120 chars; control chars stripped
}

interface EditAudio {
  publicId: string;
  volume?: number;           // dB-ish offset; -20 sits under dialogue
  fadeInMs?: number;
  fadeOutMs?: number;
}

interface EditDecisions {
  clips: EditClipDecision[];
  audio?: EditAudio | null;
  duckOriginalAudioDb?: number | null;  // [-60, 0]
  watermarkPublicId?: string | null;
  look?: EditLook;                      // default "neutral"
  captionPosition?: "south" | "north";  // default "south"
}
```

Whose responsibility is what:

| Field | Settable by agent? | Settable by timeline? | Settable by toolbar? |
|---|---|---|---|
| `clips[].publicId` | ❌ pinned | ❌ pinned | ❌ pinned |
| `clips[].durationSeconds` | ❌ pinned | ❌ pinned | ❌ pinned |
| `clips[].trimStart` / `trimEnd` | ✅ | ✅ (drag handles) | ❌ |
| `clips[].colorGrade` | ✅ | ❌ (read-only display) | ❌ |
| `clips[].transitionMs` | ✅ | ✅ (clip detail slider) | ❌ |
| `clips[].caption` | ✅ | ✅ (clip detail input) | ❌ |
| `audio` | ✅ | ❌ | ✅ (toggle + volume) |
| `duckOriginalAudioDb` | ✅ | ❌ | ✅ (toggle) |
| `watermarkPublicId` | ✅ | ❌ | ✅ (toggle) |
| `look` | ✅ | ❌ | ✅ (6 buttons) |
| `captionPosition` | ✅ | ❌ | ✅ (south / north) |

---

## 3. Frontend reference

All paths under `frontend/src/`.

### 3.1 Route — `routes/editor-route.tsx`

Owns the page. Three surfaces, one state:

- **Layout** — two-column grid on `lg+`:
  - Left (1fr): `VideoPlayer` → `CloudinaryArtifactStrip` → `EditorTimeline` → `EditorClipDetail` (conditional).
  - Right (24rem, sticky): `EditorToolbar` → `EditorAgentPanel`.
- **State** — sourced from the Zustand `beat-graph-store` `editor` slice
  (`decisions`, `finalUrl`, `thumbnailUrl`, `durationSeconds`, `conversation`,
  `committed`). Plus local `selectedClipIndex` + `latest` (most recent agent
  emission) + transient `thinking`, `baking`, `urlCopied`, `bootError`.
- **Boot** — `api.editorInit(manifest)` once on mount. Populates the editor
  slice. Then auto-fires the first agent turn so the proposal card has
  something to show.
- **Re-bake loop** — every patch (agent-accepted or direct-manipulation)
  calls `queueBake(next)`. Optimistic state update + 250ms-debounced
  `api.editorApply` → `setEditorBaked` with the post-trust-boundary
  `decisions`.
- **Helpers** — `patchClip(index, patch)` (per-clip merge + queueBake),
  `patchGlobal(patch)` (top-level merge + queueBake), `beatLabels` memo
  (beatId → `{name, mood}`), `callAgent(userMessage?)` (one editor turn).
- **Empty states** — `EditorAwaitingApprovalsFallback` for the no-manifest
  / no-approved-take cases. `SeedingFallback` for the dev `?seed=demo` path.
- **Outbound** — `Ship the cut` → `setFinalCinematic` → `navigate("/final")`.

### 3.2 `components/editor/editor-agent-panel.tsx`

The director's chat. Renders the conversation, the proposal card with three
follow-up pills, the commit summary on lock, and the input + "Lock the cut"
button. Stays the primary edit surface even with timeline + toolbar mounted.

| Prop | Type | Purpose |
|---|---|---|
| `conversation` | `EditorTurn[]` | History of `{role: "agent"\|"user", content, timestamp, decisions?}`. |
| `latest` | `EditorTurnResponse \| null` | Most recent agent emission — drives the proposal card. |
| `thinking` | `boolean` | Show the "Director is watching the cut" loader. |
| `committed` | `boolean` | Once locked, disable the input. |
| `livingDecisions` | `EditDecisions \| null` | If equal to `latest.decisions`, the proposal card swaps "Apply edit / Keep mine" for an "Applied" badge. |
| `onUserMessage(text)` | callback | Send a text turn → `/api/editor/turn`. |
| `onAcceptProposal()` | callback | Bake `latest.decisions`. |
| `onRevertProposal()` | callback | No-op + toast. The advisory proposal card is dismissed by accepting or counter-proposing. |
| `onCommitNow()` | callback | Synthetic "lock it" message → triggers `commitEdit`. |

### 3.3 `components/editor/editor-timeline.tsx`

Beat scrubber. One bar per clip; bar width is proportional to its trimmed
duration so trims visibly shrink the bar. Selected bar exposes left/right
trim handles with pointer-capture drag → maps pixel ratio back to source
seconds. Hovering shows the cross-fade tag (`↘ <ms>`).

| Prop | Type | Purpose |
|---|---|---|
| `decisions` | `EditDecisions` | The current cut. |
| `beatLabels` | `Record<beatId, {name, mood}>` | Bar label + mood-tinted gradient. |
| `selectedIndex` | `number \| null` | Which bar shows trim handles. |
| `onSelectClip(index)` | callback | Toggles selection. |
| `onPatchClip(index, patch)` | callback | Patches `trimStart` / `trimEnd` (and could carry any `EditClipDecision` field). |

### 3.4 `components/editor/editor-clip-detail.tsx`

Per-clip controls. Mounts in the editor route only when `selectedClipIndex !== null`.

| Prop | Type | Purpose |
|---|---|---|
| `index` | `number` | Beat ordinal. |
| `label` | `string` | Beat name. |
| `clip` | `EditClipDecision` | The clip being refined. |
| `onPatch(patch)` | callback | Patches `transitionMs` or `caption` on this clip. |
| `onClose()` | callback | Deselect (clears `selectedClipIndex`). |

Reads: trim numerics (read-only — drag the timeline handles to change them).
Writes: cross-fade slider (0–1200ms) and caption text input.

### 3.5 `components/editor/editor-toolbar.tsx`

Global controls. Patches top-level `EditDecisions` fields (never per-clip).

| Section | Field touched | Control |
|---|---|---|
| Look | `look: EditLook` | 6 buttons (`neutral`, `warm-archive`, `cool-modern`, `high-contrast-mono`, `punchy-trailer`, `soft-romance`). |
| Music bed | `audio: EditAudio \| null` | Toggle (Add demo bed / Remove music) + volume range slider (-40 to 0). |
| Ducking | `duckOriginalAudioDb` | Toggle: off vs `-12dB`. Visible only when music is on. |
| Captions | `captionPosition: "south" \| "north"` | Bottom / Top. |
| Watermark | `watermarkPublicId: string \| null` | Toggle: off vs `"sceneos-mark"`. |

Constant: `DEMO_MUSIC_TRACK = "audio/demo-bed"` — placeholder publicId until
a real audio library is scaffolded.

| Prop | Type | Purpose |
|---|---|---|
| `decisions` | `EditDecisions` | Reads current state. |
| `onPatch(patch)` | callback | Merges patch into top-level decisions. |

### 3.6 `routes/editor-route.tsx → CloudinaryArtifactStrip`

The prize-winning surface. Lives only in the editor route file (not extracted
to its own file because it's 1:1 coupled to that route's data).

Shows:

1. **Eyebrow** — "Cloudinary · single-URL bake" in ember.
2. **Master cut · live URL** — the bake target.
3. **Copy / Open** affordances on the URL.
4. **Mono URL block** — break-all, full transform pipeline visible.
5. **Transform-vocabulary chips** — derived from `EditDecisions` via
   `deriveTransformChips`. Each chip names a Cloudinary capability the
   current cut is using:
   - `fl_splice × N` — number of overlay splices.
   - `so / eo × N` — number of trimmed clips.
   - `e_fade × N` — number of cross-fades.
   - `e_brightness/contrast × N` — number of per-beat grades.
   - `l_text × N` — number of captioned beats.
   - `look:<name>` — global LUT, when not `neutral`.
   - `l_audio` — music bed when present.
   - `e_volume:<n>` — original-audio ducking when set.
   - `l_watermark` — watermark when present.
6. **Poster-frame derivative link** — `<thumbnailUrl>` (from
   `build_thumbnail_url` server-side). Click-to-open opens the same publicId
   transformed to JPG via `/so_auto/<id>.jpg`. Demonstrates that the same
   Cloudinary publicId yields both video and image derivatives by URL alone.

### 3.7 `lib/api.ts` — editor methods

```ts
api.editorInit(manifest: Manifest): Promise<EditorInitResponse>
api.editorTurn(body: EditorTurnRequest): Promise<EditorTurnResponse>
api.editorApply(body: EditorApplyRequest): Promise<EditorApplyResponse>
```

Streaming (`/api/editor/stream`) is reachable via raw fetch + ReadableStream
when the route opts in; today the editor route uses the one-shot `editorTurn`
endpoint.

### 3.8 `stores/beat-graph-store.ts` — editor slice

```ts
editor: {
  decisions: EditDecisions | null;
  conversation: EditorTurn[];
  finalUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  committed: boolean;
}
```

Mutations (used by the route):

- `setEditorBaked({decisions, finalUrl, thumbnailUrl, durationSeconds})` — replace baked state.
- `appendEditorTurn(turn)` — push a conversation turn.
- `markEditorCommitted()` — flip `committed: true`.
- `resetEditor()` — restore initial.

The slice is persisted by zustand-persist (see `partialize` in the store) so
mounting/unmounting `/edit` doesn't lose the user's edits.

---

## 4. Lifecycle of a single edit

Worked example: user drags the right trim handle on beat 3 to shorten it by 0.5s.

1. `EditorTimeline` pointer-move → `onPatchClip(2, {trimEnd: 5.5})`.
2. `editor-route.tsx:patchClip(2, {trimEnd: 5.5})` → merges into
   `editor.decisions.clips[2]` and calls `queueBake(next)`.
3. `queueBake` writes optimistic `decisions` to the store (UI updates
   instantly — bar shrinks) and schedules `bake(next)` for 250ms later.
4. Subsequent drag events refresh the pixel position locally and reset the
   timer; only the final pause fires `bake`.
5. `bake` calls `api.editorApply({manifest, decisions: next})`.
6. Backend `/api/editor/apply` runs `_normalize_decisions` (clamps
   `trimEnd ≤ durationSeconds`, validates effects, etc.), then
   `build_editor_url(normalized)`.
7. Response: `{finalUrl, thumbnailUrl, durationSeconds, decisions: <post-clamp>}`.
8. Frontend `setEditorBaked(...)` writes the response to the store.
9. `VideoPlayer` `src` is the new `finalUrl`; Cloudinary's CDN serves the
   re-baked MP4 (cache hit on shared transform prefixes, miss on the new tail).
10. `CloudinaryArtifactStrip` re-renders with the new URL and refreshed chips.

The same path is shared by every direct-manipulation control. Agent-led
edits go through `callAgent → bake`, which is the same `bake` function.

---

## 5. Tests pinning the contract

Backend (`backend_py/tests/`):

- `test_editor_url_fl_splice_lives_in_layer_opener` — `fl_splice` syntax trap.
- `test_editor_apply_produces_full_duration_cut` — 3-clip × 5s cut reports 15s.
- `test_apply_edit_decisions_rejects_hallucinated_publicid` — trust-boundary fence.
- `test_editor_security.py` — broader allowlist + clamp tests.
- `test_resilience.py:test_upload_video_*` — Cloudinary upload retry behavior.

Add a frontend test before shipping any timeline regression: drag the trim
handle, confirm `api.editorApply` is called once after debounce, confirm
the URL changes.

---

## 6. What is **not** in the editor (intentional)

- No render server. No ffmpeg. No "export" job. The Cloudinary URL **is** the
  export — copy it, embed it, ship it.
- No timeline ruler in seconds. The bar widths encode the durations
  proportionally; the readout is mono numerals on the bar and on the URL strip.
- No keyframe-by-keyframe scrubber. The editor is beat-granular, not frame-granular.
- No multi-track audio. One global music bed; the original Veo-baked audio
  rides under it (with optional ducking).
- No clip reordering. Beat order is pinned to the manifest. Reordering would
  break narrative continuity (the agent-built arc) and isn't a hackathon need.
- No undo stack beyond agent proposals. Every accepted proposal is its own
  bake; the user goes back by counter-proposing.

These cuts keep the demo legible in 60 seconds. The Cloudinary capability set
(splice, trim, transitions, color, captions, audio, watermark, LUT, ducking,
poster-frame derivative) covers the entire surface we want to advertise.
