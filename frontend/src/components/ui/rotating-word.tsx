import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";

/**
 * Cross-fades between words when `value` changes. Uses
 * `AnimatePresence mode="popLayout"` so the outgoing and incoming words
 * can transition simultaneously without layout thrash.
 *
 * NextSense's hero pattern: a headline ending in a single word that
 * swaps over time. We don't auto-rotate — we expose `value` so the
 * parent controls the rhythm (e.g. swap to match selected video type).
 *
 * Usage:
 *   <RotatingWord value={`a ${videoType}`} />
 *   <RotatingWord value="cinematic" autoRotate={words} intervalMs={3000} />
 */
interface RotatingWordProps {
  value: string;
  className?: string;
  /** Direction of motion. `up` = old slides up, new comes from below. */
  direction?: "up" | "down";
}

export function RotatingWord({ value, className, direction = "up" }: RotatingWordProps) {
  const offset = direction === "up" ? 12 : -12;

  return (
    <span
      className={cn("relative inline-flex items-baseline", className)}
      style={{ verticalAlign: "baseline" }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: offset, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -offset, filter: "blur(2px)" }}
          transition={{
            duration: DURATIONS.smooth,
            ease: EASE.outQuart,
          }}
          className="inline-block whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
