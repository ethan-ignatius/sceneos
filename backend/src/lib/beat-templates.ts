/**
 * Mirror of frontend/src/lib/beat-templates.ts.
 * Source of truth: docs/SHARED_TYPES.md
 *
 * The agent service uses this to pull the canonical archetype.intent + mood
 * for any given beat.template at runtime.
 */
import type { Beat, BeatTemplate, VideoType } from "../types/manifest.js";

interface BeatTemplateDef {
  template: BeatTemplate;
  beatName: string;
  intent: string;
  mood: Beat["archetype"]["mood"];
  suggestedDuration: number;
}

const TRAILER: BeatTemplateDef[] = [
  { template: "trailer.establishing", beatName: "Establishing", intent: "Place the viewer in the world. Wide, atmospheric. Stakes implied, not stated.", mood: "wide-establish", suggestedDuration: 8 },
  { template: "trailer.hook",         beatName: "Hook",         intent: "Introduce the protagonist with intimacy. Make us care in three seconds.", mood: "intimate-hook", suggestedDuration: 12 },
  { template: "trailer.rising",       beatName: "Rising",       intent: "Stakes escalate. Pace quickens. Conflict reveals itself.", mood: "kinetic-rising", suggestedDuration: 18 },
  { template: "trailer.climax-tease", beatName: "Climax Tease", intent: "Promise the apex without delivering it. Leave the viewer unable to look away.", mood: "tense-climax", suggestedDuration: 14 },
  { template: "trailer.sting",        beatName: "Sting",        intent: "One image. One line. The audience exhales and remembers.", mood: "punchy-sting", suggestedDuration: 8 },
];

const SHORT: BeatTemplateDef[] = [
  { template: "short.hook",   beatName: "Hook",   intent: "First three seconds matter. Stop the scroll.", mood: "intimate-hook", suggestedDuration: 5 },
  { template: "short.turn",   beatName: "Turn",   intent: "Subvert the expectation set in the hook.", mood: "kinetic-rising", suggestedDuration: 10 },
  { template: "short.payoff", beatName: "Payoff", intent: "Land the emotion. Punchy, memorable, shareable.", mood: "punchy-sting", suggestedDuration: 5 },
];

const FEATURE: BeatTemplateDef[] = [
  { template: "feature.setup",      beatName: "Setup",      intent: "Establish the world, the protagonist, and the everyday before the disruption.", mood: "wide-establish", suggestedDuration: 20 },
  { template: "feature.inciting",   beatName: "Inciting",   intent: "Disruption. The event that pulls the protagonist out of the ordinary.", mood: "intimate-hook", suggestedDuration: 25 },
  { template: "feature.rising",     beatName: "Rising",     intent: "Escalating obstacles. New rules of the world emerge.", mood: "kinetic-rising", suggestedDuration: 35 },
  { template: "feature.midpoint",   beatName: "Midpoint",   intent: "Reversal or revelation. Stakes redefined.", mood: "kinetic-rising", suggestedDuration: 25 },
  { template: "feature.crisis",     beatName: "Crisis",     intent: "Lowest point. The dark night.", mood: "tense-climax", suggestedDuration: 30 },
  { template: "feature.climax",     beatName: "Climax",     intent: "The apex. The dramatic question is answered.", mood: "tense-climax", suggestedDuration: 25 },
  { template: "feature.denouement", beatName: "Denouement", intent: "Resolution. The new normal. Quiet, earned.", mood: "still-resolve", suggestedDuration: 20 },
];

export const BEAT_TEMPLATES: Record<VideoType, BeatTemplateDef[]> = {
  trailer: TRAILER,
  short: SHORT,
  feature: FEATURE,
};

export function findTemplate(template: BeatTemplate): BeatTemplateDef | undefined {
  for (const list of Object.values(BEAT_TEMPLATES)) {
    const found = list.find((t) => t.template === template);
    if (found) return found;
  }
  return undefined;
}
