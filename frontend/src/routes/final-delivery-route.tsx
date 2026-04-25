import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Link2, ExternalLink, ArrowRight, Loader2 } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { Button } from "@/components/ui/button";
import { useScrollVelocity } from "@/lib/use-scroll-velocity";
import { api, ApiError } from "@/lib/api";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * The exhale. The delivery. The screen the user shares.
 *
 * Choreography (see docs/FINAL_DELIVERY.md §2–§4):
 *   0.00s   Route mounts on bg-bg-base. The "fade-to-cinema" is the
 *           absence of route transition + the content's own staggered
 *           entrance. No black-overlay div needed.
 *   0.15s   "Your cinematic." headline slides up + fades in (filmIn 0.72s).
 *   0.35s   Player fades in.
 *   0.55s   Three actions cascade.
 *
 * Subtle parallax (§8): as the user scrolls, the player drifts up
 * 0 → -20px Y via window-bound useScrollVelocity. Disabled under
 * prefers-reduced-motion.
 */
export function FinalDeliveryRoute() {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const reset = useBeatGraphStore((s) => s.reset);
  const resetPrompt = usePromptStore((s) => s.reset);
  const reducedMotion = useReducedMotion();

  const [openingCutOS, setOpeningCutOS] = useState(false);
  const playerWrapRef = useRef<HTMLDivElement>(null);

  // Window-bound scroll velocity drives the parallax. The hook returns
  // a clamped progress 0..1 we read each RAF tick.
  const { progressRef, registerElement } = useScrollVelocity({ clamp: [0, 1] });
  useEffect(() => {
    return registerElement(window);
    // registerElement reads opts via closure — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const tick = () => {
      const el = playerWrapRef.current;
      if (el) {
        const offset = progressRef.current * -20;
        el.style.transform = `translate3d(0, ${offset}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, progressRef]);

  const finalUrl = manifest?.finalCloudinaryUrl;

  const handleCopy = useCallback(async () => {
    if (!finalUrl) return;
    await navigator.clipboard.writeText(finalUrl);
    toast.success("Share link copied");
  }, [finalUrl]);

  const handleCutOS = useCallback(async () => {
    if (!manifest || openingCutOS) return;
    setOpeningCutOS(true);
    try {
      const res = await api.cutosImport({ manifest });
      if (!res.editUrl) {
        toast.error("CutOS returned no edit URL");
        return;
      }
      window.open(res.editUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "CutOS handoff failed.");
    } finally {
      setOpeningCutOS(false);
    }
  }, [manifest, openingCutOS]);

  const handleMakeAnother = useCallback(() => {
    // Reset BOTH stores before navigate — landing reads from prompt store
    // for its initial draft. Stale state would leak into the next session.
    reset();
    resetPrompt();
    navigate("/");
  }, [reset, resetPrompt, navigate]);

  // Guard: if there's no rendered cinematic, this route shouldn't be visible.
  if (!manifest || !finalUrl) {
    return <Navigate to="/" replace />;
  }

  // Append fl_attachment for forced download. Cloudinary's transform tells
  // its CDN to set Content-Disposition: attachment. Idempotent — if the URL
  // already has the transform we don't double-stamp it.
  const downloadUrl = finalUrl.includes("fl_attachment")
    ? finalUrl
    : finalUrl.replace("/upload/", "/upload/fl_attachment/");

  const beatList = manifest.beats;

  return (
    // MotionConfig reducedMotion="user" makes every motion.X inside this
    // route auto-degrade transform animations to opacity when the user
    // prefers reduced motion. Opacity-only fades are WCAG-acceptable; the
    // transforms (y: 24, scale: 0.985) are the parts we suppress.
    <MotionConfig reducedMotion="user">
    <main className="film-grain relative min-h-screen overflow-x-hidden bg-bg-base px-6 py-16">
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative z-10 mx-auto flex max-w-[80rem] flex-col items-center gap-10 text-center"
      >
        <div className="space-y-3">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.1 }}
            className="font-mono text-[11px] uppercase tracking-[0.32em] text-fg-tertiary"
          >
            Delivered · {manifest.videoType} · {formatDuration(manifest.durationSeconds)}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.15 }}
            className="text-display-lg italic text-fg-primary"
          >
            Your cinematic.
          </motion.h1>
        </div>

        {/* 70vw player; capped on very wide viewports. The wrapping div is
            the parallax target — VideoPlayer keeps its own internal layout. */}
        <motion.div
          ref={playerWrapRef}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.35 }}
          // 70vw at desktop; on narrow viewports the player stretches to
          // 90vw so it doesn't shrink to a postage stamp on mobile.
          className="w-[90vw] max-w-[1200px] sm:w-[70vw]"
          style={{ willChange: "transform" }}
        >
          <VideoPlayer
            src={finalUrl}
            suggestedDurationSeconds={manifest.durationSeconds}
            autoPlay
            muted={false}
            caption="Final cut · Cloudinary fl_splice"
          />
        </motion.div>

        {/* Three actions — Download primary, Share + CutOS ghost. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.55 }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChild size="lg" variant="primary">
            <a href={downloadUrl} download>
              <Download size={16} strokeWidth={1.5} aria-hidden="true" />
              Download MP4
            </a>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={handleCopy}
            className="btn--edge-underline"
          >
            <Link2 size={16} strokeWidth={1.5} aria-hidden="true" />
            Copy share link
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={handleCutOS}
            disabled={openingCutOS}
            className="btn--edge-underline"
          >
            {openingCutOS ? (
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            {openingCutOS ? "Opening CutOS…" : "Open in CutOS"}
          </Button>
        </motion.div>
      </motion.section>

      {/* Below-the-fold metadata — gives the parallax something to scroll past
          and documents what was made. Mono / quiet by design. */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATIONS.cinematic, delay: 0.8 }}
        className="relative z-10 mx-auto mt-32 grid max-w-[64rem] gap-10 pb-16"
      >
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">
            Master prompt
          </div>
          <p className="max-w-prose font-mono text-sm leading-relaxed text-fg-secondary">
            {manifest.masterPrompt}
          </p>
        </div>

        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">
            Beat manifest
          </div>
          <ol className="divide-y divide-fg-tertiary/15 border-y border-fg-tertiary/15">
            {beatList.map((b, i) => {
              // Prefer the scene's actual refined duration; fall back to
              // the archetype's suggested length only if the agent didn't
              // refine it.
              const dur = b.scenes[0]?.durationSeconds ?? b.archetype.suggestedDuration;
              return (
                <li
                  key={b.beatId}
                  className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-4 py-3 font-mono text-xs"
                >
                  <span className="text-fg-tertiary tabular-nums">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <span>
                    <span className="text-fg-primary">{b.beatName}</span>
                    <span className="ml-2 text-fg-tertiary">· {b.archetype.mood}</span>
                  </span>
                  <span className="text-fg-tertiary tabular-nums">{dur}s</span>
                </li>
              );
            })}
          </ol>
        </div>
      </motion.section>

      {/* "Make another" — bottom-right ghost, returns to landing with a clean store. */}
      <motion.button
        type="button"
        onClick={handleMakeAnother}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.0 }}
        className={cn(
          "btn--edge-underline group fixed bottom-6 right-6 z-20 inline-flex items-center gap-2",
          "rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-[0.28em]",
          "text-fg-tertiary transition-colors duration-200 hover:text-fg-primary",
        )}
      >
        Make another
        <ArrowRight
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </motion.button>
    </main>
    </MotionConfig>
  );
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  if (mm === 0) return `${ss}s`;
  return `${mm}m ${ss.toString().padStart(2, "0")}s`;
}
