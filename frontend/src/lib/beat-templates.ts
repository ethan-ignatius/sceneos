import type { Beat, BeatTemplate, VideoType } from "@/types/manifest";
import { uuid, nowISO } from "@/lib/utils";

interface BeatTemplateDef {
  template: BeatTemplate;
  beatName: string;
  intent: string;
  mood: Beat["archetype"]["mood"];
  suggestedDuration: number;
  /** Directorial guidance for this beat — the cinematography moat. */
  directorNotes: string;
}

/**
 * Beat archetypes encode the cinematography knowledge SceneOS exists to
 * provide. The agent prepends `directorNotes` to its system prompt so
 * questions and refined Higgsfield prompts speak in directorial language
 * (lens, movement, light, blocking, pace) — not generic "what mood?".
 *
 * Tuning these strings IS tuning the moat. Treat as production code, not
 * placeholder text.
 */
const TRAILER: BeatTemplateDef[] = [
  {
    template: "trailer.establishing",
    beatName: "Establishing",
    intent: "Place the viewer in the world. Stakes implied, not stated.",
    mood: "wide-establish",
    suggestedDuration: 8,
    directorNotes: [
      "FRAME: Establishing shot. Open wide and atmospheric.",
      "LENS: 24mm or wider for grand scale; OR 85mm + heavy compression for an isolated subject.",
      "MOVEMENT: Slow push-in or static. Never handheld.",
      "LIGHT: Single dominant key, large soft source. Set the world's emotional temperature here — cold blues for loneliness, warm golds for wonder, low-sat greys for gravitas.",
      "BLOCKING: Subject (if any) in lower third or off-center; landscape dominates.",
      "PACE: One shot, breathing. Audience must feel the world before anything happens.",
    ].join("\n"),
  },
  {
    template: "trailer.hook",
    beatName: "Hook",
    intent: "First close-up of the protagonist. Make us care in three seconds.",
    mood: "intimate-hook",
    suggestedDuration: 12,
    directorNotes: [
      "FRAME: Intimate close-up of the protagonist. The 'connect' moment.",
      "LENS: 35mm or 50mm at f/1.8–2.0. Shallow depth of field; everything but the eyes falls away.",
      "MOVEMENT: Slight handheld breath — NOT static. Empathy comes from a living camera.",
      "LIGHT: Soft key on the eyes; let the rest of the frame go dark. Catch-light is non-negotiable.",
      "BLOCKING: Subject slightly off-center, looking toward action we don't yet see.",
      "BEHAVIOR: One specific micro-action — a hand reaching, a glance, a swallow, hesitation. Specificity > generality.",
      "PACE: Hold the shot. Let the audience read the face. No rapid cut.",
    ].join("\n"),
  },
  {
    template: "trailer.rising",
    beatName: "Rising",
    intent: "Stakes escalate. Pace quickens. Conflict reveals itself.",
    mood: "kinetic-rising",
    suggestedDuration: 18,
    directorNotes: [
      "FRAME: Variety. Avoid eye-level for too long. Cut between scales.",
      "LENS: Mix focal lengths — wide for context, tight for impact, never the same shot twice.",
      "MOVEMENT: Camera is alive — dolly, drone, handheld, crane. Static shots are forbidden in this beat.",
      "LIGHT: Hard light, increased contrast. Add shadows.",
      "BLOCKING: Each shot must add a new piece of the conflict. Never repeat information.",
      "PACE: 1–2 second cuts. Music drives. Build velocity, not just intensity.",
    ].join("\n"),
  },
  {
    template: "trailer.climax-tease",
    beatName: "Climax Tease",
    intent: "Promise the apex without delivering it. Make the viewer unable to look away.",
    mood: "tense-climax",
    suggestedDuration: 14,
    directorNotes: [
      "FRAME: One held image of the highest stakes — caught mid-action OR a hard freeze.",
      "LENS: Wide for scale, OR ECU for emotional impact. Pick one and commit.",
      "MOVEMENT: One enormous move — fall, swing, embrace, transformation — or total stillness.",
      "LIGHT: Backlit silhouette permitted; high-contrast palette.",
      "BLOCKING: Subject dominates frame.",
      "PACE: One held moment, then a HARD cut to black or white. Sound design carries what the cut withholds.",
    ].join("\n"),
  },
  {
    template: "trailer.sting",
    beatName: "Sting",
    intent: "One image. One line. The audience exhales and remembers.",
    mood: "punchy-sting",
    suggestedDuration: 8,
    directorNotes: [
      "FRAME: Title card or single iconic frame. Weighted, intentional.",
      "LENS: Match the emotional center — wide for title-on-landscape, tight for face-with-tagline.",
      "MOVEMENT: Static, OR a slow pull-back to reveal a title.",
      "LIGHT: Clean. Backgrounds often pure black or pure white. Negative space is the canvas.",
      "TYPOGRAPHY: If text — display serif or stencil. Italics on connectives, never on nouns.",
      "PACE: 3–5 seconds. Resist cutting earlier. The audience needs the beat.",
    ].join("\n"),
  },
];

const SHORT: BeatTemplateDef[] = [
  {
    template: "short.hook",
    beatName: "Hook",
    intent: "Stop the scroll in 1.5 seconds.",
    mood: "intimate-hook",
    suggestedDuration: 5,
    directorNotes: [
      "FRAME: Instantly readable. One clear focal point. No text intros.",
      "LENS: 35mm or 50mm, frontal, eye-level.",
      "MOVEMENT: Static or one small move. Frame must register before the brain decides to keep watching.",
      "LIGHT: Bright, high-contrast. Algorithm-friendly = exposure-friendly.",
      "BLOCKING: Subject centered or strict rule-of-thirds.",
      "PACE: 1–3 seconds before something resolves, surprises, or invites.",
    ].join("\n"),
  },
  {
    template: "short.turn",
    beatName: "Turn",
    intent: "Subvert the expectation set in the hook.",
    mood: "kinetic-rising",
    suggestedDuration: 10,
    directorNotes: [
      "FRAME: Recontextualize what came before.",
      "LENS: Switch focal length from the hook — tight → wide, or vice versa.",
      "MOVEMENT: Camera reveal — pull back, push in, whip pan, rack focus.",
      "LIGHT: Different palette from hook. Make the contrast obvious.",
      "BLOCKING: New positions, new orientations.",
      "PACE: 4–6 seconds; the turn lands at the midpoint of the short.",
    ].join("\n"),
  },
  {
    template: "short.payoff",
    beatName: "Payoff",
    intent: "Land the emotion or punchline in under 5 seconds.",
    mood: "punchy-sting",
    suggestedDuration: 5,
    directorNotes: [
      "FRAME: Tighter than the hook. Final image carries the weight.",
      "LENS: Mid-shot to ECU.",
      "MOVEMENT: Often static. Resist a final move.",
      "LIGHT: Bold, branded.",
      "BLOCKING: Subject anchored. Optional text overlay or branded sting.",
      "PACE: 3 seconds. Hard stop. Don't fade.",
    ].join("\n"),
  },
];

const FEATURE: BeatTemplateDef[] = [
  {
    template: "feature.setup",
    beatName: "Setup",
    intent: "Establish the world, the protagonist, and the everyday before disruption.",
    mood: "wide-establish",
    suggestedDuration: 20,
    directorNotes: [
      "FRAME: Build the ordinary world. The protagonist's routine.",
      "LENS: Mostly mediums and wides. Eye-level, classical.",
      "MOVEMENT: Composed and patient. Push-ins, slow dollies. Establish that the camera trusts the world.",
      "LIGHT: Soft, natural. Whatever the 'normal' palette of this world is — stable.",
      "BLOCKING: Show the protagonist relating to their environment, their loved ones, their work. Comfort, even if fragile.",
      "PACE: 3–5 second shots. The audience needs to feel time passing here.",
    ].join("\n"),
  },
  {
    template: "feature.inciting",
    beatName: "Inciting",
    intent: "The disruption. The event that pulls the protagonist out of the ordinary.",
    mood: "intimate-hook",
    suggestedDuration: 25,
    directorNotes: [
      "FRAME: The break. The thing that cannot be ignored.",
      "LENS: Tighter than Setup. Push closer to the protagonist's face during/after the event.",
      "MOVEMENT: Camera responds to the event — tilts, jolts, follows.",
      "LIGHT: First palette shift of the film. Even subtle counts.",
      "BLOCKING: Protagonist meets the disruption physically — confronted, witness, summoned.",
      "PACE: One scene held, no rapid cuts. Let the disruption breathe.",
    ].join("\n"),
  },
  {
    template: "feature.rising",
    beatName: "Rising",
    intent: "Escalating obstacles. New rules of the world emerge.",
    mood: "kinetic-rising",
    suggestedDuration: 35,
    directorNotes: [
      "FRAME: Variety of locations and angles. The world keeps revealing itself.",
      "LENS: Cut across focal lengths. Wides for new spaces, tights for confrontations.",
      "MOVEMENT: More handheld, more drone, more movement of any kind. Build velocity.",
      "LIGHT: Increasing contrast. Shadows lengthen.",
      "BLOCKING: Each scene introduces a new rule, ally, or antagonist.",
      "PACE: Quickening. Average shot length drops over the course of this beat.",
    ].join("\n"),
  },
  {
    template: "feature.midpoint",
    beatName: "Midpoint",
    intent: "Reversal or revelation. Stakes redefined.",
    mood: "kinetic-rising",
    suggestedDuration: 25,
    directorNotes: [
      "FRAME: Pivot. What the audience thought the story was about — it isn't, exactly.",
      "LENS: Often a deliberate, composed shot — directors signal the midpoint with care.",
      "MOVEMENT: One slow, intentional move (push or pull). Or a held wide.",
      "LIGHT: New palette begins to creep in.",
      "BLOCKING: Protagonist meets a mirror — version of themselves, antagonist's belief, or hidden truth.",
      "PACE: Slow down briefly, then accelerate.",
    ].join("\n"),
  },
  {
    template: "feature.crisis",
    beatName: "Crisis",
    intent: "Lowest point. The dark night.",
    mood: "tense-climax",
    suggestedDuration: 30,
    directorNotes: [
      "FRAME: Isolation. The protagonist alone, or stripped of allies/tools.",
      "LENS: Tighter, more claustrophobic.",
      "MOVEMENT: Static or trapped — limited movement. Camera can't escape either.",
      "LIGHT: Lowest key. Negative space dominant. Shadows swallow detail.",
      "BLOCKING: The protagonist decides, again, what they are — or aren't.",
      "PACE: Slowest beat in the film. Hold the silence.",
    ].join("\n"),
  },
  {
    template: "feature.climax",
    beatName: "Climax",
    intent: "The apex. The dramatic question is answered.",
    mood: "tense-climax",
    suggestedDuration: 25,
    directorNotes: [
      "FRAME: Maximum stakes. The image the audience came for.",
      "LENS: Bigger lenses (wider) for spectacle; longer lenses for emotional culmination. Pick the lane.",
      "MOVEMENT: Major motion — chase, fight, embrace, sacrifice — or one held heroic stillness.",
      "LIGHT: Heightened. Practical lights become iconic; key lights become sculptural.",
      "BLOCKING: Protagonist commits. The body says yes or no.",
      "PACE: Cut hard at the answer.",
    ].join("\n"),
  },
  {
    template: "feature.aftermath",
    beatName: "Aftermath",
    intent: "The dust settles. The cost of victory or the weight of loss is felt before the world resolves.",
    mood: "still-resolve",
    suggestedDuration: 18,
    directorNotes: [
      "FRAME: The immediate quiet after the apex. Bodies, places, faces in the moments after the cut.",
      "LENS: Mediums and tight close-ups. Read the cost on the face.",
      "MOVEMENT: Almost none. Slow drift OR pure static. The camera is winded too.",
      "LIGHT: Warm twilight or pre-dawn — palette cooling toward the new normal but not yet there.",
      "BLOCKING: Protagonist alone in the frame, or ally beside them. Touch is permitted; speech is rare.",
      "PACE: Long takes. 5–8 second shots. The audience earns the silence.",
    ].join("\n"),
  },
  {
    template: "feature.denouement",
    beatName: "Denouement",
    intent: "Resolution. The new normal. Quiet, earned.",
    mood: "still-resolve",
    suggestedDuration: 20,
    directorNotes: [
      "FRAME: The world after. Echoes of the Setup, but changed.",
      "LENS: Mediums and wides. Classical again.",
      "MOVEMENT: Slow. Often static. The camera, like the protagonist, has stopped chasing.",
      "LIGHT: Settled. New normal palette.",
      "BLOCKING: The protagonist exists in the new world. Show, don't tell.",
      "PACE: 4–6 second shots. Let the audience exhale.",
    ].join("\n"),
  },
];

const STORY: BeatTemplateDef[] = [
  {
    template: "story.hook",
    beatName: "Hook",
    intent: "Establish the false equilibrium. Stop the audience from looking away.",
    mood: "intimate-hook",
    suggestedDuration: 5,
    directorNotes: [
      "FRAME: One image that contains the premise.",
      "LENS: 35mm or 50mm. Close enough to read intent.",
      "MOVEMENT: Static or breath-only handheld.",
      "LIGHT: Single motivated source. Catch the eyes.",
      "PACE: Hold one moment that tells us what kind of movie this is.",
    ].join("\n"),
  },
  {
    template: "story.exposition",
    beatName: "Exposition",
    intent: "Establish the world, the protagonist, and what they want.",
    mood: "wide-establish",
    suggestedDuration: 8,
    directorNotes: [
      "FRAME: Wider. Show the protagonist in their world.",
      "LENS: 24mm scale OR 85mm compression to isolate them in it.",
      "MOVEMENT: Slow push-in or composed static. Patient.",
      "LIGHT: Soft, motivated, normal. The everyday.",
      "PACE: Breathing. One or two shots, no cut frenzy.",
    ].join("\n"),
  },
  {
    template: "story.inciting",
    beatName: "Inciting Incident",
    intent: "The disruption. The protagonist must act.",
    mood: "intimate-hook",
    suggestedDuration: 6,
    directorNotes: [
      "FRAME: The break. A specific physical moment.",
      "LENS: Switch focal length from exposition.",
      "MOVEMENT: Camera reacts. Tilt, jolt, follow.",
      "LIGHT: Palette shifts. Something is wrong.",
      "PACE: Faster cuts begin here. The world changes.",
    ].join("\n"),
  },
  {
    template: "story.rising",
    beatName: "Rising Action",
    intent: "Stakes escalate. Obstacles compound. The protagonist commits.",
    mood: "kinetic-rising",
    suggestedDuration: 10,
    directorNotes: [
      "FRAME: Variety. Avoid eye-level for too long.",
      "LENS: Mix focal lengths.",
      "MOVEMENT: Camera is alive. Dolly, drone, handheld, crane.",
      "LIGHT: Hard light, rising contrast.",
      "PACE: 1-2 second cuts. Build velocity.",
    ].join("\n"),
  },
  {
    template: "story.climax",
    beatName: "Climax",
    intent: "The apex. The dramatic question is answered.",
    mood: "tense-climax",
    suggestedDuration: 8,
    directorNotes: [
      "FRAME: One held image of the highest stakes OR maximum motion.",
      "LENS: Wide for scale OR ECU for emotional impact.",
      "MOVEMENT: One enormous move OR total stillness.",
      "LIGHT: Backlit silhouette permitted. High contrast.",
      "PACE: Held moment, then a hard cut.",
    ].join("\n"),
  },
  {
    template: "story.falling",
    beatName: "Falling Action",
    intent: "The aftermath. Consequences land.",
    mood: "still-resolve",
    suggestedDuration: 6,
    directorNotes: [
      "FRAME: The world after. Echo the exposition.",
      "LENS: Match or mirror exposition lens.",
      "MOVEMENT: Slowed. Often static.",
      "LIGHT: Settled. Soft.",
      "PACE: Long takes. Let the audience exhale.",
    ].join("\n"),
  },
  {
    template: "story.resolution",
    beatName: "Resolution",
    intent: "The new normal. The last frame is the emotional register.",
    mood: "still-resolve",
    suggestedDuration: 5,
    directorNotes: [
      "FRAME: Final image. The thing they remember.",
      "LENS: Match the emotional center.",
      "MOVEMENT: Locked-off, OR a slow pull-back to god view.",
      "LIGHT: Negative space is the canvas.",
      "PACE: One held moment. End.",
    ].join("\n"),
  },
];

const REGISTRY: Record<VideoType, BeatTemplateDef[]> = {
  story: STORY,
  trailer: TRAILER,
  short: SHORT,
  feature: FEATURE,
};

export function buildInitialBeats(videoType: VideoType): Beat[] {
  const defs = REGISTRY[videoType];
  return defs.map((def) => ({
    beatId: uuid(),
    beatName: def.beatName,
    template: def.template,
    status: "pending",
    archetype: {
      intent: def.intent,
      mood: def.mood,
      suggestedDuration: def.suggestedDuration,
      directorNotes: def.directorNotes,
    },
    scenes: [
      {
        sceneId: uuid(),
        conversation: [],
        approved: false,
      },
    ],
  }));
}

export function totalSuggestedDuration(videoType: VideoType): number {
  return REGISTRY[videoType].reduce((sum, def) => sum + def.suggestedDuration, 0);
}

/**
 * Beat-count by user-facing video type. The canvas reads this when
 * rendering the planet system, and the prompt-store reads it for the
 * landing-page tier picker.
 *
 * Tier mapping (locked with the user 2026-04-26):
 *   short    → 3 beats   ("Trailer")     — TikTok-register, snappy
 *   trailer  → 5 beats   ("Short film")  — mini-movie, full arc compressed
 *   feature  → 8 beats   ("Movie")       — full dramatic arc + aftermath
 *   story    → 7 beats                   — internal canonical fallback
 */
export const BEAT_COUNT_BY_TYPE: Record<VideoType, number> = {
  short: 3,
  trailer: 5,
  feature: 8,
  story: 7,
};

/**
 * Three user-facing tiers exposed in landing's video-type picker.
 * `id` is the internal VideoType; `label` is what we render in the chip.
 * Order: shortest → longest.
 */
export const VIDEO_TYPE_TIERS: ReadonlyArray<{
  id: VideoType;
  label: string;
  beatCount: number;
  hint: string;
}> = [
  { id: "short", label: "Trailer", beatCount: 3, hint: "punchy social-media cut" },
  { id: "trailer", label: "Short film", beatCount: 5, hint: "mini-movie, full arc" },
  { id: "feature", label: "Movie", beatCount: 8, hint: "long-form, every beat" },
];

/**
 * Heuristic: pick a tier from prompt verbosity when the user hasn't made
 * an explicit choice. Word-count ranges tuned against representative
 * prompts (see comment block):
 *   ≤ 8 words   → Trailer (3) — "a dog runs away in the 90s" (7 words)
 *   9 – 25 words → Short film (5) — "a woman finds an old letter from her late husband and decides to follow its instructions across the city" (22 words)
 *   > 25 words  → Movie (8) — anything paragraph-length
 */
export function pickVideoTypeFromPrompt(prompt: string): VideoType {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "trailer"; // empty input — neutral default
  if (words <= 8) return "short";
  if (words <= 25) return "trailer";
  return "feature";
}

export const BEAT_TEMPLATES = REGISTRY;
export { STORY, TRAILER, SHORT, FEATURE };
export type { BeatTemplateDef };

export function nowStamp() {
  return nowISO();
}
