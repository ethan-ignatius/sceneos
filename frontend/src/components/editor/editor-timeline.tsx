import { useCallback, useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { EditClipDecision, EditDecisions } from "@/types/api";
import type { BeatMood } from "@/types/manifest";
import { cn } from "@/lib/utils";
import { moodAccentColor } from "@/lib/cloudinary-transforms";
import { DURATIONS, EASE } from "@/lib/motion-presets";

interface EditorTimelineProps {
  decisions: EditDecisions;
  beatLabels: Record<string, { name: string; mood: BeatMood }>;
  selectedIndex: number | null;
  onSelectClip: (index: number) => void;
  onPatchClip: (index: number, patch: Partial<EditClipDecision>) => void;
}

/**
 * Editor timeline. One bar per beat, length proportional to its trimmed duration.
 *
 *  - Click a beat → opens the per-clip detail (transition + caption).
 *  - Drag the LEFT handle → trimStart.
 *  - Drag the RIGHT handle → trimEnd.
 *
 * Hairline-bordered band, mood-tinted bars. The selected bar gets an ember
 * inset bottom-rule + visible trim handles. No card chrome around the row.
 */
export function EditorTimeline({
  decisions,
  beatLabels,
  selectedIndex,
  onSelectClip,
  onPatchClip,
}: EditorTimelineProps) {
  const totalDuration = useMemo(
    () =>
      decisions.clips.reduce((acc, c) => {
        const inS = c.trimStart ?? 0;
        const outS = c.trimEnd ?? c.durationSeconds;
        return acc + Math.max(outS - inS, 0);
      }, 0),
    [decisions.clips],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
          Timeline
        </span>
        <span className="font-mono text-chip tabular-nums text-fg-tertiary">
          {totalDuration.toFixed(1)}s · {decisions.clips.length} beats
        </span>
      </div>

      <div className="relative flex h-[5.5rem] items-stretch border-y border-fg-tertiary/15 bg-bg-base/40">
        {decisions.clips.map((clip, i) => {
          const inS = clip.trimStart ?? 0;
          const outS = clip.trimEnd ?? clip.durationSeconds;
          const beatDur = Math.max(outS - inS, 0);
          const flex = totalDuration > 0 ? beatDur / totalDuration : 1 / decisions.clips.length;
          const beatId = clip.beatId || "";
          const meta = beatLabels[beatId];
          const isSelected = i === selectedIndex;
          return (
            <TimelineBar
              key={`${clip.publicId}-${i}`}
              clip={clip}
              flex={flex}
              index={i}
              label={meta?.name ?? `Beat ${i + 1}`}
              moodTint={meta ? moodAccentColor(meta.mood) : "#6f9c7d"}
              selected={isSelected}
              onSelect={() => onSelectClip(i)}
              onPatch={(p) => onPatchClip(i, p)}
            />
          );
        })}
      </div>
    </section>
  );
}

interface TimelineBarProps {
  clip: EditClipDecision;
  flex: number;
  index: number;
  label: string;
  moodTint: string;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<EditClipDecision>) => void;
}

function TimelineBar({ clip, flex, index, label, moodTint, selected, onSelect, onPatch }: TimelineBarProps) {
  const inS = clip.trimStart ?? 0;
  const outS = clip.trimEnd ?? clip.durationSeconds;
  const beatDur = Math.max(outS - inS, 0);
  const trimmed = inS > 0 || outS < clip.durationSeconds;
  const transitionMs = clip.transitionMs ?? 0;

  const ref = useRef<HTMLButtonElement>(null);
  const dragKindRef = useRef<"in" | "out" | null>(null);

  const handlePointerDown = useCallback(
    (kind: "in" | "out") => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragKindRef.current = kind;
      const el = ref.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);

      const rect = el.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const sourceSec = inS + ratio * beatDur;
        if (dragKindRef.current === "in") {
          const clamped = Math.max(0, Math.min(sourceSec, outS - 0.25));
          onPatch({ trimStart: round(clamped) });
        } else if (dragKindRef.current === "out") {
          const clamped = Math.max(inS + 0.25, Math.min(sourceSec, clip.durationSeconds));
          onPatch({ trimEnd: round(clamped) });
        }
      };
      const up = (ev: PointerEvent) => {
        dragKindRef.current = null;
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    },
    [inS, outS, beatDur, clip.durationSeconds, onPatch],
  );

  return (
    <motion.button
      type="button"
      ref={ref}
      onClick={onSelect}
      animate={{ flex }}
      transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
      style={{
        background: `linear-gradient(140deg, ${moodTint}30 0%, ${moodTint}08 60%, transparent 100%)`,
      }}
      className={cn(
        "group relative h-full min-w-[3.5rem] cursor-pointer overflow-hidden text-left",
        "border-l border-fg-tertiary/15 first:border-l-0",
        "transition-[box-shadow,background-color,border-color] duration-200 ease-out",
        // Selected: full ember frame (top + bottom rules) + a subtle
        // bg lift so the clip reads as the active one even at a glance.
        // Trimmed-but-not-selected: just the bottom rule (lighter).
        selected
          ? "bg-brand-ember/[0.04] shadow-[inset_0_2px_0_0_rgba(240,168,104,0.55),inset_0_-2px_0_0_rgba(240,168,104,0.85)]"
          : trimmed
            ? "shadow-[inset_0_-1px_0_0_rgba(240,168,104,0.4)]"
            : "hover:bg-fg-primary/[0.02]",
      )}
      aria-label={`${label} — ${beatDur.toFixed(1)} seconds${trimmed ? ", trimmed" : ""}`}
    >
      {/* Index + transition tag — selected bars get extra horizontal
          padding so the text doesn't crowd the ember-highlighted edge. */}
      <div className={cn(
        "absolute top-1.5 flex items-center justify-between gap-2",
        selected ? "inset-x-4" : "inset-x-2",
      )}>
        <span
          className={cn(
            "font-body text-micro font-medium tabular-nums",
            selected ? "text-brand-ember" : "text-fg-tertiary",
          )}
        >
          {(index + 1).toString().padStart(2, "0")}
        </span>
        {transitionMs > 0 && index > 0 ? (
          <span className="font-body text-micro tabular-nums text-fg-tertiary/80">
            ↘ {transitionMs}ms
          </span>
        ) : null}
      </div>

      {/* Beat name + duration — same selected-padding treatment so the
          label sits cleanly inside the highlighted frame. */}
      <div className={cn(
        "absolute bottom-1.5 space-y-0.5 leading-tight",
        selected ? "inset-x-4" : "inset-x-2",
      )}>
        <div className="truncate font-body text-pill font-medium text-fg-primary">{label}</div>
        <div className="font-mono text-micro tabular-nums text-fg-tertiary">
          {beatDur.toFixed(1)}s {trimmed ? "· trimmed" : ""}
        </div>
      </div>

      {/* Trim handles — only visible when this beat is selected. */}
      {selected ? (
        <>
          <span
            data-cursor="hide"
            onPointerDown={handlePointerDown("in")}
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-brand-ember/70"
            aria-label="Trim in-point"
          />
          <span
            data-cursor="hide"
            onPointerDown={handlePointerDown("out")}
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-brand-ember/70"
            aria-label="Trim out-point"
          />
        </>
      ) : null}
    </motion.button>
  );
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
