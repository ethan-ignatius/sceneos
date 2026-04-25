/**
 * Mirror of frontend/src/types/api.ts.
 * Source of truth: docs/SHARED_TYPES.md
 */
import type {
  BeatArchetype,
  BeatTemplate,
  HiggsfieldClipPrompt,
  Manifest,
  VideoType,
} from "./manifest.js";

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
}

export type GenerationProvider = "higgsfield" | "segmind" | "replicate";

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
}

export interface StitchRequest {
  manifest: Manifest;
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

/**
 * POST /api/decompose
 *
 * One-shot LLM call that turns the master prompt into a Higgsfield-ready
 * clip prompt for every beat in the graph. The frontend posts the master
 * prompt + the (already-built) beat skeleton; the backend returns one
 * HiggsfieldClipPrompt per beat, keyed by beatId.
 */
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
  /** Optional: short character/world bible the agent can reuse for continuity. */
  continuityBible?: string;
}

export interface DecomposedClip {
  beatId: string;
  /** Human-readable scene summary for the node UI. */
  sceneSummary: string;
  /** A single coherent paragraph suitable for downstream agents/editors. */
  refinedPrompt: string;
  /** The actual Higgsfield-shaped prompt envelope (text-to-image + image-to-video). */
  clipPrompt: HiggsfieldClipPrompt;
}
