import type { DemoFixtureId } from "./demo-mode";

/**
 * Pre-baked Cloudinary cinematics used by the mock api layer (see
 * demo-mode.ts) for the LA Hacks live demo. Public_ids point at the
 * real lighthouse31 bake (Veo 3.1 Fast at 1080p with synced audio,
 * baked 2026-04-25). These are not secret — anyone who hits the URL
 * gets the video — so this file is safe to commit. The mocking
 * indirection is the secret, not the asset list.
 *
 * Three fixtures, swappable via `?demo=<id>` on the URL:
 *
 *   trailer5  ← DEFAULT. 5-beat short film. ~50s of mock render.
 *   short3    ← 3-beat trailer. ~30s of mock render. Round-1 safety pick.
 *   feature7  ← Full 7-beat arc. ~70s of mock render. Round-2 only.
 *
 * To rebake (e.g. cloud rotation, fresh prompt): run the real pipeline
 * once end-to-end with the demo prompt, capture the publicIds for each
 * beat from the manifest, paste them in below. The structure stays
 * fixed; only the publicId / clipUrl strings change.
 */

const CLOUD = "https://res.cloudinary.com/dghelx0al/video/upload";

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
  /** What "Lock it in" produces if the user takes the chip path. */
  refinedSummary: string;
  durationSeconds: number;
  clipPublicId: string;
  clipUrl: string;
  lastFrameUrl?: string;
}

interface DemoFixture {
  /** What goes back as the suggested videoType on the landing
   *  decompose if the user submits without picking a tier. */
  videoType: "short" | "trailer" | "feature" | "story";
  beats: DemoBeat[];
  /** Continuity bible returned by /api/decompose mock. */
  continuityBible: string;
  /** Pre-built fl_splice'd master cut URL — what /api/stitch/url returns. */
  masterCutUrl: string;
  /** publicId of the master cut for the manifest. */
  masterCutPublicId: string;
  /** Optional ambient audio overlay used in the master cut. */
  audioPublicId?: string;
}

// ── Lighthouse-31 real-bake clip catalog (shared across all fixtures) ──
const LH_BEAT_1 = {
  publicId: "sceneos/lighthouse31/beat-1/beat-1-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-1/beat-1-scene-1.mp4`,
  duration: 5,
};
const LH_BEAT_2 = {
  publicId: "sceneos/lighthouse31/beat-2/beat-2-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-2/beat-2-scene-1.mp4`,
  duration: 8,
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
const LH_BEAT_6 = {
  publicId: "sceneos/lighthouse31/beat-6/beat-6-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-6/beat-6-scene-1.mp4`,
  duration: 6,
};
const LH_BEAT_7 = {
  publicId: "sceneos/lighthouse31/beat-7/beat-7-scene-1",
  url: `${CLOUD}/sceneos/lighthouse31/beat-7/beat-7-scene-1.mp4`,
  duration: 5,
};

const LH_AUDIO = "sceneos/8dbb956c76a7/audio/music";

const LH_CONTINUITY =
  "Setting: Cape Disappointment Light, US Pacific Northwest, November 1957. " +
  "Single keeper character — weathered, mid-50s, navy turtleneck under a wool overcoat, " +
  "kept consistent across all beats via shared Imagen 3 character reference. " +
  "Color register: storm-blue exteriors, amber lantern interiors, salt-spray highlights. " +
  "Audio bed: Lyria 2 piano + strings, ducked -28dB so dialogue stays primary.";

// ── trailer5 (DEFAULT — 5-beat short film) ────────────────────────────
// Subset of lighthouse31 chosen for narrative density: hook (1) →
// inciting (3) → rising (4) → climax (5) → resolution (7). Skips
// exposition + falling so the demo lands faster.
const TRAILER5: DemoFixture = {
  videoType: "trailer",
  continuityBible: LH_CONTINUITY,
  audioPublicId: LH_AUDIO,
  masterCutPublicId: LH_BEAT_1.publicId,
  // fl_splice'd master cut composed live by the frontend's
  // buildSpliceUrl() against this beat order — but we hold a static URL
  // here as the api.stitchUrl response so the stitch step is instant.
  masterCutUrl:
    `${CLOUD}/c_fill,w_1920,h_1080` +
    `/l_video:sceneos:lighthouse31:beat-3:beat-3-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-4:beat-4-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-5:beat-5-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-7:beat-7-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_audio:sceneos:8dbb956c76a7:audio:music,e_volume:-28/fl_layer_apply` +
    `/${LH_BEAT_1.publicId}.mp4`,
  beats: [
    {
      template: "trailer.establishing",
      refinedPrompt:
        "Cape Disappointment Light, dusk, November 1957. Wide static shot of the lighthouse silhouetted against a storm-blue sky. Single amber lantern visible at the top, beam sweeping across rolling whitecaps. The keeper's shadow passes the upper window. Held composition — let the wind and the surf carry the soundtrack.",
      firstQuestion: "What feeling do you want this opening to land on — anticipation, isolation, or warmth?",
      suggestedAnswers: ["isolation, the keeper alone", "anticipation, like a storm coming", "warmth, the lantern as a beacon"],
      refinedSummary: "isolation; the keeper alone in the storm",
      durationSeconds: LH_BEAT_1.duration,
      clipPublicId: LH_BEAT_1.publicId,
      clipUrl: LH_BEAT_1.url,
    },
    {
      template: "trailer.hook",
      refinedPrompt:
        "Interior of the lighthouse keeper's office. Mid-50s keeper at a wooden desk, oil lantern flickering. He pauses mid-logbook entry — eyes lift to the window. Outside, faint silhouette of a ship's mast cresting too close to shore. 35mm, intimate handheld breath. Costume: navy turtleneck under wool overcoat (consistent across all beats).",
      firstQuestion: "What does the keeper see that disturbs him? Be specific — the question carries the rest of the film.",
      suggestedAnswers: ["a ship too close to the rocks", "a light he doesn't recognize", "his own reflection in the storm"],
      refinedSummary: "a ship cresting too close to the rocks",
      durationSeconds: LH_BEAT_3.duration,
      clipPublicId: LH_BEAT_3.publicId,
      clipUrl: LH_BEAT_3.url,
    },
    {
      template: "trailer.rising",
      refinedPrompt:
        "Keeper sprints down the spiral staircase, oil lantern in hand, coat trailing. Camera follows in tight handheld, treads echoing. He bursts into the lower observation deck, throws the heavy door — sea spray and wind roar in. Outside, the ship is closer, listing. Fast cuts. Rising contrast: amber interior, storm-blue exterior. Pace: 1-2 second cuts, building velocity.",
      firstQuestion: "What's the keeper's instinct here — save them, sound an alarm, or signal a warning?",
      suggestedAnswers: ["sound the foghorn", "swing the lantern manually", "fire a flare"],
      refinedSummary: "swing the lantern manually to warn the ship",
      durationSeconds: LH_BEAT_4.duration,
      clipPublicId: LH_BEAT_4.publicId,
      clipUrl: LH_BEAT_4.url,
    },
    {
      template: "trailer.climax-tease",
      refinedPrompt:
        "On the catwalk around the lantern room, keeper braces against the wind, both hands gripping the lantern's brass guide. He swings the beam manually — dramatic arc across the water. The ship's silhouette catches the light. A long held moment, the audience holds its breath. Wide shot for scale, ECU on the keeper's eyes for emotional impact. One enormous move, then total stillness.",
      firstQuestion: "Does the ship turn in time, or does the moment land tragically?",
      suggestedAnswers: ["it turns — the keeper saves them", "it doesn't — the keeper watches it founder", "ambiguous — the storm swallows the answer"],
      refinedSummary: "ambiguous — the storm swallows the answer",
      durationSeconds: LH_BEAT_5.duration,
      clipPublicId: LH_BEAT_5.publicId,
      clipUrl: LH_BEAT_5.url,
    },
    {
      template: "trailer.sting",
      refinedPrompt:
        "Dawn. Storm broken. Keeper walks the rocky shoreline, coat heavy with salt. He kneels — picks up a piece of weathered ship's planking. Holds it. The lantern still burns above. Match the exposition's lens — closure mirrors opening. Long take, locked-off, slow pull-back to god view. Negative space and grey sky. End on the held image of the keeper alone.",
      firstQuestion: "What's the keeper feeling in this final beat — duty, grief, or quiet pride?",
      suggestedAnswers: ["duty, the work continues", "grief, for what the storm took", "quiet pride, he did what he could"],
      refinedSummary: "quiet pride mixed with grief — the work continues",
      durationSeconds: LH_BEAT_7.duration,
      clipPublicId: LH_BEAT_7.publicId,
      clipUrl: LH_BEAT_7.url,
    },
  ],
};

// ── short3 (3-beat trailer — Round 1 safety pick) ─────────────────────
// Hook → climax → resolution. Densest possible arc in the smallest budget.
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
  beats: [
    TRAILER5.beats[0], // establishing → reuse hook
    TRAILER5.beats[3], // climax-tease
    TRAILER5.beats[4], // sting
  ],
};

// ── feature7 (full 7-beat arc — Round 2 only) ─────────────────────────
const FEATURE7: DemoFixture = {
  videoType: "feature",
  continuityBible: LH_CONTINUITY,
  audioPublicId: LH_AUDIO,
  masterCutPublicId: LH_BEAT_1.publicId,
  // The full lighthouse master cut from cached.py.
  masterCutUrl:
    `${CLOUD}/c_fill,w_1920,h_1080` +
    `/l_text:Arial_52_bold:Cape%20Disappointment%20Light.%20November%201957.,co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140` +
    `/l_video:sceneos:lighthouse31:beat-2:beat-2-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-3:beat-3-scene-1,fl_splice/c_fill,w_1920,h_1080` +
    `/l_text:Arial_52_bold:23%3A42%20hours.,co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-4:beat-4-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-5:beat-5-scene-1,fl_splice/c_fill,w_1920,h_1080` +
    `/l_text:Arial_52_bold:The%20Astoria.%20Lost%3A%20October%2031%20%201922.,co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-6:beat-6-scene-1,fl_splice/c_fill,w_1920,h_1080/fl_layer_apply` +
    `/l_video:sceneos:lighthouse31:beat-7:beat-7-scene-1,fl_splice/c_fill,w_1920,h_1080` +
    `/l_text:Arial_52_bold:From%20Logbook%2041.,co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140/fl_layer_apply` +
    `/l_audio:sceneos:8dbb956c76a7:audio:music,e_volume:-28/fl_layer_apply` +
    `/${LH_BEAT_1.publicId}.mp4`,
  beats: [
    TRAILER5.beats[0],
    {
      template: "feature.inciting",
      refinedPrompt:
        "Wide establishing shot of the lighthouse from offshore, dawn breaking. Keeper's silhouette in the lantern room. Match cut to him at his logbook desk, methodical morning ritual.",
      firstQuestion: "What's the keeper's daily routine that anchors his world?",
      suggestedAnswers: ["logbook entries every hour", "polishing the lantern brass", "weather observations at sunrise"],
      refinedSummary: "logbook entries every hour, the rhythm of duty",
      durationSeconds: LH_BEAT_2.duration,
      clipPublicId: LH_BEAT_2.publicId,
      clipUrl: LH_BEAT_2.url,
    },
    TRAILER5.beats[1],
    TRAILER5.beats[2],
    TRAILER5.beats[3],
    {
      template: "feature.aftermath",
      refinedPrompt:
        "Keeper trudges back up the spiral staircase, exhausted. Pauses at the top — looks down at his own hands. Lantern still burning behind him. Held moment, breath visible.",
      firstQuestion: "What does the keeper carry with him from this moment forward?",
      suggestedAnswers: ["the weight of not knowing", "renewed dedication", "a quiet acceptance"],
      refinedSummary: "the weight of not knowing — but the work continues",
      durationSeconds: LH_BEAT_6.duration,
      clipPublicId: LH_BEAT_6.publicId,
      clipUrl: LH_BEAT_6.url,
    },
    TRAILER5.beats[4],
  ],
};

export const DEMO_FIXTURES: Record<DemoFixtureId, DemoFixture> = {
  trailer5: TRAILER5,
  short3: SHORT3,
  feature7: FEATURE7,
};

export type { DemoBeat, DemoFixture };
