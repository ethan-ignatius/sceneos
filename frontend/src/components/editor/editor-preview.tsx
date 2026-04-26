import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, AlertCircle } from "lucide-react";
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
 * a transport row with play/pause, skip ±5s, current/total mono time, and
 * a click-to-seek scrubber. The scrubber's playhead drags via pointer
 * capture, which is what reads as "deliberate" — the same pattern CutOS
 * uses for its main playhead handle.
 *
 * Spacebar / K toggles play when the frame has focus. The video src changes
 * (re-bakes from the editor) reset position to 0 — same behavior as the
 * canvas drawer's VideoPlayer, since a re-bake is logically a new cut.
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
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationSeconds ?? 0);
  // Load failure overlay. Editor's bake URL points at Cloudinary; on
  // resumed projects the asset can be rotated/deleted, and during a bake
  // race the URL can briefly 404 before the new derivative is ready.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!src) return;
    setCurrentTime(0);
    setLoadError(null);
    setAutoplayBlocked(false);
    v.load();
    // Cached video may have v.duration ready synchronously and never
    // re-fire loadedmetadata on src swap — seed from the element so
    // the readout doesn't stick at "0:00".
    const seed = v.duration;
    if (Number.isFinite(seed) && seed > 0) setDuration(seed);
    const onTime = () => setCurrentTime(v.currentTime);
    // loadedmetadata + durationchange together: some MP4 muxers report
    // metadata before duration is computed, so durationchange catches
    // the firmer value once it's known.
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
    // MediaError codes mapped to human messages — same vocabulary as
    // VideoPlayer so the two surfaces feel consistent.
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
    // Autoplay-blocked recovery: catch NotAllowedError so we can show
    // the play overlay instead of leaving the user staring at a frozen
    // first frame.
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
    // reloadCount is the Retry hook — bumping re-runs load().
  }, [src, reloadCount]);

  // Late-arriving prop. /api/editor/apply returns durationSeconds but
  // the URL bake can land first (e.g., demo lookup hit) — promote the
  // prop into local state once it firms up, preserving any larger value
  // the video element has already reported.
  useEffect(() => {
    if (typeof durationSeconds !== "number") return;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    setDuration((prev) => (prev > 0 ? prev : durationSeconds));
  }, [durationSeconds]);

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
      {/* Video frame — letterbox hairline only. */}
      <div className="relative overflow-hidden border border-fg-tertiary/15 bg-black">
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          playsInline
          loop
          controls={false}
          onClick={togglePlay}
          className="block aspect-video w-full cursor-pointer object-cover"
        />
        {baking ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 bg-bg-base/80 px-2.5 py-1 font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-ember" />
            {bakingCaption}
          </div>
        ) : null}
      </div>

      {/* Transport row: play · skip · time · scrubber · total time. */}
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

        <div
          ref={scrubRef}
          role="slider"
          aria-label="Scrub timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(safeDuration)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onPointerDown={handleScrubPointerDown}
          className="group relative h-1 flex-1 cursor-ew-resize bg-fg-tertiary/20"
        >
          <div
            className="absolute inset-y-0 left-0 bg-brand-ember"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-ember opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${progress * 100}%`, boxShadow: "0 0 8px rgba(240,168,104,0.6)" }}
          />
        </div>

        <span className="font-mono text-chip tabular-nums text-fg-tertiary w-[3.25rem] text-right">
          {formatTime(safeDuration)}
        </span>
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
