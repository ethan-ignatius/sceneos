/**
 * Provider interface for video-clip generators.
 *
 * Every provider (mock, Higgsfield Cloud, Segmind, Replicate, Fal.ai) implements
 * the same two methods so services/generation.ts can dispatch to whichever one
 * is configured via env vars. Adding a new provider = drop a file in this folder
 * and register it in services/generation.ts.
 */
import type { GenerationProvider, JobStatus } from "../../types/api.js";

export interface ProviderGenerateParams {
  prompt: string;
  durationSeconds: number;
  /** Optional reference image URL — required for image-to-video providers. */
  startImageUrl?: string;
  resolution?: "1080p" | "720p";
}

export interface ProviderGenerateResult {
  /** The provider's own job identifier — opaque to us. */
  providerJobId: string;
  /** Hint to the client for first-poll cadence. */
  pollAfterMs: number;
}

export interface ProviderStatusResult {
  status: JobStatus;
  /** Provider-hosted MP4 URL once status === "succeeded". */
  clipUrl?: string;
  error?: string;
}

export interface VideoProvider {
  readonly name: GenerationProvider;
  generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult>;
  getStatus(providerJobId: string): Promise<ProviderStatusResult>;
}

/** Thrown when a provider hits a quota/rate limit. Caller may retry on a fallback provider. */
export class ProviderQuotaError extends Error {
  constructor(public readonly provider: GenerationProvider, message: string) {
    super(message);
    this.name = "ProviderQuotaError";
  }
}
