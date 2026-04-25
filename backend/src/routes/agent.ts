import { Hono } from "hono";
import { z } from "zod";
import type { AgentRequest, AgentResponse } from "../types/api.js";
import { isMockMode } from "../lib/mock-mode.js";
import { runMockAgentTurn } from "../mock/index.js";
import { runAgentTurn } from "../services/agent.js";

export const agentRoute = new Hono();

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

const AgentTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  content: z.string(),
  timestamp: z.string(),
});

const SceneSchema = z.object({
  sceneId: z.string().min(1),
  conversation: z.array(AgentTurnSchema),
  refinedPrompt: z.string().optional(),
  clipPrompt: z.unknown().optional(),
  jobId: z.string().optional(),
  clipPublicId: z.string().optional(),
  clipUrl: z.string().optional(),
  durationSeconds: z.number().optional(),
  approved: z.boolean(),
});

const BeatSchema = z.object({
  beatId: z.string().min(1),
  beatName: z.string().min(1),
  template: z.string().min(1),
  status: z.enum([
    "pending",
    "questioning",
    "ready-to-generate",
    "generating",
    "preview",
    "approved",
  ]),
  scenes: z.array(SceneSchema),
  archetype: ArchetypeSchema,
});

const RequestSchema = z.object({
  manifest: z.object({
    projectId: z.string().min(1),
    videoType: z.enum(["trailer", "short", "feature"]),
    masterPrompt: z.string().min(1).max(2_000),
    createdAt: z.string(),
    beats: z.array(BeatSchema).min(1),
    finalCloudinaryUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationSeconds: z.number().optional(),
  }),
  beatId: z.string().min(1),
  userMessage: z.string().max(4_000).optional(),
});

agentRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const request = parsed.data as AgentRequest;

  if (isMockMode()) {
    return c.json(runMockAgentTurn(request), 200);
  }

  try {
    const response: AgentResponse = await runAgentTurn(request);
    return c.json(response, 200);
  } catch (err) {
    console.error("[agent] failed", err);
    return c.json(
      { error: "Agent turn failed", details: (err as Error).message },
      502,
    );
  }
});
