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
 *
 *  - Caption: timeline-anchored, baked via Cloudinary `l_text:` overlay.
 *  - Transition: cross-fade ms INTO this clip from the previous one.
 *  - Trim numerics: shown read-only here. Drag the timeline handles to change.
 */
export function EditorClipDetail({ index, label, clip, onPatch, onClose }: EditorClipDetailProps) {
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? clip.durationSeconds;
  const beatDur = Math.max(trimEnd - trimStart, 0);
  const transition = clip.transitionMs ?? 0;

  return (
    <div className="space-y-4 rounded-md border border-brand-ember-dim/40 bg-bg-elev-1/70 p-4 backdrop-blur-md">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="caption-track text-[10px] text-fg-tertiary">
            Beat {(index + 1).toString().padStart(2, "0")}
          </div>
          <div className="font-display text-lg italic text-fg-primary">{label}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-tertiary hover:text-fg-primary"
        >
          done
        </button>
      </div>

      {/* Trim readout */}
      <section className="grid grid-cols-3 gap-3 rounded-sm border border-fg-tertiary/15 bg-bg-base/60 p-3 font-mono text-[11px] tabular-nums">
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-fg-tertiary">In</div>
          <div className="text-fg-primary">{trimStart.toFixed(2)}s</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-fg-tertiary">Out</div>
          <div className="text-fg-primary">{trimEnd.toFixed(2)}s</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-fg-tertiary">Length</div>
          <div className="text-brand-ember">{beatDur.toFixed(2)}s</div>
        </div>
      </section>

      {/* Transition */}
      {index > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
              Transition in
            </span>
            <span className="font-mono text-[10px] tabular-nums text-fg-tertiary">
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
            className="w-full accent-brand-ember"
            aria-label="Cross-fade duration in milliseconds"
          />
        </section>
      ) : (
        <section className="rounded-sm border border-dashed border-fg-tertiary/20 bg-bg-base/40 px-3 py-2 text-[11px] text-fg-tertiary">
          First beat. No transition in.
        </section>
      )}

      {/* Caption */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
            Caption
          </span>
          <span className="font-mono text-[9px] text-fg-tertiary">
            {clip.caption ? "shown for this beat" : "off"}
          </span>
        </div>
        <input
          type="text"
          value={clip.caption ?? ""}
          onChange={(e) => onPatch({ caption: e.target.value })}
          placeholder="Optional title for this beat"
          className={cn(
            "w-full rounded-sm border border-fg-tertiary/25 bg-bg-base/60 px-3 py-2",
            "text-[12px] text-fg-primary outline-none",
            "placeholder:text-fg-tertiary/60 focus:border-brand-ember-dim/60",
          )}
        />
      </section>
    </div>
  );
}
