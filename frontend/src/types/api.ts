/**
 * API request/response shapes. Mirror of backend/src/types/api.ts.
 * Source of truth: docs/SHARED_TYPES.md
 */
import type {
  BeatArchetype,
  BeatTemplate,
  HiggsfieldClipPrompt,
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
 *  - replicate:  multi-model fallback
 *  - cached:     hard-coded demo project (instant, on-stage safety net)
 */
export type GenerationProvider = "higgsfield" | "kling" | "replicate" | "cached";

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
