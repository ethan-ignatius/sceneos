import type { EditClipDecision } from "@/types/api";

interface EditorClipDetailProps {
  index: number;
  label: string;
  clip: EditClipDecision;
  onPatch: (patch: Partial<EditClipDecision>) => void;
  onClose: () => void;
}

/**
 * Per-clip controls. Visible only when a beat is selected on the timeline.
 * Reduced to FADES only — trims live as drag handles directly on the
 * timeline row above (no need to expose them again here as a duplicate
 * input). Caption input was dropped per "fades + trims + appending +
 * music — otherwise we're good." Hairline-divided, no card chrome.
 */
export function EditorClipDetail({ index, label, clip, onPatch, onClose }: EditorClipDetailProps) {
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? clip.durationSeconds;
  const beatDur = Math.max(trimEnd - trimStart, 0);
  const transition = clip.transitionMs ?? 0;

  return (
    <section className="space-y-4 border-t border-fg-tertiary/15 pt-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-caption tabular-nums text-fg-tertiary">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <span className="font-body text-meta-lg font-medium text-fg-primary">{label}</span>
          <span className="font-mono text-caption tabular-nums text-fg-tertiary">
            {trimStart.toFixed(2)}–{trimEnd.toFixed(2)}s · {beatDur.toFixed(2)}s
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer font-body text-chip text-fg-tertiary transition-colors hover:text-fg-primary"
        >
          Done
        </button>
      </header>

      {/* Cross-fade — first beat has nothing to fade INTO so the slider
          only renders for index > 0. */}
      {index > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
              Cross-fade in
            </span>
            <span className="font-mono text-caption tabular-nums text-fg-tertiary">
              {transition === 0 ? "hard cut" : `${transition}ms`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1200}
            step={40}
            value={transition}
            onChange={(e) => onPatch({ transitionMs: Number(e.target.value) })}
            className="w-full cursor-pointer accent-brand-ember"
            aria-label="Cross-fade duration in milliseconds"
          />
        </div>
      ) : (
        <p className="font-body text-pill text-fg-tertiary">First beat — no fade in.</p>
      )}
    </section>
  );
}
