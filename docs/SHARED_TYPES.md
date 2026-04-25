# SceneOS — Shared Types

> Source of truth for TypeScript interfaces shared between `frontend/` and `backend/`.
> Last updated: 2026-04-25.

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
  jobId?: string;                // Higgsfield job
  clipPublicId?: string;         // Cloudinary public_id for fl_splice
  clipUrl?: string;              // Cloudinary delivery URL for preview
  durationSeconds?: number;
  approved: boolean;
}

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
      estimatedRemaining: number; // soft hint, never exact
    }
  | {
      kind: "sufficient";
      refinedPrompt: string;
      sceneSummary: string;       // human-readable summary for the UI
      suggestedDuration: number;
    };
```

### `POST /api/generate`

```ts
export interface GenerateRequest {
  projectId: string;
  beatId: string;
  sceneId: string;
  refinedPrompt: string;
  durationSeconds: number;
}

export interface GenerateResponse {
  jobId: string;
  provider: GenerationProvider;
  pollAfterMs: number;
}

export type GenerationProvider = "higgsfield" | "segmind" | "replicate" | "mock";
```

### `GET /api/status/:jobId`

```ts
export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  clipUrl?: string;
  clipPublicId?: string;
  error?: string;
  pollAfterMs?: number;          // present iff status is queued/running
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
```

### `POST /api/stitch/url`

```ts
export interface StitchRequest {
  manifest: Manifest;
}

export interface StitchResponse {
  finalUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
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
