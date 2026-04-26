# SceneOS — Shared Types

> Source of truth for TypeScript interfaces shared between `frontend/` and `backend/`.
> Last updated: 2026-04-25 (round 4 — modern surface appendix at section 9 supersedes older session/agent/orchestrate definitions where they conflict).

These types are duplicated in:
- `frontend/src/types/manifest.ts`
- `backend/src/types/manifest.ts`

**Rule:** when you change a type here, update both copies in the same commit. (At a future stage, we can extract a `packages/shared` workspace; for hackathon scope, copy is fine.)

---

## 1. Core manifest

```ts
/**
 * The whole project. Lives in frontend Zustand and is the request body
 * to most backend endpoints. Backend is largely stateless w.r.t. this.
 */
export interface Manifest {
  projectId: string;             // uuid v4, generated client-side
  videoType: VideoType;
  masterPrompt: string;
  createdAt: string;             // ISO 8601
  beats: Beat[];                 // ordered
  finalCloudinaryUrl?: string;   // computed by /api/stitch/url
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export type VideoType = "trailer" | "short" | "feature";
```

---

## 2. Beats and scenes

```ts
export interface Beat {
  beatId: string;
  beatName: string;              // "Establishing", "Hook", ...
  template: BeatTemplate;
  status: BeatStatus;
  scenes: Scene[];               // length 1 unless feature mode w/ recursion
  archetype: BeatArchetype;      // visual + LLM context
}

export type BeatStatus =
  | "pending"                    // not yet visited
  | "questioning"                // agent is asking
  | "ready-to-generate"          // sufficient info; waiting for click
  | "generating"                 // Higgsfield job in flight
  | "preview"                    // clip available, awaiting approval
  | "approved";                  // locked in, contributes to final URL

export type BeatTemplate =
  | "trailer.establishing"
  | "trailer.hook"
  | "trailer.rising"
  | "trailer.climax-tease"
  | "trailer.sting"
  | "short.hook"
  | "short.turn"
  | "short.payoff"
  | "feature.setup"
  | "feature.inciting"
  | "feature.rising"
  | "feature.midpoint"
  | "feature.crisis"
  | "feature.climax"
  | "feature.denouement";

export interface BeatArchetype {
  /** What the agent is trying to extract for this beat. */
  intent: string;
  /** Visual mood — informs Cloudinary color grade transformation. */
  mood: BeatMood;
  /** Suggested duration. Final duration is per-scene. */
  suggestedDuration: number;     // seconds
}

export type BeatMood =
  | "wide-establish"
  | "intimate-hook"
  | "kinetic-rising"
  | "tense-climax"
  | "still-resolve"
  | "punchy-sting";
```

---

## 3. Scene + agent conversation

```ts
export interface Scene {
  sceneId: string;
  conversation: AgentTurn[];
  refinedPrompt?: string;        // emitted by agent on sufficiency
  clipPrompt?: HiggsfieldClipPrompt; // emitted by /api/decompose
  jobId?: string;                // Higgsfield job
  clipPublicId?: string;         // Cloudinary public_id for fl_splice
  clipUrl?: string;              // Cloudinary delivery URL for preview
  durationSeconds?: number;
  approved: boolean;
}

export interface HiggsfieldClipPrompt {
  imagePrompt: string;           // → text-to-image (e.g. soul/standard)
  motionPrompt: string;          // → image-to-video (e.g. dop/standard)
  aspectRatio: HiggsfieldAspectRatio;
  resolution: HiggsfieldResolution;
  durationSeconds: number;
  preferredModel: string;        // higgsfield model_id
}

export type HiggsfieldAspectRatio = "16:9" | "9:16" | "1:1";
export type HiggsfieldResolution = "720p" | "1080p";

export interface AgentTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;             // ISO 8601
}
```

---

## 4. Backend API

### `POST /api/agent`

```ts
export interface AgentRequest {
  manifest: Manifest;
  beatId: string;
  userMessage?: string;          // null on first call
}

export type AgentResponse =
  | {
      kind: "question";
      question: string;
      reasoning: string;
      estimatedRemaining: number;     // soft hint, never exact
      suggestedAnswers?: [string, string, string];  // 3 different-direction options
    }
  | {
      kind: "sufficient";
      refinedPrompt: string;
      sceneSummary: string;            // human-readable summary for the UI
      suggestedDuration: number;
      beatFacts?: BeatFacts;           // structured extraction → orchestrator input
    };

/**
 * Structured facts extracted by the agent at markSufficient.
 * The deterministic pipeline (orchestrator) reads this — never the raw conversation.
 * Without beatFacts, the orchestrator has nothing to dispatch on.
 */
export interface BeatFacts {
  subject: string;                 // who/what is in frame
  action: string;                  // what they do
  setting: string;                 // where it happens
  framing?: string;                // lens / camera distance / movement
  mood: string;                    // emotional register
  characterDescription?: string;   // appearance, costume, identifying details — for ref-image gen
  locationDescription?: string;    // place visual details — for ref-image gen
}

### `POST /api/generate`

```ts
export interface GenerateRequest {
  projectId: string;
  beatId: string;
  sceneId: string;
  refinedPrompt: string;
  durationSeconds: number;
  /** Helps the cached provider locate the right pre-rendered clip. */
  beatTemplate?: string;
  /**
   * Chained generation: pass the previous beat's `lastFrameUrl` to seed I2V.
   * Honored by fal, vertex (Veo I2V), and higgsfield (skips T2I and goes
   * straight to I2V). When omitted, providers do their own keyframe gen.
   */
  startImageUrl?: string;
  /** The full clipPrompt (imagePrompt + motionPrompt + ...) — provider-specific. */
  clipPrompt?: HiggsfieldClipPrompt;
}

export interface GenerateResponse {
  jobId: string;
  provider: GenerationProvider;
  pollAfterMs: number;
}

/**
 * Dispatch tiers, switched via backend GENERATION_PROVIDER env var.
 *  - higgsfield: recorded-demo tier (best quality, slow)
 *  - kling:      live-demo tier (faster, slightly lower quality)
 *  - fal:        fast/cheap real-AI tier via fal.ai (LTX-Video)
 *  - vertex:     Vertex AI Veo 3.1 Fast (Google Cloud — service-account auth)
 *  - replicate:  multi-model fallback
 *  - cached:     hard-coded demo project (instant, on-stage safety net)
 */
export type GenerationProvider =
  | "higgsfield"
  | "kling"
  | "fal"
  | "vertex"
  | "replicate"
  | "cached";
```

### `GET /api/status/:jobId`

```ts
export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  clipUrl?: string;
  clipPublicId?: string;
  /**
   * Chain primitive: present iff status === "succeeded" AND clipPublicId
   * is set. Cloudinary `so_99p` derivative — the near-final frame of the
   * clip as a JPG. Pass this as `startImageUrl` on the next beat's
   * /api/generate call to chain consecutive scenes.
   */
  lastFrameUrl?: string;
  error?: string;
  pollAfterMs?: number;          // present iff status is queued/running
  provider?: GenerationProvider; // echoed for client display
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
```

### `POST /api/stitch/url`

```ts
export interface StitchRequest {
  manifest: Manifest;
  /** Optional public_id of a Cloudinary audio asset to overlay across the final cut. */
  audioPublicId?: string;
  /** When true, applies per-beat mood color grading to each clip in the splice. */
  colorGrade?: boolean;
}

export interface StitchResponse {
  finalUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
}
```

### `POST /api/decompose`

One-shot LLM call that turns the master prompt into a Higgsfield-ready clip
prompt for every beat. Called by the frontend immediately after the user
submits the master prompt.

```ts
export interface DecomposeRequest {
  masterPrompt: string;
  videoType: VideoType;
  beats: DecomposeBeatInput[];
}

export interface DecomposeBeatInput {
  beatId: string;
  template: BeatTemplate;
  beatName: string;
  archetype: BeatArchetype;
}

export interface DecomposeResponse {
  clips: DecomposedClip[];
  continuityBible?: string;
}

export interface DecomposedClip {
  beatId: string;
  sceneSummary: string;
  refinedPrompt: string;
  clipPrompt: HiggsfieldClipPrompt;
}
```

### `POST /api/cutos/import`

```ts
export interface CutOSImportRequest {
  manifest: Manifest;
}

export interface CutOSImportResponse {
  projectId: string;
  editUrl: string;               // deep link into CutOS
}
```

---

## 5. Outbound to CutOS

What we send to **CutOS's** `POST /api/projects/import-manifest`:

```ts
export interface CutOSImportPayload {
  projectName: string;
  resolution: "1920x1080";
  frameRate: 24;
  beats: Array<{
    beat_id: string;
    prompt: string;
    duration: number;
    clip_url: string;
    clip_storage_path?: string;
  }>;
}

export interface CutOSImportResponseFromCutOS {
  projectId: string;
}
```

---

## 6. Cloudinary helpers

```ts
export interface CloudinaryUploadResult {
  publicId: string;
  resourceType: "video" | "image" | "audio";
  url: string;
  durationSeconds?: number;
  bytes: number;
  format: string;
}

export interface FinalUrlOptions {
  audioPublicId?: string;        // adds l_audio overlay
  colorGradePerBeat?: boolean;   // applies mood-based grading
  watermark?: string;            // optional public_id
}
```

---

## 7. Beat-template registry

The frontend uses this to spawn nodes. The agent uses it to constrain the questionnaire.

```ts
export interface BeatTemplateDef {
  template: BeatTemplate;
  videoType: VideoType;
  beatName: string;              // human label
  archetype: BeatArchetype;
  agentSystemPrompt: string;     // injected when agent works on this beat
  ordering: number;              // 0-indexed sequence within the video type
}

export const BEAT_TEMPLATE_REGISTRY: Record<BeatTemplate, BeatTemplateDef> = {
  // ...defined in frontend/src/lib/beat-templates.ts and mirrored backend-side
};
```

---

## 8. Defaults

```ts
export const DEFAULT_DURATIONS: Record<VideoType, number[]> = {
  trailer: [8, 12, 18, 14, 8],            // sums to 60s
  short: [5, 10, 5],                       // sums to 20s
  feature: [20, 25, 35, 25, 30, 25, 20],   // sums to ~3min
};

export const POLL_INTERVAL_MS = 5000;
export const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
export const SUFFICIENCY_MIN_QUESTIONS = 2;
export const SUFFICIENCY_MAX_QUESTIONS = 6;
```

---

## 9. Modern surface (round 4, 2026-04-25)

The frontend should use these endpoints + types. Where they conflict with sections 1–4 above (e.g. `VideoType`, `AgentResponse`), this section wins.

### 9.1. Updated `VideoType` + `Manifest`

```ts
/** Backend-canonical as of 2026-04-25. "story" is the primary path. */
export type VideoType = "story" | "trailer" | "short" | "feature";

export type SessionMode = "demo" | "normal";

export interface Manifest {
  projectId: string;
  videoType: VideoType;
  masterPrompt: string;
  createdAt: string;
  beats: Beat[];
  /** Stamped by /api/session/start. Read by agent + orchestrator + visualizer. */
  mode?: SessionMode;
  /**
   * Picked by /api/session/start (mood/videoType-based) and stamped on the
   * manifest. /api/stitch/url uses this as the audio overlay if no explicit
   * `audioPublicId` is in the stitch body.
   */
  audioPublicId?: string;
  finalCloudinaryUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}
```

`BeatTemplate` adds the 7 `story.*` templates: `story.hook`, `story.exposition`, `story.inciting`, `story.rising`, `story.climax`, `story.falling`, `story.resolution`.

### 9.2. `POST /api/session/start`

```ts
export interface SessionStartRequest {
  mode: SessionMode;                 // required
  masterPromptOverride?: string;
  promptId?: string;                 // pin to a curated prompt
  aspectRatio?: "16:9" | "9:16" | "1:1";  // default "16:9"
}

export interface SessionStartResponse {
  projectId: string;
  mode: SessionMode;
  masterPrompt: string;
  videoType: VideoType;
  manifest: Manifest;
  demoPromptId?: string;             // demo only
  normalPromptId?: string;           // normal only
  projectRefs?: ProjectRefs;         // demo only — character + location
  speculativeJobs?: Record<string, SpeculativeJob>; // demo only — keyed by beatId
}

export interface ProjectRef {
  imageUrl: string;
  publicId: string;
  kind: "character" | "location";
  prompt: string;
  stub?: boolean;                    // true when Imagen safety-filtered
  degraded?: string;
}

export interface ProjectRefs {
  character: ProjectRef | null;
  location: ProjectRef | null;
}
```

In demo mode the response is large because the backend has already fanned out all 7 beat pipelines in parallel. The frontend can poll `/api/status/{jobId}` for each immediately. When the agent eventually calls `markSufficient` for a beat, `/api/orchestrate/{beatId}` returns the pre-warmed job — no new work happens. The speculative-kickoff phase is bounded at 90s; on timeout each missing beat ships `{ speculative: true, error: "timeout" }`.

### 9.3. `GET /api/session/{projectId}`

Reconcile a frontend's in-memory state with the backend's session cache after a refresh / late-join. Avoids burning a fresh Imagen call + 7 video submissions in demo mode.

```ts
export interface SessionGetResponse {
  projectId: string;
  mode: SessionMode;
  masterPrompt: string;
  videoType: VideoType;
  createdAt: string;
  manifest: Manifest;
  demoPromptId?: string;
  normalPromptId?: string;
  projectRefs?: ProjectRefs;
  speculativeJobs?: Record<string, SpeculativeJob>;
}
```

`404` when the projectId is unknown.

### 9.4. `POST /api/agent/stream` (SSE)

Server-Sent Events stream of one agent turn. Frontend consumes via `fetch` + `ReadableStream` (POST body, so `EventSource` doesn't apply).

Body is the same shape as `/api/agent` (`AgentRequest`). Events:

```ts
export type AgentStreamEvent =
  | { type: "ready" }
  | { type: "thought"; chunk: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | ({ type: "result" } & AgentResponse)
  | { type: "error"; message: string }
  | { type: "done" };
```

`AgentResponse` itself now has `suggestedAnswers` on the `question` branch and `beatFacts` on the `sufficient` branch:

```ts
export interface BeatFacts {
  subject?: string;
  action?: string;
  setting?: string;
  framing?: string;
  mood?: string;
  characterDescription?: string;     // for Imagen reference image
  locationDescription?: string;      // for Imagen reference image
}

export type AgentResponse =
  | { kind: "question"; question: string; reasoning: string; estimatedRemaining: number; suggestedAnswers?: [string, string, string] }
  | { kind: "sufficient"; refinedPrompt: string; sceneSummary: string; suggestedDuration: number; beatFacts?: BeatFacts };
```

### 9.5. `POST /api/orchestrate/{beatId}`

Runs the deterministic per-beat pipeline: `beatFacts` → motion preset → reference images (or shared project refs) → clipPrompt → provider.generate(). The frontend calls this AFTER the agent emits `kind: "sufficient"`. In demo mode the call returns the pre-warmed speculative job — no new work.

```ts
export interface OrchestrateRequest {
  manifest: Manifest;
  beatFacts: BeatFacts;
  /** From the previous beat's /api/status response — enables I2V chaining. */
  previousLastFrameUrl?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface OrchestrateResponse {
  sceneId: string;
  jobId: string;
  provider: GenerationProvider;
  pollAfterMs: number;
  chainFromPrevious: boolean;
  seedImageUrl?: string | null;
  characterRef?: ProjectRef | null;
  locationRef?: ProjectRef | null;
  sharedRefs: boolean;               // true when project_refs were used
  motionPreset: Record<string, string>;
  clipPrompt: ClipPrompt;
  refinedPrompt: string;
  speculativeReused?: boolean;       // demo cache hit
  /** Set when active provider failed and `cached` was used instead. */
  originalProvider?: GenerationProvider;
  fallbackReason?: string;
}
```

### 9.6. `POST /api/references/generate`

Single-call Imagen 3 generation (character or location). Use this if you want to run Imagen on demand outside the orchestrator (e.g. user clicks "regenerate character" in the UI).

```ts
export interface ReferenceGenerateRequest {
  kind: "character" | "location";
  description: string;
  projectId?: string;
  beatId?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export type ReferenceGenerateResponse = ProjectRef;
```

### 9.7. `GET /api/status/{jobId}` — `lastFrameUrl`

`StatusResponse` adds:

```ts
/**
 * Cloudinary `so_99p` derivative — near-final frame of the clip as a JPG.
 * Set when status === "succeeded" AND clipPublicId is set. Pass to the
 * next beat's /api/orchestrate as `previousLastFrameUrl` to chain.
 */
lastFrameUrl?: string;
```

### 9.8. `POST /api/stitch/url` — `audioPublicId`

`StitchResponse` echoes back the audio overlay used:

```ts
audioPublicId?: string;
```

The frontend can show "Soundtrack: …" in the export confirmation UI.
