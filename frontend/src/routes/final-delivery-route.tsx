import { MotionConfig, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Link2, ArrowRight, Copy, Check } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { Button } from "@/components/ui/button";
import { SparkleField } from "@/components/landing/sparkle-field";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { toast } from "sonner";

/**
 * The exhale. The delivery. The screen the user shares.
 *
 * Aggressive letterbox treatment per SENIOR_FRONTEND_TRANSMISSION Part
 * 6.17: black bars top + bottom carry the chrome, the video sits in the
 * frame between, the user is *in* the cinema. The bars are functional
 * — every piece of chrome (project mark, Make another, type · duration)
 * lives inside them so nothing competes with the cinematic in the middle.
 *
 * Composition: anchor is the player; counterweight is the headline above
 * it. One italic prompt-quote underneath the action row and that's all.
 * Parallax + below-fold "Beat manifest" + "Composed with Cloudinary"
 * footer + redundant date slate all dropped — they were decorative noise
 * the user already saw on the canvas.
 *
 * Choreography:
 *   0.00s   Route mounts on bg-black. Letterbox bars slide in (scaleY).
 *   0.15s   "Your cinematic." headline rises + fades in (filmIn 0.72s).
 *   0.35s   Player fades + scales in.
 *   0.50s   URL track-hero panel.
 *   0.65s   Action row.
 *   0.80s   Master-prompt quote underline.
 */
export function FinalDeliveryRoute() {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const reset = useBeatGraphStore((s) => s.reset);
  const resetPrompt = usePromptStore((s) => s.reset);
  const [urlCopied, setUrlCopied] = useState(false);

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

  return (
    // MotionConfig reducedMotion="user" auto-degrades transform animations
    // to opacity when the user prefers reduced motion.
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-hidden bg-black px-6">
        {/* ── Letterbox bars ─────────────────────────────────────────────
            Top + bottom 10vh each. The chrome lives INSIDE these bars
            (project mark + Make another up top, type · duration at the
            bottom-right) — per Transmission Part 6.17, the bars are
            functional, not decorative. */}
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

        {/* ── Top slate ──────────────────────────────────────────────────
            Project mark left, Make another right. The Make another pill
            is in caption-track register — film-credit feel, not a CTA. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.55 }}
          className="fixed inset-x-0 top-0 z-50 flex h-[10vh] items-center justify-between px-6 sm:px-10"
        >
          <div className="caption-track text-[10px] text-fg-tertiary/85">
            <span className="text-brand-ember">●</span>
            <span className="ml-2">A SceneOS production</span>
          </div>
          <button
            type="button"
            onClick={handleMakeAnother}
            className="caption-track group inline-flex items-center gap-1.5 text-[10px] text-fg-tertiary transition-colors duration-200 hover:text-brand-ember focus-visible:outline-none focus-visible:text-brand-ember"
            aria-label="Archive this project and start a new one"
          >
            Make another
            <ArrowRight
              size={11}
              strokeWidth={1.5}
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        </motion.div>

        {/* ── Bottom slate ───────────────────────────────────────────────
            Single line: type · duration. The film-credit register at
            the bottom-right of a frame. Composed-with-Cloudinary +
            today's date were both decorative noise that duplicated the
            URL panel and added nothing. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.55 }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-[10vh] items-center justify-end px-6 sm:px-10"
        >
          <div className="caption-track text-[10px] tabular-nums text-fg-tertiary/85">
            {manifest.videoType} · {formatDuration(manifest.durationSeconds)}
          </div>
        </motion.div>

        {/* ── Centered composition ───────────────────────────────────────
            Single anchor (the player) with one counterweight above
            (headline) and one below (master-prompt quote). Everything
            else stripped. */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: 0.4 }}
          className="relative z-10 mx-auto flex min-h-screen max-w-[80rem] flex-col items-center justify-center gap-7 py-[12vh] text-center"
        >
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.15 }}
            className="font-display text-display-lg italic leading-[1.05] tracking-[-0.02em] text-fg-primary text-balance"
          >
            Your cinematic.
          </motion.h1>

          {/* 16:9 player. No caption — the URL panel below carries that
              load, the player just plays. 70vw on desktop, 90vw on
              narrow so it doesn't shrink to a postage stamp. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.35 }}
            className="w-[90vw] max-w-[1100px] sm:w-[72vw]"
          >
            <VideoPlayer
              src={finalUrl}
              suggestedDurationSeconds={manifest.durationSeconds}
              autoPlay
              muted={false}
            />
          </motion.div>

          {/* fl_splice URL panel — the cinematic IS this URL. Mono body,
              caption-track eyebrow, copy affordance right. */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.5 }}
            className="w-[90vw] max-w-[1100px] sm:w-[72vw]"
          >
            <div className="flex items-baseline justify-between gap-3 pb-1.5">
              <span className="caption-track text-[10px] text-fg-tertiary">
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
                className="inline-flex items-center gap-1.5 font-body text-[11px] text-fg-tertiary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:text-fg-primary"
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
            <div className="break-all rounded-[2px] border border-fg-tertiary/15 bg-bg-base/50 px-4 py-3 text-left font-mono text-[12px] leading-[1.6] text-fg-secondary">
              {finalUrl}
            </div>
          </motion.div>

          {/* Action row. Download primary (the user came here for the file).
              Copy + Reopen editor as quiet ghost links. */}
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
            <Button size="lg" variant="ghost" onClick={handleCopy}>
              <Link2 size={16} strokeWidth={1.5} aria-hidden="true" />
              Copy share link
            </Button>
            <Button size="lg" variant="ghost" onClick={() => navigate("/edit")}>
              Reopen editor
            </Button>
          </motion.div>

          {/* Master prompt — single italic line, no eyebrow. The user
              already saw their work; this is just a quiet receipt at
              the foot of the cinema. Below-fold "Beat manifest" list
              dropped (decorative). */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.8 }}
            className="max-w-prose font-display italic text-[1.0625rem] leading-[1.5] text-fg-tertiary text-pretty"
          >
            "{manifest.masterPrompt}"
          </motion.p>
        </motion.section>
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
