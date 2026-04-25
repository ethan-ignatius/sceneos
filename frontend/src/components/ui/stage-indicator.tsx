import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "direct", label: "Direct" },
  { key: "compose", label: "Compose" },
  { key: "stitch", label: "Stitch" },
  { key: "deliver", label: "Deliver" },
] as const;

/**
 * Tells the judge where they are in the pipeline without narration.
 * Always at top, always one of four stages, always one is active.
 *
 * Routes → stages:
 *   /            → 01·DIRECT
 *   /transition  → 01·DIRECT (transient)
 *   /canvas      → 02·COMPOSE (default) or 03·STITCH (when ≥1 approved)
 *   /final       → 04·DELIVER
 *
 * Per VIABILITY §5 V1.
 */
export function StageIndicator() {
  const { pathname } = useLocation();
  const manifest = useBeatGraphStore((s) => s.manifest);

  let activeKey: (typeof STAGES)[number]["key"] = "direct";
  if (pathname === "/" || pathname === "/transition") {
    activeKey = "direct";
  } else if (pathname === "/canvas") {
    const approvedCount =
      manifest?.beats.filter((b) => b.status === "approved").length ?? 0;
    activeKey = approvedCount > 0 ? "stitch" : "compose";
  } else if (pathname === "/final") {
    activeKey = "deliver";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1], delay: 0.4 }}
      className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4"
      aria-label="Pipeline stage indicator"
    >
      <div
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-fg-tertiary/25 bg-bg-elev-1/70 px-2 py-1 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
      >
        {STAGES.map((stage, i) => {
          const isActive = stage.key === activeKey;
          const isPast =
            STAGES.findIndex((s) => s.key === activeKey) > i;
          return (
            <div key={stage.key} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 caption-track text-[9px] tabular-nums transition-colors duration-300",
                  isActive
                    ? "bg-brand-ember/15 text-brand-ember"
                    : isPast
                      ? "text-fg-secondary"
                      : "text-fg-tertiary",
                )}
              >
                <span className="text-fg-tertiary/70 tabular-nums">
                  {(i + 1).toString().padStart(2, "0")}
                </span>
                <span>{stage.label}</span>
              </span>
              {i < STAGES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px w-3 transition-colors duration-300",
                    isPast || isActive ? "bg-brand-ember/40" : "bg-fg-tertiary/25",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
