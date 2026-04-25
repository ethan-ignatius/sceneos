/**
 * Video-generation facade. Filename preserved per docs/BACKEND_ARCHITECTURE.md;
 * this module is now provider-agnostic and dispatches to whichever provider is
 * active (mock when no keys, Higgsfield Cloud when HIGGSFIELD_API_KEY is set).
 *
 * Adding a new provider:
 *   1. Drop a file under services/providers/ implementing VideoProvider.
 *   2. Register it in `pickProvider()` below.
 *
 * No call site outside this file should import a concrete provider directly.
 */
import type { GenerateRequest, GenerateResponse, JobStatus } from "../types/api.js";
import { higgsfieldProvider } from "./providers/higgsfield-cloud.js";
import { mockProvider } from "./providers/mock.js";
import type { VideoProvider } from "./providers/types.js";
import { registerJob, getJob, type JobRecord } from "./job-registry.js";

function pickProvider(): VideoProvider {
  if (process.env.HIGGSFIELD_API_KEY) return higgsfieldProvider;
  return mockProvider;
}

const provider = pickProvider();

export const activeProviderName = provider.name;

console.log(`[generation] active provider: ${provider.name}`);

/**
 * Kick off generation, register the job under our internal id, and return
 * the response shape expected by routes/generate.ts.
 */
export async function startGeneration(req: GenerateRequest): Promise<GenerateResponse> {
  const { providerJobId, pollAfterMs } = await provider.generate({
    prompt: req.refinedPrompt,
    durationSeconds: req.durationSeconds,
    startImageUrl: process.env.TEST_REFERENCE_IMAGE_URL,
  });

  const jobId = registerJob({
    providerJobId,
    providerName: provider.name,
    projectId: req.projectId,
    beatId: req.beatId,
    sceneId: req.sceneId,
    durationSeconds: req.durationSeconds,
  });

  return { jobId, provider: provider.name, pollAfterMs };
}

export interface ProviderPollResult {
  job: JobRecord;
  status: JobStatus;
  providerClipUrl?: string;
  error?: string;
}

/**
 * Poll the active provider for a previously registered job. Returns the raw
 * provider state plus the registry record so the caller can decide what to do
 * (e.g. trigger a Cloudinary upload on first success).
 */
export async function pollProvider(jobId: string): Promise<ProviderPollResult | null> {
  const job = getJob(jobId);
  if (!job) return null;
  const status = await provider.getStatus(job.providerJobId);
  return {
    job,
    status: status.status,
    providerClipUrl: status.clipUrl,
    error: status.error,
  };
}
