import { Suspense, lazy, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { LocateFixed } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { NodeDetailDrawer } from "@/components/node/node-detail-drawer";
import { StitchTray } from "@/components/stitch/stitch-tray";
import { PersistentUrlStrip } from "@/components/stitch/persistent-url-strip";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import { DecomposeIndicator } from "@/components/canvas/decompose-indicator";
import { RESET_CAMERA_EVENT } from "@/components/canvas/beat-map-3d";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { startAmbientProjector } from "@/lib/audio-cues";

const BeatMap3D = lazy(() =>
  import("@/components/canvas/beat-map-3d").then((m) => ({ default: m.BeatMap3D })),
);

export function CanvasRoute() {
  const manifest = useBeatGraphStore((s) => s.manifest);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  // Stitch-tray state lives in the store (not local) so the canvas tree —
  // specifically NodeMesh's label-hiding — can react to it without prop
  // drilling. Recent refactor; see beat-graph-store.ts.
  const stitchOpen = useBeatGraphStore((s) => s.stitchTrayOpen);
  const setStitchOpen = useBeatGraphStore((s) => s.setStitchTrayOpen);
  const { masterPrompt } = usePromptStore();

  // Ambient projector loop. Fades in over 0.8s, fades out over 0.6s.
  // Mute is checked at start time only — toggling mid-canvas doesn't
  // affect this loop (acceptable for demo).
  useEffect(() => {
    const stop = startAmbientProjector();
    return stop;
  }, []);

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
    <main className="relative h-screen w-screen overflow-hidden bg-bg-base">
      <CanvasErrorBoundary>
        <Suspense fallback={<CanvasFallback />}>
          <BeatMap3D beats={manifest.beats} />
        </Suspense>
      </CanvasErrorBoundary>

      {/* Chrome cards — stack vertically on <md (issue #153). On a 375px
          viewport the master-prompt card (max-w-md) + stitch button width
          collide; stacking puts master-prompt full-width and stitch under it. */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between md:p-6"
      >
        <div className="pointer-events-auto w-full max-w-md rounded-md border border-fg-tertiary/25 bg-bg-elev-1/75 px-4 py-3 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] transition-colors md:w-auto">
          <div className="caption-track text-[10px] text-fg-tertiary">
            <span className="text-brand-ember">●</span>
            <span className="ml-2">{manifest.videoType}</span>
          </div>
          <p className="mt-1.5 line-clamp-1 max-w-prose font-display text-base italic leading-snug text-fg-primary md:line-clamp-2">
            {masterPrompt}
          </p>
          <DecomposeIndicator />
        </div>

        <button
          onClick={() => setStitchOpen(!stitchOpen)}
          aria-label={`Open stitch tray — ${approvedCount} of ${totalCount} beats ready`}
          className="pointer-events-auto group min-h-11 w-full rounded-md border border-fg-tertiary/25 bg-bg-elev-1/75 px-4 py-3 text-left backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] transition-colors duration-200 hover:border-brand-ember/60 hover:bg-bg-elev-1/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base md:w-auto"
        >
          <div className="caption-track text-[10px] text-fg-tertiary transition-colors group-hover:text-brand-ember/90">
            Stitch
          </div>
          <div className="mt-1.5 font-display text-base italic text-fg-primary tabular-nums">
            {approvedCount} of {totalCount}
          </div>
        </button>
      </motion.div>

      {/* Beat-status pips — sits ABOVE the persistent URL strip (URL strip is
          bottom-12, pips at bottom-24) so the two don't crowd each other on
          narrow viewports. The pips are aria-hidden because they duplicate
          the same info as the stitch button "X of Y" count. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center gap-1.5"
      >
        {manifest.beats.map((b) => (
          <span
            key={b.beatId}
            className={`h-1 w-10 rounded-full transition-colors duration-300 ${
              b.status === "approved"
                ? "bg-brand-ember"
                : b.status === "preview" || b.status === "generating"
                ? "bg-brand-ember/50"
                : "bg-fg-tertiary/30"
            }`}
          />
        ))}
      </div>

      {/* Always-visible URL strip — Cloudinary track-hero feature is no
          longer hidden behind the stitch tray (VIABILITY V2 / issue #072). */}
      <PersistentUrlStrip onOpenTray={() => setStitchOpen(true)} />

      {/* Re-center affordance — bottom-right corner. Subdued by default,
          ember on hover. Always available; the keyboard shortcut (Esc) is
          power-user, this is discoverable. Hidden when the stitch tray is
          open (it would overlap). */}
      {!stitchOpen ? (
        <button
          type="button"
          onClick={recenterCamera}
          aria-label="Re-center camera (Esc)"
          title="Re-center camera (Esc)"
          className="pointer-events-auto group fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-fg-tertiary/25 bg-bg-elev-1/70 px-3 py-1.5 caption-track text-[10px] text-fg-tertiary backdrop-blur-xl transition-colors duration-200 hover:border-brand-ember/60 hover:bg-bg-elev-1/85 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <LocateFixed size={12} strokeWidth={1.5} aria-hidden="true" />
          <span>Re-center</span>
          <span className="ml-1 hidden text-fg-tertiary/60 sm:inline">⎋</span>
        </button>
      ) : null}

      <AnimatePresence>{activeBeatId ? <NodeDetailDrawer key={activeBeatId} /> : null}</AnimatePresence>

      <AnimatePresence>{stitchOpen ? <StitchTray onClose={() => setStitchOpen(false)} /> : null}</AnimatePresence>
    </main>
    </MotionConfig>
  );
}

function CanvasFallback() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="caption-track text-[10px] text-fg-tertiary">
        Composing the canvas
      </div>
    </div>
  );
}

function CanvasMissingManifestFallback() {
  return (
    <main className="grid min-h-screen w-screen place-items-center bg-bg-base p-8">
      <div className="max-w-md space-y-5 text-center">
        <div className="caption-track text-[10px] text-fg-tertiary">No active project</div>
        <h2 className="font-display text-display-md italic leading-snug text-fg-primary">
          Start with a sentence.
        </h2>
        <p className="font-body text-body-sm leading-relaxed text-fg-secondary">
          The canvas reads from your project. Head back to the landing page and
          tell us what you're directing.
        </p>
        <Link
          to="/"
          className="btn--edge-underline inline-flex items-center gap-2 rounded-md border border-fg-tertiary/40 px-4 py-2 caption-track text-[10px] text-fg-secondary transition-colors hover:border-brand-ember hover:text-brand-ember"
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
        <div className="caption-track text-[10px] text-state-error">Stale project state</div>
        <h2 className="font-display text-display-md italic leading-snug text-fg-primary">
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
          className="btn--edge-underline inline-flex items-center gap-2 rounded-md border border-fg-tertiary/40 px-4 py-2 caption-track text-[10px] text-fg-secondary transition-colors hover:border-brand-ember hover:text-brand-ember"
        >
          Reset and restart
        </button>
      </div>
    </main>
  );
}
