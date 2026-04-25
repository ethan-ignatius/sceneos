import { Hono } from "hono";
import type { GenerationProvider, JobStatus, StatusResponse } from "../types/api.js";
import { decodeJobId } from "../services/provider.js";
import * as higgsfield from "../services/higgsfield.js";
import * as kling from "../services/kling.js";
import * as fal from "../services/fal.js";
import * as replicate from "../services/replicate.js";
import * as cached from "../services/cached-demo.js";
import { isMockMode } from "../lib/mock-mode.js";
import { getMockClip } from "../mock/index.js";

/**
 * GET /api/status/:jobId
 *
 * In MOCK_MODE this resolves jobs deterministically. Real mode dispatches via
 * the provider encoded in the jobId prefix (provider::providerJobId).
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
      clipPublicId: status.clipPublicId,
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
    console.error("[status] failed", err);
    return c.json(
      {
        error: `Provider "${decoded.provider}" status failed`,
        details: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }
});

async function dispatchStatus(
  provider: GenerationProvider,
  providerJobId: string,
): Promise<{
  status: JobStatus;
  clipUrl?: string;
  clipPublicId?: string;
  error?: string;
}> {
  switch (provider) {
    case "higgsfield":
      return higgsfield.getStatus(providerJobId);
    case "kling":
      return kling.getStatus(providerJobId);
    case "fal":
      return fal.getStatus(providerJobId);
    case "replicate":
      return replicate.getStatus(providerJobId);
    case "cached":
      return cached.getStatus(providerJobId);
  }
}
