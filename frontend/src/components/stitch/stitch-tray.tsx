import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Copy, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import {
  useBeatGraphStore,
  selectApprovedClipPublicIds,
} from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { TextSplitter } from "@/lib/text-splitter";
import { usePointerDrag } from "@/lib/use-pointer-drag";
import {
  buildSpliceUrl,
  buildSpliceUrlSegments,
  buildThumbnailUrl,
  moodAccentColor,
} from "@/lib/cloudinary";
import { api, ApiError } from "@/lib/api";
import { playRenderWhoosh } from "@/lib/audio-cues";
import { SPRING, DURATIONS, EASE } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StitchTrayProps {
  onClose: () => void;
}

/**
 * The Cloudinary moment. The third — and most quietly devastating — of the
 * three demo-winning moments.
 *
 * As beats approve, a new `l_video:<id>,fl_splice/` segment types itself
 * into the live URL with a brief ember afterglow. The thumbnail row
 * mood-tints each beat and lights approved ones; the Render CTA pulses
 * when every beat is in.
 *
 * URL diff strategy (see docs/STITCH_TRAY.md §2): each new approval inserts
 * exactly one segment in a known position. We track approvedIds.length and
 * render head/middle/tail/base separately — only `tail` runs through
 * the sequential TextSplitter.
 */
export function StitchTray({ onClose }: StitchTrayProps) {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const setFinalCinematic = useBeatGraphStore((s) => s.setFinalCinematic);
  const approvedIds = useBeatGraphStore(selectApprovedClipPublicIds);
  const totalCount = manifest?.beats.length ?? 0;
  const approvedCount = approvedIds.length;
  const allReady = approvedCount === totalCount && totalCount > 0;
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  // Tracks mount status so the in-flight stitchUrl call can't setState on
  // an unmounted tray (e.g., user clicks Close mid-render).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const segments = buildSpliceUrlSegments(approvedIds);

  // Track approval count to detect *which* render added the new tail —
  // only that render gets the ember afterglow + typewriter.
  const prevCountRef = useRef(0);
  const [revealKey, setRevealKey] = useState(0);
  const [shouldType, setShouldType] = useState(false);
  useEffect(() => {
    if (approvedCount > prevCountRef.current && approvedCount >= 2) {
      // A new tail appeared (and isn't the first ever segment).
      setRevealKey((k) => k + 1);
      setShouldType(true);
      // Settle to non-glow steady state after 1s.
      const t = window.setTimeout(() => setShouldType(false), 1000);
      prevCountRef.current = approvedCount;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = approvedCount;
  }, [approvedCount]);

  const fullUrl = buildSpliceUrl(approvedIds);
  const copy = async () => {
    if (!fullUrl) return;
    await navigator.clipboard.writeText(fullUrl);
    toast.success("Cloudinary URL copied");
  };

  const handleRender = async () => {
    if (!manifest || !allReady || rendering) return;
    // Whoosh fires at click-time; the navigate happens after stitchUrl
    // resolves. The cue's tail (200ms) carries into the /final mount.
    playRenderWhoosh();
    setRendering(true);
    setRenderError(null);
    try {
      const res = await api.stitchUrl({ manifest });
      if (!mountedRef.current) return;
      setFinalCinematic({
        finalUrl: res.finalUrl,
        thumbnailUrl: res.thumbnailUrl,
        durationSeconds: res.durationSeconds,
      });
      navigate("/final");
    } catch (err) {
      if (!mountedRef.current) return;
      setRenderError(err instanceof ApiError ? err.message : "Render failed.");
      setRendering(false);
    }
  };

  // Drag-to-pan thumbnail row. The hook handles register + cleanup inside
  // its own useEffect — listeners attach exactly once per mount.
  const thumbsRef = useRef<HTMLDivElement>(null);
  usePointerDrag(thumbsRef);

  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={SPRING.drawer}
      className="absolute right-6 top-20 z-40 w-[32rem] overflow-hidden rounded-xl border border-fg-tertiary/30 bg-bg-elev-2/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-fg-tertiary/20 px-5 py-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
            Stitch tray
          </div>
          <div className="mt-1 font-display text-lg italic text-fg-primary">
            {approvedCount} / {totalCount} ready
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-fg-tertiary transition-colors hover:text-fg-primary"
          aria-label="Close stitch tray"
          title="Close"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </header>

      <div className="space-y-4 p-5">
        {/* Thumbnail row — mood-tinted, ember on approved, dim on pending.
            Drag-to-pan with inertial decay; native overflow-x stays intact. */}
        <div
          ref={thumbsRef}
          tabIndex={0}
          aria-label="Beat thumbnails — drag or scroll horizontally"
          // touch-action: pan-y → vertical page scroll starting from this
          // row is preserved on touch devices; only horizontal pan/drag
          // is captured by usePointerDrag.
          style={{ touchAction: "pan-y" }}
          className="flex cursor-grab gap-2 overflow-x-auto pb-1 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden data-[dragging=true]:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember-dim/60 rounded-md"
        >
          {manifest?.beats.map((b) => {
            const scene = b.scenes[0];
            const isApproved = b.status === "approved" || scene.approved;
            const tint = moodAccentColor(b.archetype.mood);
            return (
              <div
                key={b.beatId}
                title={`${b.beatName} · ${b.archetype.mood}`}
                className={cn(
                  "relative aspect-video w-28 flex-shrink-0 overflow-hidden rounded-md border transition-all duration-300",
                  isApproved
                    ? "border-brand-ember/60 shadow-[0_0_18px_-4px_rgba(240,168,104,0.55)]"
                    : "border-fg-tertiary/30 opacity-50",
                )}
              >
                {scene.clipPublicId ? (
                  <img
                    src={buildThumbnailUrl(scene.clipPublicId, { mood: b.archetype.mood })}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-bg-base" />
                )}
                {/* Mood tint — bottom-edge gradient hint, low opacity. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
                  style={{
                    background: `linear-gradient(to top, ${tint}66, transparent)`,
                  }}
                />
                <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-fg-primary mix-blend-difference">
                  {b.beatName}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live URL block. Renders the first URL as a fade-in; subsequent
            approvals typewriter the new tail with an ember afterglow. */}
        <motion.div
          initial={false}
          animate={{ opacity: segments ? 1 : 0.6 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
          className="rounded-md border border-fg-tertiary/30 bg-bg-base/80 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
              Live URL · fl_splice
            </div>
            <button
              onClick={copy}
              disabled={!fullUrl}
              className="text-fg-tertiary transition-colors hover:text-fg-primary disabled:opacity-40"
              aria-label="Copy Cloudinary URL"
              title="Copy URL"
            >
              <Copy size={13} strokeWidth={1.5} />
            </button>
          </div>

          {!segments ? (
            <div className="font-mono text-[10px] leading-relaxed text-fg-tertiary">
              Approve clips to see the URL build.
            </div>
          ) : (
            <div className="break-all font-mono text-[10px] leading-relaxed text-fg-secondary">
              <span>{segments.head}</span>
              <span>{segments.middle}</span>
              {segments.tail ? (
                shouldType ? (
                  <span key={revealKey} className="url-segment-glow">
                    <TextSplitter
                      text={segments.tail}
                      className="reveal-chars"
                      delayStrategy="sequential"
                      perCharStep={0.03}
                      maxTotalDelay={1.4}
                      ariaLabel={segments.tail}
                    />
                  </span>
                ) : (
                  <span>{segments.tail}</span>
                )
              ) : null}
              <span>{segments.base}</span>
            </div>
          )}
        </motion.div>

        <div className="flex flex-col gap-2">
          {renderError ? (
            <div
              role="alert"
              className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-[11px] text-state-error"
            >
              {renderError}
            </div>
          ) : null}
          <Button
            size="md"
            variant="primary"
            disabled={!allReady || rendering}
            onClick={handleRender}
            className={cn("w-full", allReady && !rendering && "ember-pulse")}
            aria-label="Render the final cinematic"
          >
            {rendering ? (
              <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
            {rendering ? "Stitching…" : "Render final cinematic"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!allReady}
            className="btn--edge-underline w-full"
          >
            <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
            Open in CutOS to fine-edit
          </Button>
        </div>
      </div>
    </motion.aside>
  );
}
