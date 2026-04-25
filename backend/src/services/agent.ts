/**
 * Questionnaire agent service.
 *
 * Owner: Ethan
 *
 * Implementation notes (see docs/BACKEND_ARCHITECTURE.md §3 + §6):
 *  - LLM: OpenAI GPT-4o (mirrors CutOS) OR Claude Sonnet via Anthropic SDK.
 *  - Stateless per call. The frontend sends the entire Manifest each turn.
 *  - Tool/function-call shape:
 *      askQuestion({ question, reasoning, estimatedRemaining })
 *      markSufficient({ refinedPrompt, sceneSummary, suggestedDuration })
 *  - Sufficiency threshold uses lib/sufficiency.ts (heuristic + LLM gate).
 *  - System prompt seeded with the beat's archetype.intent and mood.
 */

import type { AgentRequest, AgentResponse } from "../types/api.js";
import type { Beat } from "../types/manifest.js";

export async function runAgentTurn(_req: AgentRequest): Promise<AgentResponse> {
  // TODO(ethan):
  //   1. Find the active beat in the manifest by beatId.
  //   2. Build the system prompt from beat.archetype.intent + beat.archetype.mood + manifest.masterPrompt.
  //   3. Append req.userMessage as the latest user turn (if present).
  //   4. Call OpenAI/Anthropic with two tools: askQuestion, markSufficient.
  //   5. Return whichever tool was called as the AgentResponse.
  throw new Error("services/agent.ts: not implemented");
}

export function systemPromptFor(beat: Beat, masterPrompt: string): string {
  return [
    `You are a cinematography director assisting a non-expert.`,
    ``,
    `MASTER IDEA: ${masterPrompt}`,
    ``,
    `BEAT: ${beat.beatName} (${beat.template})`,
    `INTENT: ${beat.archetype.intent}`,
    `MOOD: ${beat.archetype.mood}`,
    `SUGGESTED DURATION: ${beat.archetype.suggestedDuration}s`,
    ``,
    `Ask focused, cinematic questions to fill in the gap between the master idea`,
    `and a generative prompt that will produce a high-quality clip for THIS beat.`,
    `Stop asking as soon as you have: a subject, an action, a setting, a camera`,
    `framing, and a mood — typically 2–4 questions, never more than 6.`,
    ``,
    `Tools:`,
    `  askQuestion(question, reasoning, estimatedRemaining)`,
    `  markSufficient(refinedPrompt, sceneSummary, suggestedDuration)`,
    ``,
    `When you call markSufficient, refinedPrompt MUST be a single coherent prompt`,
    `that a video model can consume — describe the subject, action, setting,`,
    `framing, lens, color/light, and mood in one paragraph. Carry character`,
    `descriptors verbatim from any earlier beats so continuity is preserved.`,
  ].join("\n");
}
