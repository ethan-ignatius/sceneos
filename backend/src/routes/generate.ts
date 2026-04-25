import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types/api.js";
import { getProvider, encodeJobId } from "../services/provider.js";

/**
 * POST /api/generate
 * Kicks off a clip-generation job for one scene via the active provider.
 *
 * Owner: Vishnu
 *
 * The active provider is decided by GENERATION_PROVIDER env var:
 *   higgsfield (default) | kling | replicate | cached
 * Provider implementations live in services/{name}.ts and conform to
 * services/provider.ts:ProviderModule.
 */
export const generateRoute = new Hono();

generateRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as GenerateRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

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
        hint: "Set GENERATION_PROVIDER=cached for an instant on-stage fallback.",
      },
      501,
    );
  }
});
