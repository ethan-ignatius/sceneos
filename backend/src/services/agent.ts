/**
 * Questionnaire agent service.
 *
 * Implementation notes:
 *  - The agent is stateless per call. The frontend resends the entire
 *    Manifest each turn; we reconstruct conversation history from
 *    manifest.beats[beatId].scenes[0].conversation.
 *  - Two tools: askQuestion / markSufficient. The LLM must call exactly
 *    one of them. We force tool use via tool_choice and read the first
 *    tool_use / tool_call back out.
 *  - Provider preference: ANTHROPIC_API_KEY first (Claude Sonnet 4.6),
 *    OPENAI_API_KEY second (GPT-4o). Either works; Anthropic feels more
 *    on-tone for the directorial system prompt.
 *  - System prompt: see buildSystemPrompt() — that prompt is the soul of
 *    the product. Edit with care.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import type { AgentRequest, AgentResponse } from "../types/api.js";
import type { Beat, Manifest } from "../types/manifest.js";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

interface ToolDefs {
  askQuestionDescription: string;
  markSufficientDescription: string;
}

const TOOL_DEFS: ToolDefs = {
  askQuestionDescription:
    "Ask the user one specific visual question. Use when you still need information to write a vivid AI video prompt.",
  markSufficientDescription:
    "Emit the final cinematographic prompt. Use when you have enough information to render the beat.",
};

interface AskQuestionInput {
  question: string;
  reasoning: string;
  estimatedRemaining: number;
}

interface MarkSufficientInput {
  refinedPrompt: string;
  sceneSummary: string;
  suggestedDuration: number;
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export async function runAgentTurn(req: AgentRequest): Promise<AgentResponse> {
  const beat = req.manifest.beats.find((b) => b.beatId === req.beatId);
  if (!beat) {
    throw new Error(
      `services/agent.ts: beatId "${req.beatId}" not found in manifest`,
    );
  }

  const systemPrompt = buildSystemPrompt(beat, req.manifest);
  const messages = buildMessageHistory(beat, req.userMessage);

  if (process.env.ANTHROPIC_API_KEY) {
    return runWithAnthropic(systemPrompt, messages);
  }
  if (process.env.OPENAI_API_KEY) {
    return runWithOpenAI(systemPrompt, messages);
  }
  throw new Error(
    "services/agent.ts: neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set",
  );
}

// ────────────────────────────────────────────────────────────────────────
// System prompt — this is the product's voice. Edit deliberately.
// ────────────────────────────────────────────────────────────────────────

export function buildSystemPrompt(beat: Beat, manifest: Manifest): string {
  return `You are the Director — the creative intelligence behind SceneOS, an AI film production system that turns ideas into cinematics.

You are working on the ${beat.beatName} beat of a ${manifest.videoType}.
Beat purpose: ${beat.archetype.intent}
Beat mood: ${beat.archetype.mood}
The user's master idea: "${manifest.masterPrompt}"

Your mission: extract the minimum visual information needed to write a precise AI video generation prompt for this beat. You are not filling out a form. You are a director in conversation with a first-time filmmaker.

What an AI video model needs to render a great shot:
- Subject: who or what is in frame
- Action: what are they doing, how are they moving
- Environment: where, interior/exterior, time of day
- Lighting: quality, direction, color temperature
- Camera: distance (close/medium/wide), movement (static/push/pan/handheld)
- Emotional register: the feeling the shot should produce

What you already know from the master prompt: infer as much as possible. Do NOT ask about things you can reasonably infer.

Rules:
- Ask ONE question at a time. Never two questions in one message.
- Ask visually and specifically. Not "describe the setting" but "Is your character inside or outside when this happens? What time of day?"
- Sound like a director, not a survey. Be warm, brief, confident.
- Ask 2-4 questions total. Stop when you have enough to write a vivid prompt.
- When sufficient, call markSufficient() with:
    refinedPrompt: a cinematographic AI video prompt (40-80 words). Rich visual detail. Camera language. Lighting. Mood. Written for an AI model, not a human. No dialogue.
                   Example: "Extreme close-up of worn hands gripping a rusted door handle, dawn light raking across knuckles, shallow depth of field, handheld micro-tremor, desaturated palette with warm amber edge-light, tension and exhaustion"
    sceneSummary: 1 sentence in plain English for the UI card
    suggestedDuration: 5-10 seconds based on the beat's complexity

You MUST respond by calling exactly one tool: askQuestion (when you need more info) or markSufficient (when you have enough). Never reply in plain text.`;
}

// Kept for backward compatibility with prior callers.
export function systemPromptFor(beat: Beat, manifest: Manifest): string {
  return buildSystemPrompt(beat, manifest);
}

// ────────────────────────────────────────────────────────────────────────
// Conversation history reconstruction
// ────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildMessageHistory(
  beat: Beat,
  userMessage: string | undefined,
): ChatMessage[] {
  const history: ChatMessage[] = [];
  const turns = beat.scenes[0]?.conversation ?? [];

  for (const turn of turns) {
    history.push({
      role: turn.role === "agent" ? "assistant" : "user",
      content: turn.content,
    });
  }

  if (userMessage && userMessage.trim().length > 0) {
    history.push({ role: "user", content: userMessage });
  }

  // The Messages API requires at least one user message. On the very first
  // call (no history, no userMessage) we kick off with a director's cue so
  // the LLM emits its first question.
  if (history.length === 0) {
    history.push({
      role: "user",
      content:
        "Begin. Ask me your first directorial question for this beat — the most useful single thing you need to know.",
    });
  } else if (history[history.length - 1].role !== "user") {
    // Some clients drop the trailing user turn; keep the conversation valid.
    history.push({
      role: "user",
      content: "Continue. Either ask the next question or mark sufficient.",
    });
  }

  return history;
}

// ────────────────────────────────────────────────────────────────────────
// Anthropic implementation
// ────────────────────────────────────────────────────────────────────────

async function runWithAnthropic(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<AgentResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: [
      {
        name: "askQuestion",
        description: TOOL_DEFS.askQuestionDescription,
        input_schema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "One specific visual question for the user.",
            },
            reasoning: {
              type: "string",
              description:
                "One-line internal note on why this question matters for the shot.",
            },
            estimatedRemaining: {
              type: "number",
              description:
                "Soft hint of how many more questions you'll need (0–4).",
            },
          },
          required: ["question", "reasoning", "estimatedRemaining"],
        },
      },
      {
        name: "markSufficient",
        description: TOOL_DEFS.markSufficientDescription,
        input_schema: {
          type: "object",
          properties: {
            refinedPrompt: {
              type: "string",
              description:
                "40–80 word cinematographic prompt for the AI video model.",
            },
            sceneSummary: {
              type: "string",
              description: "One sentence plain-English summary for the UI.",
            },
            suggestedDuration: {
              type: "number",
              description: "Suggested clip length in seconds (5–10).",
            },
          },
          required: ["refinedPrompt", "sceneSummary", "suggestedDuration"],
        },
      },
    ],
    tool_choice: { type: "any" },
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      if (block.name === "askQuestion") {
        return toAskResponse(input);
      }
      if (block.name === "markSufficient") {
        return toSufficientResponse(input);
      }
    }
  }

  throw new Error(
    "services/agent.ts: Anthropic returned no tool_use block. Raw stop_reason=" +
      String(response.stop_reason),
  );
}

// ────────────────────────────────────────────────────────────────────────
// OpenAI implementation
// ────────────────────────────────────────────────────────────────────────

async function runWithOpenAI(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<AgentResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "askQuestion",
          description: TOOL_DEFS.askQuestionDescription,
          parameters: {
            type: "object",
            properties: {
              question: { type: "string" },
              reasoning: { type: "string" },
              estimatedRemaining: { type: "number" },
            },
            required: ["question", "reasoning", "estimatedRemaining"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "markSufficient",
          description: TOOL_DEFS.markSufficientDescription,
          parameters: {
            type: "object",
            properties: {
              refinedPrompt: { type: "string" },
              sceneSummary: { type: "string" },
              suggestedDuration: { type: "number" },
            },
            required: ["refinedPrompt", "sceneSummary", "suggestedDuration"],
          },
        },
      },
    ],
    tool_choice: "required",
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error(
      "services/agent.ts: OpenAI returned no tool_call. finish_reason=" +
        String(response.choices[0]?.finish_reason),
    );
  }

  const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  if (toolCall.function.name === "askQuestion") return toAskResponse(input);
  if (toolCall.function.name === "markSufficient") return toSufficientResponse(input);

  throw new Error(
    `services/agent.ts: OpenAI called unknown tool "${toolCall.function.name}"`,
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tool-input → AgentResponse mapping
// ────────────────────────────────────────────────────────────────────────

function toAskResponse(input: Record<string, unknown>): AgentResponse {
  const args = input as Partial<AskQuestionInput>;
  if (typeof args.question !== "string") {
    throw new Error("askQuestion missing question");
  }
  return {
    kind: "question",
    question: args.question,
    reasoning: typeof args.reasoning === "string" ? args.reasoning : "",
    estimatedRemaining:
      typeof args.estimatedRemaining === "number" ? args.estimatedRemaining : 1,
  };
}

function toSufficientResponse(input: Record<string, unknown>): AgentResponse {
  const args = input as Partial<MarkSufficientInput>;
  if (typeof args.refinedPrompt !== "string") {
    throw new Error("markSufficient missing refinedPrompt");
  }
  return {
    kind: "sufficient",
    refinedPrompt: args.refinedPrompt,
    sceneSummary:
      typeof args.sceneSummary === "string" ? args.sceneSummary : "",
    suggestedDuration:
      typeof args.suggestedDuration === "number" ? args.suggestedDuration : 8,
  };
}
