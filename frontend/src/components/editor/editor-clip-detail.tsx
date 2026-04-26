import type { EditClipDecision } from "@/types/api";
import { cn } from "@/lib/utils";

interface EditorClipDetailProps {
  index: number;
  label: string;
  clip: EditClipDecision;
  onPatch: (patch: Partial<EditClipDecision>) => void;
  onClose: () => void;
}

/**
 * Per-clip controls. Visible only when a beat is selected on the timeline.
 * Hairline-divided, no card chrome, no nested rows.
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
          <span className="font-mono text-[11px] tabular-nums text-fg-tertiary">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <span className="font-body text-meta-lg font-medium text-fg-primary">{label}</span>
          <span className="font-mono text-[11px] tabular-nums text-fg-tertiary">
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

      {/* Transition */}
      {index > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
              Transition in
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-tertiary">
              {transition === 0 ? "hard cut" : `${transition}ms cross-fade`}
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
        <p className="font-body text-[12px] text-fg-tertiary">First beat — no transition in.</p>
      )}

      {/* Caption */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
            Caption
          </span>
          <span className="font-body text-[11px] text-fg-tertiary/70">
            {clip.caption ? "shown" : "off"}
          </span>
        </div>
        <input
          type="text"
          value={clip.caption ?? ""}
          onChange={(e) => onPatch({ caption: e.target.value })}
          placeholder="Optional title for this beat"
          className={cn(
            "w-full border-b border-fg-tertiary/25 bg-transparent px-1 py-1.5",
            "font-body text-[13px] text-fg-primary outline-none",
            "placeholder:text-fg-tertiary/60 focus:border-brand-ember-dim/60",
            "transition-colors",
          )}
        />
      </div>
    </section>
  );
}
