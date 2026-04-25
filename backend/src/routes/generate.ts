import { Hono } from "hono";
import { z } from "zod";
import type { GenerateResponse } from "../types/api.js";
import type { HiggsfieldClipPrompt } from "../types/manifest.js";
import { getProvider, encodeJobId } from "../services/provider.js";
import { isMockMode } from "../lib/mock-mode.js";
import { deterministicJobId } from "../mock/index.js";

/**
 * POST /api/generate
 * Kicks off a clip-generation job for one scene.
 *
 * In MOCK_MODE returns a deterministic mock jobId immediately. Frontend devs
 * see the same lifecycle as real. Otherwise dispatches via services/provider.ts
 * which honors GENERATION_PROVIDER.
 */
export const generateRoute = new Hono();

const ClipPromptSchema = z.object({
  imagePrompt: z.string().min(1),
  motionPrompt: z.string().min(1),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  resolution: z.enum(["720p", "1080p"]),
  durationSeconds: z.number().positive().max(60),
  preferredModel: z.string().min(1),
});

const RequestSchema = z.object({
  projectId: z.string().min(1),
  beatId: z.string().min(1),
  sceneId: z.string().min(1),
  refinedPrompt: z.string().min(1),
  durationSeconds: z.number().positive().max(60),
  beatTemplate: z.string().optional(),
  clipPrompt: ClipPromptSchema.optional(),
});

generateRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  if (isMockMode()) {
    const response: GenerateResponse = {
      jobId: deterministicJobId(
        "mock",
        `${parsed.data.beatTemplate ?? parsed.data.beatId}-${parsed.data.sceneId}`,
      ),
      provider: "cached",
      pollAfterMs: 800,
    };
    return c.json(response, 200);
  }

  const { name, impl } = getProvider();
  const clipPrompt: HiggsfieldClipPrompt = parsed.data.clipPrompt ?? {
    imagePrompt: parsed.data.refinedPrompt,
    motionPrompt: parsed.data.refinedPrompt,
    aspectRatio: "16:9",
    resolution: "1080p",
    durationSeconds: parsed.data.durationSeconds,
    preferredModel: "higgsfield-ai/dop/standard",
  };

  try {
    const { jobId: providerJobId } = await impl.generate({
      refinedPrompt: parsed.data.refinedPrompt,
      durationSeconds: parsed.data.durationSeconds,
      beatTemplate: parsed.data.beatTemplate,
      clipPrompt,
      projectId: parsed.data.projectId,
      beatId: parsed.data.beatId,
      sceneId: parsed.data.sceneId,
    });
    const response: GenerateResponse = {
      jobId: encodeJobId(name, providerJobId),
      provider: name,
      pollAfterMs: name === "cached" ? 0 : name === "kling" ? 4000 : 5000,
    };
    return c.json(response, 200);
  } catch (err) {
    console.error("[generate] failed", err);
    return c.json(
      {
        error: `Provider "${name}" submission failed`,
        details: err instanceof Error ? err.message : String(err),
        hint: "Set MOCK_MODE=true for instant canned data, or GENERATION_PROVIDER=cached.",
      },
      502,
    );
  }
});
