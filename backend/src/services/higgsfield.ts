/**
 * Higgsfield video-generation service.
 *
 * Owner: Vishnu
 *
 * Implementation notes (see docs/BACKEND_ARCHITECTURE.md §6):
 *  - Auth via HIGGSFIELD_API_KEY.
 *  - Prefer Sora 2 / Veo 3.1 for quality if available; fall back to Kling 3.0.
 *  - Latency: 60–180s per clip. Frontend polls.
 *  - On API errors / quota issues, fall back to services/segmind.ts or services/replicate.ts
 *    via a provider-agnostic interface (kept narrow on purpose).
 *
 * Reference:
 *   https://cloud.higgsfield.ai/
 *   https://github.com/higgsfield-ai/higgsfield-client (official Python SDK)
 *   https://www.segmind.com/models/higgsfield-image2video/api (third-party gateway)
 */

import type { JobStatus, GenerationProvider } from "../types/api.js";

export interface GenerateClipParams {
  prompt: string;
  durationSeconds: number;
  resolution?: "1080p" | "720p";
  model?: "sora-2" | "veo-3.1" | "kling-3.0";
}

export interface GenerateClipResult {
  jobId: string;
  provider: GenerationProvider;
}

export interface JobStatusResult {
  status: JobStatus;
  clipUrl?: string;     // Higgsfield-hosted URL when succeeded
  error?: string;
}

export async function generateClip(_params: GenerateClipParams): Promise<GenerateClipResult> {
  // TODO(vishnu): POST to Higgsfield, return jobId + provider.
  throw new Error("services/higgsfield.ts: not implemented");
}

export async function getJobStatus(_jobId: string): Promise<JobStatusResult> {
  // TODO(vishnu): GET Higgsfield job, map provider status to JobStatus union.
  throw new Error("services/higgsfield.ts: not implemented");
}
