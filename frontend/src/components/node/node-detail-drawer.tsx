import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Clapperboard } from "lucide-react";
import { useBeatGraphStore, selectActiveBeat } from "@/stores/beat-graph-store";
import { AgentBubbleStream } from "@/components/agent/agent-bubble-stream";
import { GenerationPanel } from "./generation-panel";
import { ClipPreview } from "./clip-preview";
import { Button } from "@/components/ui/button";
import { DURATIONS, EASE, SPRING, STAGGER } from "@/lib/motion-presets";
import { api, ApiError } from "@/lib/api";
import { sleep, cn } from "@/lib/utils";
import type { GenerationProvider } from "@/types/api";

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
  const [provider, setProvider] = useState<GenerationProvider | null>(null);
  // Set to true on unmount; the polling loop checks each iteration so an
  // orphaned poll can't write to a stale beat after the drawer closes.
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!beat || !manifest) return;
    const scene = beat.scenes[0];
    if (!scene.refinedPrompt) return;
    setGenError(null);
    setProvider(null);
    updateBeat(beat.beatId, { status: "generating" });

    try {
      const gen = await api.generate({
        projectId: manifest.projectId,
        beatId: beat.beatId,
        sceneId: scene.sceneId,
        refinedPrompt: scene.refinedPrompt,
        durationSeconds: scene.durationSeconds ?? beat.archetype.suggestedDuration,
        beatTemplate: beat.template,
      });
      if (cancelRef.current) return;
      setProvider(gen.provider);

      // Poll until terminal. Hard timeout at 30s for demo safety.
      const startMs = Date.now();
      let delay = gen.pollAfterMs;
      while (!cancelRef.current) {
        if (Date.now() - startMs > 30_000) {
          throw new ApiError(0, "Generation timed out after 30s");
        }
        await sleep(delay);
        if (cancelRef.current) return;
        const status = await api.status(gen.jobId);
        if (cancelRef.current) return;
        if (status.status === "succeeded") {
          updateScene(beat.beatId, scene.sceneId, {
            jobId: gen.jobId,
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
      if (cancelRef.current) return;
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
      role="dialog"
      aria-modal="true"
      aria-label={`Beat ${beatIndex + 1}: ${beat.beatName}`}
      // Slide direction adapts to layout: mobile (bottom sheet) gets a y
       // slide-up; desktop (right drawer) gets x slide-in. CSS media query
       // implementation via @media-style variants would be cleaner but Motion
       // doesn't expose that — so we use a single y-only animation that
       // reads correctly on both: rises from below on mobile, drops in from
       // the right edge with a slight upward bounce on desktop.
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={SPRING.drawer}
      // Bottom-sheet on <md, side-drawer on >=md (issue #155). Mobile gets
      // 85svh max so the canvas peek behind the sheet stays visible.
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85svh] w-full flex-col rounded-t-md border-t border-brand-ember-dim/40 bg-bg-elev-1/90 backdrop-blur-xl md:absolute md:inset-y-0 md:right-0 md:bottom-auto md:top-0 md:max-h-none md:w-full md:max-w-[36rem] md:rounded-none md:border-l md:border-t-0"
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
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
          className="flex items-start justify-between border-b border-fg-tertiary/30 p-6"
        >
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-tertiary">
              Beat {beatIndex + 1} of {totalBeats} · {beat.template.split(".")[0]}
            </div>
            <h2 className="mt-1 text-display-md italic text-fg-primary">{beat.beatName}</h2>
            {/* Description lifted to Fraunces italic 18px so the drawer header
                reads as title card + voiceover, not form label + helper text.
                See FINAL_HANDOFF §2.B / §5 P0.2. */}
            <p className="mt-3 max-w-prose font-display italic text-[1.125rem] leading-[1.4] text-fg-secondary">
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
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
          className="flex-1 overflow-hidden p-6"
        >
          {isGenerating ? (
            <GenerationPanel
              suggestedDurationSeconds={beat.archetype.suggestedDuration}
              provider={provider}
            />
          ) : isPreview ? (
            <ClipPreview beat={beat} />
          ) : (
            <AgentBubbleStream beat={beat} />
          )}
        </motion.div>

        {/* Footer — progress + CTA. Hidden during generation; the panel speaks for itself. */}
        {!isGenerating && !isPreview ? (
          <motion.footer
            variants={fadeUp}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            className="space-y-4 border-t border-fg-tertiary/30 p-6"
          >
            {/* Hairline progress bar replaces the bordered pill that read as
                an empty input field. Ember fills L→R as the questionnaire
                progresses. See FINAL_HANDOFF §2.C / §5 P0.3. */}
            {(() => {
              const userAnswers = beat.scenes[0]?.conversation.filter(
                (t) => t.role === "user",
              ).length ?? 0;
              // Mock backend asks ~2 questions per beat; if the agent has
              // already declared sufficient (status flipped) the answer is
              // exactly userAnswers; otherwise estimate at least one more.
              const totalQuestions = isReadyToGenerate
                ? userAnswers
                : Math.max(2, userAnswers + 1);
              const ratio = totalQuestions === 0 ? 0 : userAnswers / totalQuestions;
              return (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="caption-track text-[10px] text-fg-tertiary">
                      Director's questionnaire
                    </span>
                    <span className="caption-track text-[10px] tabular-nums text-fg-tertiary">
                      {userAnswers.toString().padStart(2, "0")}{" "}
                      <span className="text-fg-tertiary/50">/</span>{" "}
                      {totalQuestions.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <div className="relative h-px overflow-hidden bg-fg-tertiary/20">
                    <motion.div
                      className={cn(
                        "absolute inset-y-0 left-0 origin-left",
                        isReadyToGenerate ? "bg-brand-ember" : "bg-brand-ember/70",
                      )}
                      initial={false}
                      animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
                      transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
                    />
                  </div>
                  {isReadyToGenerate ? (
                    <p className="caption-track text-[10px] text-brand-ember">
                      <span className="text-brand-ember">●</span>
                      <span className="ml-2">The scene has its blocking.</span>
                    </p>
                  ) : null}
                </div>
              );
            })()}

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
              <Clapperboard size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="caption-track text-[12px]">Roll camera</span>
            </Button>
          </motion.footer>
        ) : null}
      </motion.div>
    </motion.aside>
  );
}
