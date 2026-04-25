import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types/api.js";
import { getProvider, encodeJobId } from "../services/provider.js";
import { isMockMode } from "../lib/mock-mode.js";
import { deterministicJobId } from "../mock/index.js";

/**
 * POST /api/generate
 * Kicks off a clip-generation job for one scene.
 *
 * In MOCK_MODE returns a deterministic mock jobId immediately. Frontend
 * dev sees the same lifecycle (queued → running → succeeded) as real.
 *
 * Otherwise dispatches via services/provider.ts which honors the
 * GENERATION_PROVIDER env var (higgsfield | kling | replicate | cached).
 */
export const generateRoute = new Hono();

generateRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as GenerateRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  if (isMockMode()) {
    const response: GenerateResponse = {
      jobId: deterministicJobId("mock", `${body.beatId}-${body.sceneId}`),
      provider: "cached",
      pollAfterMs: 800, // fast enough to feel responsive in dev
    };
    return c.json(response, 200);
  }

  const { name, impl } = getProvider();

  try {
    const { jobId: providerJobId } = await impl.generate({
      refinedPrompt: body.refinedPrompt,
      durationSeconds: body.durationSeconds,
      beatTemplate: body.beatTemplate,
      projectId: body.projectId,
      beatId: body.beatId,
      sceneId: body.sceneId,
    });
    const response: GenerateResponse = {
      jobId: encodeJobId(name, providerJobId),
      provider: name,
      pollAfterMs: name === "cached" ? 0 : name === "kling" ? 4000 : 5000,
    };
    return c.json(response, 200);
  } catch (err) {
    return c.json(
      {
        error: `Provider "${name}" not implemented`,
        details: err instanceof Error ? err.message : String(err),
        hint: "Set MOCK_MODE=true for instant canned data, or GENERATION_PROVIDER=cached.",
      },
      501,
    );
  }
});
