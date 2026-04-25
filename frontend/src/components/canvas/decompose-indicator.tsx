import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { DURATIONS, EASE } from "@/lib/motion-presets";

/**
 * Subtle status pill — shown inside the master-prompt card while the
 * /api/decompose call (kicked off from the landing submit) is in flight.
 *
 * pending  → ember-pulse dot + "Decomposing scenes…"   (sticks until resolved)
 * success  → static ember dot + "Scenes refined"        (auto-dismisses ~1.6s)
 * error    → muted dot + "Couldn't refine — using templates" (auto-dismisses ~4s)
 *
 * The indicator never blocks anything; it's purely an awareness cue. The
 * questionnaire and downstream pipeline run regardless of decompose state.
 */
export function DecomposeIndicator() {
  const status = useBeatGraphStore((s) => s.decomposeStatus);
  const setStatus = useBeatGraphStore((s) => s.setDecomposeStatus);

  // Auto-fade success/error back to idle so the chip doesn't linger.
  useEffect(() => {
    if (status !== "success" && status !== "error") return;
    const ms = status === "success" ? 1600 : 4000;
    const t = setTimeout(() => setStatus("idle"), ms);
    return () => clearTimeout(t);
  }, [status, setStatus]);

  const visible = status !== "idle";
  const label =
    status === "pending"
      ? "Decomposing scenes…"
      : status === "success"
        ? "Scenes refined"
        : "Couldn't refine — using templates";
  const dotClass =
    status === "pending"
      ? "ember-pulse bg-brand-ember"
      : status === "success"
        ? "bg-brand-ember"
        : "bg-state-error/70";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
          className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-fg-tertiary/15 bg-bg-elev-1/70 px-3 py-1 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] caption-track text-[10px] text-fg-secondary"
        >
          <span aria-hidden className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass}`} />
          <span>{label}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
