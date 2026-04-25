import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types/api.js";

/**
 * POST /api/generate
 * Kicks off a Higgsfield clip-generation job for one scene.
 *
 * Owner: Vishnu
 *
 * Implementation notes:
 *  - Call services/higgsfield.ts → generateClip(refinedPrompt, durationSeconds)
 *  - On Higgsfield 429 / outage, fall back to services/segmind.ts or services/replicate.ts.
 *  - Persist jobId in an in-memory Map (services/job-registry.ts).
 *  - Return { jobId, provider, pollAfterMs } so the frontend knows when to start polling.
 */
export const generateRoute = new Hono();

generateRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as GenerateRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  // TODO(vishnu): call services/higgsfield.ts. For now, return a deterministic stub job.
  const response: GenerateResponse = {
    jobId: `stub-${body.beatId}-${body.sceneId}`,
    provider: "higgsfield",
    pollAfterMs: 5000,
  };
  return c.json(response, 501);
});
