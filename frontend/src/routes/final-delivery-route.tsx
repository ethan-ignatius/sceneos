import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Link2, ArrowRight, Copy, Check } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { Button } from "@/components/ui/button";
import { SparkleField } from "@/components/landing/sparkle-field";
import { useScrollVelocity } from "@/lib/use-scroll-velocity";
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
 *   0.55s   Two actions cascade.
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
  const [urlCopied, setUrlCopied] = useState(false);

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
    return () => {
      cancelAnimationFrame(raf);
      // Clear the inline transform so the player snaps back to its layout
      // position. Without this, toggling prefers-reduced-motion mid-session
      // leaves the parallax offset frozen — reads as a centering bug.
      const el = playerWrapRef.current;
      if (el) el.style.transform = "";
    };
  }, [reducedMotion, progressRef]);

  const finalUrl = manifest?.finalCloudinaryUrl;

  const handleCopy = useCallback(async () => {
    if (!finalUrl) return;
    await navigator.clipboard.writeText(finalUrl);
    toast.success("Cinematic shared.");
  }, [finalUrl]);

  const handleMakeAnother = useCallback(() => {
    // Reset BOTH stores before navigate — landing reads from prompt store
    // for its initial draft. Stale state would leak into the next session.
    reset();
    resetPrompt();
    navigate("/");
  }, [reset, resetPrompt, navigate]);

  // Guard: no manifest = no project at all; landing is the right home for
  // that. Has-manifest-but-no-finalUrl is the broken-feeling case (used to
  // bounce to / silently); give it a visible empty state instead.
  if (!manifest) {
    return <Navigate to="/" replace />;
  }
  if (!finalUrl) {
    return <FinalAwaitingRenderFallback />;
  }

  // Append fl_attachment for forced download. Cloudinary's transform tells
  // its CDN to set Content-Disposition: attachment. Idempotent — if the URL
  // already has the transform we don't double-stamp it.
  const downloadUrl = finalUrl.includes("fl_attachment")
    ? finalUrl
    : finalUrl.replace("/upload/", "/upload/fl_attachment/");

  const beatList = manifest.beats;

  return (
    // MotionConfig reducedMotion="user" auto-degrades transform animations
    // to opacity when the user prefers reduced motion.
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-x-hidden bg-black px-6 py-16">
        {/* Letterbox bars — top + bottom, 10vh each, slide-in for the
            "fade-to-cinema" reveal. MotionConfig reducedMotion="user"
            above auto-degrades scaleY → opacity, but the initial state
            still renders a solid black bar at full height for one frame.
            Adding `opacity: 0` to initial means the reduced-motion path
            fades the bar in cleanly instead of cutting from black. */}
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[10vh] origin-top bg-black"
          aria-hidden="true"
        />
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[10vh] origin-bottom bg-black"
          aria-hidden="true"
        />
        {/* End-card slate microcopy in the letterbox — top-left + top-right + bottom-left */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.6 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-[10vh] items-center justify-between px-8 sm:px-12"
        >
          <div className="font-body text-[11.5px] font-medium text-fg-tertiary/80">
            <span className="text-brand-ember">●</span>
            <span className="ml-2">A SceneOS production</span>
          </div>
          <div className="font-body text-[11.5px] font-medium tabular-nums text-fg-tertiary/80">
            {manifest.videoType} · {formatDuration(manifest.durationSeconds)}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.6 }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-[10vh] items-center justify-between px-8 sm:px-12"
        >
          <div className="font-body text-[11.5px] text-fg-tertiary/80">
            Composed with Cloudinary
          </div>
          <div className="font-body text-[11.5px] tabular-nums text-fg-tertiary/80">
            {new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date())}
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: 0.4 }}
          className="relative z-10 mx-auto flex min-h-screen max-w-[80rem] flex-col items-center justify-center gap-10 text-center"
        >
          <div className="space-y-3">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.1 }}
              className="font-body text-[12.5px] font-medium tabular-nums text-fg-tertiary"
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

          {/* fl_splice URL panel — the artifact. The cinematic IS this URL;
              surfacing it as the centerpiece between the player and the
              actions makes the Cloudinary track-hero unmistakable in the
              demo. Mono body, ember tail, copy + open affordances. */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.5 }}
            className="w-[90vw] max-w-[1200px] sm:w-[70vw]"
          >
            <div className="flex items-baseline justify-between gap-3 pb-1.5">
              <span className="font-body text-[11.5px] font-medium tracking-[0.02em] text-fg-tertiary">
                Stitched · Cloudinary fl_splice
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!finalUrl) return;
                  try {
                    await navigator.clipboard.writeText(finalUrl);
                    setUrlCopied(true);
                    window.setTimeout(() => setUrlCopied(false), 1400);
                    toast.success("Cinematic URL copied.");
                  } catch {
                    toast.error("Couldn't reach the clipboard.");
                  }
                }}
                className="inline-flex items-center gap-1.5 font-body text-[11.5px] text-fg-tertiary transition-colors hover:text-fg-primary"
                aria-label="Copy cinematic URL"
              >
                {urlCopied ? (
                  <>
                    <Check size={11} strokeWidth={2} className="text-brand-ember" aria-hidden="true" />
                    <span className="text-brand-ember">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="break-all rounded-md border border-fg-tertiary/15 bg-bg-base/50 px-4 py-3 text-left font-mono text-[12px] leading-[1.6] text-fg-secondary">
              {finalUrl}
            </div>
          </motion.div>

          {/* Three actions — Download primary, Copy share link ghost,
              Reopen editor link. Download leads (the user came here for
              the file); Copy is the share path; Reopen editor is the
              "I want to refine more" escape. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.65 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Button asChild size="lg" variant="primary" className="ember-pulse">
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
              onClick={() => navigate("/edit")}
              className="btn--edge-underline"
            >
              Reopen editor
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
            <div className="font-body text-[12px] font-medium text-fg-tertiary">
              Master prompt
            </div>
            <p className="max-w-prose font-display italic text-[1.25rem] leading-[1.45] text-fg-secondary">
              {manifest.masterPrompt}
            </p>
          </div>

          <div className="space-y-3">
            <div className="font-body text-[12px] font-medium text-fg-tertiary">
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

        {/* "Make another" — top-right ghost, returns to landing with a
            clean store. `right-8` clipped on `<sm`; switching to safe-
            area + responsive offsets keeps it inside the viewport on
            phones (right-3 / right-4) while preserving the desktop
            placement (sm:right-8). */}
        <motion.button
          type="button"
          onClick={handleMakeAnother}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.0 }}
          className={cn(
            "btn--edge-underline group fixed right-3 top-[3.5vh] z-[60] inline-flex items-center gap-2 sm:right-8",
            "rounded-full border border-fg-tertiary/20 px-3 py-1.5 font-body text-[11.5px] font-medium sm:px-4 sm:py-2 sm:text-[12px]",
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

/**
 * Visible empty state when a manifest exists but the cinematic hasn't
 * been rendered yet. Replaces the previous silent `<Navigate to="/" />`
 * which made /final feel like it was bouncing the user to landing.
 *
 * Mirrors the route's letterbox register (top + bottom black bars,
 * Fraunces display headline) so the user sees they ARE at /final, just
 * with nothing delivered yet.
 */
function FinalAwaitingRenderFallback() {
  const navigate = useNavigate();
  return (
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-x-hidden bg-black px-6 py-16">
        {/* Letterbox bars — match the render-state register so the empty
            state reads as the same room, not a different page. */}
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[10vh] origin-top bg-black"
          aria-hidden="true"
        />
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[10vh] origin-bottom bg-black"
          aria-hidden="true"
        />

        <section className="relative z-10 mx-auto flex min-h-screen max-w-[64rem] flex-col items-center justify-center gap-7 text-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.2 }}
            className="font-body text-[12px] font-medium text-fg-tertiary"
          >
            Final delivery · Awaiting render
          </motion.div>

          {/* Headline + ambient ember sparkles drifting over it. The
              SparkleField sits in a `relative` wrapper so its absolutely-
              positioned dots pin to the headline area. Reads as a held
              black frame waiting for the reel. */}
          <div className="relative">
            <SparkleField count={10} className="text-brand-ember/70" />
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.3 }}
              className="font-display text-display-lg italic leading-[1.05] text-fg-primary"
            >
              The cinematic isn't rendered yet.
            </motion.h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.55 }}
            className="max-w-prose font-display italic text-[1.125rem] leading-[1.45] text-fg-secondary"
          >
            Approve every take on <em>the</em> canvas, then stitch the cut. Final
            delivery opens <em>the</em> moment the render lands.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.7 }}
            className="mt-3"
          >
            <Button size="lg" variant="primary" onClick={() => navigate("/canvas")}>
              Continue from canvas
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </motion.div>
        </section>
      </main>
    </MotionConfig>
  );
}
