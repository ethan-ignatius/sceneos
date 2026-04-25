import { useMemo, type CSSProperties, type ReactNode } from "react";

/**
 * Renders a string as a sequence of <span data-index> elements so each
 * character can be animated independently — typically via CSS keyframes
 * with randomised animation-delays for the flicker reveal.
 *
 * Reference: alexportfolio's components/Common/TextSplitter/TextSplitter.tsx.
 *
 * Usage:
 *   <TextSplitter text="DIRECT YOUR IDEA" className="flicker-on-mount" />
 *
 *   And in CSS:
 *     .flicker-on-mount span {
 *       opacity: 0;
 *       animation: flicker 0.64s ease-out forwards;
 *     }
 *
 * The `delaySeed` lets you control timing variance. Each character's
 * delay is `baseDelay + (deterministicRandom(index) * jitter)`.
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
}

function pseudoRandom(i: number, seed: number): number {
  // Deterministic pseudo-random in [0, 1) — same input, same output.
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function TextSplitter({
  text,
  className,
  baseDelay = 0,
  jitter = 0,
  seed = 1,
  ariaLabel,
  style,
}: TextSplitterProps): ReactNode {
  const chars = useMemo(() => Array.from(text), [text]);

  return (
    <span
      className={className}
      style={style}
      aria-label={ariaLabel ?? text}
      role={ariaLabel ? "text" : undefined}
    >
      {chars.map((char, i) => {
        const delay = baseDelay + pseudoRandom(i, seed) * jitter;
        const isSpace = char === " ";
        return (
          <span
            key={i}
            data-index={i}
            aria-hidden="true"
            style={{
              animationDelay: `${delay}s`,
              display: "inline-block",
              whiteSpace: isSpace ? "pre" : "normal",
            }}
          >
            {isSpace ? " " : char}
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
