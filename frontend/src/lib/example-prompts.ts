/**
 * Five exemplary master prompts surfaced via the "Explore an example"
 * button on landing. Each one is intentionally OVER-packed so the agent
 * has all the load-bearing facets it needs (subject, action, setting,
 * framing register, mood, characterDescription, locationDescription)
 * and asks the user one or zero questions per beat before calling
 * markSufficient. The user can also edit before submitting — the
 * button only fills the draft, it does not auto-submit.
 *
 * What "packed" looks like in practice:
 *   - named character + age + identifying physical details (so the
 *     agent's beatFacts.characterDescription writes itself)
 *   - concrete setting + time of day + light register (so locationDescription
 *     and mood lock in immediately)
 *   - 3-5 key narrative beats woven into the paragraph (so the agent's
 *     prior-beats block has substance the moment decompose returns)
 *   - cinematographer cues (lens / palette / pace) so the per-beat
 *     archetype directorNotes don't have to do all the work
 */
export interface ExamplePrompt {
  id: string;
  /** One-line label shown only in dev tooling. Not user-facing. */
  label: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: ReadonlyArray<ExamplePrompt> = [
  {
    id: "mars-cass",
    label: "Sci-fi · astronaut on Mars",
    prompt:
      "Astronaut Cass, mid-30s, copper-red suit dust-streaked, sun-bleached helmet under one arm, walks the rim of a Martian dune at dusk. Earth is a faint blue dot on the horizon. Behind her a second crashed pod still smolders. She has eight minutes of oxygen left and thirty years of unspoken regret. She uncaps a thermos of coffee her daughter packed before launch and drinks alone. The wind picks up. She turns back toward the wreckage. Slow drone descents, amber-and-rust palette, crackling radio interference throughout, anamorphic flares at the horizon.",
  },
  {
    id: "tokyo-cafe",
    label: "Indie romance · wrong drink in Tokyo",
    prompt:
      "Eli, a 22-year-old Japanese barista with paint-stained fingers and round wire glasses, hands a stranger the wrong drink at 3 AM in a tiny Shimokitazawa café. The stranger is Mei, mid-20s, red trench coat, sheet music tucked under her arm. She drinks the wrong order without saying anything and leaves a folded napkin on the bar. Six years pass — same café, same hour, different city. They meet again on a Shibuya train, both holding the same drink, neither speaking. Soft amber interiors, neon-blue exteriors, vintage Japanese city-pop drifting from the speakers, 35mm intimate close-ups, one held two-shot at the end.",
  },
  {
    id: "spider-iron",
    label: "Action · Spider-Man + Iron Man chase",
    prompt:
      "Spider-Man, 19, in his red-and-blue suit, swings between Manhattan skyscrapers at golden hour chasing a stolen vibranium briefcase. Iron Man, gold-and-red armor scuffed from a previous fight, hovers above and signals — they need to work together. The briefcase tumbles into the East River. Spider-Man dives. Iron Man's repulsors light the water from above like twin floodlights. They surface together, four hands on the case, both breathing hard. Banter on the flight back to the tower. New York at dusk, the Hudson catching real-estate light, fast cuts on the chase, one long held two-shot when they surface.",
  },
  {
    id: "fox-kit-pinecone",
    label: "Animation · arctic fox + glowing pinecone",
    prompt:
      "A small Arctic fox kit, fur pure white dusted with falling snow, carries a glowing amber pinecone in its teeth through a frozen pine forest at twilight. A great horned owl, brown-and-gray with steady amber eyes, watches from a high branch as the kit passes beneath. The kit reaches a hollow log where seven other fox kits wait, ears tucked, breath visible in the cold. They huddle around the pinecone. Its glow spreads outward through the forest, lighting the snow and waking the trees. Stylized animation in the register of Cartoon Saloon, palette of cobalt twilight and ember firelight, gentle falling snow throughout, no dialogue.",
  },
  {
    id: "vienna-conductor",
    label: "Drama · last conductor in Vienna",
    prompt:
      "Iris, an 84-year-old retired conductor with cropped silver hair, deep wrinkles, and a long charcoal wool coat, stands alone in the empty Vienna Musikverein at 6 AM. Mahler's Ninth plays softly from a phone in her coat pocket. She raises her hands and conducts one last time, eyes closed, while sunrise filters through the high arched windows in shafts of gold. The orchestra exists only in her memory — empty seats, dust motes catching the light, gilded interiors. A single tear tracks down her cheek during the adagio's climax. Long takes, no cuts during the conducting, period-accurate gilt-and-velvet hall, distant traffic barely audible.",
  },
];

/**
 * Pick a random example prompt, but never the same one twice in a row.
 * Pass the previous id (or null on first call) so the cycle has memory
 * across button clicks. Without this, three clicks in a row could
 * surface the same prompt repeatedly and the "explore another" feel
 * dies.
 */
export function pickExamplePrompt(previousId: string | null): ExamplePrompt {
  const candidates =
    previousId == null
      ? EXAMPLE_PROMPTS
      : EXAMPLE_PROMPTS.filter((p) => p.id !== previousId);
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx]!;
}
