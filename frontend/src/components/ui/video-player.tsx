import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";

interface VideoPlayerProps {
  src: string;
  /** Suggested duration for "0:08 / 0:12" while metadata is loading. */
  suggestedDurationSeconds?: number;
  /** Cinematography label rendered top-left as caption (e.g. "Beat 02 · Hook"). */
  caption?: string;
  /** Auto-attempt play on mount. Browser policy may still block. */
  autoPlay?: boolean;
  /** Mute by default — autoplay survives more browser policies muted. */
  muted?: boolean;
  className?: string;
}

/**
 * Custom-skinned video player. Zero browser chrome.
 *
 *  - Big Play overlay (96px ember) on idle/pause; AnimatePresence-fades.
 *  - Click-to-seek progress bar at the bottom edge (2px → 4px on hover).
 *  - Mono `mm:ss / mm:ss` time readout in the top-right corner.
 *  - Spacebar toggles play/pause when the player has focus.
 *  - Cleanly tears down listeners + pauses video on unmount, so closing
 *    the drawer (or switching beats — drawer remounts) auto-pauses.
 *
 * The mood-graded URL is built upstream by `buildClipUrl({ mood })`; this
 * component just receives `src`. See docs/VIDEO_PLAYER.md.
 */
export function VideoPlayer({
  src,
  suggestedDurationSeconds,
  caption,
  autoPlay = true,
  muted = true,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(suggestedDurationSeconds ?? 0);
  // Load-error state. Surfaces a "Couldn't load this clip" overlay with a
  // Retry that re-runs v.load() — recovers from transient Cloudinary 404s
  // (CDN propagation lag), expired/rotated public_ids on resumed projects,
  // or a network blip. The MediaError code goes into the diagnostic line
  // so we can tell decode failures apart from network failures.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set when autoplay is attempted but blocked by browser policy. The
  // play overlay stays visible and the user clicks to start playback.
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Reload key — bumped to force the effect to re-run + clear error state
  // without changing the src prop.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Empty / undefined src — skip the load() call. Setting v.src to "" or
    // null in some browsers triggers a spurious MEDIA_ERR_SRC_NOT_SUPPORTED
    // and pollutes the loadError state before the real URL arrives.
    if (!src) return;
    // Browsers cache metadata aggressively. After a src swap (regenerate
    // produces a new clip), the same <video> element may keep the old
    // frame and not re-fire `loadedmetadata`. An explicit load() forces
    // a fresh fetch + metadata pass.
    setProgress(0);
    setCurrentTime(0);
    setLoadError(null);
    setAutoplayBlocked(false);
    v.load();
    // Some browsers (Safari especially) populate v.duration synchronously
    // for cached videos and never re-fire loadedmetadata on src swap. Seed
    // from v.duration if it's already known so the readout never sticks
    // at "0:00" for a freshly-mounted cached clip.
    const seed = v.duration;
    if (Number.isFinite(seed) && seed > 0) setDuration(seed);
    const onTime = () => {
      setCurrentTime(v.currentTime);
      setProgress(v.duration ? v.currentTime / v.duration : 0);
    };
    // loadedmetadata fires once metadata is parsed; durationchange fires
    // any time duration becomes known or refines (some MP4 muxers emit
    // metadata before duration is computed). Listening to both means the
    // "/ X:XX" denominator stops reading 0:00 the moment it can.
    const updateDuration = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onPlay = () => {
      setPlaying(true);
      setAutoplayBlocked(false);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(1);
    };
    // MediaError codes:
    //   1 ABORTED · 2 NETWORK · 3 DECODE · 4 SRC_NOT_SUPPORTED
    // 4 catches Cloudinary 404s on resumed projects (asset rotated /
    // deleted). 2 is transient; the Retry button re-runs load().
    const onError = () => {
      const code = v.error?.code;
      const msg =
        code === 4
          ? "Couldn't load this clip — the source may have moved."
          : code === 2
            ? "Network hiccup loading the clip."
            : code === 3
              ? "This clip can't be decoded in your browser."
              : "Couldn't load this clip.";
      setLoadError(msg);
      setPlaying(false);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", updateDuration);
    v.addEventListener("durationchange", updateDuration);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    // Autoplay-blocked recovery. Browsers throw NotAllowedError from
    // play() when the page hasn't received user gesture. Catching it
    // surfaces the play overlay so the user has an obvious next step
    // (a click anywhere on the frame starts playback). We only need to
    // do this when autoPlay is requested — autoplay=false flows already
    // require an explicit click.
    if (autoPlay) {
      const tryPlay = () => {
        const p = v.play();
        if (p && typeof p.then === "function") {
          p.catch((err: Error) => {
            if (err.name === "NotAllowedError") {
              setAutoplayBlocked(true);
            }
            // Other rejections (AbortError from interruption) are fine —
            // the user-initiated play() will override.
          });
        }
      };
      // canplay fires once enough data is ready to start playback.
      v.addEventListener("canplay", tryPlay, { once: true });
      // Belt-and-suspenders: if canplay never fires (e.g., immediate
      // error), the error handler sets loadError and the overlay shows.
    }
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", updateDuration);
      v.removeEventListener("durationchange", updateDuration);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      // Auto-pause on unmount — keeps audio from leaking when the drawer
      // closes mid-play.
      try {
        v.pause();
      } catch {
        /* noop */
      }
    };
    // reloadCount intentionally in deps so Retry re-runs the effect.
  }, [src, autoPlay, reloadCount]);

  // Late-arriving suggested duration — manifest can hydrate after mount
  // (e.g., resumed project rebuilds the Cloudinary URL before the
  // durationSeconds field comes back from /api/editor/apply). Promote the
  // suggested value into local state when it firms up, but only while
  // the video itself hasn't reported a real duration yet.
  useEffect(() => {
    if (typeof suggestedDurationSeconds !== "number") return;
    if (!Number.isFinite(suggestedDurationSeconds) || suggestedDurationSeconds <= 0) return;
    setDuration((prev) => (prev > 0 ? prev : suggestedDurationSeconds));
  }, [suggestedDurationSeconds]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {
        // Autoplay-blocked or user navigated away mid-call. The Play
        // overlay will be visible — user can click to retry.
      });
    } else {
      v.pause();
    }
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative aspect-video overflow-hidden rounded-md bg-black outline-none",
        "shadow-(--shadow-panel)",
        "ring-1 ring-brand-ember-dim/40 focus-visible:ring-2 focus-visible:ring-brand-ember",
        className,
      )}
    >
      <video
        ref={videoRef}
        src={src || undefined}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        loop
        preload="auto"
        // Hide the native chrome — we draw our own.
        controls={false}
        onClick={togglePlay}
        className="block h-full w-full object-cover"
      />

      {caption ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-bg-base/55 px-2.5 py-1 font-body text-pill font-medium text-fg-secondary backdrop-blur">
          {caption}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-bg-base/55 px-2 py-1 font-mono text-caption tabular-nums text-fg-secondary backdrop-blur">
        {formatTime(currentTime)}
        <span className="mx-1.5 text-fg-tertiary/70">/</span>
        {formatTime(duration)}
      </div>

      {/* Big Play overlay — visible when paused or autoplay was blocked.
          Click anywhere on the video also toggles, so this is mostly a
          visual affordance. Suppressed while a load error is showing
          (the error overlay owns the surface in that state). */}
      <AnimatePresence>
        {!playing && !loadError ? (
          <motion.button
            key="play-overlay"
            type="button"
            onClick={togglePlay}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
            aria-label={autoplayBlocked ? "Tap to play" : "Play"}
            className="absolute inset-0 grid place-items-center"
          >
            <span className="grid h-24 w-24 place-items-center rounded-full bg-bg-base/40 backdrop-blur-md ring-1 ring-brand-ember/40">
              <Play
                size={36}
                strokeWidth={1.5}
                fill="currentColor"
                className="ml-1 text-brand-ember drop-shadow-[0_0_18px_rgba(240,168,104,0.6)]"
              />
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Load-error overlay — covers the frame with a non-cinematic
          message + Retry. Clicking Retry bumps reloadCount so the load
          effect re-runs against the same src. Most failures here are
          stale Cloudinary URLs (resumed projects) or transient network
          hiccups; both clear cleanly on retry once the cause is gone. */}
      <AnimatePresence>
        {loadError ? (
          <motion.div
            key="error-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
            role="alert"
            className="absolute inset-0 grid place-items-center bg-bg-base/85 backdrop-blur-md"
          >
            <div className="flex max-w-[80%] flex-col items-center gap-3 text-center">
              <AlertCircle size={20} strokeWidth={1.5} className="text-state-error" aria-hidden="true" />
              <p className="font-body text-pill leading-snug text-fg-secondary">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  setReloadCount((n) => n + 1);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-fg-tertiary/30 px-3 py-1.5 font-body text-pill font-medium text-fg-primary transition-colors hover:border-brand-ember/60 hover:text-brand-ember"
              >
                <RotateCcw size={11} strokeWidth={1.5} aria-hidden="true" />
                Retry
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Pause hint on hover when playing (subtle) */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {playing ? (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-bg-base/40 backdrop-blur-md">
            <Pause size={18} strokeWidth={1.5} className="text-fg-primary" />
          </span>
        ) : null}
      </div>

      {/* Progress bar — bottom edge, click to seek. */}
      <div
        role="slider"
        aria-label="Scrub timeline"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={-1}
        onClick={seekFromEvent}
        className="absolute inset-x-0 bottom-0 cursor-pointer"
      >
        <div className="relative h-2 transition-[height] duration-200 hover:h-2.5">
          <div className="absolute inset-x-0 bottom-0 h-px bg-fg-tertiary/40" />
          <div
            className="absolute bottom-0 left-0 h-px bg-brand-ember transition-[width] duration-100 ease-linear"
            style={{ width: `${progress * 100}%`, boxShadow: "0 0 8px rgba(240,168,104,0.6)" }}
          />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
