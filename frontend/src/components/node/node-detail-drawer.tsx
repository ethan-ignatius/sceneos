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

  // Extracted from handleGenerate so it can be re-attached on mount when
  // the user reloads /canvas mid-generation: persisted manifest will have
  // beat.status === "generating" with scene.jobId set, but we never called
  // /api/generate again, so polling needs to restart from the existing jobId.
  const pollUntilDone = useCallback(
    async (jobId: string, beatId: string, sceneId: string, initialDelay: number) => {
      const startMs = Date.now();
      let delay = initialDelay;
      while (!cancelRef.current) {
        // 5-minute ceiling on a re-attached poll — long enough for Veo 3
        // (~1–4 min real-world) but bounded so a stuck jobId doesn't spin
        // forever. Fresh dispatches use 30s for demo safety; re-attaches
        // get the wider window because we don't know how long the job has
        // already been running.
        if (Date.now() - startMs > 5 * 60_000) {
          throw new ApiError(0, "Generation polling timed out");
        }
        await sleep(delay);
        if (cancelRef.current) return;
        const status = await api.status(jobId);
        if (cancelRef.current) return;
        if (status.status === "succeeded") {
          updateScene(beatId, sceneId, {
            jobId,
            clipPublicId: status.clipPublicId,
            clipUrl: status.clipUrl,
          });
          updateBeat(beatId, { status: "preview" });
          return;
        }
        if (status.status === "failed") {
          throw new ApiError(0, status.error ?? "Generation failed");
        }
        delay = status.pollAfterMs ?? 800;
      }
    },
    [updateBeat, updateScene],
  );

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
      await pollUntilDone(gen.jobId, beat.beatId, scene.sceneId, gen.pollAfterMs);
    } catch (err) {
      if (cancelRef.current) return;
      setGenError(err instanceof ApiError ? err.message : "Generation hit a snag.");
      updateBeat(beat.beatId, { status: "ready-to-generate" });
    }
  }, [beat, manifest, updateBeat, pollUntilDone]);

  // Re-attach an in-flight Veo / Higgsfield poll when the drawer mounts
  // and the persisted manifest reports beat.status === "generating" with a
  // jobId set on the scene. Without this, refreshing /canvas mid-generation
  // leaves the drawer stuck on the spinner forever.
  //
  // We try to decode the provider from the jobId's `provider::id` prefix
  // for the badge ("Vertex AI · Veo"); falls back to null if the format
  // changes.
  const beatId = beat?.beatId;
  const sceneId = beat?.scenes[0]?.sceneId;
  const persistedJobId = beat?.scenes[0]?.jobId;
  const isGeneratingStatus = beat?.status === "generating";
  useEffect(() => {
    if (!beatId || !sceneId || !persistedJobId || !isGeneratingStatus) return;
    setGenError(null);
    const decoded = persistedJobId.split("::")[0];
    if (decoded && decoded !== "mock") {
      setProvider(decoded as GenerationProvider);
    }
    pollUntilDone(persistedJobId, beatId, sceneId, 1500).catch((err) => {
      if (cancelRef.current) return;
      setGenError(err instanceof ApiError ? err.message : "Lost connection to the running job.");
      updateBeat(beatId, { status: "ready-to-generate" });
    });
    // We intentionally do not depend on pollUntilDone — its identity churns
    // on every render via updateBeat/updateScene closure refs, and we only
    // ever want this effect to re-attach once per (beatId, jobId) pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, sceneId, persistedJobId, isGeneratingStatus]);

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
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85svh] w-full flex-col rounded-t-md border-t border-fg-tertiary/15 bg-[#14110f]/[0.97] backdrop-blur-2xl md:absolute md:inset-y-0 md:right-0 md:bottom-auto md:top-0 md:max-h-none md:w-full md:max-w-[36rem] md:rounded-none md:border-l md:border-t-0"
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
            <div className="caption-track text-[10px] tabular-nums text-fg-tertiary">
              <span className="text-brand-ember">{(beatIndex + 1).toString().padStart(2, "0")}</span>
              <span className="mx-2 text-fg-tertiary/50">/</span>
              <span>{totalBeats.toString().padStart(2, "0")}</span>
              <span className="mx-2 text-fg-tertiary/50">·</span>
              <span>{beat.template.split(".")[0]}</span>
            </div>
            <h2 className="mt-2 text-display-md italic leading-[1.05] text-fg-primary">
              {beat.beatName}
            </h2>
            {/* Description lifted to Fraunces italic 18px so the drawer header
                reads as title card + voiceover, not form label + helper text. */}
            <p className="mt-3 max-w-prose font-display italic text-lede leading-[1.4] text-fg-secondary">
              {beat.archetype.intent}
            </p>
          </div>
          <button
            onClick={() => setActiveBeat(null)}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-fg-tertiary transition-colors hover:bg-bg-elev-2 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember"
            aria-label="Close drawer"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
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
              <div
                role="alert"
                className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-body text-body-sm leading-snug text-state-error"
              >
                {genError}
              </div>
            ) : null}

            {/* Two-CTA footer: the primary "Roll camera" demands the
                questionnaire is sufficient; the secondary "Lock it in"
                lets the user bail out of the conversation early when
                they feel they've said enough. We synthesize a refined
                prompt from their answers + the beat archetype and flip
                the beat to ready-to-generate locally — no backend call
                needed since the agent's job is just to extract structure
                from what the user has already typed. */}
            {!isReadyToGenerate ? (
              (() => {
                const userAnswers = beat.scenes[0]?.conversation
                  .filter((t) => t.role === "user")
                  .map((t) => t.content)
                  .join(". ");
                const canLock = !!userAnswers && userAnswers.length > 0;
                if (!canLock) return null;
                const lockIn = () => {
                  const refined = [
                    beat.archetype.intent,
                    beat.archetype.directorNotes ?? "",
                    `Director's notes: ${userAnswers}.`,
                    `Mood ${beat.archetype.mood}; cinematic, ~${beat.archetype.suggestedDuration}s.`,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  updateScene(beat.beatId, beat.scenes[0].sceneId, {
                    refinedPrompt: refined,
                    durationSeconds: beat.archetype.suggestedDuration,
                  });
                  updateBeat(beat.beatId, { status: "ready-to-generate" });
                };
                return (
                  <button
                    type="button"
                    onClick={lockIn}
                    className="block w-full rounded-md border border-fg-tertiary/30 bg-bg-elev-2/30 px-4 py-2.5 caption-track text-[10px] text-fg-secondary transition-colors hover:border-brand-ember/50 hover:bg-bg-elev-2/50 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                    aria-label="Lock in answers and prepare to generate"
                  >
                    I have enough — lock it in
                  </button>
                );
              })()
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
