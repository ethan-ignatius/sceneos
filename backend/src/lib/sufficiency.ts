/**
 * Information-sufficiency scoring for the questionnaire agent.
 *
 * Owner: Ethan
 *
 * Approach (heuristic + LLM gate):
 *   1. Cheap heuristic: count distinct semantic facets present in the conversation
 *      (subject, action, setting, framing, mood). Each turn that adds a new facet
 *      bumps the score.
 *   2. LLM gate: at score ≥ THRESHOLD, ask the agent itself to confirm sufficiency
 *      via the markSufficient tool. Cheap because we batch with the next turn.
 *
 * This file is intentionally minimal — the actual scoring lives in the agent's
 * tool-calling logic. We expose constants here so they're tunable in one place.
 */

export const SUFFICIENCY_MIN_QUESTIONS = 2;
export const SUFFICIENCY_MAX_QUESTIONS = 6;

/** Facets the questionnaire is trying to fill. */
export type Facet = "subject" | "action" | "setting" | "framing" | "mood";

export const REQUIRED_FACETS: Facet[] = ["subject", "action", "setting", "framing", "mood"];
