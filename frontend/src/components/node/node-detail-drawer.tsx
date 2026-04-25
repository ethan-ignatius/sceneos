import { motion } from "motion/react";
import { X, Sparkles } from "lucide-react";
import { useBeatGraphStore, selectActiveBeat } from "@/stores/beat-graph-store";
import { AgentBubbleStream } from "@/components/agent/agent-bubble-stream";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/lib/motion-presets";

export function NodeDetailDrawer() {
  const beat = useBeatGraphStore(selectActiveBeat);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);

  if (!beat) return null;

  const status = beat.status;
  const sceneIndex = 1;
  const totalScenes = beat.scenes.length;
  const isReadyToGenerate = status === "ready-to-generate";

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={SPRING.drawer}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[36rem] flex-col border-l border-brand-ember-dim/40 bg-bg-elev-1/90 backdrop-blur-xl"
    >
      <header className="flex items-start justify-between border-b border-fg-tertiary/30 p-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
            Beat {sceneIndex} of {totalScenes} · {beat.template.split(".")[0]}
          </div>
          <h2 className="mt-1 text-display-md italic text-fg-primary">{beat.beatName}</h2>
          <p className="mt-2 max-w-prose font-mono text-xs leading-relaxed text-fg-tertiary">
            {beat.archetype.intent}
          </p>
        </div>
        <button
          onClick={() => setActiveBeat(null)}
          className="text-fg-tertiary transition-colors hover:text-fg-primary"
          aria-label="Close drawer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </header>

      <div className="flex-1 overflow-hidden p-6">
        <AgentBubbleStream beat={beat} />
      </div>

      <footer className="space-y-3 border-t border-fg-tertiary/30 p-6">
        <div
          className={`rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.24em] ${
            isReadyToGenerate
              ? "border-brand-ember/50 bg-brand-ember/10 text-brand-ember"
              : "border-fg-tertiary/40 text-fg-tertiary"
          }`}
        >
          {isReadyToGenerate ? "Sufficient information collected" : "More questions recommended"}
        </div>
        <Button size="lg" variant="primary" className="w-full" disabled={!isReadyToGenerate}>
          <Sparkles size={16} strokeWidth={1.5} />
          Generate scene
        </Button>
      </footer>
    </motion.aside>
  );
}
