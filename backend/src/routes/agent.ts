import { Hono } from "hono";
import type { AgentRequest } from "../types/api.js";
import { isMockMode } from "../lib/mock-mode.js";
import { runMockAgentTurn } from "../mock/index.js";

/**
 * POST /api/agent
 * Per-beat questionnaire turn.
 *
 * Owner: Ethan (real implementation)
 *
 * In MOCK_MODE this returns canned, directorial-language questions per
 * beat template. Frontend devs see realistic data without any keys.
 */
export const agentRoute = new Hono();

agentRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as AgentRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  if (isMockMode()) {
    return c.json(runMockAgentTurn(body), 200);
  }

  // TODO(ethan): wire OpenAI/Anthropic; build system prompt via
  //   services/agent.ts:systemPromptFor(beat, manifest); call with
  //   askQuestion / markSufficient tools; return AgentResponse.
  return c.json(
    {
      error: "agent.real not implemented",
      hint: "Run with MOCK_MODE=true (or omit, auto-default) until Ethan wires services/agent.ts.",
    },
    501,
  );
});
