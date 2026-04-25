import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { NodeDetailDrawer } from "@/components/node/node-detail-drawer";
import { StitchTray } from "@/components/stitch/stitch-tray";
import { PersistentUrlStrip } from "@/components/stitch/persistent-url-strip";
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

  // Ambient projector loop. Fades in over 0.8s, fades out over 0.6s.
  // Mute is checked at start time only — toggling mid-canvas doesn't
  // affect this loop (acceptable for demo).
  useEffect(() => {
    const stop = startAmbientProjector();
    return stop;
  }, []);

  if (!manifest) return <Navigate to="/" replace />;

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
      <Suspense fallback={<CanvasFallback />}>
        <BeatMap3D beats={manifest.beats} />
      </Suspense>

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
