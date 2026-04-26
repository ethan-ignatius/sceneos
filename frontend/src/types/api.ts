/**
 * API request/response shapes. Frontend canonical copy; the FastAPI backend
 * (backend_py/sceneos_py) accepts/returns these same shapes via dict bodies.
 * Source of truth: docs/SHARED_TYPES.md
 */
import type {
  Beat,
  BeatArchetype,
  BeatFacts,
  BeatTemplate,
  ClipPrompt,
  Manifest,
  SessionMode,
  VideoType,
} from "./manifest";

// BeatFacts lives in manifest.ts so Scene can reference it without an import
// cycle. Re-exported here because the rest of the app imports it from
// "@/types/api" alongside the request/response shapes that consume it.
export type { BeatFacts } from "./manifest";

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
      /** Optional quick replies (0..4). Empty/absent means open-ended. */
      suggestedAnswers?: string[];
    }
  | {
      kind: "sufficient";
      refinedPrompt: string;
      sceneSummary: string;
      suggestedDuration: number;
      /**
       * Structured handoff to the orchestrator. Frontend should pass this
       * directly to /api/orchestrate/{beatId} as `beatFacts`.
       */
      beatFacts?: BeatFacts;
    };

/**
 * SSE events streamed by POST /api/agent/stream. Frontend consumes via
 * fetch + ReadableStream (POST → no EventSource).
 */
export type AgentStreamEvent =
  | { type: "ready" }
  | { type: "thought"; chunk: string }
  // Gemini emits "text" when the model returns prose without selecting a
  // tool. Treated like "thought" by the UI so the user sees live tokens.
  | { type: "text"; chunk: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | ({ type: "result" } & (
      | { kind: "question"; question: string; reasoning: string; estimatedRemaining: number; suggestedAnswers?: string[] }
      | { kind: "sufficient"; refinedPrompt: string; sceneSummary: string; suggestedDuration: number; beatFacts?: BeatFacts }
    ))
  | { type: "error"; message: string }
  | { type: "done" };

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

export interface GenerateResponse {
  jobId: string;
  provider: GenerationProvider;
  pollAfterMs: number;
  /**
   * Set by the backend when the active provider rejected the call (quota,
   * safety filter, network) and we auto-fell-back to the `cached` demo
   * lane. The frontend uses this pair to show a tasteful "demo lane"
   * badge on the resulting clip — judges should see WHEN we're showing
   * a real Veo render vs a demo-cloud cached clip.
   */
  originalProvider?: GenerationProvider;
  fallbackReason?: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  stage?: "veo_running" | "cloudinary_uploading" | "cloudinary_uploaded" | string;
  /** Optional orchestrator queue job id when status is proxied through orch::<id>. */
  orchestratorJobId?: string;
  /** Encoded provider::<id> handle when orchestrator has submitted downstream. */
  providerJobId?: string;
  clipUrl?: string;
  clipPublicId?: string;
  /**
   * Cloudinary `so_99p` derivative — near-final frame of the clip as a JPG.
   * Set when status === "succeeded" AND clipPublicId is set. Pass to the
   * next beat's /api/orchestrate as `previousLastFrameUrl` to chain.
   */
  lastFrameUrl?: string;
  error?: string;
  pollAfterMs?: number;
  provider?: GenerationProvider;
  /**
   * ISO-8601 timestamp captured server-side when the provider job was first
   * dispatched. The frontend uses this as the elapsed-time source so closing
   * and re-opening a drawer mid-generation doesn't restart the progress bar
   * from zero. Only present for providers that track it (Vertex today).
   */
  startedAt?: string;
  /** Free-form backend observability payload (timings, trace metadata). */
  observability?: Record<string, unknown>;
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
  /** The audio overlay used in the splice (echoed back for client display). */
  audioPublicId?: string;
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
 * SSE events streamed by POST /api/editor/stream. Same envelope as the
 * main agent stream — discriminator is `type`. The `result` event mirrors
 * the EditorTurnResponse shape so consumers can apply identical logic
 * regardless of streaming vs one-shot endpoint.
 */
export type EditorStreamEvent =
  | { type: "ready" }
  | { type: "thought"; chunk: string }
  | { type: "text"; chunk: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | ({ type: "result" } & (
      | { kind: "propose"; decisions: EditDecisions; rationale: string; suggestedFollowups: string[] }
      | { kind: "commit"; decisions: EditDecisions; rationale: string; summary: string }
    ))
  | { type: "error"; message: string }
  | { type: "done" };

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

// ─────────────────────────────────────────────────────────────────────────
// Round 4 (2026-04-25) modern surface — added alongside the legacy types
// above so frontend can adopt incrementally.
// ─────────────────────────────────────────────────────────────────────────

/** POST /api/session/start */
export interface SessionStartRequest {
  /** "demo" speculatively pre-generates all 7 beats; "normal" is agent-driven. */
  mode: SessionMode;
  /** Power-user override; otherwise a curated prompt is picked for the mode. */
  masterPromptOverride?: string;
  /** Pin to a specific curated prompt by id (see backend demo_prompts.py). */
  promptId?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface ProjectRef {
  imageUrl: string;
  publicId: string;
  kind: "character" | "location";
  prompt: string;
  /** Set when Imagen safety-filtered the prompt and the stub asset was used. */
  stub?: boolean;
  degraded?: string;
}

/**
 * Project-level references generated ONCE per project. Every beat reuses
 * these as its I2V seed so the protagonist + world stay consistent across
 * all 7 beats. This is the most-noticed-by-humans correctness property.
 */
export interface ProjectRefs {
  character: ProjectRef | null;
  location: ProjectRef | null;
}

/**
 * Per-beat speculative job summary returned by demo session/start. Same
 * shape as the orchestrate response; frontend can poll /api/status/{jobId}
 * immediately for each.
 */
export interface SpeculativeJob {
  speculative: true;
  beatId?: string;
  startedAt?: string;
  sceneId?: string;
  jobId?: string;
  provider?: GenerationProvider;
  pollAfterMs?: number;
  chainFromPrevious?: boolean;
  seedImageUrl?: string;
  characterRef?: ProjectRef | null;
  locationRef?: ProjectRef | null;
  sharedRefs?: boolean;
  motionPreset?: Record<string, string>;
  clipPrompt?: ClipPrompt;
  refinedPrompt?: string;
  /** When the speculative-kickoff timed out or this beat failed to submit. */
  error?: string;
  /** Set when the orchestrator's provider-fallback path swapped in cached. */
  originalProvider?: GenerationProvider;
  fallbackReason?: string;
}

export interface SessionStartResponse {
  projectId: string;
  mode: SessionMode;
  masterPrompt: string;
  videoType: VideoType;
  manifest: Manifest;
  /** Demo only: the picked curated prompt id. */
  demoPromptId?: string;
  /** Normal only: the picked curated prompt id. */
  normalPromptId?: string;
  /** Demo only: project-level shared character + location refs. */
  projectRefs?: ProjectRefs;
  /** Demo only: kickoff jobs keyed by beatId. */
  speculativeJobs?: Record<string, SpeculativeJob>;
}

/** GET /api/session/{projectId} — reconcile state on refresh. */
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

/** POST /api/orchestrate/{beatId} */
export interface OrchestrateRequest {
  manifest: Manifest;
  beatFacts: BeatFacts;
  /** Last-frame URL of the previous beat; used for I2V chaining. */
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
  /** True when project-level shared refs were used as the I2V seed. */
  sharedRefs: boolean;
  motionPreset: Record<string, string>;
  clipPrompt: ClipPrompt;
  refinedPrompt: string;
  /** Demo-mode lookup hit — the orchestrator returned the pre-warmed job. */
  speculativeReused?: boolean;
  /** Set when the active provider failed and `cached` was used instead. */
  originalProvider?: GenerationProvider;
  fallbackReason?: string;
}

/** POST /api/references/generate */
export interface ReferenceGenerateRequest {
  kind: "character" | "location";
  description: string;
  projectId?: string;
  beatId?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export type ReferenceGenerateResponse = ProjectRef;
