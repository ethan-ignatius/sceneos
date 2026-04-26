import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
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

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Browsers cache metadata aggressively. After a src swap (regenerate
    // produces a new clip), the same <video> element may keep the old
    // frame and not re-fire `loadedmetadata`. An explicit load() forces
    // a fresh fetch + metadata pass.
    setProgress(0);
    setCurrentTime(0);
    v.load();
    const onTime = () => {
      setCurrentTime(v.currentTime);
      setProgress(v.duration ? v.currentTime / v.duration : 0);
    };
    const onMeta = () => {
      if (!Number.isNaN(v.duration)) setDuration(v.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(1);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      // Auto-pause on unmount — keeps audio from leaking when the drawer
      // closes mid-play.
      try {
        v.pause();
      } catch {
        /* noop */
      }
    };
  }, [src]);

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
      data-cursor="hide"
      className={cn(
        "group relative aspect-video overflow-hidden rounded-md bg-black outline-none",
        "shadow-(--shadow-panel)",
        "ring-1 ring-brand-ember-dim/40 focus-visible:ring-2 focus-visible:ring-brand-ember",
        className,
      )}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        loop
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

      {/* Big Play overlay — visible when paused. Click anywhere on the
          video also toggles, so this is mostly a visual affordance. */}
      <AnimatePresence>
        {!playing ? (
          <motion.button
            key="play-overlay"
            type="button"
            onClick={togglePlay}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
            aria-label="Play"
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
