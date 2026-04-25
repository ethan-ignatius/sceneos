/**
 * Questionnaire agent service.
 *
 * Stateless per HTTP call. The frontend sends the whole manifest, and this
 * service asks one directorial question at a time until the active beat has
 * enough detail to emit a Higgsfield-ready prompt.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AgentRequest, AgentResponse } from "../types/api.js";
import type { AgentTurn, Beat, Manifest, Scene } from "../types/manifest.js";
import {
  REQUIRED_FACETS,
  SUFFICIENCY_MAX_QUESTIONS,
  SUFFICIENCY_MIN_QUESTIONS,
} from "../lib/sufficiency.js";

const TARGET_CLIP_SECONDS = 5;
const DEFAULT_MODEL = "claude-opus-4-7";

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "askQuestion",
    description:
      "Ask one focused directorial question. Re-anchor to the master vision and offer concrete options.",
    input_schema: {
      type: "object",
      required: ["question", "reasoning", "estimatedRemaining"],
      properties: {
        question: { type: "string" },
        reasoning: { type: "string" },
        estimatedRemaining: {
          type: "integer",
          minimum: 0,
          maximum: SUFFICIENCY_MAX_QUESTIONS,
        },
      },
    },
  },
  {
    name: "markSufficient",
    description:
      "Call when subject, action, setting, framing, and mood are locked in for this beat.",
    input_schema: {
      type: "object",
      required: ["refinedPrompt", "sceneSummary", "suggestedDuration"],
      properties: {
        refinedPrompt: { type: "string" },
        sceneSummary: { type: "string" },
        suggestedDuration: {
          type: "integer",
          minimum: 3,
          maximum: 10,
        },
      },
    },
  },
];

const AskQuestionArgs = z.object({
  question: z.string().min(1),
  reasoning: z.string().min(1),
  estimatedRemaining: z.coerce.number().int().min(0).max(SUFFICIENCY_MAX_QUESTIONS),
});

const MarkSufficientArgs = z.object({
  refinedPrompt: z.string().min(40),
  sceneSummary: z.string().min(8).max(200),
  suggestedDuration: z.coerce.number().int().min(3).max(10),
});

export async function runAgentTurn(req: AgentRequest): Promise<AgentResponse> {
  const beat = req.manifest.beats.find((b) => b.beatId === req.beatId);
  if (!beat) {
    throw new Error(`runAgentTurn: beatId not found in manifest (${req.beatId})`);
  }

  const conversation = collectConversation(beat, req.userMessage);
  const userTurnCount = conversation.filter((t) => t.role === "user").length;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return stubAgentTurn(beat, req.manifest.masterPrompt, conversation, userTurnCount);
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = conversation.length
    ? conversation.map((t) => ({
        role: t.role === "agent" ? ("assistant" as const) : ("user" as const),
        content: t.content,
      }))
    : [{ role: "user", content: `Begin the questionnaire for the ${beat.beatName} beat.` }];

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_AGENT_MODEL ?? DEFAULT_MODEL,
    max_tokens: 2048,
    system: [
      systemPromptFor(beat, req.manifest),
      "",
      turnBudgetReminder(userTurnCount),
    ].join("\n"),
    tools: AGENT_TOOLS,
    tool_choice: { type: "any" },
    messages,
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      `runAgentTurn: model did not call a tool (stop_reason=${response.stop_reason})`,
    );
  }

  if (toolUse.name === "askQuestion") {
    const args = AskQuestionArgs.parse(toolUse.input);
    return {
      kind: "question",
      question: args.question,
      reasoning: args.reasoning,
      estimatedRemaining: args.estimatedRemaining,
    };
  }

  if (toolUse.name === "markSufficient") {
    if (userTurnCount < SUFFICIENCY_MIN_QUESTIONS) {
      return {
        kind: "question",
        question: forcedFollowUp(beat),
        reasoning: `We've only heard from you ${userTurnCount} time${userTurnCount === 1 ? "" : "s"}; one more answer locks the vision in.`,
        estimatedRemaining: 1,
      };
    }

    const args = MarkSufficientArgs.parse(toolUse.input);
    return {
      kind: "sufficient",
      refinedPrompt: args.refinedPrompt,
      sceneSummary: args.sceneSummary,
      suggestedDuration: args.suggestedDuration,
    };
  }

  throw new Error(`runAgentTurn: unknown tool ${toolUse.name}`);
}

export function systemPromptFor(beat: Beat, manifest: Manifest): string {
  const beatIndex = manifest.beats.findIndex((b) => b.beatId === beat.beatId);
  const earlierBeats = manifest.beats
    .slice(0, beatIndex)
    .filter((b) => b.scenes[0]?.refinedPrompt)
    .map((b) => `- ${b.beatName}: ${b.scenes[0].refinedPrompt}`)
    .join("\n");

  return [
    `You are SceneOS, a warm and opinionated cinematographer guiding a non-expert through one beat of their film.`,
    `You suggest concrete directorial choices: lens, movement, light, blocking, pace, and color.`,
    ``,
    `MASTER VISION: "${manifest.masterPrompt}"`,
    `VIDEO TYPE: ${manifest.videoType}`,
    `CURRENT BEAT: ${beat.beatName} (${beat.template}) - ${beatIndex + 1} of ${manifest.beats.length}`,
    `INTENT: ${beat.archetype.intent}`,
    `MOOD: ${beat.archetype.mood}`,
    `BEAT BUDGET: ${beat.archetype.suggestedDuration}s overall; write one ${TARGET_CLIP_SECONDS}-second clip.`,
    ``,
    `FACETS REQUIRED BEFORE markSufficient:`,
    REQUIRED_FACETS.map((f) => `  - ${f}`).join("\n"),
    ``,
    earlierBeats ? `EARLIER BEATS ALREADY LOCKED IN:\n${earlierBeats}\n` : "",
    `If a character was described in an earlier beat, carry those exact descriptors into this beat.`,
    ``,
    `For askQuestion: ask one focused question, keep it to two short sentences, and offer 2-3 concrete options.`,
    `For markSufficient: refinedPrompt must be one paragraph with subject, action, setting, framing/lens, movement, light/color, and mood.`,
    `You must call exactly one tool per turn. Never reply in plain text.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function turnBudgetReminder(userTurnCount: number): string {
  const remaining = Math.max(0, SUFFICIENCY_MAX_QUESTIONS - userTurnCount);
  return [
    `TURN STATE: the user has answered ${userTurnCount} time${userTurnCount === 1 ? "" : "s"} so far on this beat. Hard cap is ${SUFFICIENCY_MAX_QUESTIONS} questions; you have ~${remaining} left.`,
    userTurnCount < SUFFICIENCY_MIN_QUESTIONS
      ? `You must askQuestion this turn. Minimum answers before markSufficient: ${SUFFICIENCY_MIN_QUESTIONS}.`
      : `If every facet is locked, prefer markSufficient. Otherwise askQuestion.`,
  ].join("\n");
}

function collectConversation(beat: Beat, userMessage?: string): AgentTurn[] {
  const scene = activeScene(beat);
  const history: AgentTurn[] = scene ? [...scene.conversation] : [];

  if (userMessage && userMessage.trim().length > 0) {
    const last = history[history.length - 1];
    const alreadyTrailing =
      last && last.role === "user" && last.content.trim() === userMessage.trim();
    if (!alreadyTrailing) {
      history.push({
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return history;
}

function activeScene(beat: Beat): Scene | undefined {
  if (beat.scenes.length === 0) return undefined;
  const unapproved = [...beat.scenes].reverse().find((s) => !s.approved);
  return unapproved ?? beat.scenes[beat.scenes.length - 1];
}

function forcedFollowUp(beat: Beat): string {
  return `Before I lock in the ${beat.beatName.toLowerCase()} clip, give me one concrete sensory detail: a sound, a color, or a single object in frame.`;
}

function stubAgentTurn(
  beat: Beat,
  masterPrompt: string,
  conversation: AgentTurn[],
  userTurnCount: number,
): AgentResponse {
  if (userTurnCount >= SUFFICIENCY_MIN_QUESTIONS && hasFacetCoverage(conversation)) {
    const lastUser = [...conversation].reverse().find((t) => t.role === "user");
    const flavor = lastUser?.content?.slice(0, 240) ?? beat.archetype.intent;
    return {
      kind: "sufficient",
      refinedPrompt: [
        `Stub agent (no ANTHROPIC_API_KEY): ${TARGET_CLIP_SECONDS}-second ${beat.beatName.toLowerCase()} clip for "${masterPrompt}".`,
        `${beat.archetype.intent}`,
        `Subject and action drawn from the user's last answer: ${flavor}.`,
        `Mood ${beat.archetype.mood}; cinematic 35mm, shallow depth of field, motivated practical light, ${TARGET_CLIP_SECONDS}-second sustained moment.`,
      ].join(" "),
      sceneSummary: `${beat.beatName}: ${truncate(beat.archetype.intent, 100)}`,
      suggestedDuration: TARGET_CLIP_SECONDS,
    };
  }

  const question = STUB_QUESTIONS[userTurnCount % STUB_QUESTIONS.length];
  return {
    kind: "question",
    question: question(beat, masterPrompt),
    reasoning: `Anchoring the ${beat.beatName.toLowerCase()} beat back to the master vision before locking the ${TARGET_CLIP_SECONDS}-second clip.`,
    estimatedRemaining: Math.max(
      0,
      SUFFICIENCY_MIN_QUESTIONS - userTurnCount - 1,
    ),
  };
}

const STUB_QUESTIONS: Array<(beat: Beat, masterPrompt: string) => string> = [
  (beat, master) =>
    `We're opening the ${beat.beatName.toLowerCase()} of "${truncate(master, 80)}": who is in frame? Pick a lone figure mid-action, a crowd reacting, or an object that carries the story.`,
  (beat) =>
    `For this ${beat.beatName.toLowerCase()}, what action sells the ${beat.archetype.mood} mood? Choose a slow turn, a sudden movement, or a held breath.`,
  (beat) =>
    `Where are we, exactly? Give me one concrete interior or exterior location for the ${beat.beatName.toLowerCase()}.`,
  (beat) =>
    `Camera-wise, should this ${beat.beatName.toLowerCase()} feel intimate with a tight close-up, grand with an anamorphic wide, or kinetic with handheld tracking?`,
  (beat) =>
    `Last anchor for the ${beat.beatName.toLowerCase()}: what's the dominant color or light source? Golden hour, neon, candlelight, or overcast daylight all work.`,
];

function hasFacetCoverage(conversation: AgentTurn[]): boolean {
  const userText = conversation
    .filter((t) => t.role === "user")
    .map((t) => t.content.toLowerCase())
    .join(" ");
  if (userText.length < 40) return false;
  return REQUIRED_FACETS.every((facet) =>
    FACET_HINTS[facet].some((kw) => userText.includes(kw)),
  );
}

const FACET_HINTS: Record<string, string[]> = {
  subject: ["he ", "she ", "they ", "person", "man", "woman", "child", "figure", "character", "i "],
  action: ["walk", "run", "turn", "look", "sit", "stand", "hold", "fall", "fight", "drive", "speak", "smile", "cry"],
  setting: ["street", "room", "forest", "city", "house", "field", "ocean", "desert", "mountain", "indoor", "outdoor", "interior", "exterior"],
  framing: ["close", "wide", "medium", "shot", "angle", "lens", "mm", "tracking", "handheld", "drone", "aerial"],
  mood: ["tense", "warm", "cold", "soft", "harsh", "kinetic", "still", "intimate", "epic", "moody", "bright", "dark", "golden"],
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}...`;
}
