import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Clapperboard, ChevronRight } from "lucide-react";
import { useBeatGraphStore, selectActiveBeat } from "@/stores/beat-graph-store";
import { AgentBubbleStream } from "@/components/agent/agent-bubble-stream";
import { GenerationPanel } from "./generation-panel";
import { ClipPreview } from "./clip-preview";
import { Button } from "@/components/ui/button";
import { DURATIONS, EASE, SPRING, STAGGER } from "@/lib/motion-presets";
import { api, ApiError } from "@/lib/api";
import { nowISO, sleep } from "@/lib/utils";
import type { GenerationProvider, StatusResponse } from "@/types/api";

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Detect Veo's safety-filter / content-policy rejection. Matches the
 * actual error string Vertex returns ("violated Vertex AI's usage
 * guidelines", "Support codes: NNNNNN", "filtered the output"). When
 * this fires, we kick the beat back into questioning so the agent can
 * help the user rephrase — softly, no manual retry button.
 */
function isContentPolicyError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("usage guidelines") ||
    m.includes("support codes") ||
    (m.includes("filtered") && m.includes("veo")) ||
    m.includes("violated vertex ai") ||
    m.includes("safety filter blocked") ||
    m.includes("sensitive words") ||
    m.includes("responsible ai")
  );
}

export function NodeDetailDrawer() {
  const beat = useBeatGraphStore(selectActiveBeat);
  const manifest = useBeatGraphStore((s) => s.manifest);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const setStitchTrayOpen = useBeatGraphStore((s) => s.setStitchTrayOpen);
  const updateBeat = useBeatGraphStore((s) => s.updateBeat);
  const updateScene = useBeatGraphStore((s) => s.updateScene);
  const appendAgentTurn = useBeatGraphStore((s) => s.appendAgentTurn);

  const [genError, setGenError] = useState<string | null>(null);
  const [provider, setProvider] = useState<GenerationProvider | null>(null);
  const [providerStage, setProviderStage] = useState<string | null>(null);
  // When backend auto-falls-back to the cached lane (Vertex quota/safety
  // failure), keep the original-attempted provider so the GenerationPanel
  // can surface a "demo lane — Vertex unreachable" badge. Judges shouldn't
  // think a cached demo clip is a fresh Veo render.
  const [fallbackFrom, setFallbackFrom] = useState<GenerationProvider | null>(null);
  // ISO timestamp from the backend status response — survives drawer
  // close/reopen so the GenerationPanel's elapsed time is the TRUE
  // elapsed (Date.now() - startedAt) rather than restarting from drawer
  // mount. Captured on the first /api/status call after mount and on
  // every poll thereafter; stale values are fine because the wallclock
  // calculation only depends on the timestamp identity.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [latestStatus, setLatestStatus] = useState<StatusResponse | null>(null);
  const [statusSamples, setStatusSamples] = useState<
    Array<{ atMs: number; status: string; stage?: string | null; pollAfterMs?: number | null }>
  >([]);
  const [dispatchMs, setDispatchMs] = useState<number | null>(null);
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
      let retriedExpiredJob = false;
      while (!cancelRef.current) {
        // 5-minute ceiling on a re-attached poll — long enough for Veo 3.1 Fast
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
        setLatestStatus(status);
        setStatusSamples((prev) => {
          const next = [
            ...prev,
            {
              atMs: Date.now() - startMs,
              status: status.status,
              stage: status.stage ?? null,
              pollAfterMs: status.pollAfterMs ?? null,
            },
          ];
          return next.slice(-80);
        });
        setProviderStage(status.stage ?? null);
        // First status response with a startedAt locks our elapsed-time
        // source. Backend value wins over drawer-mount time.
        if (status.startedAt) {
          setStartedAt((prev) => prev ?? status.startedAt!);
        }
        if (status.status === "succeeded") {
          // Race-aware write: canvas-route's speculative poller may have
          // promoted the same jobId already. If clipPublicId is set, just
          // flip the beat to preview — re-writing the same publicId churns
          // store subscribers for nothing.
          const m = useBeatGraphStore.getState().manifest;
          const liveScene = m?.beats
            .find((b) => b.beatId === beatId)
            ?.scenes.find((s) => s.sceneId === sceneId);
          if (!liveScene) return; // manifest reset mid-poll
          if (liveScene.clipPublicId) {
            updateBeat(beatId, { status: "preview" });
            return;
          }
          updateScene(beatId, sceneId, {
            jobId,
            clipPublicId: status.clipPublicId,
            clipUrl: status.clipUrl,
            lastFrameUrl: status.lastFrameUrl,
          });
          updateBeat(beatId, { status: "preview" });
          return;
        }
        if (status.status === "failed") {
          const errMsg = status.error ?? "Generation failed";

          // Safety filter — Veo rejected the prompt content. Throw with
          // a message that isContentPolicyError matches so the caller can
          // route through handleContentPolicyRecovery.
          if (status.safety || isContentPolicyError(errMsg)) {
            updateScene(beatId, sceneId, {
              jobId: undefined,
              speculativeJobId: undefined,
            });
            throw new ApiError(0, errMsg);
          }

          // "Unknown vertex jobId" — backend restarted, in-memory jobs lost.
          if (/unknown\s+\w+\s+jobid/i.test(errMsg)) {
            // Backend restarted and lost in-memory provider job registry.
            // Auto-re-dispatch once with the same prompt so users don't hit
            // a dead-end "expired render" state on node 2+.
            updateScene(beatId, sceneId, { jobId: undefined, speculativeJobId: undefined });
            if (!retriedExpiredJob) {
              retriedExpiredJob = true;
              const b = manifest?.beats.find((x) => x.beatId === beatId);
              const s = b?.scenes.find((x) => x.sceneId === sceneId);
              if (manifest && b && s?.refinedPrompt) {
                const beatIdx = manifest.beats.findIndex((x) => x.beatId === beatId);
                const prevBeat = beatIdx > 0 ? manifest.beats[beatIdx - 1] : null;
                const prevScene = prevBeat?.scenes?.[0];
                const regen = s.beatFacts
                  ? await api.orchestrate(beatId, {
                      manifest,
                      beatFacts: s.beatFacts,
                      previousLastFrameUrl: prevScene?.lastFrameUrl,
                      aspectRatio: "16:9",
                    })
                  : await api.generate({
                      projectId: manifest.projectId,
                      beatId,
                      sceneId,
                      refinedPrompt: s.refinedPrompt,
                      durationSeconds: s.durationSeconds ?? b.archetype.suggestedDuration,
                      beatTemplate: b.template,
                    });
                if (cancelRef.current) return;
                if (regen.provider && String(regen.provider) !== "orchestrator") {
                  setProvider(regen.provider as GenerationProvider);
                }
                setFallbackFrom((regen as { originalProvider?: GenerationProvider }).originalProvider ?? null);
                updateScene(beatId, sceneId, { jobId: regen.jobId });
                delay = regen.pollAfterMs ?? 1200;
                continue;
              }
            }
            throw new ApiError(0, "The previous render expired. Click Roll camera to start fresh.");
          }
          throw new ApiError(0, errMsg);
        }
        delay = status.pollAfterMs ?? 800;
      }
    },
    [manifest, updateBeat, updateScene],
  );

  // Veo content-policy recovery. Veo refuses some prompts (real-violence,
  // explicit, named-person, etc.); the user can't be expected to know the
  // safety surface up front. Instead: clear the stale generation state,
  // bounce the beat back to questioning, and seed the conversation with
  // an agent turn explaining what happened so the user keeps refining
  // until Veo accepts. They never see a dead-end "render failed" wall.
  const handleContentPolicyRecovery = useCallback(
    (beatId: string, sceneId: string) => {
      setGenError(null);
      setProvider(null);
      setProviderStage(null);
      setStartedAt(null);
      setFallbackFrom(null);
      // Wipe any clip / job state so the next render goes fresh once the
      // user gives the agent something Veo can accept. The refinedPrompt
      // gets cleared too — the previous one is what tripped the filter.
      updateScene(beatId, sceneId, {
        clipPublicId: undefined,
        clipUrl: undefined,
        lastFrameUrl: undefined,
        jobId: undefined,
        speculativeJobId: undefined,
        refinedPrompt: undefined,
      });
      appendAgentTurn(beatId, sceneId, {
        role: "agent",
        content:
          "Veo refused that frame for a content-policy reason. Tell me what you want this beat to feel like in different words — softer subject, less violence, no named people — and I'll re-pitch it.",
        timestamp: nowISO(),
      });
      updateBeat(beatId, { status: "questioning" });
    },
    [updateBeat, updateScene, appendAgentTurn],
  );

  const handleGoNext = useCallback(() => {
    if (!manifest || !beat) return;
    const idx = manifest.beats.findIndex((b) => b.beatId === beat.beatId);
    if (idx < 0) return;
    if (idx < manifest.beats.length - 1) {
      setActiveBeat(manifest.beats[idx + 1]!.beatId);
    } else {
      setActiveBeat(null);
      setStitchTrayOpen(true);
    }
  }, [beat, manifest, setActiveBeat, setStitchTrayOpen]);

  const handleGenerate = useCallback(async () => {
    if (!beat || !manifest) return;
    const scene = beat.scenes[0];
    if (!scene.refinedPrompt) return;
    setGenError(null);
    setProvider(null);
    setProviderStage(null);
    setStartedAt(null);
    setLatestStatus(null);
    setStatusSamples([]);
    setDispatchMs(null);
    setFallbackFrom(null);

    // ── Speculative-result fast path ──────────────────────────────
    // Landing route pre-bakes every beat the moment decompose
    // resolves. By the time the user finishes their conversation and
    // hits Roll camera, the speculative clip is often already done —
    // canvas-route's poller will have written clipPublicId/clipUrl
    // onto the scene. If we see it, skip Veo entirely and flip
    // straight to preview. Wait collapses to ~0s on the user's side.
    if (scene.clipPublicId && scene.clipUrl) {
      updateBeat(beat.beatId, { status: "preview" });
      return;
    }
    // If a speculative job is still running, attach to it instead of
    // dispatching a new one. The pollUntilDone loop handles both
    // running and succeeded states; on succeeded we flip to preview.
    // If the speculative job is dead (backend restarted, in-memory jobs
    // wiped), fall through to dispatch a fresh one instead of erroring.
    if (scene.speculativeJobId) {
      updateScene(beat.beatId, scene.sceneId, { jobId: scene.speculativeJobId });
      updateBeat(beat.beatId, { status: "generating" });
      try {
        await pollUntilDone(scene.speculativeJobId, beat.beatId, scene.sceneId, 1500);
        return;
      } catch (specErr) {
        if (cancelRef.current) return;
        const msg = specErr instanceof ApiError ? specErr.message : "";
        if (isContentPolicyError(msg)) {
          handleContentPolicyRecovery(beat.beatId, scene.sceneId);
          return;
        }
        // Speculative job expired / unknown — clear it and fall through
        // to a fresh dispatch below instead of showing an error.
        updateScene(beat.beatId, scene.sceneId, {
          jobId: undefined,
          speculativeJobId: undefined,
        });
      }
    }

    updateBeat(beat.beatId, { status: "generating" });

    try {
      const t0 = performance.now();
      const beatIdx = manifest.beats.findIndex((b) => b.beatId === beat.beatId);
      const prevBeat = beatIdx > 0 ? manifest.beats[beatIdx - 1] : null;
      const prevScene = prevBeat?.scenes?.[0];
      const gen = scene.beatFacts
        ? await api.orchestrate(beat.beatId, {
            manifest,
            beatFacts: scene.beatFacts,
            previousLastFrameUrl: prevScene?.lastFrameUrl,
            aspectRatio: "16:9",
          })
        : await api.generate({
            projectId: manifest.projectId,
            beatId: beat.beatId,
            sceneId: scene.sceneId,
            refinedPrompt: scene.refinedPrompt,
            durationSeconds: scene.durationSeconds ?? beat.archetype.suggestedDuration,
            beatTemplate: beat.template,
          });
      if (cancelRef.current) return;
      setDispatchMs(Math.round(performance.now() - t0));
      if (gen.provider && String(gen.provider) !== "orchestrator") {
        setProvider(gen.provider as GenerationProvider);
      }
      setFallbackFrom((gen as { originalProvider?: GenerationProvider }).originalProvider ?? null);
      updateScene(beat.beatId, scene.sceneId, {
        jobId: gen.jobId,
        generateFallbackFrom: (gen as { originalProvider?: GenerationProvider }).originalProvider,
        generateFallbackReason: (gen as { fallbackReason?: string }).fallbackReason,
      });
      await pollUntilDone(gen.jobId, beat.beatId, scene.sceneId, gen.pollAfterMs);
    } catch (err) {
      if (cancelRef.current) return;
      const msg = err instanceof ApiError ? err.message : "Generation hit a snag.";
      if (isContentPolicyError(msg)) {
        handleContentPolicyRecovery(beat.beatId, scene.sceneId);
      } else {
        setGenError(msg);
        updateBeat(beat.beatId, { status: "ready-to-generate" });
      }
    }
  }, [beat, manifest, updateBeat, updateScene, pollUntilDone, handleContentPolicyRecovery]);

  // Re-attach an in-flight Veo / Higgsfield poll when the drawer mounts
  // and the persisted manifest reports beat.status === "generating" with a
  // jobId set on the scene. Without this, refreshing /canvas mid-generation
  // leaves the drawer stuck on the spinner forever.
  //
  // We try to decode the provider from the jobId's `provider::id` prefix
  // for the badge ("Vertex AI · Veo"); falls back to null if the format
  // changes or the prefix doesn't match a real provider.
  const beatId = beat?.beatId;
  const sceneId = beat?.scenes[0]?.sceneId;
  const persistedJobId = beat?.scenes[0]?.jobId;
  const isGeneratingStatus = beat?.status === "generating";
  useEffect(() => {
    if (!beatId || !sceneId || !persistedJobId || !isGeneratingStatus) return;
    setGenError(null);
    setStatusSamples([]);
    const decoded = persistedJobId.split("::")[0];
    const KNOWN_PROVIDERS: readonly GenerationProvider[] = [
      "vertex",
      "higgsfield",
      "kling",
      "fal",
      "replicate",
      "cached",
    ];
    if (decoded && (KNOWN_PROVIDERS as readonly string[]).includes(decoded)) {
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

  // Auto-roll-camera — when the agent commits (status flips to
  // "ready-to-generate" with a refinedPrompt set), automatically fire
  // handleGenerate() instead of waiting for the user to click "Roll
  // camera." The manual button stays as the override (e.g. after a
  // regenerate). Fires once per (beatId, sceneId) so a re-mount with
  // the same status doesn't re-dispatch.
  const autoRolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || beat.status !== "ready-to-generate") return;
    if (!beat.scenes[0]?.refinedPrompt) return;
    const key = `${beat.beatId}::${beat.scenes[0].sceneId}`;
    if (autoRolledRef.current === key) return;
    autoRolledRef.current = key;
    void handleGenerate();
  }, [beat, handleGenerate]);

  // Auto-advance — when the beat is approved (auto-approve in
  // ClipPreview just fired), wait a beat (1.6s — long enough for the
  // user to register the approval) then advance to the next pending
  // beat OR open the stitch tray on the last one. Manual "Next beat"
  // button still exists as an override during the wait window.
  const autoAdvancedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || beat.status !== "approved") return;
    const key = beat.beatId;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    const t = window.setTimeout(() => {
      handleGoNext();
    }, 1600);
    return () => window.clearTimeout(t);
  }, [beat, handleGoNext]);

  if (!beat) return null;

  const status = beat.status;
  const isReadyToGenerate = status === "ready-to-generate";
  const isGenerating = status === "generating";
  const isPreview = status === "preview" || status === "approved";

  const beatIndex = manifest?.beats.findIndex((b) => b.beatId === beat.beatId) ?? 0;
  const totalBeats = manifest?.beats.length ?? 1;
  const isLastBeat = beatIndex >= totalBeats - 1;

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
      // Floating panel — credit-card / Phantom / Wealthsimple geometry.
      // Mobile: bottom sheet that floats above the URL strip (still has
      // its own rounded corners). Desktop: a free-floating right panel
      // with margin from every viewport edge, rounded-2xl, soft shadow.
      // No more edge-to-edge "stuck" feel.
      // select-text reverses the canvas main's select-none so users can
      // copy agent messages / refined prompts. The chrome above doesn't
      // need to be copyable; the drawer's content does.
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[85svh] w-auto select-text flex-col rounded-2xl border border-fg-tertiary/15 bg-bg-panel/92 backdrop-blur-2xl shadow-(--shadow-panel) md:absolute md:inset-x-auto md:bottom-4 md:right-4 md:top-20 md:max-h-none md:w-[34rem] md:max-w-[calc(100vw-2rem)]"
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
        {/* Header — stripped to the essentials.
            Was: index/total + template name + h2 + italic intent paragraph.
            Now: a tiny "04 / 07" counter + the beat name. The italic intent
            prose was the agent's first thought; the agent says it in the
            chat, so showing it twice was just noise. The template name
            ("story", "trailer") is metadata — irrelevant once you're inside
            the beat — also dropped. */}
        <motion.header
          variants={fadeUp}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
          className="flex items-start justify-between gap-4 border-b border-fg-tertiary/15 px-6 pb-4 pt-5"
        >
          <div>
            {/* Plain "4 of 5" — leading-zero "04 of 05" read as mechanical
                and ugly per the user. Tabular-nums kept so digits don't
                jitter when the count grows. */}
            <div className="font-body text-pill font-medium tabular-nums text-fg-tertiary">
              <span className="text-brand-ember">{beatIndex + 1}</span>
              <span className="mx-1.5 text-fg-tertiary/45">of</span>
              <span>{totalBeats}</span>
            </div>
            <h2 className="text-balance mt-1.5 font-body text-body-lg font-medium leading-[1.15] text-fg-primary">
              {beat.beatName}
            </h2>
          </div>
          <button
            onClick={() => setActiveBeat(null)}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-bg-elev-2/40 text-fg-tertiary transition-colors hover:bg-bg-elev-2/80 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember"
            aria-label="Close drawer"
            title="Close"
          >
            <X size={16} strokeWidth={1.5} />
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
              stage={providerStage}
              startedAt={startedAt}
              fallbackFrom={fallbackFrom}
              debug={{
                dispatchMs,
                latestStatus,
                samples: statusSamples,
              }}
              onCancel={() => {
                cancelRef.current = true;
                setStartedAt(null);
                setProviderStage(null);
                setProvider(null);
                setFallbackFrom(null);
                setLatestStatus(null);
                setStatusSamples([]);
                setDispatchMs(null);
                setGenError(null);
                updateBeat(beat.beatId, { status: "ready-to-generate" });
              }}
            />
          ) : isPreview ? (
            <ClipPreview beat={beat} />
          ) : (
            <AgentBubbleStream beat={beat} />
          )}
        </motion.div>

        {/* Footer — agent path: lock-in / roll camera. Preview path: next beat. */}
        {!isGenerating && isPreview ? (
          <motion.footer
            variants={fadeUp}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            className="border-t border-fg-tertiary/15 px-6 py-4"
          >
            <Button
              size="lg"
              variant="primary"
              className="w-full ember-pulse"
              onClick={handleGoNext}
              aria-label={isLastBeat ? "Open stitch — review your film" : "Go to the next beat"}
            >
              <span className="font-body text-meta font-medium">
                {isLastBeat ? "Continue to stitch" : "Next beat"}
              </span>
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </motion.footer>
        ) : !isGenerating ? (
          <motion.footer
            variants={fadeUp}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            className="space-y-3 border-t border-fg-tertiary/15 px-6 py-4"
          >
            {genError ? (
              <div
                role="alert"
                className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-body text-body-sm leading-snug text-state-error"
              >
                {genError}
              </div>
            ) : null}

            {(() => {
              const userAnswers = beat.scenes[0]?.conversation
                .filter((t) => t.role === "user")
                .map((t) => t.content)
                .join(". ");
              const canLock = !!userAnswers && userAnswers.length > 0;

              if (isReadyToGenerate) {
                // Without a refinedPrompt the backend has nothing to send
                // to Veo. The button shouldn't even be reachable in this
                // state (lock-it-in writes a refinedPrompt), but guard
                // anyway so a stale manifest can't dispatch a no-op render.
                const canRoll = !!beat.scenes[0]?.refinedPrompt;
                return (
                  <Button
                    size="lg"
                    variant="primary"
                    disabled={!canRoll}
                    className="w-full ember-pulse"
                    onClick={handleGenerate}
                    aria-label={
                      canRoll
                        ? "Roll camera — start the render"
                        : "Roll camera unavailable until the beat has a refined prompt"
                    }
                  >
                    <Clapperboard size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span className="font-body text-meta font-medium">Roll camera</span>
                  </Button>
                );
              }

              if (!canLock) {
                return null;
              }

              const lockIn = () => {
                const refined = [
                  beat.archetype.intent,
                  beat.archetype.directorNotes ?? "",
                  `Director's notes: ${userAnswers}.`,
                  `Mood ${beat.archetype.mood}; cinematic, ~${beat.archetype.suggestedDuration}s.`,
                ]
                  .filter(Boolean)
                  .join(" ");
                const scene = beat.scenes[0];
                // Lock-it-in folds the user's answers into a richer
                // refinedPrompt — same contract as the agent's
                // markSufficient. Mandatory re-bake: invalidate the
                // speculative clip + jobs so Roll camera dispatches a
                // fresh Veo with this prompt, not the decompose draft.
                updateScene(beat.beatId, scene.sceneId, {
                  refinedPrompt: refined,
                  durationSeconds: beat.archetype.suggestedDuration,
                  speculativeJobId: undefined,
                  jobId: undefined,
                  clipPublicId: undefined,
                  clipUrl: undefined,
                  lastFrameUrl: undefined,
                });
                updateBeat(beat.beatId, { status: "ready-to-generate" });
              };
              return (
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full justify-center border-brand-ember/55 text-fg-primary hover:bg-brand-ember/10 hover:text-brand-ember"
                  onClick={lockIn}
                  aria-label="I have enough — lock it in and prepare to generate"
                >
                  <Clapperboard size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span className="font-body text-meta font-medium">I have enough — generate</span>
                </Button>
              );
            })()}
          </motion.footer>
        ) : null}
      </motion.div>
    </motion.aside>
  );
}
