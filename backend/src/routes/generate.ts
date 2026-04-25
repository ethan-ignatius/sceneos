import { Hono } from "hono";
import { z } from "zod";
import { startGeneration } from "../services/higgsfield.js";

/**
 * POST /api/generate
 * Kicks off a clip-generation job for one scene via the active provider
 * (mock by default, Higgsfield Cloud when keys are configured).
 *
 * Owner: Vishnu
 */
export const generateRoute = new Hono();

const GenerateBody = z.object({
  projectId: z.string().min(1),
  beatId: z.string().min(1),
  sceneId: z.string().min(1),
  refinedPrompt: z.string().min(1),
  durationSeconds: z.number().positive().max(180),
});

generateRoute.post("/", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = GenerateBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  try {
    const response = await startGeneration(parsed.data);
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown generation error";
    console.error("[/api/generate] failed", err);
    return c.json({ error: "Generation failed", details: message }, 502);
  }
});
