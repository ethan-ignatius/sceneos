import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorPreviewProps {
  src: string;
  /** Total duration the cut bakes to (from /api/editor/apply) for the readout. */
  durationSeconds?: number;
  /** Baking pill shown top-right while a debounced bake is in flight. */
  baking?: boolean;
  /** Override the default "Baking the cut" caption when `baking` is true. */
  bakingCaption?: string;
  className?: string;
}

/**
 * CutOS-style preview surface for /edit.
 *
 * Frame holds a clean &lt;video&gt; (no in-frame chrome). Below the frame:
 * a transport row with play/pause, skip ±5s, current/total mono time, a
 * smooth click-to-seek scrubber, and a fullscreen toggle. The scrubber's
 * playhead drags via pointer capture and is RAF-driven during playback so
 * the bar moves at 60fps instead of the 250ms `timeupdate` jerk.
 *
 * Spacebar / K toggles play. Arrow keys skip ±5s. F toggles fullscreen.
 * The video src changes (re-bakes from the editor) reset position to 0 —
 * a re-bake is logically a new cut.
 */
export function EditorPreview({
  src,
  durationSeconds,
  baking = false,
  bakingCaption = "Baking the cut",
  className,
}: EditorPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationSeconds ?? 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!src) return;
    setCurrentTime(0);
    setLoadError(null);
    setAutoplayBlocked(false);
    v.load();
    const seed = v.duration;
    if (Number.isFinite(seed) && seed > 0) setDuration(seed);
    const onTime = () => setCurrentTime(v.currentTime);
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
      setCurrentTime(v.duration ?? 0);
    };
    const onError = () => {
      const code = v.error?.code;
      const msg =
        code === 4
          ? "Couldn't load this cut — the source may have moved."
          : code === 2
            ? "Network hiccup loading the cut."
            : code === 3
              ? "This cut can't be decoded in your browser."
              : "Couldn't load this cut.";
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
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.catch((err: Error) => {
          if (err.name === "NotAllowedError") setAutoplayBlocked(true);
        });
      }
    };
    v.addEventListener("canplay", tryPlay, { once: true });
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", updateDuration);
      v.removeEventListener("durationchange", updateDuration);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      try {
        v.pause();
      } catch {
        /* noop */
      }
    };
  }, [src, reloadCount]);

  // RAF-driven scrubber — 60fps progress updates while playing. The
  // <video>'s `timeupdate` event only fires every ~250ms, which is what
  // makes the bar feel jerky. We drive `currentTime` from
  // requestAnimationFrame as long as the video is playing, then fall back
  // to the event when paused (where the user might be scrubbing).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrentTime(v.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing]);

  // Late-arriving prop. /api/editor/apply returns durationSeconds but the
  // URL bake can land first — promote the prop into local state once it
  // firms up, preserving any larger value the video element already saw.
  useEffect(() => {
    if (typeof durationSeconds !== "number") return;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    setDuration((prev) => (prev > 0 ? prev : durationSeconds));
  }, [durationSeconds]);

  // Fullscreen — track the actual document.fullscreenElement so we stay
  // in sync if the user hits Esc. Browsers without the API just no-op.
  useEffect(() => {
    const onFsChange = () => {
      setFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Browsers can refuse fullscreen if no user gesture was attached
      // (older Safari, embedded contexts). Silent — the button stays
      // available, the user can try again.
    }
  }, []);

  // Global F-key fullscreen — works anywhere on /edit, not just when
  // the preview wrapper is focused. Bypassed when typing in any text
  // surface so "f" still types into the director chat input. Also
  // bypassed when meta/ctrl/alt is held so it doesn't intercept
  // browser shortcuts (Cmd-F find, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.matches("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const skip = (deltaSec: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min((v.duration || 0), v.currentTime + deltaSec));
    v.currentTime = next;
    setCurrentTime(next);
  };

  const scrubFromClientX = (clientX: number) => {
    const v = videoRef.current;
    const el = scrubRef.current;
    if (!v || !el || !v.duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const next = ratio * v.duration;
    v.currentTime = next;
    setCurrentTime(next);
  };

  const handleScrubPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = scrubRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    scrubFromClientX(e.clientX);
    const move = (ev: PointerEvent) => scrubFromClientX(ev.clientX);
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      skip(-5);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      skip(5);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      void toggleFullscreen();
    }
  };

  const safeDuration = duration || durationSeconds || 0;
  const progress = safeDuration > 0 ? currentTime / safeDuration : 0;

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn("space-y-3 outline-none", className)}
    >
      {/* Video frame — letterbox hairline only. requestFullscreen targets
          this wrapper so the scrubber overlay can ride along when active. */}
      <div
        ref={frameRef}
        className={cn(
          "relative overflow-hidden border border-fg-tertiary/15 bg-black",
          fullscreen && "flex h-screen w-screen items-center justify-center border-0",
        )}
      >
        <video
          ref={videoRef}
          src={src || undefined}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          controls={false}
          onClick={togglePlay}
          className={cn(
            "block w-full cursor-pointer object-cover",
            fullscreen ? "max-h-screen object-contain" : "aspect-video",
          )}
        />
        {baking ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 bg-bg-base/80 px-2.5 py-1 font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-ember" />
            {bakingCaption}
          </div>
        ) : null}
        {autoplayBlocked && !loadError ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Tap to play"
            className="absolute inset-0 grid place-items-center bg-bg-base/30 backdrop-blur-[1px] transition-colors hover:bg-bg-base/45"
          >
            <span className="grid h-16 w-16 cursor-pointer place-items-center rounded-full bg-bg-base/55 ring-1 ring-brand-ember/40">
              <Play size={22} strokeWidth={1.5} fill="currentColor" className="ml-0.5 text-brand-ember" aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {loadError ? (
          <div role="alert" className="absolute inset-0 grid place-items-center bg-bg-base/85 backdrop-blur-md">
            <div className="flex max-w-[80%] flex-col items-center gap-3 text-center">
              <AlertCircle size={20} strokeWidth={1.5} className="text-state-error" aria-hidden="true" />
              <p className="font-body text-pill leading-snug text-fg-secondary">{loadError}</p>
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
          </div>
        ) : null}

        {/* Fullscreen-only scrubber overlay — auto-fades when the cursor
            is idle. We render it inside the frame so requestFullscreen
            keeps the controls visible while the page chrome is hidden. */}
        {fullscreen ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-gradient-to-t from-bg-base/85 via-bg-base/40 to-transparent px-6 pb-6 pt-12">
            <button
              type="button"
              onClick={togglePlay}
              className="pointer-events-auto grid h-9 w-9 cursor-pointer place-items-center bg-brand-ember text-black transition-colors hover:bg-brand-ember/90"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause size={15} strokeWidth={2} fill="currentColor" />
              ) : (
                <Play size={15} strokeWidth={2} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <span className="font-mono text-chip tabular-nums text-fg-secondary">{formatTime(currentTime)}</span>
            <div
              role="slider"
              aria-label="Scrub timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round(safeDuration)}
              aria-valuenow={Math.round(currentTime)}
              tabIndex={0}
              onPointerDown={handleScrubPointerDown}
              className="pointer-events-auto group relative h-1 flex-1 cursor-ew-resize bg-fg-tertiary/30"
            >
              <div className="absolute inset-y-0 left-0 bg-brand-ember" style={{ width: `${progress * 100}%` }} />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-ember"
                style={{ left: `${progress * 100}%`, boxShadow: "0 0 8px rgba(240,168,104,0.6)" }}
              />
            </div>
            <span className="font-mono text-chip tabular-nums text-fg-secondary">{formatTime(safeDuration)}</span>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="pointer-events-auto grid h-7 w-7 cursor-pointer place-items-center text-fg-secondary transition-colors hover:text-fg-primary"
              aria-label="Exit fullscreen"
              title="Exit fullscreen (F or Esc)"
            >
              <Minimize2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Inline transport row — only shown when NOT fullscreen, since the
          fullscreen overlay above carries its own. */}
      {!fullscreen ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => skip(-5)}
              className="grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary transition-colors hover:text-fg-primary"
              aria-label="Skip back 5 seconds"
              title="Back 5s (←)"
            >
              <SkipBack size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="grid h-8 w-8 cursor-pointer place-items-center bg-brand-ember text-black transition-colors hover:bg-brand-ember/90"
              aria-label={playing ? "Pause" : "Play"}
              title="Play / pause (space)"
            >
              {playing ? (
                <Pause size={14} strokeWidth={2} fill="currentColor" />
              ) : (
                <Play size={14} strokeWidth={2} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => skip(5)}
              className="grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary transition-colors hover:text-fg-primary"
              aria-label="Skip forward 5 seconds"
              title="Forward 5s (→)"
            >
              <SkipForward size={14} strokeWidth={1.5} />
            </button>
          </div>

          <span className="font-mono text-chip tabular-nums text-fg-tertiary w-[3.25rem]">
            {formatTime(currentTime)}
          </span>

          {/* Smooth scrubber — taller invisible hit area, thin visible
              track. The handle is always visible (not hover-gated) so the
              eye reads the playhead position immediately. */}
          <div
            ref={scrubRef}
            role="slider"
            aria-label="Scrub timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(safeDuration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onPointerDown={handleScrubPointerDown}
            className="group relative flex h-4 flex-1 cursor-ew-resize items-center"
          >
            <div className="relative h-1 w-full bg-fg-tertiary/20 transition-[height] duration-150 group-hover:h-1.5">
              <div
                className="absolute inset-y-0 left-0 bg-brand-ember will-change-[width]"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-ember opacity-70 transition-[opacity,transform] duration-150 group-hover:scale-125 group-hover:opacity-100 will-change-[left]"
                style={{ left: `${progress * 100}%`, boxShadow: "0 0 8px rgba(240,168,104,0.5)" }}
              />
            </div>
          </div>

          <span className="font-mono text-chip tabular-nums text-fg-tertiary w-[3.25rem] text-right">
            {formatTime(safeDuration)}
          </span>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Enter fullscreen"
            title="Fullscreen (F)"
          >
            <Maximize2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
