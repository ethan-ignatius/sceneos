import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { NodeDetailDrawer } from "@/components/node/node-detail-drawer";
import { StitchTray } from "@/components/stitch/stitch-tray";
import { PersistentUrlStrip } from "@/components/stitch/persistent-url-strip";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import { DecomposeIndicator } from "@/components/canvas/decompose-indicator";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { startAmbientProjector } from "@/lib/audio-cues";

const BeatMap3D = lazy(() =>
  import("@/components/canvas/beat-map-3d").then((m) => ({ default: m.BeatMap3D })),
);

export function CanvasRoute() {
  const manifest = useBeatGraphStore((s) => s.manifest);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const { masterPrompt } = usePromptStore();
  const [stitchOpen, setStitchOpen] = useState(false);

  // Mount diagnostic — logs the canvas state on every mount so a black
  // screen has a paper trail in DevTools console.
  useEffect(() => {
    console.info("[CanvasRoute] mount", {
      hasManifest: !!manifest,
      beatCount: manifest?.beats?.length ?? 0,
      videoType: manifest?.videoType,
      masterPrompt: masterPrompt ? `${masterPrompt.slice(0, 60)}…` : "(empty)",
    });
  }, [manifest, masterPrompt]);

  // Ambient projector loop. Fades in over 0.8s, fades out over 0.6s.
  // Mute is checked at start time only — toggling mid-canvas doesn't
  // affect this loop (acceptable for demo).
  useEffect(() => {
    const stop = startAmbientProjector();
    return stop;
  }, []);

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
        <div className="pointer-events-auto w-full max-w-md rounded-md border border-fg-tertiary/25 bg-bg-elev-1/75 px-4 py-3 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] md:w-auto">
          <div className="caption-track text-[10px] text-fg-tertiary">
            Master prompt · {manifest.videoType}
          </div>
          <p className="mt-1.5 line-clamp-2 max-w-prose font-display text-base italic leading-snug text-fg-primary">
            {masterPrompt}
          </p>
          <DecomposeIndicator />
        </div>

        <button
          onClick={() => setStitchOpen((s) => !s)}
          className="pointer-events-auto group min-h-11 w-full rounded-md border border-fg-tertiary/25 bg-bg-elev-1/75 px-4 py-3 text-left backdrop-blur-xl transition-colors hover:border-brand-ember/60 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)] md:w-auto"
        >
          <div className="caption-track text-[10px] text-fg-tertiary group-hover:text-brand-ember/80 transition-colors">
            Stitch tray
          </div>
          <div className="mt-1.5 font-display text-base italic text-fg-primary tabular-nums">
            {approvedCount} of {totalCount} ready
          </div>
        </button>
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center gap-1.5">
        {manifest.beats.map((b) => (
          <span
            key={b.beatId}
            className={`h-1 w-12 rounded-full transition-colors duration-300 ${
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

      <AnimatePresence>{activeBeatId ? <NodeDetailDrawer key={activeBeatId} /> : null}</AnimatePresence>

      <AnimatePresence>{stitchOpen ? <StitchTray onClose={() => setStitchOpen(false)} /> : null}</AnimatePresence>
    </main>
    </MotionConfig>
  );
}

function CanvasFallback() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-fg-tertiary">
        Loading the canvas…
      </div>
    </div>
  );
}

function CanvasMissingManifestFallback() {
  return (
    <main className="grid min-h-screen w-screen place-items-center bg-bg-base p-8">
      <div className="max-w-lg space-y-4 text-center">
        <div className="caption-track text-[10px] text-fg-tertiary">No active project</div>
        <p className="font-display text-2xl italic leading-snug text-fg-primary">
          Start by writing a master prompt on the landing page.
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-fg-tertiary">
          /canvas reads from the beat-graph store. Nothing's there yet — that's
          why this page is empty. Head back to landing, type one sentence about
          the cinematic you're directing, and hit Start.
        </p>
        <Link
          to="/"
          className="inline-block rounded-md border border-fg-tertiary/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-secondary hover:border-brand-ember hover:text-brand-ember"
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
      <div className="max-w-lg space-y-4 text-center">
        <div className="caption-track text-[10px] text-state-error">Stale project state</div>
        <p className="font-display text-2xl italic leading-snug text-fg-primary">
          The stored manifest has no beats.
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-fg-tertiary">
          This usually means a persisted project from an older schema is loaded.
          Resetting clears localStorage and starts you fresh.
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            localStorage.removeItem("sceneos:prompt");
            location.href = "/";
          }}
          className="rounded-md border border-fg-tertiary/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-secondary hover:border-brand-ember hover:text-brand-ember"
        >
          Reset and restart
        </button>
      </div>
    </main>
  );
}
