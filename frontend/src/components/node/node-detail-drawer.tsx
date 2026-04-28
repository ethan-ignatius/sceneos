import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Clapperboard, ChevronRight, Volume2 } from "lucide-react";
import { useBeatGraphStore, selectActiveBeat, EMPTY_BEAT_RUNTIME } from "@/stores/beat-graph-store";
import { AgentBubbleStream } from "@/components/agent/agent-bubble-stream";
import { GenerationPanel } from "./generation-panel";
import { ClipPreview } from "./clip-preview";
import { Button } from "@/components/ui/button";
import { DURATIONS, EASE, SPRING, STAGGER } from "@/lib/motion-presets";
import { api, ApiError } from "@/lib/api";
import { nowISO, sleep } from "@/lib/utils";
import { useNarration, useNarrationStore } from "@/lib/use-narration";
import { isDemoMode, demoRenderTotalSeconds, getDemoBeatTargetPublicId } from "@/lib/demo-mode";
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
  // Per-beat runtime store actions — let runtime survive drawer mount
  // cycles. Without this, navigating Planet 1 → 2 → 1 wipes provider /
  // stage / sample history even though the backend job is still running.
  const setBeatRuntimeAction = useBeatGraphStore((s) => s.setBeatRuntime);

  const narration = useNarration();

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
  // Target Cloudinary publicId for the active beat — surfaced by
  // GenerationPanel's CloudinaryTrace so the reveal lands on a stable
  // string instead of waiting for /api/status. Loaded async because
  // the demo fixture import is dynamic. Null in non-demo mode.
  const [demoTargetPublicId, setDemoTargetPublicId] = useState<string | null>(null);
  useEffect(() => {
    if (!beat || !manifest) {
      setDemoTargetPublicId(null);
      return;
    }
    const idx = manifest.beats.findIndex((b) => b.beatId === beat.beatId);
    if (idx < 0) return;
    let active = true;
    void getDemoBeatTargetPublicId(idx).then((id) => {
      if (active) setDemoTargetPublicId(id);
    });
    return () => {
      active = false;
    };
  }, [beat?.beatId, manifest]);
  const [statusSamples, setStatusSamples] = useState<
    Array<{ atMs: number; status: string; stage?: string | null; pollAfterMs?: number | null }>
  >([]);
  const [dispatchMs, setDispatchMs] = useState<number | null>(null);
  // Locks the "I have enough — generate" button while the markSufficient
  // round-trip is in flight. Without it, double-clicks spam the canned
  // "OK — that's enough" instruction into the agent stream multiple
  // times before the first call resolves (Image #47 from the user).
  const [lockingIn, setLockingIn] = useState(false);
  // Set to true on unmount; the polling loop checks each iteration so an
  // orphaned poll can't write to a stale beat after the drawer closes.
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    return () => {
      cancelRef.current = true;
    };
  }, []);

  // Hydrate runtime state from the store when the active beat changes.
  // Without this, navigating Planet 1 → Planet 2 → Planet 1 leaves the
  // drawer showing Planet 2's stale provider/stage/samples (or empty
  // initial values) until the next status poll arrives. The store keeps
  // a per-beat runtime snapshot that we restore on each beat switch.
  // Tracked via a ref so the mirror effect below doesn't write back
  // BEFORE we've hydrated (would clobber the persisted runtime with
  // empty initial state).
  const hydratedBeatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = beat?.beatId;
    if (!id) {
      hydratedBeatIdRef.current = null;
      return;
    }
    if (hydratedBeatIdRef.current === id) return;
    const r = useBeatGraphStore.getState().beatRuntime[id] ?? EMPTY_BEAT_RUNTIME;
    setProvider(r.provider);
    setProviderStage(r.providerStage);
    setStartedAt(r.startedAt);
    setLatestStatus(r.latestStatus);
    setStatusSamples(r.statusSamples);
    setDispatchMs(r.dispatchMs);
    setFallbackFrom(r.fallbackFrom);
    setGenError(r.genError);
    setLockingIn(r.lockingIn);
    hydratedBeatIdRef.current = id;
  }, [beat?.beatId]);

  // Mirror local runtime back to the store on every change. Only fires
  // AFTER hydration for the current beat so we never overwrite an active
  // beat's persisted runtime with empty initial state during the brief
  // window between component render and the hydrate effect running.
  useEffect(() => {
    const id = beat?.beatId;
    if (!id || hydratedBeatIdRef.current !== id) return;
    setBeatRuntimeAction(id, {
      provider,
      providerStage,
      startedAt,
      latestStatus,
      statusSamples,
      dispatchMs,
      fallbackFrom,
      genError,
      lockingIn,
    });
  }, [
    beat?.beatId,
    provider,
    providerStage,
    startedAt,
    latestStatus,
    statusSamples,
    dispatchMs,
    fallbackFrom,
    genError,
    lockingIn,
    setBeatRuntimeAction,
  ]);

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
        let status: StatusResponse;
        try {
          status = await api.status(jobId);
        } catch (err) {
          if (cancelRef.current) return;
          // 404 on the status endpoint = backend lost the orchestrator
          // handle (server restart, eviction, manifest reset). Same
          // recovery as "Unknown vertex jobId" below — clear the stale
          // jobId so the drawer can re-dispatch on the next Roll camera
          // click. Surfacing the raw URL ("orch%3A%3A...failed: 404")
          // to the user reads as a server bug; treat it as a cold-start.
          if (err instanceof ApiError && err.status === 404) {
            updateScene(beatId, sceneId, {
              jobId: undefined,
              speculativeJobId: undefined,
            });
            throw new ApiError(
              0,
              "The previous render expired. Click Roll camera to start fresh.",
            );
          }
          throw err;
        }
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
        // source. Backend value wins over drawer-mount time. Also
        // persist on the scene so a drawer remount (user navigates
        // away mid-render and back) hydrates the progress bar at the
        // correct elapsed position immediately, instead of showing
        // "0s" for the 1.5-3s window before the next poll lands.
        if (status.startedAt) {
          setStartedAt((prev) => prev ?? status.startedAt!);
          const m = useBeatGraphStore.getState().manifest;
          const live = m?.beats
            .find((b) => b.beatId === beatId)
            ?.scenes.find((s) => s.sceneId === sceneId);
          if (live && !live.startedAt) {
            updateScene(beatId, sceneId, { startedAt: status.startedAt });
          }
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
          // Co-director reacts to the finished render
          const mNow = useBeatGraphStore.getState().manifest;
          const bNow = mNow?.beats.find((b) => b.beatId === beatId);
          if (mNow && bNow) {
            useNarrationStore.getState().playMoment("beat_complete", {
              beat: bNow, manifest: mNow, masterPrompt: mNow.masterPrompt,
            }, beatId);
          }
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
      // Prefer the backend's structured detail.error/details over the
      // generic ApiError.message ("API /api/orchestrate/... failed: 502").
      // The 502 detail body carries the cascade's real failure reason —
      // surfacing it lets the user see "Imagen quota exhausted" etc.
      // instead of an opaque 502.
      let msg = err instanceof ApiError ? err.message : "Generation hit a snag.";
      if (err instanceof ApiError && err.details && typeof err.details === "object") {
        const d = err.details as { detail?: { error?: string; details?: string } };
        const inner = d.detail?.error;
        const detail = d.detail?.details;
        if (inner) msg = detail ? `${inner} — ${detail}` : inner;
      }
      if (isContentPolicyError(msg)) {
        handleContentPolicyRecovery(beat.beatId, scene.sceneId);
      } else {
        setGenError(msg);
        updateBeat(beat.beatId, { status: "ready-to-generate" });
        // Auto-roll guard stays set — re-firing in a tight loop on the
        // same error would just hammer the backend. The user reclaims
        // the retry by clicking Roll camera (manual intent) OR by closing
        // and re-opening the drawer (the ref resets on remount and the
        // ready-to-generate effect auto-fires "Composing the camera.").
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

  // Auto-advance — when the beat is approved, wait a beat then
  // advance to the next pending beat OR open the stitch tray on the
  // last one. Manual "Next beat" button still exists as an override
  // during the wait window.
  //
  // Bumped from 1.6s → 3.0s after the user flagged "instantly backs
  // out of a node after generation" — 1.6s clipped past the approval
  // chime and the green ✓ animation before the eye registered them.
  // 3s is long enough that the user reads "Approved" + the
  // refinedPrompt and feels the take land before the drawer slides
  // to the next beat.
  const autoAdvancedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || beat.status !== "approved") return;
    const key = beat.beatId;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    const t = window.setTimeout(() => {
      handleGoNext();
    }, 3000);
    return () => window.clearTimeout(t);
  }, [beat, handleGoNext]);

  // Fire-and-forget beat narration when the drawer opens for a new beat.
  // Skip if another narration (prompt_reaction, decompose_intro) is still playing
  // to avoid cutting off the co-director mid-sentence.
  const narrationBeatId = beat?.beatId;
  const narrationStatus = useNarrationStore((s) => s.status);
  const narrationMoment = useNarrationStore((s) => s.currentMoment);
  useEffect(() => {
    if (!narrationBeatId || !manifest) return;
    // Don't interrupt intro narrations — they set the scene
    if (
      (narrationStatus === "playing" || narrationStatus === "loading") &&
      (narrationMoment === "prompt_reaction" || narrationMoment === "decompose_intro")
    ) {
      return;
    }
    narration.stop();
    narration.playBeatNarration(narrationBeatId, manifest);
    return () => {
      narration.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationBeatId]);

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
            <AnimatePresence>
              {narration.status === "playing" && narration.currentBeatId === beat.beatId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE.outQuart }}
                  className="mt-2 flex items-center gap-2"
                >
                  <Volume2 size={14} className="shrink-0 text-brand-ember" />
                  <div className="flex items-center gap-[3px]">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.span
                        key={i}
                        className="inline-block w-[2px] rounded-full bg-brand-ember"
                        animate={{ height: [3, 10, 3] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {narration.currentText && narration.currentBeatId === beat.beatId && (narration.status === "playing" || narration.status === "done") && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 0.7, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4, ease: EASE.outQuart }}
                  className="mt-1.5 font-body text-body-sm italic leading-snug text-fg-secondary"
                >
                  {narration.currentText}
                </motion.p>
              )}
            </AnimatePresence>
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
              totalEstSeconds={isDemoMode() ? demoRenderTotalSeconds() : null}
              cloudinaryPublicId={
                latestStatus?.clipPublicId ?? demoTargetPublicId ?? null
              }
              // Prefer the persisted scene.startedAt — that's set on
              // first poll AND survives drawer-unmount/remount, so the
              // progress bar lights up at the correct elapsed value
              // instantly. Local startedAt is the secondary source for
              // first-mount-before-first-poll cases.
              startedAt={beat.scenes[0]?.startedAt ?? startedAt}
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

              const lockIn = async () => {
                if (!manifest || lockingIn) return;
                const scene = beat.scenes[0];
                // Force the agent to emit markSufficient. The canned
                // "OK — that's enough" string is a SYSTEM instruction
                // sent through the userMessage channel — not a real
                // user dialogue line. We deliberately do NOT append it
                // to the visible conversation (was the screen-spam bug:
                // every click of the button stamped a duplicate user
                // bubble even when the agent stream errored). The
                // agent only needs it as a streamed userMessage to
                // trigger forceMarkSufficient.
                setGenError(null);
                setLockingIn(true);
                let sufficient = false;
                try {
                  for await (const ev of api.agentStream({
                    manifest,
                    beatId: beat.beatId,
                    userMessage: "OK — that's enough. Wrap this beat now.",
                    forceMarkSufficient: true,
                  })) {
                    if (cancelRef.current) return;
                    if (ev.type === "result" && ev.kind === "sufficient") {
                      updateScene(beat.beatId, scene.sceneId, {
                        refinedPrompt: ev.refinedPrompt,
                        durationSeconds: ev.suggestedDuration,
                        beatFacts: ev.beatFacts,
                        speculativeJobId: undefined,
                        jobId: undefined,
                        clipPublicId: undefined,
                        clipUrl: undefined,
                        lastFrameUrl: undefined,
                      });
                      appendAgentTurn(beat.beatId, scene.sceneId, {
                        role: "agent",
                        content: `Cued. ${ev.sceneSummary}. Call action when ready.`,
                        timestamp: nowISO(),
                      });
                      updateBeat(beat.beatId, { status: "ready-to-generate" });
                      // Narrate the lock-in moment so the user hears
                      // "we got it" instead of a silent state-flip.
                      // useNarrationStore is the concurrent ElevenLabs
                      // hook; the playMoment helper resolves the right
                      // line for this transition.
                      if (manifest) {
                        useNarrationStore.getState().playMoment("beat_locked", {
                          beat, manifest, masterPrompt: manifest.masterPrompt,
                        }, beat.beatId);
                      }
                      sufficient = true;
                      return;
                    }
                    if (ev.type === "error") {
                      // Don't surface the cryptic Gemini error; fall through
                      // to the synthesized fallback below so the user can
                      // still proceed.
                      break;
                    }
                  }
                } catch {
                  if (cancelRef.current) return;
                  // Network / abort — fall through to fallback.
                }

                if (sufficient || cancelRef.current) return;

                // ── Stream-failure fallback ────────────────────────
                // Agent failed (Gemini cold-retry exhausted, network
                // blip, etc.). Rather than dead-end the user with a
                // red error and a duplicate "OK — that's enough"
                // bubble, synthesize a refinedPrompt locally from the
                // beat archetype + the user's actual answers. This
                // skips beatFacts (continuity for LATER beats may
                // degrade slightly), but unblocks the demo flow —
                // better partial continuity than total stuck.
                const userAnswers = scene.conversation
                  .filter((t) => t.role === "user")
                  .map((t) => t.content)
                  .join(". ");
                const synthesizedPrompt = [
                  beat.archetype.intent,
                  beat.archetype.directorNotes ?? "",
                  userAnswers ? `Director's notes: ${userAnswers}.` : "",
                  `Mood ${beat.archetype.mood}; cinematic, ~${beat.archetype.suggestedDuration}s.`,
                ]
                  .filter(Boolean)
                  .join(" ");
                updateScene(beat.beatId, scene.sceneId, {
                  refinedPrompt: synthesizedPrompt,
                  durationSeconds: beat.archetype.suggestedDuration,
                  speculativeJobId: undefined,
                  jobId: undefined,
                  clipPublicId: undefined,
                  clipUrl: undefined,
                  lastFrameUrl: undefined,
                });
                appendAgentTurn(beat.beatId, scene.sceneId, {
                  role: "agent",
                  content: "Cued from your notes. Call action when ready.",
                  timestamp: nowISO(),
                });
                updateBeat(beat.beatId, { status: "ready-to-generate" });
              };
              return (
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={lockingIn}
                  className="w-full justify-center border-brand-ember/55 text-fg-primary hover:bg-brand-ember/10 hover:text-brand-ember disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void (async () => {
                      try {
                        await lockIn();
                      } finally {
                        if (!cancelRef.current) setLockingIn(false);
                      }
                    })();
                  }}
                  aria-label={lockingIn ? "Wrapping the beat" : "I have enough — lock it in and prepare to generate"}
                  aria-busy={lockingIn}
                >
                  <Clapperboard size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span className="font-body text-meta font-medium">
                    {lockingIn ? "Wrapping the beat…" : "I have enough — generate"}
                  </span>
                </Button>
              );
            })()}
          </motion.footer>
        ) : null}
      </motion.div>
    </motion.aside>
  );
}
