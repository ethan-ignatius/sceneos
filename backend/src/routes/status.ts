import { Hono } from "hono";
import type { StatusResponse } from "../types/api.js";
import { decodeJobId } from "../services/provider.js";
import * as higgsfield from "../services/higgsfield.js";
import * as kling from "../services/kling.js";
import * as replicate from "../services/replicate.js";
import * as cached from "../services/cached-demo.js";
import { isMockMode } from "../lib/mock-mode.js";
import { getMockClip } from "../mock/index.js";

/**
 * GET /api/status/:jobId
 *
 * In MOCK_MODE this resolves jobs deterministically: the first poll
 * returns "running", the second returns "succeeded" with a real,
 * playable Cloudinary demo clip URL. The lifecycle is realistic
 * enough that the frontend's optimistic UI / loading state can be
 * iterated against without ever calling Higgsfield.
 *
 * Real-mode dispatches via the provider encoded in the jobId prefix
 * (provider::providerJobId). Stateless across server restarts.
 */
export const statusRoute = new Hono();

const MOCK_TICK = new Map<string, number>();

statusRoute.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  if (isMockMode()) {
    const ticks = (MOCK_TICK.get(jobId) ?? 0) + 1;
    MOCK_TICK.set(jobId, ticks);

    if (ticks < 2) {
      const response: StatusResponse = {
        jobId,
        provider: "cached",
        status: "running",
        pollAfterMs: 800,
      };
      return c.json(response, 200);
    }

    // Pick a clip — beat template is encoded in the jobId seed when generated
    // by mock; if not, fall back to a default.
    const seed = jobId.split("::").pop() ?? "";
    const beatTemplate = seed.split("-")[0] ?? "trailer.establishing";
    const clip = getMockClip(beatTemplate);

    const response: StatusResponse = {
      jobId,
      provider: "cached",
      status: "succeeded",
      clipUrl: clip.url,
      clipPublicId: clip.publicId,
    };
    return c.json(response, 200);
  }

  let decoded: ReturnType<typeof decodeJobId>;
  try {
    decoded = decodeJobId(jobId);
  } catch (err) {
    return c.json(
      { error: "Bad jobId", details: err instanceof Error ? err.message : String(err) },
      400,
    );
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
