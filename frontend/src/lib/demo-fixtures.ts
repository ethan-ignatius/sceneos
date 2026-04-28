import type { DemoFixtureId } from "./demo-mode";

/**
 * Pre-baked clip catalog used by the mocked /api layer (see demo-mode.ts)
 * for the LA Hacks live judging round. The pipeline IS real — we just
 * substitute the slow Veo / Higgsfield render with already-rendered
 * clips so wall-clock budget is bounded. The conversation questions, the
 * progression, the URLs, even the master-cut composition all read as
 * "we made this on the spot."
 *
 * The default fixture is `cyberpunk7` — a 7-beat short cinematic about
 * four kids on a sand basketball court who find a tape recorder in a
 * dystopia where music is forbidden. Reference assets and MP4 clips
 * live under `frontend/public/demo/` so they ship with the frontend
 * bundle and play locally without Cloudinary.
 *
 * Fixture shape (per beat):
 *   firstQuestion       — the agent's seed: scene-setting, framing
 *   suggestedAnswers    — 3 chips; the FIRST always lands the actual scene
 *   secondQuestion      — followup: dialogue / specific moment / mood
 *   secondSuggestedAnswers — 3 chips for the followup; FIRST is canon
 *   refinedSummary      — what the user "wrote", quoted back as Cued.
 *   refinedPrompt       — Veo-grade paragraph for the Roll-camera step
 *   referenceImages     — Imagen-style refs surfaced in the drawer
 *
 * The two-question rhythm reads as a real director conversation: the
 * agent asks a setup question, the user picks; the agent then asks for
 * a specific dialogue or beat-ending choice; the user picks; agent says
 * "I have enough" and rolls camera. Each beat lands at ~5s of user
 * interaction + ~10s of mocked render = ~15-20s, fitting the 2.5 min
 * total budget.
 */

const CLOUD = "https://res.cloudinary.com/dghelx0al/video/upload";
// Local clips live in frontend/public/demo and are served at /demo/*.
const LOCAL = "/demo";

interface DemoBeat {
  /** Matches a frontend BeatTemplate id; the manifest's matching beat
   *  gets mapped by index, not by template — but keeping the template
   *  in sync helps the agent's stage-aware questions feel correct. */
  template: string;
  refinedPrompt: string;
  /** First question the agent asks when the user opens this beat. */
  firstQuestion: string;
  /** Quick-reply chips the agent suggests with the first question. */
  suggestedAnswers: string[];
  /** Followup question after the user answers the first. */
  secondQuestion: string;
  /** Quick-reply chips for the followup. */
  secondSuggestedAnswers: string[];
  /** What "Cued. ..." reads after the agent flips to sufficient. */
  refinedSummary: string;
  durationSeconds: number;
  clipPublicId: string;
  clipUrl: string;
  lastFrameUrl?: string;
  /**
   * Optional list of pre-rendered reference image URLs (Imagen-style
   * character / location refs) that the demo agent surfaces during the
   * thinking phase to show "we just generated these to lock continuity."
   * Each entry is an absolute URL or a same-origin path under /demo.
   */
  referenceImages?: { url: string; label: string }[];
}

interface DemoFixture {
  /** What goes back as the suggested videoType on the landing
   *  decompose if the user submits without picking a tier. The
   *  cyberpunk fixture forces 7 beats via "story" tempates. */
  videoType: "short" | "trailer" | "feature" | "story";
  beats: DemoBeat[];
  /** Continuity bible returned by /api/decompose mock. */
  continuityBible: string;
  /** Pre-built master cut URL — what /api/stitch/url returns. */
  masterCutUrl: string;
  /** publicId / identifier of the master cut for the manifest. */
  masterCutPublicId: string;
  /** Optional ambient audio overlay used in the master cut. */
  audioPublicId?: string;
}

// ── cyberpunk7 (DEFAULT — 7-beat sand-court cyberpunk short) ──────────
//
// Visual register: Riot's Arcane / League cinematics — painterly
// stylized animation, saturated rim light, dust motes catching sun.
// Setting: a sandblown basketball court in a cyberpunk slum, dingy
// metal architecture all around, four young guys in cobbled-together
// streetwear (the dinginess softened by the colorful fabric). One
// giant mech haunts the skyline. In this world music is forbidden;
// finding a working tape recorder is the inciting jolt of the cut.
const CYBERPUNK_CONTINUITY =
  "Setting: a sand basketball court in a cyberpunk slum, late afternoon. " +
  "Four young guys in colorful streetwear, dust kicked up around their feet. " +
  "Architecture: dingy brown-metal scaffolds, neon-tagged bulkheads, " +
  "a single rusting hoop and net standing in the open sand. A giant mech " +
  "patrols the skyline. Visual register: stylized 2D animation in the " +
  "register of Riot's Arcane — painterly, saturated rim light, exaggerated " +
  "silhouettes. Cast (kept consistent across all 7 beats via shared " +
  "Imagen character refs): MC (lean, sharp jawline, faded hoodie); " +
  "Glasses (buzz cut, round frames, clean lineups, careful hands); " +
  "Dimorphic (broad, sunglasses, intimidating posture, dry sense of humor); " +
  "Speedy (lankier fourth, tracksuit, the loud one). World rule: " +
  "music is illegal. The giant mech is wired to lock onto sound signatures.";

const CYBERPUNK7: DemoFixture = {
  videoType: "story",
  continuityBible: CYBERPUNK_CONTINUITY,
  masterCutPublicId: "demo/MasterCut",
  masterCutUrl: `${LOCAL}/MasterCut.mp4`,
  beats: [
    // ── Beat 1 — Hook (basketball flies, drone push, MC drives) ───────
    {
      template: "story.hook",
      refinedPrompt:
        "Stylized 2D animation in the register of Riot's Arcane. A basketball " +
        "arcs into a copper-pink sky over a cyberpunk slum, drone-tracked from " +
        "above so the ball nearly kisses the lens. Cut down to four young guys " +
        "on a sand basketball court — dust catches the late sun. The MC, lean " +
        "in a faded hoodie, dribbles toward the hoop. Painterly rim light. " +
        "Architecture in the back: rusted scaffolds, neon-tagged bulkheads.",
      firstQuestion:
        "We open in a cyberpunk slum — sand basketball court, four kids playing in the dust. What's the very first image the audience sees?",
      suggestedAnswers: [
        "a basketball mid-air, drone tracks it down — it nearly hits the lens",
        "a wide of the dusty court at sunset, four guys mid-game",
        "the MC mid-dribble, painterly close-up on his hands",
      ],
      secondQuestion:
        "Good — we open on the ball mid-arc, then drop into the game. Who do we follow as the camera lands?",
      secondSuggestedAnswers: [
        "the MC — he's got main-character energy, drives the lane",
        "the whole group — four silhouettes against the sun",
        "the dimorphic guy — broad, sunglasses, off the play",
      ],
      refinedSummary:
        "open on the basketball arcing toward the lens — drone push down to the MC driving the lane, four kids playing in the dust",
      durationSeconds: 5,
      clipPublicId: "demo/Clip1",
      clipUrl: `${LOCAL}/Clip1.mp4`,
      referenceImages: [
        { url: `${LOCAL}/location.png`, label: "Sand court" },
        { url: `${LOCAL}/char1.png`, label: "MC" },
      ],
    },
    // ── Beat 2 — Exposition (the play breaks down) ───────────────────
    {
      template: "story.exposition",
      refinedPrompt:
        "Continuing from the same end frame. The MC pulls up for a jumper. " +
        "Mid-release, his teammate — broad-shouldered, sunglasses — leaps and " +
        "spikes the block clean. The basketball thuds into the sand and rests " +
        "there. Match-cut energy, Arcane brushwork, dust burst on the impact. " +
        "Hold on the still ball half-buried in sand for a beat.",
      firstQuestion:
        "MC is at the rim — he's about to take the shot. What stops the play cold?",
      suggestedAnswers: [
        "his teammate spikes the block — clean rejection",
        "he hesitates — second-guesses the shot",
        "the rim breaks loose — the ball rolls away",
      ],
      secondQuestion:
        "Block lands. The ball thuds into the sand. How long do we hold on it?",
      secondSuggestedAnswers: [
        "a long hold — silence, just the ball half-buried in sand",
        "a quick cut — straight into the next play",
        "slow motion on the impact, then snap to silence",
      ],
      refinedSummary:
        "the dimorphic teammate spikes the block; the ball thuds dead in the sand and the world holds on it",
      durationSeconds: 6,
      clipPublicId: "demo/Clip2",
      clipUrl: `${LOCAL}/Clip2.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char1v2.png`, label: "MC · alt" },
        { url: `${LOCAL}/char4.png`, label: "Dimorphic" },
      ],
    },
    // ── Beat 3 — Inciting (the recorder is unearthed) ────────────────
    {
      template: "story.inciting",
      refinedPrompt:
        "All four guys around the dead ball, hands on knees, panting. One says " +
        "'who's gonna take it?' The Glasses guy — buzz cut, round frames, careful " +
        "hands — drops to one knee and skims the sand. He pulls up a battered tape " +
        "recorder, brushes the grit off the case. Hold on his expression as he " +
        "registers what he's holding. Stylized 2D animation, dust motes in shafted " +
        "light.",
      firstQuestion:
        "Four guys panting around the dead ball. Someone has to say something — what's the line?",
      suggestedAnswers: [
        "'who's gonna take it?' — flat, exhausted",
        "'we run it back' — defiant, fired up",
        "'I'm done' — a kid drops to the sand",
      ],
      secondQuestion:
        "Then something interrupts the moment. What changes the air?",
      secondSuggestedAnswers: [
        "the Glasses guy spots something half-buried — pulls up a tape recorder",
        "they hear a low hum from the architecture above",
        "a drone passes over — they all duck reflexively",
      ],
      refinedSummary:
        "panting after the play — 'who's gonna take it?' — Glasses unearths a buried tape recorder, brushes the sand off",
      durationSeconds: 10,
      clipPublicId: "demo/Clip3",
      clipUrl: `${LOCAL}/Clip3.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char3.png`, label: "Glasses" },
        { url: `${LOCAL}/char1.png`, label: "MC" },
        { url: `${LOCAL}/char4.png`, label: "Dimorphic" },
      ],
    },
    // ── Beat 4 — Rising (headphones, press play) ─────────────────────
    {
      template: "story.rising",
      refinedPrompt:
        "Four guys huddle around Glasses as he holds the recorder. The Dimorphic " +
        "guy leans in over his sunglasses — 'bro, what is this?' MC pushes in: " +
        "'gimme gimme gimme.' Glasses ignores them, plugs in a worn pair of " +
        "headphones, presses play. The recorder crackles to life. Tight handheld " +
        "blocking, painterly rim light on the headphones.",
      firstQuestion:
        "Glasses is holding a strange device. The others crowd in — give me one line each.",
      suggestedAnswers: [
        "Dimorphic leans in: 'bro, what is this?' — MC: 'gimme gimme gimme'",
        "Speedy snatches at it: 'let me see' — Dimorphic: 'back off'",
        "they all just stare — silent, charged",
      ],
      secondQuestion:
        "How does Glasses figure out what it does?",
      secondSuggestedAnswers: [
        "headphones in — he plugs them, presses play, the recorder crackles",
        "he flips it over, peels the back off, finds a tape inside",
        "the recorder hisses on its own — they all freeze and listen",
      ],
      refinedSummary:
        "Dimorphic: 'bro, what is this?' MC: 'gimme gimme gimme.' Glasses plugs the headphones in and presses play — the recorder crackles awake",
      durationSeconds: 6,
      clipPublicId: "demo/Clip4",
      clipUrl: `${LOCAL}/Clip4.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char3.png`, label: "Glasses" },
        { url: `${LOCAL}/char2.png`, label: "Speedy" },
      ],
    },
    // ── Beat 5 — Climax (dolly zoom, 'is this music?') ───────────────
    {
      template: "story.climax",
      refinedPrompt:
        "The recorder plays — music spills into the headphones for the first time " +
        "in this kid's life. Dolly zoom on Glasses: he's stretched, the world " +
        "behind him compresses. He's astonished, shocked, frozen. The MC asks " +
        "openly, naive — 'is this music?' The Dimorphic slaps the back of his " +
        "head, hisses 'say that word out loud, idiot.' Stylized animation, " +
        "exaggerated camera move, painterly bloom on the headphone glow.",
      firstQuestion:
        "Music plays through the headphones. This kid's never heard it before. How does the camera show that?",
      suggestedAnswers: [
        "dolly zoom — he stretches, the world behind him compresses",
        "slow-mo close-up — eyes wide, headphones bloom",
        "rack focus from the recorder to his face — sharp, then ECU",
      ],
      secondQuestion:
        "MC blurts the obvious. Dimorphic shuts him up — what's the dialogue?",
      secondSuggestedAnswers: [
        "MC: 'is this music?' — Dimorphic slaps his head: 'say that word out loud, idiot'",
        "MC: 'what is this?' — Speedy: 'shut up, shut up'",
        "MC: 'I've never heard…' — Dimorphic: 'don't finish that sentence'",
      ],
      refinedSummary:
        "dolly zoom on Glasses; MC: 'is this music?' — Dimorphic slaps his head: 'say that word out loud, idiot'",
      durationSeconds: 5,
      clipPublicId: "demo/Clip5",
      clipUrl: `${LOCAL}/Clip5.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char3.png`, label: "Glasses" },
        { url: `${LOCAL}/char1.png`, label: "MC" },
        { url: `${LOCAL}/char4.png`, label: "Dimorphic" },
      ],
    },
    // ── Beat 6 — Falling (mech locks on) ─────────────────────────────
    {
      template: "story.falling",
      refinedPrompt:
        "The four guys grab for the recorder, fight over it for one beat — then " +
        "freeze. Cut to a HUD POV from a giant mech overlooking the slum: a blue " +
        "diamond hitmark settles over the four kids, snaps to red, and the words " +
        "'MUSIC DETECTED' flash in cyan across the targeting plate. Cut back: the " +
        "Dimorphic turns first, teeth bared, eyes wide. The other three follow " +
        "his stare, slow. Arcane-style animation, neon HUD overlay.",
      firstQuestion:
        "Music is illegal in this world. The mech that patrols the slum is wired to lock onto sound. What does it see?",
      suggestedAnswers: [
        "HUD POV — blue diamond locks on them, snaps to red, 'MUSIC DETECTED'",
        "drones swarm out of rooftops, surrounding them",
        "the city PA blares a warning — speakers everywhere",
      ],
      secondQuestion:
        "Cut back to the kids. Who notices the mech first?",
      secondSuggestedAnswers: [
        "the Dimorphic — turns first, teeth bared, the others follow",
        "Glasses — frozen, headphones still on",
        "the MC — looks up first, mouth open",
      ],
      refinedSummary:
        "mech HUD POV — blue→red lock, 'MUSIC DETECTED'; Dimorphic turns first, the others follow his stare",
      durationSeconds: 6,
      clipPublicId: "demo/Clip6",
      clipUrl: `${LOCAL}/Clip6.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char4.png`, label: "Dimorphic" },
        { url: `${LOCAL}/location.png`, label: "Slum skyline" },
      ],
    },
    // ── Beat 7 — Resolution (escape, mech fires) ─────────────────────
    {
      template: "story.resolution",
      refinedPrompt:
        "All four scatter at once, screaming 'WAOAOAOAH!' as they sprint in " +
        "different directions through the sand. Cut wide: the giant mech rears " +
        "up over the architecture, fires a single colossal shot — the round " +
        "lands wide and detonates next to one of the running kids, throwing him " +
        "sideways in a bloom of dust. End on the moment of the explosion. " +
        "Stylized animation, painterly fireball, exaggerated motion lines.",
      firstQuestion:
        "Lock is hot. The four kids scatter — what's the sound that carries the cut?",
      suggestedAnswers: [
        "all four scream 'WAOAOAOAH!' — overlapping, panicked",
        "no scream — just hard breathing, sand crunching",
        "the mech's targeting tone, building to a launch",
      ],
      secondQuestion:
        "How do we end? Mech fires — what's the last image?",
      secondSuggestedAnswers: [
        "explosion blooms next to one of them — throws him sideways in dust",
        "they make it past the corner — mech hesitates, frame freezes",
        "mech fires, smash cut to black on the muzzle flash",
      ],
      refinedSummary:
        "all four scatter screaming 'WAOAOAOAH!'; mech fires; the round detonates next to one of the kids in a bloom of dust",
      durationSeconds: 7,
      clipPublicId: "demo/Clip7",
      clipUrl: `${LOCAL}/Clip7.mp4`,
      referenceImages: [
        { url: `${LOCAL}/char1.png`, label: "MC" },
        { url: `${LOCAL}/char2.png`, label: "Speedy" },
        { url: `${LOCAL}/char3.png`, label: "Glasses" },
        { url: `${LOCAL}/char4.png`, label: "Dimorphic" },
      ],
    },
  ],
};

// ── Lighthouse-31 real-bake clip catalog (legacy fixtures) ────────────
const LH_BEAT_1 = {
  publicId: "sceneos/lighthouse31/beat-1/beat-1-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-1/beat-1-scene-1.mp4`,
  duration: 5,
};
const LH_BEAT_3 = {
  publicId: "sceneos/lighthouse31/beat-3/beat-3-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-3/beat-3-scene-1.mp4`,
  duration: 6,
};
const LH_BEAT_4 = {
  publicId: "sceneos/lighthouse31/beat-4/beat-4-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-4/beat-4-scene-1.mp4`,
  duration: 10,
};
const LH_BEAT_5 = {
  publicId: "sceneos/lighthouse31/beat-5/beat-5-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-5/beat-5-scene-1.mp4`,
  duration: 8,
};
const LH_BEAT_7 = {
  publicId: "sceneos/lighthouse31/beat-7/beat-7-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-7/beat-7-scene-1.mp4`,
  duration: 5,
};

const LH_AUDIO = "sceneos/8dbb956c76a7/audio/music";

const LH_CONTINUITY =
  "Setting: Cape Disappointment Light, US Pacific Northwest, November 1957. " +
  "Single keeper character — weathered, mid-50s, navy turtleneck under a wool overcoat.";

// Legacy fixtures — kept so old `?demo=trailer5` URLs don't 404. Single-
// turn Q&A (no secondQuestion) — these were never the live-judging path.
function legacyBeat(
  template: string,
  q: string,
  answers: string[],
  q2: string,
  a2: string[],
  summary: string,
  duration: number,
  publicId: string,
  url: string,
): DemoBeat {
  return {
    template,
    refinedPrompt: summary,
    firstQuestion: q,
    suggestedAnswers: answers,
    secondQuestion: q2,
    secondSuggestedAnswers: a2,
    refinedSummary: summary,
    durationSeconds: duration,
    clipPublicId: publicId,
    clipUrl: url,
  };
}

const TRAILER5: DemoFixture = {
  videoType: "trailer",
  continuityBible: LH_CONTINUITY,
  audioPublicId: LH_AUDIO,
  masterCutPublicId: LH_BEAT_1.publicId,
  masterCutUrl:
    `${CLOUD}/c_fill,w_1920,h_1080` +
    `/l_video:sceneos:lighthouse31:beat-3:beat-3-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-4:beat-4-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-5:beat-5-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-7:beat-7-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_audio:sceneos:8dbb956c76a7:audio:music,e_volume:-28/fl_layer_apply` +
    `/${LH_BEAT_1.publicId}.mp4`,
  beats: [
    legacyBeat("trailer.establishing", "What feeling lands first?", ["isolation", "anticipation", "warmth"], "And the lens?", ["wide static", "slow push-in", "drone descent"], "isolation; the keeper alone", LH_BEAT_1.duration, LH_BEAT_1.publicId, LH_BEAT_1.url),
    legacyBeat("trailer.hook", "What does the keeper see?", ["a ship too close", "a strange light", "his reflection"], "How does he react?", ["lifts his lantern", "freezes", "breathes out slow"], "a ship too close to the rocks", LH_BEAT_3.duration, LH_BEAT_3.publicId, LH_BEAT_3.url),
    legacyBeat("trailer.rising", "His instinct?", ["sound the foghorn", "swing the lantern", "fire a flare"], "Pace?", ["fast cuts", "one long take", "handheld"], "swing the lantern manually", LH_BEAT_4.duration, LH_BEAT_4.publicId, LH_BEAT_4.url),
    legacyBeat("trailer.climax-tease", "Does the ship turn?", ["it turns", "it doesn't", "ambiguous"], "Hold on?", ["the keeper's eyes", "the wide", "the storm"], "ambiguous — the storm swallows it", LH_BEAT_5.duration, LH_BEAT_5.publicId, LH_BEAT_5.url),
    legacyBeat("trailer.sting", "Final feeling?", ["duty", "grief", "quiet pride"], "Last frame?", ["wide pull-back", "ECU on his face", "match the open"], "quiet pride mixed with grief", LH_BEAT_7.duration, LH_BEAT_7.publicId, LH_BEAT_7.url),
  ],
};

const SHORT3: DemoFixture = {
  videoType: "short",
  continuityBible: LH_CONTINUITY,
  audioPublicId: LH_AUDIO,
  masterCutPublicId: LH_BEAT_1.publicId,
  masterCutUrl:
    `${CLOUD}/c_fill,w_1920,h_1080` +
    `/l_video:sceneos:lighthouse31:beat-5:beat-5-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-7:beat-7-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_audio:sceneos:8dbb956c76a7:audio:music,e_volume:-28/fl_layer_apply` +
    `/${LH_BEAT_1.publicId}.mp4`,
  beats: [TRAILER5.beats[0], TRAILER5.beats[3], TRAILER5.beats[4]],
};

export const DEMO_FIXTURES: Record<DemoFixtureId, DemoFixture> = {
  cyberpunk7: CYBERPUNK7,
  trailer5: TRAILER5,
  short3: SHORT3,
  // Keep `feature7` callable so old query-string URLs don't 404. Aliases
  // the cyberpunk fixture; the previous lighthouse 7-beat ordering was
  // never demoed and the cyberpunk story is a stronger judging cut.
  feature7: CYBERPUNK7,
};

export type { DemoBeat, DemoFixture };
