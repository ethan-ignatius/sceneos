import { Hono } from "hono";
import type { StatusResponse } from "../types/api.js";
import { pollProvider } from "../services/higgsfield.js";
import { uploadVideoFromUrl } from "../services/cloudinary.js";
import { ensureUpload, publicIdFor } from "../services/job-registry.js";

/**
 * GET /api/status/:jobId
 *
 * Polls the active provider. When the provider reports succeeded, this route
 * triggers a Cloudinary upload (idempotently, via the job registry's promise
 * dedup) and returns the deterministic public_id + delivery URL the frontend
 * uses for preview and for fl_splice concatenation.
 *
 * Owner: Vishnu
 */
export const statusRoute = new Hono();

const POLL_AFTER_MS = 5000;

statusRoute.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  const poll = await pollProvider(jobId);
  if (!poll) {
    const response: StatusResponse = { jobId, status: "failed", error: "Unknown jobId" };
    return c.json(response, 404);
  }

  const { job, status, providerClipUrl, error } = poll;

  if (status === "failed") {
    const response: StatusResponse = { jobId, status: "failed", error: error ?? job.error };
    return c.json(response, 200);
  }

  if (status !== "succeeded") {
    const response: StatusResponse = { jobId, status, pollAfterMs: POLL_AFTER_MS };
    return c.json(response, 200);
  }

  if (!providerClipUrl) {
    const response: StatusResponse = {
      jobId,
      status: "failed",
      error: "Provider reported succeeded but returned no clip URL",
    };
    return c.json(response, 200);
  }

  try {
    const upload = await ensureUpload(job, () =>
      uploadVideoFromUrl(providerClipUrl, publicIdFor(job)),
    );
    const response: StatusResponse = {
      jobId,
      status: "succeeded",
      clipUrl: upload.url,
      clipPublicId: upload.publicId,
    };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloudinary upload failed";
    console.error(`[/api/status/${jobId}] upload failed`, err);
    const response: StatusResponse = { jobId, status: "failed", error: message };
    return c.json(response, 200);
  }
});
