/**
 * Replicate fallback — multi-model gateway.
 *
 * Tier: emergency fallback if both Higgsfield and Kling are down.
 * Replicate hosts multiple text-to-video / image-to-video models behind
 * a single API; pick whichever is up at runtime.
 *
 * Owner: stretch
 */
import type { JobStatus } from "../types/api.js";
import { encodeJobId, type GenerateClipParams } from "./provider.js";

export async function generate(_params: GenerateClipParams): Promise<{ jobId: string }> {
  // TODO: POST https://api.replicate.com/v1/predictions with REPLICATE_API_TOKEN
  void encodeJobId;
  throw new Error("services/replicate.ts: generate not implemented");
}

export async function getStatus(_jobId: string): Promise<{ status: JobStatus; clipUrl?: string; error?: string }> {
  throw new Error("services/replicate.ts: getStatus not implemented");
}
