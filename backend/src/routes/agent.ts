import { Hono } from "hono";
import type { AgentRequest } from "../types/api.js";
import { isMockMode } from "../lib/mock-mode.js";
import { runMockAgentTurn } from "../mock/index.js";
import { runAgentTurn } from "../services/agent.js";

/**
 * POST /api/agent
 * Per-beat questionnaire turn.
 *
 * Stateless: the frontend resends the entire Manifest each turn. We map
 * conversation history → LLM messages, force a tool call, and reply with
 * either { kind: "question" } or { kind: "sufficient" }.
 *
 * In MOCK_MODE this returns canned, directorial-language questions per
 * beat template so the frontend can be developed without LLM keys.
 */
export const agentRoute = new Hono();

agentRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as AgentRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  if (isMockMode()) {
    return c.json(runMockAgentTurn(body), 200);
  }

  try {
    const response = await runAgentTurn(body);
    return c.json(response, 200);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    console.error("[agent] runAgentTurn failed:", details);
    return c.json(
      {
        error: "Agent turn failed",
        details,
        hint: "Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in backend/.env, or run with MOCK_MODE=true.",
      },
      500,
    );
  }
});
