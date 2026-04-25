/**
 * API request/response shapes. Frontend canonical copy; the FastAPI backend
 * (backend_py/sceneos_py) accepts/returns these same shapes via dict bodies.
 * Source of truth: docs/SHARED_TYPES.md
 */
import type {
  BeatArchetype,
  BeatTemplate,
  Manifest,
  VideoType,
} from "./manifest";

export interface AgentRequest {
  manifest: Manifest;
  beatId: string;
  userMessage?: string;
}

export type AgentResponse =
  | {
      kind: "question";
      question: string;
      reasoning: string;
      estimatedRemaining: number;
    }
  | {
      kind: "sufficient";
      refinedPrompt: string;
      sceneSummary: string;
      suggestedDuration: number;
    };

export interface GenerateRequest {
  projectId: string;
  beatId: string;
  sceneId: string;
  refinedPrompt: string;
  durationSeconds: number;
  beatTemplate?: string;
}

/**
 * Dispatch tiers, switched via backend GENERATION_PROVIDER env var.
 *  - higgsfield: recorded-demo tier (best quality, slow)
 *  - kling:      live-demo tier (faster, slightly lower quality)
 *  - fal:        fast/cheap real-AI tier via fal.ai (LTX-Video)
 *  - vertex:     Vertex AI Veo 3 (Google Cloud — service-account auth)
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

export interface GenerateResponse {
  jobId: string;
  provider: GenerationProvider;
  pollAfterMs: number;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  clipUrl?: string;
  clipPublicId?: string;
  error?: string;
  pollAfterMs?: number;
  provider?: GenerationProvider;
}

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

export interface CutOSImportRequest {
  manifest: Manifest;
}

export interface CutOSImportResponse {
  projectId: string;
  editUrl: string;
}

// ────────────────────────────────────────────────────────────────────────
// Editor (Stage 7) — agentic post-stitch refinement.
// All decisions deterministically bake into a single Cloudinary URL via
// /api/editor/apply. No render server, no ffmpeg.
// ────────────────────────────────────────────────────────────────────────

/** Global look LUT names. Keep in sync with backend cloudinary.LOOK_PRESETS. */
export type EditLook =
  | "neutral"
  | "warm-archive"
  | "cool-modern"
  | "high-contrast-mono"
  | "punchy-trailer"
  | "soft-romance";

export interface EditClipDecision {
  beatId?: string;
  publicId: string;
  durationSeconds: number;
  trimStart?: number;
  trimEnd?: number;
  /** Cloudinary effect string, e.g. "e_brightness:-15,e_contrast:10". */
  colorGrade?: string;
  /** Cross-fade INTO this clip from the previous one. Ignored on first clip. */
  transitionMs?: number;
  /** Caption shown for the duration of this beat. */
  caption?: string;
}

export interface EditAudio {
  publicId: string;
  /** Volume offset, e.g. -20 for quiet bed. */
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export interface EditDecisions {
  clips: EditClipDecision[];
  audio?: EditAudio | null;
  /** Volume offset on the original clip audio so music sits on top. */
  duckOriginalAudioDb?: number | null;
  watermarkPublicId?: string | null;
  look?: EditLook;
  captionPosition?: "south" | "north";
}

export interface EditorTurnRequest {
  manifest: Manifest;
  decisions?: EditDecisions;
  conversation?: { role: "agent" | "user"; content: string; timestamp?: string }[];
  userMessage?: string;
}

export type EditorTurnResponse =
  | {
      kind: "propose";
      decisions: EditDecisions;
      rationale: string;
      suggestedFollowups: string[];
    }
  | {
      kind: "commit";
      decisions: EditDecisions;
      rationale: string;
      summary: string;
    };

export interface EditorApplyRequest {
  manifest: Manifest;
  decisions: EditDecisions;
}

export interface EditorApplyResponse {
  finalUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  decisions: EditDecisions;
}

export interface EditorInitResponse extends EditorApplyResponse {}

/**
 * POST /api/decompose
 *
 * One-shot LLM call that turns the master prompt into a Higgsfield-ready
 * clip prompt envelope per beat. The frontend posts the master prompt +
 * the just-built beat skeleton; the backend returns one DecomposedClip
 * per input beat (matching beatIds, in order).
 */
export interface DecomposeBeatInput {
  beatId: string;
  template: BeatTemplate;
  beatName: string;
  archetype: BeatArchetype;
}

export interface DecomposeRequest {
  masterPrompt: string;
  videoType: VideoType;
  beats: DecomposeBeatInput[];
}

export interface DecomposedClip {
  beatId: string;
  /** Human-readable scene summary for the node UI. */
  sceneSummary: string;
  /** Single coherent paragraph for downstream agents/Veo generation. */
  refinedPrompt: string;
}

export interface DecomposeResponse {
  clips: DecomposedClip[];
  /** Optional: short character/world bible carried across beats. */
  continuityBible?: string;
}
