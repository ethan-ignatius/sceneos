import { useMemo, type CSSProperties, type ReactNode } from "react";

/**
 * Renders a string as inline-block word groups, each containing per-character
 * spans that can animate independently — typically via CSS keyframes with
 * randomised animation-delays for the flicker reveal.
 *
 * Critical detail: the WORD-level grouping prevents the browser from breaking
 * lines inside a word. Without it, every char is its own inline-block and the
 * browser splits "into" mid-word as "in / to" once the line wraps. With the
 * word-group wrapper, the line break can only happen between words.
 *
 * Reference: alexportfolio's components/Common/TextSplitter/TextSplitter.tsx,
 * extended with the word-group fix.
 */
interface TextSplitterProps {
  text: string;
  className?: string;
  baseDelay?: number;
  jitter?: number;
  /** stable seed so re-renders don't reshuffle delays */
  seed?: number;
  ariaLabel?: string;
  style?: CSSProperties;
  /**
   * "jitter" (default) — each char gets `baseDelay + pseudoRandom(i) * jitter`.
   *   Reads as flicker. Used on the landing headline.
   *
   * "sequential" — each char gets `baseDelay + i * perCharStep`, capped so
   *   the total never exceeds `maxTotalDelay` (default 1.6s). Reads as
   *   typewriter. Used on agent bubbles.
   */
  delayStrategy?: "jitter" | "sequential";
  /** Sequential mode only: per-char step in seconds. Default 0.025 (25ms). */
  perCharStep?: number;
  /** Sequential mode only: total reveal cap in seconds. Default 1.6. */
  maxTotalDelay?: number;
}

function pseudoRandom(i: number, seed: number): number {
  // Deterministic pseudo-random in [0, 1) — same input, same output.
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Splits a string into a flat list of word/space tokens, preserving spaces. */
function tokenize(text: string): string[] {
  // The regex captures runs of whitespace OR runs of non-whitespace.
  // The split keeps empties around delimiters, so we drop those.
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

export function TextSplitter({
  text,
  className,
  baseDelay = 0,
  jitter = 0,
  seed = 1,
  ariaLabel,
  style,
  delayStrategy = "jitter",
  perCharStep = 0.025,
  maxTotalDelay = 1.6,
}: TextSplitterProps): ReactNode {
  // Tokenize into words + whitespace runs. Each word becomes a non-breaking
  // inline-block group; whitespace stays as-is so the browser can break there.
  const tokens = useMemo(() => tokenize(text), [text]);
  const totalChars = useMemo(
    () => tokens.reduce((sum, t) => sum + (/^\s+$/.test(t) ? 0 : t.length), 0),
    [tokens],
  );

  // Sequential mode: scale per-char step down so total ≤ maxTotalDelay.
  const sequentialStep =
    totalChars > 0 ? Math.min(perCharStep, maxTotalDelay / totalChars) : perCharStep;

  let charIndex = 0;
  return (
    <span className={className} style={style} aria-label={ariaLabel ?? text}>
      {tokens.map((token, ti) => {
        // Whitespace token — render as-is so the browser can break on it.
        if (/^\s+$/.test(token)) {
          return (
            <span
              key={`ws-${ti}`}
              aria-hidden="true"
              style={{ whiteSpace: "pre" }}
            >
              {token}
            </span>
          );
        }
        // Word token — non-breaking inline-block container, with per-char
        // inline-block spans inside. The browser cannot break inside this group.
        const chars = Array.from(token);
        return (
          <span
            key={`w-${ti}`}
            aria-hidden="true"
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            {chars.map((ch) => {
              const i = charIndex++;
              const delay =
                delayStrategy === "sequential"
                  ? baseDelay + i * sequentialStep
                  : baseDelay + pseudoRandom(i, seed) * jitter;
              return (
                <span
                  key={i}
                  data-index={i}
                  style={{
                    animationDelay: `${delay}s`,
                    display: "inline-block",
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Word-level splitter — useful for scroll-revealed paragraphs where you
 * want each word to fade up but keep characters intact for hyphenation.
 */
export function WordSplitter({
  text,
  className,
  baseDelay = 0,
  jitter = 0,
  seed = 1,
  style,
}: TextSplitterProps): ReactNode {
  const words = useMemo(() => text.split(/(\s+)/), [text]);

  return (
    <span className={className} style={style} aria-label={text}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return word;
        const delay = baseDelay + pseudoRandom(i, seed) * jitter;
        return (
          <span
            key={i}
            data-word-index={i}
            aria-hidden="true"
            style={{
              animationDelay: `${delay}s`,
              display: "inline-block",
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
