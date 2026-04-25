/**
 * Provider dispatcher — switches the live generation engine via
 * the GENERATION_PROVIDER env var. See backend/.env.example for tiers.
 *
 * Routes do not import provider-specific clients directly; they call
 * `getProvider().generate(...)` and `.getStatus(...)`. This is what
 * lets us flip between higgsfield / kling / replicate / cached on the
 * day of the demo without touching code.
 */

import type { GenerationProvider, JobStatus } from "../types/api.js";
import type { HiggsfieldClipPrompt } from "../types/manifest.js";
import * as higgsfield from "./higgsfield.js";
import * as kling from "./kling.js";
import * as fal from "./fal.js";
import * as replicate from "./replicate.js";
import * as cached from "./cached-demo.js";

export interface ProviderModule {
  generate(params: GenerateClipParams): Promise<{ jobId: string }>;
  getStatus(jobId: string): Promise<{
    status: JobStatus;
    clipUrl?: string;
    clipPublicId?: string;
    error?: string;
  }>;
}

export interface GenerateClipParams {
  refinedPrompt: string;
  durationSeconds: number;
  beatTemplate?: string;
  clipPrompt?: HiggsfieldClipPrompt;
  projectId: string;
  beatId: string;
  sceneId: string;
}

const REGISTRY: Record<GenerationProvider, ProviderModule> = {
  higgsfield,
  kling,
  fal,
  replicate,
  cached,
};

export function getActiveProvider(): GenerationProvider {
  const raw = (process.env.GENERATION_PROVIDER ?? "higgsfield").trim().toLowerCase();
  if (raw in REGISTRY) return raw as GenerationProvider;
  console.warn(`[provider] Unknown GENERATION_PROVIDER="${raw}", falling back to higgsfield.`);
  return "higgsfield";
}

export function getProvider(): { name: GenerationProvider; impl: ProviderModule } {
  const name = getActiveProvider();
  return { name, impl: REGISTRY[name] };
}

/**
 * Encode the provider into the jobId so /api/status can route to the
 * right backend without an extra registry lookup. Keeps the backend
 * stateless across restarts.
 */
export function encodeJobId(provider: GenerationProvider, providerJobId: string): string {
  return `${provider}::${providerJobId}`;
}

export function decodeJobId(jobId: string): { provider: GenerationProvider; providerJobId: string } {
  const [provider, ...rest] = jobId.split("::");
  if (!(provider in REGISTRY)) {
    throw new Error(`Unknown provider in jobId: ${jobId}`);
  }
  return {
    provider: provider as GenerationProvider,
    providerJobId: rest.join("::"),
  };
}
