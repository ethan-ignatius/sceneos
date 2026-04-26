import type { ReactNode } from "react";

/**
 * Tiny inline markdown renderer for the agent / editor thinking streams.
 *
 * Handles `**bold**` only — the agent's chain-of-thought primarily uses
 * bold for section markers ("**Establishing the Beat**", "**Focusing on
 * the Setting**"). Everything else passes through as text. We deliberately
 * don't pull in a markdown library for two strings of CSS-bold; the parse
 * is a regex split on one delimiter pair.
 *
 * Shared between agent-bubble-stream (per-beat questionnaire) and the
 * editor agent panel (post-stitch refinement chat). Both surfaces stream
 * Gemini thinking tokens that follow the same conventions.
 */
export function renderThoughtMarkdown(text: string): ReactNode[] {
  // Split keeps the **...** segments as their own tokens.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium not-italic text-fg-secondary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}
