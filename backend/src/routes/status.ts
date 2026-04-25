import { Hono } from "hono";
import type { StatusResponse } from "../types/api.js";
import { decodeJobId } from "../services/provider.js";
import * as higgsfield from "../services/higgsfield.js";
import * as kling from "../services/kling.js";
import * as replicate from "../services/replicate.js";
import * as cached from "../services/cached-demo.js";

/**
 * GET /api/status/:jobId
 * Polls a generation job. Provider is encoded in the jobId (provider::id),
 * so this route is stateless across server restarts.
 *
 * On succeeded jobs (non-cached), this endpoint should also upload the
 * resulting MP4 to Cloudinary and surface clipPublicId. The cached provider
 * already returns Cloudinary URLs directly.
 */
export const statusRoute = new Hono();

statusRoute.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  let decoded: ReturnType<typeof decodeJobId>;
  try {
    decoded = decodeJobId(jobId);
  } catch (err) {
    return c.json({ error: "Bad jobId", details: err instanceof Error ? err.message : String(err) }, 400);
  }

  try {
    const status = await dispatchStatus(decoded.provider, decoded.providerJobId);
    const response: StatusResponse = {
      jobId,
      provider: decoded.provider,
      status: status.status,
      clipUrl: status.clipUrl,
      error: status.error,
      pollAfterMs:
        status.status === "queued" || status.status === "running"
          ? decoded.provider === "kling"
            ? 4000
            : 5000
          : undefined,
      // TODO(vishnu): once Cloudinary uploadVideoFromUrl is wired, set clipPublicId here.
    };
    return c.json(response, 200);
  } catch (err) {
    return c.json(
      {
        error: `Provider "${decoded.provider}" not implemented`,
        details: err instanceof Error ? err.message : String(err),
      },
      501,
    );
  }
});

async function dispatchStatus(provider: string, providerJobId: string) {
  switch (provider) {
    case "higgsfield":
      return higgsfield.getStatus(providerJobId);
    case "kling":
      return kling.getStatus(providerJobId);
    case "replicate":
      return replicate.getStatus(providerJobId);
    case "cached":
      return cached.getStatus(providerJobId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
