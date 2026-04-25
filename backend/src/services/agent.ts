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
 *  - The system prompt embeds beat.archetype.directorNotes verbatim — that's
 *    the cinematography moat. Generic questions ("what mood?") would make
 *    SceneOS just another wrapper; directorial questions are the product.
 */

import type { AgentRequest, AgentResponse } from "../types/api.js";
import type { Beat, Manifest } from "../types/manifest.js";

export async function runAgentTurn(_req: AgentRequest): Promise<AgentResponse> {
  // TODO(ethan):
  //   1. Find the active beat in the manifest by beatId.
  //   2. Build system prompt = systemPromptFor(beat, manifest.masterPrompt).
  //   3. Append req.userMessage as the latest user turn (if present).
  //   4. Call LLM with two tools: askQuestion, markSufficient.
  //   5. Return whichever tool was called as the AgentResponse.
  throw new Error("services/agent.ts: runAgentTurn not implemented");
}

/**
 * Composes the agent's system prompt for a single beat.
 * The directorial notes (the moat) are quoted verbatim under DIRECTOR'S NOTES.
 */
export function systemPromptFor(beat: Beat, manifest: Manifest): string {
  const beatIndex = manifest.beats.findIndex((b) => b.beatId === beat.beatId);
  const totalBeats = manifest.beats.length;
  const earlierBeats = manifest.beats
    .slice(0, beatIndex)
    .filter((b) => b.scenes[0]?.refinedPrompt)
    .map((b) => `- ${b.beatName}: ${b.scenes[0].refinedPrompt}`)
    .join("\n");

  return [
    `You are a working cinematography director assisting a non-expert.`,
    `You speak in directorial language — lens, movement, light, blocking, pace —`,
    `not generic creative-tool prompts. You stop asking as soon as you have a`,
    `subject, action, setting, framing, and mood. Two to four questions, never six.`,
    ``,
    `MASTER IDEA`,
    manifest.masterPrompt,
    ``,
    `VIDEO TYPE: ${manifest.videoType}`,
    `THIS BEAT: ${beat.beatName} (${beat.template}) — ${beatIndex + 1} of ${totalBeats}`,
    `BEAT INTENT: ${beat.archetype.intent}`,
    `MOOD KEYWORD: ${beat.archetype.mood}`,
    `SUGGESTED DURATION: ${beat.archetype.suggestedDuration}s`,
    ``,
    `DIRECTOR'S NOTES (treat as constraints, not suggestions):`,
    beat.archetype.directorNotes,
    ``,
    earlierBeats ? `EARLIER BEATS ALREADY LOCKED IN:\n${earlierBeats}\n` : "",
    `CHARACTER CONSISTENCY: If a character was described in any earlier beat,`,
    `carry those exact descriptors verbatim into this beat's refined prompt.`,
    `Never change a character's appearance, clothing, or name unless the user`,
    `explicitly requests it.`,
    ``,
    `TOOLS`,
    `  askQuestion(question, reasoning, estimatedRemaining)`,
    `      — When you still need information. Ask in directorial language.`,
    `      — Each question must reference a specific cinematographic decision`,
    `        from DIRECTOR'S NOTES (e.g., "for the establishing wide, do you`,
    `        want a 24mm sweep across mountains, or an 85mm compression on a`,
    `        lone figure against the horizon?").`,
    `      — NEVER ask "what mood?" or "describe the scene" — those questions`,
    `        belong in a wrapper around a generation API, not a director's tool.`,
    ``,
    `  markSufficient(refinedPrompt, sceneSummary, suggestedDuration)`,
    `      — When you have enough. refinedPrompt MUST be one paragraph that`,
    `        a video model can consume directly: subject, action, setting,`,
    `        framing, lens, movement, color/light, mood. Carry character`,
    `        descriptors verbatim from earlier beats.`,
    `      — sceneSummary is a one-sentence human-readable preview for the UI.`,
    ``,
    `Output ONLY the tool call. No prose around it.`,
  ]
    .filter(Boolean)
    .join("\n");
}
