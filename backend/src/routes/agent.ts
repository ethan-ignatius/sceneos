import { Hono } from "hono";
import type { AgentRequest, AgentResponse } from "../types/api.js";

/**
 * POST /api/agent
 * Per-beat questionnaire turn.
 *
 * Owner: Ethan
 *
 * Implementation notes:
 *  - Stateless. Frontend sends the entire Manifest + the active beatId + (optional) userMessage.
 *  - Use OpenAI GPT-4o (mirror CutOS) or Claude Sonnet via Anthropic SDK.
 *  - Tool-call shape: askQuestion(question, reasoning, estimatedRemaining)
 *                     | markSufficient(refinedPrompt, sceneSummary, suggestedDuration)
 *  - The system prompt should reference the beat's archetype.intent and mood.
 *  - Sufficiency threshold: see lib/sufficiency.ts (heuristic + LLM gate).
 */
export const agentRoute = new Hono();

agentRoute.post("/", async (c) => {
  const _body = (await c.req.json().catch(() => null)) as AgentRequest | null;
  if (!_body) return c.json({ error: "Invalid JSON" }, 400);

  // TODO(ethan): wire OpenAI/Anthropic, run questionnaire turn, return AgentResponse.
  const stub: AgentResponse = {
    kind: "question",
    question:
      "Stub agent: tell me one image you'd want as the very first frame of this beat.",
    reasoning: "Backend not yet wired. See docs/BACKEND_ARCHITECTURE.md §3.",
    estimatedRemaining: 3,
  };
  return c.json(stub, 200);
});
