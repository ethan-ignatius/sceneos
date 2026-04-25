/**
 * Higgsfield video-generation service.
 *
 * Two-stage flow per clip:
 *   1. text-to-image  → POST {DEFAULT_T2I_MODEL} with imagePrompt → keyframe URL
 *   2. image-to-video → POST {clipPrompt.preferredModel} with that URL +
 *      motionPrompt → final clip URL
 *
 * Higgsfield is asynchronous: each POST returns a request_id, and we have to
 * poll /requests/{id}/status until it succeeds. We model both stages with an
 * in-memory job registry — /api/generate kicks off stage 1, /api/status
 * advances the state machine on every poll.
 *
 * Env:
 *   HIGGSFIELD_API_KEY       — required
 *   HIGGSFIELD_API_SECRET    — required (auth header is `Key {key}:{secret}`)
 *   HIGGSFIELD_BASE_URL      — optional override of the lib default
 */

import { randomUUID } from "node:crypto";
import {
  authHeader,
  buildImage2VideoBody,
  buildText2ImageBody,
  cancelUrlFor,
  DEFAULT_T2I_MODEL,
  statusUrlFor,
  submitUrlFor,
} from "../lib/higgsfield-prompts.js";
import {
  getJob,
  putJob,
  type Job,
  type JobStage,
} from "./job-registry.js";
import type { JobStatus, GenerationProvider } from "../types/api.js";
import type { HiggsfieldClipPrompt } from "../types/manifest.js";
import type { GenerateClipParams as ProviderGenerateClipParams } from "./provider.js";
import { publicIdForScene, uploadVideoFromUrl } from "./cloudinary.js";

export interface GenerateClipParams {
  clipPrompt: HiggsfieldClipPrompt;
  beatId?: string;
  sceneId?: string;
  projectId?: string;
}

export interface GenerateClipResult {
  jobId: string;
  provider: GenerationProvider;
}

export interface JobStatusResult {
  status: JobStatus;
  clipUrl?: string;
  clipPublicId?: string;
  imageUrl?: string;
  error?: string;
}

interface Credentials {
  apiKey: string;
  apiSecret: string;
}

export async function generate(
  params: ProviderGenerateClipParams,
): Promise<{ jobId: string }> {
  const clipPrompt = params.clipPrompt ?? {
    imagePrompt: params.refinedPrompt,
    motionPrompt: params.refinedPrompt,
    aspectRatio: "16:9" as const,
    resolution: "1080p" as const,
    durationSeconds: params.durationSeconds,
    preferredModel: "higgsfield-ai/dop/standard",
  };
  const result = await generateClip({
    clipPrompt,
    beatId: params.beatId,
    sceneId: params.sceneId,
    projectId: params.projectId,
  });
  return { jobId: result.jobId };
}

export async function getStatus(jobId: string): Promise<JobStatusResult> {
  return getJobStatus(jobId);
}

/**
 * Kick off stage 1 (text-to-image) and persist the local job. The frontend
 * gets back a local jobId to poll.
 */
export async function generateClip(
  params: GenerateClipParams,
): Promise<GenerateClipResult> {
  const creds = readCredentials();
  if (!creds) {
    throw new Error(
      "generateClip: missing HIGGSFIELD_API_KEY/HIGGSFIELD_API_SECRET",
    );
  }

  const t2iBody = buildText2ImageBody(params.clipPrompt);
  const t2iSubmit = await postHiggsfield(
    submitUrlFor(DEFAULT_T2I_MODEL),
    t2iBody,
    creds,
  );
  const t2iRequestId = extractRequestId(t2iSubmit);
  if (!t2iRequestId) {
    throw new Error(
      `generateClip: text-to-image submission missing request_id (${JSON.stringify(t2iSubmit).slice(0, 200)})`,
    );
  }

  const jobId = `hf-${randomUUID()}`;
  const now = new Date().toISOString();
  putJob({
    jobId,
    stage: "t2i_running",
    clipPrompt: params.clipPrompt,
    t2iRequestId,
    createdAt: now,
    updatedAt: now,
    beatId: params.beatId,
    sceneId: params.sceneId,
    projectId: params.projectId,
  });

  return { jobId, provider: "higgsfield" };
}

/**
 * Advance the job's state machine and return what the frontend can show now.
 *
 * Called by GET /api/status/:jobId on every poll.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  const job = getJob(jobId);
  if (!job) return { status: "failed", error: `unknown job ${jobId}` };

  if (job.stage === "succeeded") {
    return {
      status: "succeeded",
      clipUrl: job.cloudinaryUrl ?? job.videoUrl,
      clipPublicId: job.cloudinaryPublicId,
      imageUrl: job.imageUrl,
    };
  }
  if (job.stage === "failed") {
    return { status: "failed", error: job.error };
  }

  const creds = readCredentials();
  if (!creds) {
    return { status: "failed", error: "missing HIGGSFIELD_API_KEY/HIGGSFIELD_API_SECRET" };
  }

  if (job.stage === "t2i_running" && job.t2iRequestId) {
    const remote = await pollHiggsfield(job.t2iRequestId, creds);
    if (remote.status === "running") return { status: "running" };
    if (remote.status === "failed") {
      return finalize(job, "failed", { error: remote.error });
    }
    if (!remote.assetUrl) {
      return finalize(job, "failed", {
        error: "text-to-image succeeded but no asset URL was returned",
      });
    }
    job.imageUrl = remote.assetUrl;

    // Kick off stage 2.
    const i2vBody = buildImage2VideoBody(job.clipPrompt, job.imageUrl);
    const i2vSubmit = await postHiggsfield(
      submitUrlFor(job.clipPrompt.preferredModel),
      i2vBody,
      creds,
    );
    const i2vRequestId = extractRequestId(i2vSubmit);
    if (!i2vRequestId) {
      return finalize(job, "failed", {
        error: `image-to-video submission missing request_id (${JSON.stringify(i2vSubmit).slice(0, 200)})`,
      });
    }
    job.i2vRequestId = i2vRequestId;
    job.stage = "i2v_running";
    putJob(job);
    return { status: "running", imageUrl: job.imageUrl };
  }

  if (job.stage === "i2v_running" && job.i2vRequestId) {
    const remote = await pollHiggsfield(job.i2vRequestId, creds);
    if (remote.status === "running") return { status: "running", imageUrl: job.imageUrl };
    if (remote.status === "failed") {
      return finalize(job, "failed", { error: remote.error });
    }
    if (!remote.assetUrl) {
      return finalize(job, "failed", {
        error: "image-to-video succeeded but no asset URL was returned",
      });
    }
    try {
      const publicId = publicIdForScene({
        projectId: job.projectId,
        beatId: job.beatId,
        sceneId: job.sceneId,
        fallbackJobId: job.jobId,
      });
      const uploaded = await uploadVideoFromUrl(remote.assetUrl, publicId);
      return finalize(job, "succeeded", {
        videoUrl: remote.assetUrl,
        cloudinaryUrl: uploaded.url,
        cloudinaryPublicId: uploaded.publicId,
      });
    } catch (err) {
      return finalize(job, "failed", {
        error: `Cloudinary upload failed: ${(err as Error).message}`,
      });
    }
  }

  return { status: "queued" };
}

/** Best-effort cancel of an in-flight Higgsfield request. */
export async function cancelJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  const creds = readCredentials();
  if (!creds) return;

  const requestIds = [job.t2iRequestId, job.i2vRequestId].filter(
    (id): id is string => Boolean(id),
  );
  await Promise.all(
    requestIds.map((id) =>
      fetch(cancelUrlFor(id), {
        method: "POST",
        headers: { Authorization: authHeader(creds.apiKey, creds.apiSecret) },
      }).catch((err) => {
        console.warn(`[higgsfield] cancel failed for request ${id}:`, err);
      }),
    ),
  );
}

function finalize(
  job: Job,
  stage: Extract<JobStage, "succeeded" | "failed">,
  patch: {
    videoUrl?: string;
    cloudinaryUrl?: string;
    cloudinaryPublicId?: string;
    error?: string;
  },
): JobStatusResult {
  const next: Job = {
    ...job,
    stage,
    videoUrl: patch.videoUrl ?? job.videoUrl,
    cloudinaryUrl: patch.cloudinaryUrl ?? job.cloudinaryUrl,
    cloudinaryPublicId: patch.cloudinaryPublicId ?? job.cloudinaryPublicId,
    error: patch.error ?? job.error,
    updatedAt: new Date().toISOString(),
  };
  putJob(next);
  return stage === "succeeded"
    ? {
        status: "succeeded",
        clipUrl: next.cloudinaryUrl ?? next.videoUrl,
        clipPublicId: next.cloudinaryPublicId,
        imageUrl: next.imageUrl,
      }
    : { status: "failed", error: next.error };
}

function readCredentials(): Credentials | null {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

async function postHiggsfield(
  url: string,
  body: unknown,
  creds: Credentials,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(creds.apiKey, creds.apiSecret),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Higgsfield POST ${url} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json().catch(() => ({}));
}

interface RemoteStatus {
  status: "running" | "succeeded" | "failed";
  assetUrl?: string;
  error?: string;
}

async function pollHiggsfield(
  requestId: string,
  creds: Credentials,
): Promise<RemoteStatus> {
  const res = await fetch(statusUrlFor(requestId), {
    headers: { Authorization: authHeader(creds.apiKey, creds.apiSecret) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      status: "failed",
      error: `status ${res.status}: ${text.slice(0, 300)}`,
    };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return interpretStatus(body);
}

/**
 * Higgsfield status payloads are not 100% standardized across models —
 * normalize a handful of shapes into our internal RemoteStatus union.
 */
function interpretStatus(body: Record<string, unknown>): RemoteStatus {
  const raw = String(body.status ?? body.state ?? "").toLowerCase();

  if (TERMINAL_FAILED.has(raw)) {
    return {
      status: "failed",
      error: stringField(body, ["error", "error_message", "message", "reason"]),
    };
  }

  if (TERMINAL_SUCCEEDED.has(raw)) {
    return { status: "succeeded", assetUrl: extractAssetUrl(body) };
  }

  return { status: "running" };
}

const TERMINAL_FAILED = new Set([
  "failed",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "rejected",
]);
const TERMINAL_SUCCEEDED = new Set([
  "succeeded",
  "success",
  "completed",
  "complete",
  "ready",
  "done",
]);

function extractRequestId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const obj = body as Record<string, unknown>;
  const candidates = [obj.request_id, obj.id, obj.requestId, obj.job_id, obj.jobId];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  // Sometimes nested under data/result.
  const nested = (obj.data ?? obj.result) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") return extractRequestId(nested);
  return undefined;
}

function extractAssetUrl(body: Record<string, unknown>): string | undefined {
  // Common single-URL fields.
  const single = stringField(body, [
    "output_url",
    "result_url",
    "video_url",
    "image_url",
    "url",
    "asset_url",
  ]);
  if (single) return single;

  // Nested shapes: { result: { url } }, { output: { url } }, { result: { video: { url } } }
  for (const key of ["result", "output", "data"] as const) {
    const inner = body[key];
    if (inner && typeof inner === "object") {
      const innerStr = stringField(inner as Record<string, unknown>, [
        "url",
        "video_url",
        "image_url",
      ]);
      if (innerStr) return innerStr;
      const video = (inner as Record<string, unknown>).video;
      if (video && typeof video === "object") {
        const videoStr = stringField(video as Record<string, unknown>, ["url"]);
        if (videoStr) return videoStr;
      }
    }
  }

  // Arrays: { media: [{ url }] }, { assets: [{ url }] }
  for (const key of ["media", "assets", "files", "outputs"] as const) {
    const arr = body[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first && typeof first === "object") {
        const fromArr = stringField(first as Record<string, unknown>, [
          "url",
          "video_url",
          "image_url",
        ]);
        if (fromArr) return fromArr;
      }
    }
  }

  return undefined;
}

function stringField(
  body: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
