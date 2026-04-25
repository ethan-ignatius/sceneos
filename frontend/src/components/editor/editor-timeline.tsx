import { useCallback, useMemo, useRef, useState } from "react";
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
 * Interactions:
 *   - Click a beat → selects it (drives the trim handles + caption editor below).
 *   - Drag the LEFT handle → trimStart.
 *   - Drag the RIGHT handle → trimEnd.
 *   - Hover the beat → see the transition tag (cross-fade ms into this beat).
 *
 * Visual language matches the StitchTray strip — mood-tinted, ember halo when
 * the user has moved the trim from defaults. Mono numerals for the duration.
 *
 * The handles operate on logical SOURCE seconds, not pixel widths. We compute
 * pixel widths from the current trim state so the bar shrinks live as you drag.
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
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="caption-track text-[10px]">Timeline · click a beat to refine</span>
        <span className="font-mono text-[10px] tabular-nums text-fg-tertiary">
          {totalDuration.toFixed(1)}s · {decisions.clips.length} beats
        </span>
      </div>

      <div className="relative flex h-[5.5rem] items-stretch gap-px overflow-hidden rounded-md border border-fg-tertiary/20 bg-bg-base/60 p-px">
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
    </div>
  );
}

// ── Per-bar component ─────────────────────────────────────────────────────

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
        // Map visible bar (which only covers the trimmed range) back to source seconds.
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
        "group relative h-full min-w-[3rem] cursor-pointer overflow-hidden rounded-sm border text-left",
        "transition-[border-color,box-shadow] duration-200 ease-out",
        selected
          ? "border-brand-ember/70 shadow-[0_0_16px_-4px_rgba(240,168,104,0.55)]"
          : trimmed
            ? "border-brand-ember-dim/50"
            : "border-fg-tertiary/25 hover:border-fg-secondary",
      )}
      aria-label={`${label} — ${beatDur.toFixed(1)} seconds${trimmed ? ", trimmed" : ""}`}
    >
      {/* Beat number + label */}
      <div className="absolute inset-x-2 top-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono text-[9px] tabular-nums",
            selected ? "text-brand-ember" : "text-fg-tertiary",
          )}
        >
          {(index + 1).toString().padStart(2, "0")}
        </span>
        {transitionMs > 0 && index > 0 ? (
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-fg-tertiary/80">
            ↘ {transitionMs}ms
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-2 bottom-1.5 space-y-0.5 leading-tight">
        <div className="font-display text-sm italic text-fg-primary truncate">
          {label}
        </div>
        <div className="font-mono text-[9px] tabular-nums text-fg-tertiary">
          {beatDur.toFixed(1)}s {trimmed ? "· trimmed" : ""}
        </div>
      </div>

      {/* Trim handles — only visible when this beat is selected. */}
      {selected ? (
        <>
          <span
            onPointerDown={handlePointerDown("in")}
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-brand-ember/70"
            aria-label="Trim in-point"
          />
          <span
            onPointerDown={handlePointerDown("out")}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-brand-ember/70"
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
