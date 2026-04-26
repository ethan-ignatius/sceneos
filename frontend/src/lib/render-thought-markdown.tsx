import type { ReactNode } from "react";

/**
 * Inline markdown renderer for the agent / editor thinking streams.
 *
 * Three token shapes get their own block:
 *   1. `**heading**`   — Gemini's section markers ("**Establishing the
 *                         Beat**", "**Focusing on the Setting**"). Renders
 *                         as a bold lead-line above its body paragraph.
 *   2. `[bracketed]`   — Backend status messages ("[gemini stream timed
 *                         out…; retrying with one-shot Gemini]", "[director
 *                         fallback engaged…]"). Diagnostics, not user-facing
 *                         prose. Rendered on their own line in a muted
 *                         italic register so they don't blend into the
 *                         chain of thought.
 *   3. plain text      — flows as the body of whichever section it's in.
 *
 * Successive blocks get an mt-3 gap (≈ "double newline between sections"
 * per user feedback). Original inline rendering produced a wall.
 *
 * Shared between agent-bubble-stream (per-beat questionnaire) and the
 * editor agent panel (post-stitch refinement chat).
 */
type Block =
  | { kind: "section"; heading?: string; body: string }
  | { kind: "system"; text: string };

export function renderThoughtMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g);
  const blocks: Block[] = [];
  let current: { kind: "section"; heading?: string; body: string } = {
    kind: "section",
    body: "",
  };
  const flush = () => {
    if (current.heading || current.body.trim()) {
      blocks.push({ ...current });
    }
    current = { kind: "section", body: "" };
  };

  for (const part of parts) {
    if (!part) continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      flush();
      current = { kind: "section", heading: part.slice(2, -2), body: "" };
    } else if (part.length > 2 && part.startsWith("[") && part.endsWith("]")) {
      flush();
      blocks.push({ kind: "system", text: part.slice(1, -1).trim() });
    } else {
      current.body += part;
    }
  }
  flush();

  return blocks.map((block, i) => {
    if (block.kind === "system") {
      return (
        <div
          key={i}
          className={cn(
            "block rounded-sm border border-fg-tertiary/15 bg-bg-elev-2/40 px-2 py-1 font-mono text-[11px] italic leading-snug text-fg-tertiary/85",
            i > 0 && "mt-3",
          )}
        >
          {block.text}
        </div>
      );
    }
    return (
      <div key={i} className={i > 0 ? "mt-3" : ""}>
        {block.heading ? (
          <strong className="mb-1 block font-medium not-italic text-fg-secondary">
            {block.heading}
          </strong>
        ) : null}
        {block.body.trim() ? (
          <span className="block">{block.body.trim()}</span>
        ) : null}
      </div>
    );
  });
}

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
