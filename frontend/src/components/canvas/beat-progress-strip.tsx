import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { Beat } from "@/types/manifest";
import { GOTO_CAMERA_EVENT } from "./beat-map-3d";
import { cn } from "@/lib/utils";

interface BeatProgressStripProps {
  beats: Beat[];
  activeBeatId: string | null;
}

/**
 * Top-center ambient progress strip for the canvas.
 *
 * One pip per beat, mood-tinted dashes between them — a horizontal
 * step-progress bar that tells the user at a glance:
 *   · how many beats have been approved (filled, mood-tinted, with a ✓)
 *   · which beat is currently active (ember-pulsing ring)
 *   · what's still untouched (hollow dim ring)
 *
 * Pips are clickable — fires the same GOTO_CAMERA_EVENT the minimap uses
 * so the camera flies to that beat. The whole strip is one DOM element,
 * never overlaps with the Stitch pill (top-right) or Save & exit
 * (top-left) because it's anchored top-center.
 *
 * Reads as the "you've completed X of Y" signal that the user kept asking
 * for ("a clean intuitive interface to show us that it's indeed done"),
 * without competing with the ambient cinematic feel of the canvas.
 */
export function BeatProgressStrip({ beats, activeBeatId }: BeatProgressStripProps) {
  const handleJump = (beatId: string) => {
    window.dispatchEvent(new CustomEvent(GOTO_CAMERA_EVENT, { detail: { beatId } }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 md:top-6"
      role="progressbar"
      aria-label="Beat progress"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-fg-tertiary/15 bg-bg-elev-1/65 px-3 py-1.5 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]">
        {beats.map((beat, i) => {
          const isApproved = beat.status === "approved";
          const isActive = beat.beatId === activeBeatId;
          const isInProgress =
            beat.status === "questioning" ||
            beat.status === "ready-to-generate" ||
            beat.status === "generating" ||
            beat.status === "preview";

          return (
            <div key={beat.beatId} className="flex items-center gap-2">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px w-4 transition-colors duration-500",
                    isApproved || beats[i - 1].status === "approved"
                      ? "bg-brand-ember/55"
                      : "bg-fg-tertiary/25",
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() => handleJump(beat.beatId)}
                aria-label={`${beat.beatName} — ${beat.status}. Jump to this beat.`}
                title={`${beat.beatName} · ${beat.status}`}
                className={cn(
                  "relative grid h-5 w-5 place-items-center rounded-full transition-[transform,background-color,border-color] duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elev-1",
                  isApproved
                    ? "bg-brand-ember/85 text-bg-base shadow-[0_0_10px_rgba(240,168,104,0.55)] hover:scale-110"
                    : isActive
                      ? "border border-brand-ember bg-brand-ember/15 text-brand-ember ember-pulse"
                      : isInProgress
                        ? "border border-brand-ember-dim/55 bg-brand-ember-dim/15 hover:border-brand-ember-dim"
                        : "border border-fg-tertiary/40 bg-transparent hover:border-fg-tertiary/70",
                )}
              >
                {isApproved ? (
                  <Check size={11} strokeWidth={2.6} aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1 w-1 rounded-full",
                      isActive
                        ? "bg-brand-ember"
                        : isInProgress
                          ? "bg-brand-ember-dim"
                          : "bg-fg-tertiary/55",
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
        <span aria-hidden className="ml-1 h-3 w-px bg-fg-tertiary/20" />
        <span className="font-body text-[11px] font-medium tabular-nums text-fg-tertiary">
          <span className="text-brand-ember">
            {beats.filter((b) => b.status === "approved").length}
          </span>
          <span className="mx-1 text-fg-tertiary/45">/</span>
          {beats.length}
        </span>
      </div>
    </motion.div>
  );
}
