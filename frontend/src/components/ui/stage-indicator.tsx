import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "direct", label: "Direct" },
  { key: "compose", label: "Compose" },
  { key: "stitch", label: "Stitch" },
  { key: "deliver", label: "Deliver" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

/**
 * Pipeline stage indicator — restraint-led redesign.
 *
 * Four small ember dots, one per stage. The active dot is filled + named;
 * past dots are ember-dim filled (no label); future dots are hairline rings.
 * No connector dashes. No uppercase pill. Reads at a glance without
 * shouting.
 *
 * Routes → stages:
 *   /            → 01·DIRECT
 *   /transition  → 01·DIRECT (transient)
 *   /canvas      → 02·COMPOSE (default) or 03·STITCH (when ≥1 approved)
 *   /final       → 04·DELIVER
 */
export function StageIndicator() {
  const { pathname } = useLocation();
  const manifest = useBeatGraphStore((s) => s.manifest);

  let activeKey: StageKey = "direct";
  if (pathname === "/" || pathname === "/transition") {
    activeKey = "direct";
  } else if (pathname === "/canvas") {
    const approvedCount =
      manifest?.beats.filter((b) => b.status === "approved").length ?? 0;
    activeKey = approvedCount > 0 ? "stitch" : "compose";
  } else if (pathname === "/final") {
    activeKey = "deliver";
  }

  const activeIndex = STAGES.findIndex((s) => s.key === activeKey);
  const activeStage = STAGES[activeIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1], delay: 0.4 }}
      className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4"
      aria-label="Pipeline stage indicator"
    >
      <div className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-bg-elev-1/55 px-3 py-1.5 backdrop-blur-xl">
        {STAGES.map((stage, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <span
              key={stage.key}
              className={cn(
                "h-1.5 w-1.5 flex-shrink-0 rounded-full transition-all duration-300",
                isActive
                  ? "scale-125 bg-brand-ember shadow-[0_0_10px_rgba(240,168,104,0.5)]"
                  : isPast
                  ? "bg-brand-ember-dim/70"
                  : "border border-fg-tertiary/40 bg-transparent",
              )}
              aria-hidden="true"
            />
          );
        })}
        <AnimatePresence mode="wait">
          <motion.span
            key={activeStage.key}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            className="ml-1 inline-flex items-baseline gap-1.5"
          >
            <span className="font-mono text-[9px] tabular-nums text-fg-tertiary/70">
              {(activeIndex + 1).toString().padStart(2, "0")}
            </span>
            <span className="text-[12px] font-medium text-fg-primary">
              {activeStage.label}
            </span>
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
