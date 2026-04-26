import { MotionConfig, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Link2, ArrowRight, Copy, Check } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { Button } from "@/components/ui/button";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { toast } from "sonner";

/**
 * The exhale. The delivery. The screen the user shares.
 *
 * Letterbox treatment per Transmission Part 6.17 — black bars top + bottom
 * carry the chrome (project mark + Make another up top, type · duration at
 * the bottom-right). The cut is the subject; everything else stays out of
 * its way. No Fraunces hero, no italic master-prompt receipt — the user
 * sees their work, that IS the headline.
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

  if (!manifest) {
    return <Navigate to="/" replace />;
  }
  if (!finalUrl) {
    return <FinalAwaitingRenderFallback />;
  }

  // Append fl_attachment for forced download. Cloudinary's transform tells
  // its CDN to set Content-Disposition: attachment. Idempotent.
  const downloadUrl = finalUrl.includes("fl_attachment")
    ? finalUrl
    : finalUrl.replace("/upload/", "/upload/fl_attachment/");

  return (
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-hidden bg-black px-6">
        {/* Letterbox bars — functional chrome, not decoration. */}
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[8vh] origin-top bg-black"
          aria-hidden="true"
        />
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[8vh] origin-bottom bg-black"
          aria-hidden="true"
        />

        {/* Top slate */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.4 }}
          className="fixed inset-x-0 top-0 z-50 flex h-[8vh] items-center justify-between px-6 sm:px-10"
        >
          <div className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary/85">
            <span className="text-brand-ember">●</span>
            <span className="ml-2">SceneOS</span>
          </div>
          <button
            type="button"
            onClick={handleMakeAnother}
            className="group inline-flex cursor-pointer items-center gap-1.5 font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary transition-colors duration-200 hover:text-brand-ember focus-visible:outline-none focus-visible:text-brand-ember"
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

        {/* Bottom slate */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.4 }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-[8vh] items-center justify-end px-6 sm:px-10"
        >
          <div className="font-body text-micro font-medium uppercase tracking-[0.08em] tabular-nums text-fg-tertiary/85">
            {manifest.videoType} · {formatDuration(manifest.durationSeconds)}
          </div>
        </motion.div>

        {/* Center — player is the only subject. URL row + actions sit below
            it as quiet utilities. No headline; the cut speaks. */}
        <section className="relative z-10 mx-auto flex min-h-screen max-w-[80rem] flex-col items-center justify-center gap-5 py-[10vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.25 }}
            className="w-[90vw] max-w-[1100px] sm:w-[72vw]"
          >
            <VideoPlayer
              src={finalUrl}
              suggestedDurationSeconds={manifest.durationSeconds}
              autoPlay
              muted={false}
            />
          </motion.div>

          {/* URL row — single mono line + copy. No eyebrow, no panel chrome. */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.45 }}
            className="flex w-[90vw] max-w-[1100px] items-center gap-3 sm:w-[72vw]"
          >
            <div className="flex-1 truncate border-b border-fg-tertiary/15 py-1.5 font-mono text-chip text-fg-tertiary">
              {finalUrl}
            </div>
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
              className="inline-flex cursor-pointer items-center gap-1.5 font-body text-chip text-fg-tertiary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:text-fg-primary"
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
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.55 }}
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
        </section>
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
 * been rendered yet. Mirrors the route's letterbox register.
 */
function FinalAwaitingRenderFallback() {
  const navigate = useNavigate();
  return (
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-x-hidden bg-black px-6 py-16">
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[8vh] origin-top bg-black"
          aria-hidden="true"
        />
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[8vh] origin-bottom bg-black"
          aria-hidden="true"
        />

        <section className="relative z-10 mx-auto flex min-h-screen max-w-[64rem] flex-col items-center justify-center gap-5 text-center">
          <div className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
            Awaiting render
          </div>
          <h1 className="text-balance font-body text-[28px] font-medium leading-tight text-fg-primary">
            The cinematic isn't rendered yet.
          </h1>
          <p className="max-w-prose font-body text-body-sm leading-relaxed text-fg-tertiary">
            Approve every take on the canvas, then stitch the cut. Final delivery
            opens the moment the render lands.
          </p>
          <Button size="lg" variant="primary" onClick={() => navigate("/canvas")}>
            Continue from canvas
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </section>
      </main>
    </MotionConfig>
  );
}
