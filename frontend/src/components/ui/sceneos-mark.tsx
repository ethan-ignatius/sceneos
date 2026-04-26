import { cn } from "@/lib/utils";

/**
 * SceneOS brand mark + wordmark.
 *
 * The mark distills the planetary system in `public/icon-512.png` down
 * to a 14px SVG: a circle outline (the canvas) + a small filled ember
 * pip (the active beat). Reads as "system + ember" at every size.
 *
 * The wordmark sits next to the mark in Manrope (body font). NOT
 * Fraunces — Fraunces is reserved for editorial display register
 * (route headlines, voiceover lines). The brand wordmark needs to read
 * as a clean system mark across every chrome surface, so we use the
 * same sans the rest of the chrome uses.
 *
 * Used in: landing footer, /projects sticky header, /final top chrome.
 * One source so the brand never drifts.
 */
interface SceneOSMarkProps {
  /** Pixel size of the SVG mark. Wordmark scales with it. Default 14. */
  size?: number;
  /** Hide the wordmark and render the mark alone. */
  markOnly?: boolean;
  className?: string;
}

export function SceneOSMark({ size = 14, markOnly = false, className }: SceneOSMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        {/* Outer ring — the canvas. fg-tertiary so it sits quietly in
            chrome and doesn't fight the wordmark. */}
        <circle
          cx="8"
          cy="8"
          r="6.25"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
        />
        {/* Inner ember pip — the active beat. Slightly off-axis (top-
            right) so the mark reads as orbital, not concentric. The
            shadow is what gives it the ember-glow feel at small sizes. */}
        <circle
          cx="11"
          cy="5"
          r="2"
          fill="var(--color-brand-ember)"
        />
        <circle
          cx="11"
          cy="5"
          r="3"
          fill="var(--color-brand-ember)"
          opacity="0.18"
        />
      </svg>
      {markOnly ? null : (
        <span
          // Manrope (font-body), normal-case, semibold. Tighter than
          // body default so the wordmark reads as a single locked unit
          // rather than spaced characters. NOT Fraunces — Fraunces is
          // editorial; brand chrome needs to feel system-y.
          className="font-body text-pill font-semibold normal-case tracking-[-0.005em] text-fg-secondary"
        >
          SceneOS
        </span>
      )}
    </span>
  );
}
