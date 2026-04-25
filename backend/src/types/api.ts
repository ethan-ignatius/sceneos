/**
 * Mirror of frontend/src/types/api.ts.
 * Source of truth: docs/SHARED_TYPES.md
 */
import type { Manifest } from "./manifest.js";

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
  beatTemplate?: string; // helps the cached provider locate the right clip
}

/**
 * Dispatch tiers, switched via GENERATION_PROVIDER env var.
 *  - higgsfield: recorded-demo tier (best quality, slow)
 *  - kling:      live-demo tier (faster, slightly lower quality)
 *  - fal:        fast/cheap real-AI tier via fal.ai (LTX-Video)
 *  - replicate:  multi-model fallback
 *  - cached:     hard-coded demo project (instant, on-stage safety net)
 */
export type GenerationProvider = "higgsfield" | "kling" | "fal" | "replicate" | "cached";

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
