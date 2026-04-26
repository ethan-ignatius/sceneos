import { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { LogOut, FolderClock } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { NodeDetailDrawer } from "@/components/node/node-detail-drawer";
import { StitchTray } from "@/components/stitch/stitch-tray";
import { PersistentUrlStrip } from "@/components/stitch/persistent-url-strip";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import { DecomposeIndicator } from "@/components/canvas/decompose-indicator";
import { Minimap } from "@/components/canvas/minimap";
import { RESET_CAMERA_EVENT } from "@/components/canvas/beat-map-events";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { startAmbientProjector } from "@/lib/audio-cues";
import { api } from "@/lib/api";
import { sleep } from "@/lib/utils";

const BeatMap3D = lazy(() =>
  import("@/components/canvas/beat-map-3d").then((m) => ({ default: m.BeatMap3D })),
);

export function CanvasRoute() {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  // Stitch-tray state lives in the store (not local) so the canvas tree —
  // specifically NodeMesh's label-hiding — can react to it without prop
  // drilling. Recent refactor; see beat-graph-store.ts.
  const stitchOpen = useBeatGraphStore((s) => s.stitchTrayOpen);
  const setStitchOpen = useBeatGraphStore((s) => s.setStitchTrayOpen);
  // Minimap is now opt-in chrome via the command palette ("Toggle overview").
  // Default false; the canvas reads as a clean cinematic on first land.
  const minimapOpen = useBeatGraphStore((s) => s.minimapOpen);
  // reset() now archives the current manifest before clearing — driving the
  // /projects history. Save & exit = reset + return to landing.
  const reset = useBeatGraphStore((s) => s.reset);
  const saveAndExit = useCallback(() => {
    reset();
    navigate("/");
  }, [reset, navigate]);

  // Ambient projector loop. Fades in over 0.8s, fades out over 0.6s.
  // Mute is checked at start time only — toggling mid-canvas doesn't
  // affect this loop (acceptable for demo).
  useEffect(() => {
    const stop = startAmbientProjector();
    return stop;
  }, []);

  // ── Speculative-job poller ─────────────────────────────────────────
  // The landing route fires /api/generate for every beat the moment
  // /api/decompose returns refinedPrompts. Each pre-bake jobId is parked
  // on `scene.speculativeJobId`. Here we poll every active jobId at the
  // canvas-route level so the polls survive drawer mount/unmount as the
  // user navigates between beats.
  //
  // When a speculative job succeeds:
  //   - clipPublicId / clipUrl are written onto the scene
  //   - speculativeJobId is cleared (so we stop polling)
  //   - beat.status remains pending — agent conversation UX is unchanged
  //
  // The drawer's "I have enough — generate" / "Roll camera" handlers
  // check for an existing clipPublicId first; if present, the beat
  // flips straight to "preview" with no second Veo round-trip.
  const polledJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;

    const pollOne = async (
      beatId: string,
      sceneId: string,
      jobId: string,
    ) => {
      let delay = 1500;
      const startMs = Date.now();
      while (!cancelled) {
        if (Date.now() - startMs > 8 * 60_000) return; // 8 min ceiling
        await sleep(delay);
        if (cancelled) return;
        try {
          const status = await api.status(jobId);
          if (cancelled) return;
          if (status.status === "succeeded") {
            useBeatGraphStore.getState().updateScene(beatId, sceneId, {
              clipPublicId: status.clipPublicId,
              clipUrl: status.clipUrl,
              speculativeJobId: undefined,
            });
            return;
          }
          if (status.status === "failed") {
            // Drop the speculative jobId; the user can still trigger a
            // fresh render manually. Don't write any error state — this
            // is best-effort speculative compute.
            useBeatGraphStore
              .getState()
              .updateScene(beatId, sceneId, { speculativeJobId: undefined });
            return;
          }
          delay = status.pollAfterMs ?? 5000;
        } catch {
          // Transient network blip — back off and try again. The 8min
          // ceiling above bounds the loop.
          delay = Math.min(delay * 1.5, 15000);
        }
      }
    };

    for (const beat of manifest.beats) {
      const scene = beat.scenes[0];
      if (!scene?.speculativeJobId) continue;
      // Don't double-attach: each (beatId, jobId) pair only polls once
      // per canvas mount.
      const key = `${beat.beatId}:${scene.speculativeJobId}`;
      if (polledJobsRef.current.has(key)) continue;
      polledJobsRef.current.add(key);
      void pollOne(beat.beatId, scene.sceneId, scene.speculativeJobId);
    }

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  // Auto-advance through pending beats. Whenever the user is on the
  // overview (no active beat, no stitch tray) and at least one beat is
  // still pending, after a 2s breath the camera glides into the next
  // pending beat and opens its drawer.
  //
  // Lifecycle:
  //   - First mount → 2s breath → first pending beat opens.
  //   - User approves a beat → drawer auto-closes (effect below) →
  //     2s breath → next pending beat opens.
  //   - User can hit Esc, click empty canvas, or click another beat to
  //     break the loop; the next overview moment re-arms it.
  //
  // We only advance to beats whose status is "pending" or "questioning"
  // — anything past "ready-to-generate" already has a clip in flight or
  // approved, so re-opening it would feel like a regression.
  useEffect(() => {
    if (!manifest) return;
    if (activeBeatId) return; // drawer is already open
    if (stitchOpen) return; // stitch tray is open, hold off
    const nextPending = manifest.beats.find(
      (b) => b.status === "pending" || b.status === "questioning",
    );
    if (!nextPending) return; // every beat past pending — nothing to advance to
    const t = window.setTimeout(() => {
      // Re-check at fire time: the user may have clicked something
      // during the 2s wait.
      const live = useBeatGraphStore.getState();
      if (live.activeBeatId || live.stitchTrayOpen) return;
      setActiveBeat(nextPending.beatId);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [manifest, activeBeatId, stitchOpen, setActiveBeat]);

  // Auto-close the drawer once the active beat is approved. Pairs with
  // the auto-advance above: approve → 1.2s breath on the preview →
  // drawer closes → 2s on the overview → next pending beat opens.
  // The 1.2s lets the approval animation land before we whisk away.
  useEffect(() => {
    if (!manifest) return;
    if (!activeBeatId) return;
    const active = manifest.beats.find((b) => b.beatId === activeBeatId);
    if (!active || active.status !== "approved") return;
    const t = window.setTimeout(() => {
      const live = useBeatGraphStore.getState();
      // Bail if the user already navigated elsewhere themselves.
      if (live.activeBeatId !== activeBeatId) return;
      setActiveBeat(null);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [manifest, activeBeatId, setActiveBeat]);

  // Re-center: clear active beat AND fire the camera-reset event so
  // BeatMap3D zeros any pan offset. One operation, two effects.
  const recenterCamera = useCallback(() => {
    if (activeBeatId) setActiveBeat(null);
    window.dispatchEvent(new CustomEvent(RESET_CAMERA_EVENT));
  }, [activeBeatId, setActiveBeat]);

  // Esc key returns to overview from anywhere — including mid-pan, mid-
  // active-orbit, or while a stitch tray is open. Closes stitch tray
  // first if open (most-recent-modal-wins convention); otherwise re-centers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stitchOpen) {
        setStitchOpen(false);
        return;
      }
      recenterCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stitchOpen, recenterCamera]);

  // Visible fallback instead of a silent <Navigate>. The previous behaviour
  // was: no manifest → redirect to "/" → page-crumple bg flashed dark, which
  // read as "black canvas" rather than "you skipped the landing flow."
  if (!manifest) return <CanvasMissingManifestFallback />;

  // Stale-shape guard. A persisted manifest from a prior schema version may
  // deserialize with `beats: undefined` or no entries. Surface that explicitly
  // rather than letting BeatMap3D blow up inside R3F's render loop.
  if (!Array.isArray(manifest.beats) || manifest.beats.length === 0) {
    return <CanvasEmptyBeatsFallback />;
  }

  const approvedCount = manifest.beats.filter((b) => b.status === "approved").length;
  const totalCount = manifest.beats.length;

  return (
    // MotionConfig auto-degrades transform animations to opacity under
    // prefers-reduced-motion. The drawer slide, agent bubble enter,
    // generation panel layoutId dot, and stitch-tray slide all benefit.
    // R3F-driven animations (camera breath, sparkles drift) are gated
    // separately inside their components via matchMedia.
    <MotionConfig reducedMotion="user">
    {/* select-none on the canvas main: drag-pan over the chrome (Save &
        exit, Stitch pill, planet name labels, etc.) was triggering text
        selection that stuck until the user clicked elsewhere. The 3D
        canvas + chrome is a viewport, not a document — nothing here is
        meant to be copied. The drawer + URL strip opt back in via
        select-text on their own roots. */}
    <main className="relative h-screen w-screen select-none overflow-hidden bg-bg-base">
      <CanvasErrorBoundary>
        <Suspense fallback={<CanvasFallback />}>
          <BeatMap3D beats={manifest.beats} />
        </Suspense>
      </CanvasErrorBoundary>

      {/* Apple-philosophy chrome: minimal, glass, only what's necessary.
          Master-prompt card was decorative — the user typed it; surfacing
          it as a header card was self-congratulatory chrome. Dropped.

          Top-right: a single compact rounded-full pill — Stitch progress.
          That's it. The decompose indicator floats as a thin top-edge bar
          while the API call is in flight, then disappears. */}
      {/* Stitch pill hidden while the tray is open — the tray's own
          header already shows the count and the open/close affordance,
          so leaving the pill visible was a doubled card stacked over
          the tray edge. AnimatePresence fades it out cleanly. */}
      <AnimatePresence>
      {!stitchOpen ? (
      <motion.div
        key="stitch-pill"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="pointer-events-none absolute right-4 top-4 z-20 md:right-6 md:top-5"
      >
        <button
          type="button"
          onClick={() => setStitchOpen(!stitchOpen)}
          aria-label={`Open stitch tray — ${approvedCount} of ${totalCount} beats ready`}
          className="pointer-events-auto group inline-flex min-h-10 items-center gap-3 rounded-full border border-fg-tertiary/18 bg-bg-elev-1/70 py-2 pl-4 pr-3.5 backdrop-blur-xl shadow-(--shadow-pill) transition-[border-color,background-color] duration-200 hover:border-brand-ember/45 hover:bg-bg-elev-1/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors ${
              approvedCount === totalCount && totalCount > 0
                ? "bg-brand-ember"
                : approvedCount > 0
                  ? "bg-brand-ember/60"
                  : "bg-fg-tertiary/40"
            }`}
          />
          <span className="font-body text-pill font-medium text-fg-secondary transition-colors group-hover:text-brand-ember/90">
            Stitch
          </span>
          {/* Count toned down — was font-display italic at 14px which read
              as a magazine pull-quote and pulled the eye too hard. Now
              plain body tabular-nums to match the "Save & exit" pill on
              the left and the StageIndicator's count. */}
          <span className="font-body text-pill tabular-nums text-fg-tertiary">
            {approvedCount}
            <span className="mx-1 text-fg-tertiary/45">/</span>
            {totalCount}
          </span>
        </button>
      </motion.div>
      ) : null}
      </AnimatePresence>

      {/* Decompose status — a thin self-contained bar at the top edge.
          On <md viewports the Save & exit (left) and Stitch (right) pills
          eat the full top row, so the centered indicator dropped DOWN
          ~14px below the chrome row instead of overlapping. Desktop
          keeps the original top-4 alignment so the row reads as one. */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center md:top-4">
        <DecomposeIndicator />
      </div>

      {/* BeatProgressStrip removed — it duplicated the global StageIndicator
          at top-center, producing the visible stack the user flagged.
          The StageIndicator already shows pipeline stage + progress count;
          the per-beat status is already conveyed by the planet visuals
          (atmosphere brightness, ✓ checkmark on labels, glow). */}

      {/* Top-left chrome — Save & exit + Projects. Archives the current
          manifest into /projects history (Save & exit) or jumps to the
          archive without disturbing current state (Projects). Subdued by
          default; lifts on hover. */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-1.5 md:left-6 md:top-5"
      >
        <button
          type="button"
          onClick={saveAndExit}
          aria-label="Save current project and return to landing"
          title="Save & exit"
          className="pointer-events-auto group inline-flex min-h-9 items-center gap-2 rounded-full border border-fg-tertiary/18 bg-bg-elev-1/70 px-3 py-1.5 backdrop-blur-xl transition-[border-color,background-color,color] duration-200 hover:border-fg-tertiary/40 hover:bg-bg-elev-1/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <LogOut size={11} strokeWidth={1.5} aria-hidden="true" className="text-fg-tertiary transition-colors group-hover:text-fg-secondary" />
          <span className="font-body text-pill font-medium text-fg-tertiary transition-colors group-hover:text-fg-secondary">
            Save &amp; exit
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/projects")}
          aria-label="Open projects archive"
          title="Projects"
          className="pointer-events-auto group inline-flex min-h-9 items-center gap-2 rounded-full border border-fg-tertiary/18 bg-bg-elev-1/70 px-3 py-1.5 backdrop-blur-xl transition-[border-color,background-color,color] duration-200 hover:border-fg-tertiary/40 hover:bg-bg-elev-1/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <FolderClock size={11} strokeWidth={1.5} aria-hidden="true" className="text-fg-tertiary transition-colors group-hover:text-fg-secondary" />
          <span className="font-body text-pill font-medium text-fg-tertiary transition-colors group-hover:text-fg-secondary">
            Projects
          </span>
        </button>
      </motion.div>

      {/* Always-visible URL strip — Cloudinary track-hero feature is no
          longer hidden behind the stitch tray (VIABILITY V2 / issue #072). */}
      <PersistentUrlStrip onOpenTray={() => setStitchOpen(true)} />

      {/* 2D top-down minimap — the React-Flow-style overview. Off by default
          (Tier 2 D4): the canvas reads cleaner as a cinematic when first
          loaded, and the L→R recession + connecting path already convey
          beat order. Toggled on demand from the command palette. */}
      {minimapOpen && !stitchOpen ? (
        <Minimap beats={manifest.beats} activeBeatId={activeBeatId} />
      ) : null}

      {/* Re-center button + control hint removed (Tier 2 D1, D2): both
          competed with the persistent URL strip and the stitch pill for
          attention without being primary affordances. Esc still re-centers
          (handler above), and the canvas's drag/scroll/⇧-orbit controls
          are discoverable on hover. The command palette (⌘K) surfaces
          re-center, mute, jump-to-beat, and overview-toggle for power use. */}

      <AnimatePresence>{activeBeatId ? <NodeDetailDrawer key={activeBeatId} /> : null}</AnimatePresence>

      <AnimatePresence>{stitchOpen ? <StitchTray onClose={() => setStitchOpen(false)} /> : null}</AnimatePresence>
    </main>
    </MotionConfig>
  );
}

/**
 * Loading state shown while the heavy R3F bundle + planet textures are
 * fetching. Reads as a film crew getting ready for a take, not a spinner:
 *   ●  Pulling focus.
 *      Loading the scene.
 *
 * The ember pulse provides forward motion; the display-italic line gives
 * the moment weight; the caption underneath says what's literally happening.
 * "Pulling focus" is a film-set call ("hold for focus") that happens to
 * also describe a 3D scene resolving — both meanings land.
 */
/**
 * Loading state. The visible content is delayed by 350ms — if the lazy
 * R3F bundle resolves faster than that (typical: bundle is preloaded
 * during the bridge so it lands warm), the user never sees a flash. If
 * the load is genuinely slow, the content fades in gracefully and
 * carries through to the canvas mount without a hard cut.
 *
 * Background is bg-bg-base — identical to the R3F Canvas's `<color>`
 * background — so the moment Suspense unmounts the fallback, the only
 * change is the planets ramping in via NodeMesh's intro animation;
 * there's no color shift, no dark gap.
 */
function CanvasFallback() {
  return (
    <div
      className="grid h-full w-full place-items-center bg-bg-base"
      style={{
        // 350ms delayed fade-in — under that threshold and the user
        // never sees the spinner at all.
        animation: "canvasFallbackIn 600ms ease 350ms forwards",
        opacity: 0,
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="ember-pulse h-2 w-2 rounded-full bg-brand-ember shadow-[0_0_18px_rgba(240,168,104,0.45)]"
        />
        <p className="font-body text-pill tracking-[0.04em] text-fg-tertiary/80">
          pulling focus
        </p>
      </div>
      {/* Inline keyframes to keep the fallback self-contained — no
          coupling to Tailwind config or global stylesheets. */}
      <style>{`@keyframes canvasFallbackIn { to { opacity: 1; } }`}</style>
    </div>
  );
}

function CanvasMissingManifestFallback() {
  return (
    <main className="grid min-h-screen w-screen place-items-center bg-bg-base p-8">
      <div className="max-w-md space-y-5 text-center">
        <div className="font-body text-pill font-medium text-fg-tertiary">No active project</div>
        <h2 className="text-balance font-display text-display-md italic leading-snug text-fg-primary">
          Start with a sentence.
        </h2>
        <p className="font-body text-body-sm leading-relaxed text-fg-secondary">
          The canvas reads from your project. Head back to the landing page and
          tell us what you're directing.
        </p>
        <Link
          to="/"
          className="btn--edge-underline inline-flex items-center gap-2 rounded-md border border-fg-tertiary/40 px-4 py-2 font-body text-pill font-medium text-fg-secondary transition-colors hover:border-brand-ember hover:text-brand-ember"
        >
          Back to landing
        </Link>
      </div>
    </main>
  );
}

function CanvasEmptyBeatsFallback() {
  const reset = useBeatGraphStore((s) => s.reset);
  return (
    <main className="grid min-h-screen w-screen place-items-center bg-bg-base p-8">
      <div className="max-w-md space-y-5 text-center">
        <div className="font-body text-pill font-medium text-state-error">Stale project state</div>
        <h2 className="text-balance font-display text-display-md italic leading-snug text-fg-primary">
          The manifest is empty.
        </h2>
        <p className="font-body text-body-sm leading-relaxed text-fg-secondary">
          Looks like a project from an older schema. Reset clears local storage
          and starts you fresh.
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            localStorage.removeItem("sceneos:prompt");
            location.href = "/";
          }}
          className="btn--edge-underline inline-flex items-center gap-2 rounded-md border border-fg-tertiary/40 px-4 py-2 font-body text-pill font-medium text-fg-secondary transition-colors hover:border-brand-ember hover:text-brand-ember"
        >
          Reset and restart
        </button>
      </div>
    </main>
  );
}
