import { Hono } from "hono";
import { z } from "zod";
import type { DecomposeResponse } from "../types/api.js";
import type { BeatTemplate } from "../types/manifest.js";
import { decomposeMasterPrompt } from "../services/prompt-decomposer.js";

const BEAT_TEMPLATES = [
  "trailer.establishing",
  "trailer.hook",
  "trailer.rising",
  "trailer.climax-tease",
  "trailer.sting",
  "short.hook",
  "short.turn",
  "short.payoff",
  "feature.setup",
  "feature.inciting",
  "feature.rising",
  "feature.midpoint",
  "feature.crisis",
  "feature.climax",
  "feature.denouement",
] as const satisfies readonly BeatTemplate[];

/**
 * POST /api/decompose
 *
 * One-shot LLM call that turns the master prompt into a Higgsfield-ready clip
 * prompt for every beat. Called by the frontend immediately after the user
 * submits the master prompt on the landing screen.
 *
 * Request:
 *   { masterPrompt, videoType, beats: [{ beatId, template, beatName, archetype }] }
 *
 * Response:
 *   { clips: [{ beatId, sceneSummary, refinedPrompt, clipPrompt }], continuityBible? }
 */
export const decomposeRoute = new Hono();

const ArchetypeSchema = z.object({
  intent: z.string().min(1),
  mood: z.enum([
    "wide-establish",
    "intimate-hook",
    "kinetic-rising",
    "tense-climax",
    "still-resolve",
    "punchy-sting",
  ]),
  suggestedDuration: z.number().positive(),
});

const RequestSchema = z.object({
  masterPrompt: z.string().min(1).max(2_000),
  videoType: z.enum(["trailer", "short", "feature"]),
  beats: z
    .array(
      z.object({
        beatId: z.string().min(1),
        template: z.enum(BEAT_TEMPLATES),
        beatName: z.string().min(1),
        archetype: ArchetypeSchema,
      }),
    )
    .min(1)
    .max(12),
});

decomposeRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  try {
    const result: DecomposeResponse = await decomposeMasterPrompt(parsed.data);
    return c.json(result, 200);
  } catch (err) {
    console.error("[decompose] failed", err);
    return c.json(
      { error: "Decomposition failed", details: (err as Error).message },
      502,
    );
  }
});
