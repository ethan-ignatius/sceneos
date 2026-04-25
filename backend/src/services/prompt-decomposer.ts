/**
 * Prompt-decomposition service.
 *
 * One-shot LLM call that turns the user's master prompt into a Higgsfield-ready
 * clip prompt for every beat in the graph. This is the "translation layer"
 * between human intent and the Higgsfield API.
 *
 * Flow:
 *   1. Frontend submits the master prompt and the seeded beat skeleton.
 *   2. This service builds a director-style system prompt seeded with
 *      cinematography theory + each beat's archetype intent + mood.
 *   3. GPT-4o (json mode) returns one DecomposedClip per beat with both:
 *        - imagePrompt   → goes to Higgsfield text-to-image (e.g. soul/standard)
 *        - motionPrompt  → goes to Higgsfield image-to-video (e.g. dop/standard)
 *   4. Optional `continuityBible` carries character/world descriptors so later
 *      per-beat questionnaires keep continuity.
 *
 * Reference (Higgsfield API shape):
 *   https://docs.higgsfield.ai/how-to/introduction.md
 *   https://docs.higgsfield.ai/guides/images.md
 *   https://docs.higgsfield.ai/guides/video.md
 */

import OpenAI from "openai";
import { z } from "zod";
import type {
  DecomposeBeatInput,
  DecomposeResponse,
  DecomposedClip,
} from "../types/api.js";
import type {
  HiggsfieldAspectRatio,
  HiggsfieldClipPrompt,
  HiggsfieldResolution,
  VideoType,
} from "../types/manifest.js";

const ASPECT_BY_VIDEO_TYPE: Record<VideoType, HiggsfieldAspectRatio> = {
  trailer: "16:9",
  feature: "16:9",
  short: "9:16",
};

const DEFAULT_MODEL = "higgsfield-ai/dop/standard";

const HiggsfieldClipPromptSchema = z.object({
  imagePrompt: z.string().min(20),
  motionPrompt: z.string().min(20),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  resolution: z.enum(["720p", "1080p"]),
  durationSeconds: z.number().positive().max(60),
  preferredModel: z.string().min(3),
}) satisfies z.ZodType<HiggsfieldClipPrompt>;

const DecomposedClipSchema = z.object({
  beatId: z.string().min(1),
  sceneSummary: z.string().min(8),
  refinedPrompt: z.string().min(20),
  clipPrompt: HiggsfieldClipPromptSchema,
}) satisfies z.ZodType<DecomposedClip>;

const DecomposeResponseSchema = z.object({
  clips: z.array(DecomposedClipSchema).min(1),
  continuityBible: z.string().optional(),
});

export interface DecomposeParams {
  masterPrompt: string;
  videoType: VideoType;
  beats: DecomposeBeatInput[];
}

export async function decomposeMasterPrompt(
  params: DecomposeParams,
): Promise<DecomposeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return stubDecomposition(params);
  }

  const openai = new OpenAI({ apiKey });
  const aspectRatio = ASPECT_BY_VIDEO_TYPE[params.videoType];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: buildUserPrompt({ ...params, aspectRatio }),
    },
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_DECOMPOSE_MODEL ?? "gpt-4o-2024-08-06",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("decomposeMasterPrompt: empty completion");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `decomposeMasterPrompt: model returned non-JSON: ${(err as Error).message}`,
    );
  }

  const result = DecomposeResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `decomposeMasterPrompt: schema validation failed — ${result.error.message}`,
    );
  }

  return ensureCoverage(result.data, params);
}

const SYSTEM_PROMPT = [
  "You are SceneOS's director — an AI cinematographer that turns a non-expert's idea",
  "into a beat-by-beat shot list ready for the Higgsfield video API.",
  "",
  "For each beat in the BEATS list, you must emit ONE clip with:",
  "  • imagePrompt    — a self-contained text-to-image prompt for the beat's keyframe",
  "                     (subject, setting, lighting, lens, film stock, color grade,",
  "                      composition). This is sent to Higgsfield's text-to-image model.",
  "  • motionPrompt   — a self-contained image-to-video motion prompt that describes",
  "                     camera movement (pan / dolly / crane / orbit), subject action,",
  "                     and atmospheric motion (wind, smoke, light flicker). This is",
  "                     sent to Higgsfield's image-to-video model.",
  "  • durationSeconds — honor the beat's suggestedDuration unless the master prompt",
  "                      strongly implies otherwise.",
  "  • aspectRatio    — use the value provided in DEFAULT_ASPECT.",
  "  • resolution     — '1080p' unless the master prompt is explicitly snippet/social.",
  "  • preferredModel — 'higgsfield-ai/dop/standard' by default; use 'kling-video/v2.1/pro/image-to-video'",
  "                     for cinematic camera moves; 'bytedance/seedance/v1/pro/image-to-video'",
  "                     for portrait-driven beats.",
  "",
  "Hard rules:",
  "  • Return exactly one clip per beat, IN THE ORDER PROVIDED, with each clip's beatId",
  "    matching the beatId of the corresponding input beat.",
  "  • Carry character + world descriptors verbatim across beats (a recurring",
  "    protagonist must read identically in each beat's prompts so the keyframes are",
  "    visually coherent). Put these recurring descriptors in `continuityBible`.",
  "  • Each motionPrompt must specify a camera movement and a pace word",
  "    ('slowly', 'quickly', 'lingering', 'snap-zoom', etc.).",
  "  • refinedPrompt is a single readable paragraph for the UI; not the API payload.",
  "  • Output JSON only. No markdown, no commentary.",
  "",
  "Return shape:",
  "{",
  '  "continuityBible": "<one short paragraph>",',
  '  "clips": [',
  "    {",
  '      "beatId": "<input beatId>",',
  '      "sceneSummary": "<one sentence, human-readable>",',
  '      "refinedPrompt": "<one paragraph>",',
  '      "clipPrompt": {',
  '        "imagePrompt": "<text-to-image prompt>",',
  '        "motionPrompt": "<image-to-video motion prompt>",',
  '        "aspectRatio": "16:9" | "9:16" | "1:1",',
  '        "resolution": "720p" | "1080p",',
  '        "durationSeconds": <number>,',
  '        "preferredModel": "<higgsfield model_id>"',
  "      }",
  "    }",
  "  ]",
  "}",
].join("\n");

function buildUserPrompt(args: DecomposeParams & { aspectRatio: HiggsfieldAspectRatio }): string {
  const beatsBlock = args.beats
    .map((b, i) => {
      return [
        `${i + 1}. beatId: ${b.beatId}`,
        `   template: ${b.template}`,
        `   beatName: ${b.beatName}`,
        `   intent:   ${b.archetype.intent}`,
        `   mood:     ${b.archetype.mood}`,
        `   suggestedDuration: ${b.archetype.suggestedDuration}s`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `MASTER_PROMPT: ${args.masterPrompt}`,
    `VIDEO_TYPE:    ${args.videoType}`,
    `DEFAULT_ASPECT: ${args.aspectRatio}`,
    "",
    "BEATS (return one clip per beat, in order, with matching beatIds):",
    "",
    beatsBlock,
  ].join("\n");
}

/**
 * If the model under-covers, pad with a stub clip per missing beat so the
 * frontend always gets a 1:1 mapping. Reorders clips to match the input order.
 */
function ensureCoverage(
  resp: DecomposeResponse,
  params: DecomposeParams,
): DecomposeResponse {
  const byBeatId = new Map(resp.clips.map((c) => [c.beatId, c]));
  const aspectRatio = ASPECT_BY_VIDEO_TYPE[params.videoType];

  const clips: DecomposedClip[] = params.beats.map((beat) => {
    const found = byBeatId.get(beat.beatId);
    if (found) return found;
    return stubClipForBeat(params.masterPrompt, beat, aspectRatio);
  });

  return { clips, continuityBible: resp.continuityBible };
}

/**
 * Deterministic fallback when there's no OPENAI_API_KEY. Keeps the dev/demo
 * loop runnable without burning API credits and gives Vishnu a real shape to
 * wire the Higgsfield service against.
 */
function stubDecomposition(params: DecomposeParams): DecomposeResponse {
  const aspectRatio = ASPECT_BY_VIDEO_TYPE[params.videoType];
  return {
    continuityBible:
      "Stub bible (no OPENAI_API_KEY). Reuse master-prompt subject across beats for continuity.",
    clips: params.beats.map((beat) =>
      stubClipForBeat(params.masterPrompt, beat, aspectRatio),
    ),
  };
}

function stubClipForBeat(
  masterPrompt: string,
  beat: DecomposeBeatInput,
  aspectRatio: HiggsfieldAspectRatio,
): DecomposedClip {
  const moodCue = MOOD_CUES[beat.archetype.mood];
  const imagePrompt = [
    `Cinematic still — ${beat.beatName.toLowerCase()} beat of: ${masterPrompt}.`,
    `${beat.archetype.intent}`,
    `${moodCue.lighting}, ${moodCue.lens}, shallow depth of field, 35mm film grain,`,
    `composition: ${moodCue.composition}.`,
  ].join(" ");

  const motionPrompt = [
    `${moodCue.cameraMove}, ${moodCue.pace}.`,
    `Subject motion supports the ${beat.archetype.mood} mood.`,
    `Atmosphere: ${moodCue.atmosphere}.`,
  ].join(" ");

  const clipPrompt: HiggsfieldClipPrompt = {
    imagePrompt,
    motionPrompt,
    aspectRatio,
    resolution: "1080p" as HiggsfieldResolution,
    durationSeconds: beat.archetype.suggestedDuration,
    preferredModel: DEFAULT_MODEL,
  };

  return {
    beatId: beat.beatId,
    sceneSummary: `${beat.beatName}: ${truncate(beat.archetype.intent, 110)}`,
    refinedPrompt: `${imagePrompt} ${motionPrompt}`,
    clipPrompt,
  };
}

const MOOD_CUES: Record<
  string,
  {
    lighting: string;
    lens: string;
    composition: string;
    cameraMove: string;
    pace: string;
    atmosphere: string;
  }
> = {
  "wide-establish": {
    lighting: "soft golden-hour key light from camera-left",
    lens: "anamorphic 24mm",
    composition: "rule-of-thirds horizon, deep negative space above subject",
    cameraMove: "slow aerial drone descent, gently tracking forward",
    pace: "lingering, contemplative",
    atmosphere: "drifting volumetric haze, faint distant motion",
  },
  "intimate-hook": {
    lighting: "warm practical key, eyes catchlit",
    lens: "85mm portrait",
    composition: "tight close-up, eyeline above center, negative headroom",
    cameraMove: "subtle dolly-in, almost imperceptible",
    pace: "slow, breath-held",
    atmosphere: "dust motes drifting through key light",
  },
  "kinetic-rising": {
    lighting: "high-contrast hard light, hard shadows",
    lens: "35mm",
    composition: "Dutch tilt, leading lines pointing forward",
    cameraMove: "handheld tracking, snap whip-pan into action",
    pace: "quickly, escalating",
    atmosphere: "wind-driven debris, flickering light sources",
  },
  "tense-climax": {
    lighting: "low-key chiaroscuro, single hard backlight",
    lens: "50mm",
    composition: "centered subject, oppressive negative space",
    cameraMove: "slow push-in to extreme close-up",
    pace: "tightening, deliberate",
    atmosphere: "smoke curling, distant rumble in the air",
  },
  "still-resolve": {
    lighting: "pale ambient daylight, no key",
    lens: "40mm",
    composition: "static wide, subject small in frame",
    cameraMove: "locked-off frame with the slightest float",
    pace: "stilled, exhaled",
    atmosphere: "soft wind, settled dust",
  },
  "punchy-sting": {
    lighting: "single hard rim light, deep blacks",
    lens: "50mm",
    composition: "graphic silhouette, single dominant shape",
    cameraMove: "snap zoom and hard cut beat",
    pace: "instant, percussive",
    atmosphere: "abrupt silence then sudden detail",
  },
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
