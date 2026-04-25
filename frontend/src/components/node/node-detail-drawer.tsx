import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { useBeatGraphStore, selectActiveBeat } from "@/stores/beat-graph-store";
import { AgentBubbleStream } from "@/components/agent/agent-bubble-stream";
import { GenerationPanel } from "./generation-panel";
import { Button } from "@/components/ui/button";
import { SPRING, STAGGER } from "@/lib/motion-presets";
import { api, ApiError } from "@/lib/api";
import { sleep } from "@/lib/utils";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function NodeDetailDrawer() {
  const beat = useBeatGraphStore(selectActiveBeat);
  const manifest = useBeatGraphStore((s) => s.manifest);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const updateBeat = useBeatGraphStore((s) => s.updateBeat);
  const updateScene = useBeatGraphStore((s) => s.updateScene);

  const [genError, setGenError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (!beat || !manifest) return;
    const scene = beat.scenes[0];
    if (!scene.refinedPrompt) return;
    cancelRef.current = false;
    setGenError(null);
    updateBeat(beat.beatId, { status: "generating" });

    try {
      const { jobId, pollAfterMs } = await api.generate({
        projectId: manifest.projectId,
        beatId: beat.beatId,
        sceneId: scene.sceneId,
        refinedPrompt: scene.refinedPrompt,
        durationSeconds: scene.durationSeconds ?? beat.archetype.suggestedDuration,
        beatTemplate: beat.template,
      });

      // Poll until terminal. Hard timeout at 30s for demo safety.
      const startMs = Date.now();
      let delay = pollAfterMs;
      while (!cancelRef.current) {
        if (Date.now() - startMs > 30_000) {
          throw new ApiError(0, "Generation timed out after 30s");
        }
        await sleep(delay);
        const status = await api.status(jobId);
        if (status.status === "succeeded") {
          updateScene(beat.beatId, scene.sceneId, {
            jobId,
            clipPublicId: status.clipPublicId,
            clipUrl: status.clipUrl,
          });
          updateBeat(beat.beatId, { status: "preview" });
          return;
        }
        if (status.status === "failed") {
          throw new ApiError(0, status.error ?? "Generation failed");
        }
        delay = status.pollAfterMs ?? 800;
      }
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Generation hit a snag.");
      updateBeat(beat.beatId, { status: "ready-to-generate" });
    }
  }, [beat, manifest, updateBeat, updateScene]);

  if (!beat) return null;

  const status = beat.status;
  const isReadyToGenerate = status === "ready-to-generate";
  const isGenerating = status === "generating";
  const isPreview = status === "preview" || status === "approved";

  const beatIndex = manifest?.beats.findIndex((b) => b.beatId === beat.beatId) ?? 0;
  const totalBeats = manifest?.beats.length ?? 1;

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={SPRING.drawer}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[36rem] flex-col border-l border-brand-ember-dim/40 bg-bg-elev-1/90 backdrop-blur-xl"
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: STAGGER.drawerInner, delayChildren: 0.08 } },
        }}
        className="flex h-full flex-col"
      >
        {/* Header */}
        <motion.header
          variants={fadeUp}
          transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
          className="flex items-start justify-between border-b border-fg-tertiary/30 p-6"
        >
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
              Beat {beatIndex + 1} of {totalBeats} · {beat.template.split(".")[0]}
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
            title="Close"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </motion.header>

        {/* Body — agent stream OR generation panel OR preview hint */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
          className="flex-1 overflow-hidden p-6"
        >
          {isGenerating ? (
            <GenerationPanel suggestedDurationSeconds={beat.archetype.suggestedDuration} />
          ) : isPreview ? (
            <div className="grid h-full place-items-center font-mono text-[11px] uppercase tracking-[0.24em] text-fg-tertiary">
              Preview ready · Phase 5 surface coming
            </div>
          ) : (
            <AgentBubbleStream beat={beat} />
          )}
        </motion.div>

        {/* Footer — pill + CTA. Hidden during generation; the panel speaks for itself. */}
        {!isGenerating && !isPreview ? (
          <motion.footer
            variants={fadeUp}
            transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            className="space-y-3 border-t border-fg-tertiary/30 p-6"
          >
            <div
              className={cn(
                "rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors duration-300",
                isReadyToGenerate
                  ? "ember-pulse border-brand-ember/60 bg-brand-ember/10 text-brand-ember"
                  : "border-fg-tertiary/40 text-fg-tertiary",
              )}
            >
              {isReadyToGenerate
                ? "Sufficient information collected"
                : "More questions recommended"}
            </div>

            {genError ? (
              <div className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-[11px] text-state-error">
                {genError}
              </div>
            ) : null}

            <Button
              size="lg"
              variant="primary"
              className={cn("w-full", isReadyToGenerate && "ember-pulse")}
              disabled={!isReadyToGenerate}
              onClick={handleGenerate}
            >
              <Sparkles size={16} strokeWidth={1.5} />
              Generate scene
            </Button>
          </motion.footer>
        ) : null}
      </motion.div>
    </motion.aside>
  );
}
