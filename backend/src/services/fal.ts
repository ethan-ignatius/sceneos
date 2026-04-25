/**
 * fal.ai video-generation service — "fal" tier.
 *
 * Tier: fast, real-AI, cheap. fal hosts LTX-Video (and many other models)
 * behind a single client. fal.subscribe() polls the queue server-side and
 * resolves once the job is complete — from our point of view that's a
 * single blocking promise rather than a real async lifecycle.
 *
 * To plug into the existing /api/generate → /api/status poll loop without
 * changing it, we wrap that promise into a fake job:
 *   1. generate() kicks off fal.subscribe() in the background, mints a
 *      UUID, stores the running state in JOBS keyed by that UUID, and
 *      returns the UUID immediately as the providerJobId.
 *   2. getStatus() looks up the UUID — still pending → "running",
 *      resolved → "succeeded" with the MP4 URL, rejected → "failed".
 *
 * The result MP4 is fal-hosted; the URL plays directly in browsers, which
 * is enough for the test-pipeline.sh end-to-end check. (Cloudinary upload
 * for downstream fl_splice happens later, when status.ts is wired to
 * thread clipPublicId through.)
 *
 * Reference:
 *   https://fal.ai/models/fal-ai/ltx-video
 *   https://docs.fal.ai/clients/javascript
 */
import { randomUUID } from "node:crypto";
import { fal } from "@fal-ai/client";
import type { JobStatus } from "../types/api.js";
import type { GenerateClipParams } from "./provider.js";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) {
    throw new Error(
      "services/fal.ts: FAL_API_KEY is not set. Get a free key at https://fal.ai (signup includes $10 credit).",
    );
  }
  fal.config({ credentials: key });
  configured = true;
}

type FalJobState =
  | { status: "running" }
  | { status: "succeeded"; clipUrl: string }
  | { status: "failed"; error: string };

const JOBS = new Map<string, FalJobState>();

const MODEL_ID = "fal-ai/ltx-video";

interface LtxVideoInput {
  prompt: string;
  /** Optional first-frame conditioning. */
  image_url?: string;
  /** LTX accepts a target duration; clipped server-side to the model's range. */
  duration_seconds?: number;
}

interface LtxVideoOutput {
  video?: { url?: string };
}

export async function generate(
  params: GenerateClipParams & { startImageUrl?: string },
): Promise<{ jobId: string }> {
  ensureConfigured();

  const providerJobId = randomUUID();
  JOBS.set(providerJobId, { status: "running" });

  const input: LtxVideoInput = {
    prompt: params.refinedPrompt,
    duration_seconds: params.durationSeconds,
  };
  if (params.startImageUrl) input.image_url = params.startImageUrl;

  // Fire-and-forget: fal.subscribe() blocks until the queue completes, then
  // we flip the in-memory job state. The route returned the jobId already.
  void fal
    .subscribe(MODEL_ID, { input, logs: false })
    .then((result) => {
      const data = (result?.data ?? {}) as LtxVideoOutput;
      const url = data.video?.url;
      if (!url) {
        JOBS.set(providerJobId, {
          status: "failed",
          error: `fal returned no video url. Raw: ${JSON.stringify(result?.data ?? {}).slice(0, 200)}`,
        });
        return;
      }
      JOBS.set(providerJobId, { status: "succeeded", clipUrl: url });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      JOBS.set(providerJobId, { status: "failed", error: message });
    });

  return { jobId: providerJobId };
}

export async function getStatus(
  providerJobId: string,
): Promise<{ status: JobStatus; clipUrl?: string; error?: string }> {
  const job = JOBS.get(providerJobId);
  if (!job) {
    return { status: "failed", error: `Unknown fal jobId: ${providerJobId}` };
  }
  if (job.status === "running") return { status: "running" };
  if (job.status === "failed") return { status: "failed", error: job.error };
  return { status: "succeeded", clipUrl: job.clipUrl };
}
