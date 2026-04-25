/**
 * Mock questionnaire agent.
 *
 * Canned, deterministic, but written in the SAME directorial register the
 * real agent must hit. Frontend dev iterating against this should feel like
 * they are working with a credible director — generic questions ("what
 * mood?") are forbidden here too.
 *
 * The mock advances through a beat-template-specific question list based
 * on how many user turns have occurred, then emits a synthesized refined
 * prompt and `markSufficient` once the list is exhausted.
 */

import type { AgentRequest, AgentResponse } from "../types/api.js";
import type { BeatTemplate } from "../types/manifest.js";
import { findTemplate } from "../lib/beat-templates.js";

const QUESTIONS_BY_TEMPLATE: Record<string, string[]> = {
  "trailer.establishing": [
    "For this opening wide, do you want a 24mm sweep across a full vista, or an 85mm compression on a single distant figure dwarfed by environment?",
    "Cool blue palette (isolation, scale, gravitas) or warm gold (hope, wonder)? This sets the LUT for the whole trailer.",
  ],
  "trailer.hook": [
    "What specific micro-action defines the protagonist in three seconds — a glance, a hand reaching, a held breath, a hesitation?",
    "35mm soft-key intimacy, or 50mm with a harder catch-light suggesting they have already been changed by something?",
  ],
  "trailer.rising": [
    "Three escalating obstacles in this beat — what's the first, second, third? Keep it specific (a person, an object, a place).",
    "Music-driven cut pacing (1–2s shots) or dialogue-driven (longer, conversation-led)?",
  ],
  "trailer.climax-tease": [
    "One held image of the highest stakes — what is it? An impact mid-air, a silhouette, a frozen face, an embrace?",
    "Backlit silhouette permitted? Or do we keep the protagonist's face fully readable for emotional weight?",
  ],
  "trailer.sting": [
    "Title card or single iconic frame? If title — what's the single line?",
    "Fade to black or hard cut to black after the held moment?",
  ],
  "short.hook": [
    "What is the one frame that stops the scroll in 1.5 seconds? Concrete subject and one action.",
    "Frontal eye-level (intimate) or low-angle hero shot (dramatic)?",
  ],
  "short.turn": [
    "What expectation set in the hook are we subverting? Be specific — wrong location, wrong scale, wrong tone?",
    "Pull-back reveal, whip pan, or rack focus to deliver the turn?",
  ],
  "short.payoff": [
    "What is the final visual that lands the emotion or punchline? Tighter than the hook.",
    "Branded sting (logo + tagline) or unbranded held frame?",
  ],
  "feature.setup": [
    "Show me the protagonist's everyday — what one routine action establishes their world?",
    "What is the world's 'normal' palette — natural daylight, tungsten interior, neon street, candle warmth?",
  ],
  "feature.inciting": [
    "What disrupts the everyday? Be physical and specific.",
    "Does the protagonist witness the disruption from a distance, or are they confronted by it directly?",
  ],
  "feature.rising": [
    "Three beats of escalation — first obstacle, second, third. What does each cost the protagonist?",
    "Average shot length should drop. Music or no music underneath?",
  ],
  "feature.midpoint": [
    "What is the reversal or revelation? What does the protagonist learn that recontextualizes everything?",
    "Composed wide or held tight close-up to mark the midpoint visually?",
  ],
  "feature.crisis": [
    "Lowest point — protagonist alone or stripped of allies/tools. What's the image of that loneliness?",
    "Negative space or claustrophobia? Open void or trapped frame?",
  ],
  "feature.climax": [
    "What is the dramatic question being answered, and what is the image of that answer?",
    "Major motion (chase, fight, sacrifice) or held heroic stillness?",
  ],
  "feature.denouement": [
    "What is the new normal? Echoes of the setup, but changed how?",
    "Final shot — does the camera linger on the protagonist or pull away to the world?",
  ],
};

function userTurnCount(req: AgentRequest): number {
  const beat = req.manifest.beats.find((b) => b.beatId === req.beatId);
  if (!beat) return 0;
  const scene = beat.scenes[0];
  const userTurns = scene.conversation.filter((t) => t.role === "user").length;
  // The current call adds one more user turn if userMessage is set.
  return userTurns + (req.userMessage ? 1 : 0);
}

function buildRefinedPrompt(req: AgentRequest, template: BeatTemplate): string {
  const beat = req.manifest.beats.find((b) => b.beatId === req.beatId);
  if (!beat) return req.manifest.masterPrompt;
  const archetype = beat.archetype;
  const userAnswers = beat.scenes[0].conversation
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("; ");
  const recent = req.userMessage ? `; ${req.userMessage}` : "";
  return [
    req.manifest.masterPrompt,
    `Beat: ${beat.beatName}. ${archetype.intent}`,
    `Director's specifics: ${userAnswers}${recent}`,
    `Mood: ${archetype.mood}, ${archetype.suggestedDuration}s.`,
    archetype.directorNotes,
  ].join(". ");
}

/** Strips a `[refs:N]` prefix the frontend prepends when a user attaches
 *  reference frames. Returns the parsed count + cleaned message. */
function parseRefMarker(msg: string | undefined): { refCount: number; cleanMessage: string } {
  if (!msg) return { refCount: 0, cleanMessage: "" };
  const match = msg.match(/^\[refs:(\d+)\]\s*/);
  if (!match) return { refCount: 0, cleanMessage: msg };
  return { refCount: Number.parseInt(match[1], 10), cleanMessage: msg.slice(match[0].length) };
}

export function runMockAgentTurn(req: AgentRequest): AgentResponse {
  const beat = req.manifest.beats.find((b) => b.beatId === req.beatId);
  if (!beat) {
    return {
      kind: "question",
      question: "Mock agent: I can't find that beat. Please retry.",
      reasoning: "Mock fallback — beatId not found in manifest.",
      estimatedRemaining: 1,
    };
  }
  const list = QUESTIONS_BY_TEMPLATE[beat.template] ?? [
    "Tell me one image you'd want as the very first frame of this beat.",
    "What's the dominant emotional color — warm or cool?",
  ];
  const { refCount } = parseRefMarker(req.userMessage);
  // Treat the ref-marker as not adding a user-turn for question pacing —
  // the userTurnCount() reads the manifest's recorded turns. We just need
  // to acknowledge the references in our response.
  const turns = userTurnCount(req);

  // Acknowledgment string the frontend prepends to the next agent reply
  // when references were attached. Cinematic register, not "I see N
  // images" robot-talk.
  const refAck =
    refCount > 0
      ? `Noted ${refCount === 1 ? "the reference frame" : `${refCount} reference frames`} — aiming for that mood. `
      : "";

  if (turns < list.length) {
    return {
      kind: "question",
      question: `${refAck}${list[turns]}`,
      reasoning: findTemplate(beat.template)?.directorNotes.split("\n")[0] ?? "Beat archetype",
      estimatedRemaining: list.length - turns,
    };
  }

  const refinedPrompt = buildRefinedPrompt(req, beat.template);
  return {
    kind: "sufficient",
    refinedPrompt,
    sceneSummary: `${refAck}${beat.beatName}: ${beat.archetype.intent}`,
    suggestedDuration: beat.archetype.suggestedDuration,
  };
}
