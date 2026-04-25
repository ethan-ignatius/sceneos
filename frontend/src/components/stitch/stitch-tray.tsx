import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Copy, Clapperboard, Loader2, ArrowUpRight, Check } from "lucide-react";
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
 * The Cloudinary moment, redesigned for editorial weight.
 *
 * Structure (top → bottom):
 *   1. Eyebrow caption ("STITCH · CLOUDINARY · fl_splice")
 *   2. Display headline showing approval state (e.g. "Three of seven, ready.")
 *   3. Thumbnail strip — numbered cards, mood-tinted, ember halo when approved
 *   4. Live URL card — head/middle/tail/base with typewriter on the new tail
 *   5. Render CTA — primary, ember pulse when allReady
 *
 * Premium goals (vs. the old generic panel):
 *   - Display serif title carries the gravitas
 *   - Thumbnails framed like film slates, numbered + named, breathing room
 *   - URL block treated as the showpiece (numbered segments, larger type)
 *   - Tray is wider (40rem) and taller — the demo viewer is meant to read it
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

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const segments = buildSpliceUrlSegments(approvedIds);

  const prevCountRef = useRef(0);
  const [revealKey, setRevealKey] = useState(0);
  const [shouldType, setShouldType] = useState(false);
  useEffect(() => {
    if (approvedCount > prevCountRef.current && approvedCount >= 2) {
      setRevealKey((k) => k + 1);
      setShouldType(true);
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
    toast.success("Final URL copied.");
  };

  const handleRender = async () => {
    if (!manifest || !allReady || rendering) return;
    setRendering(true);
    setRenderError(null);
    playRenderWhoosh();
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

  const thumbsRef = useRef<HTMLDivElement>(null);
  usePointerDrag(thumbsRef);

  // Headline copy: "Three of seven, ready." reads better than "3 / 7 ready"
  // when the numbers are <10. Full-spelled and italic for editorial weight.
  const numberWord = (n: number): string => {
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    return words[n] ?? n.toString();
  };
  const headline = totalCount === 0
    ? "Compose to begin."
    : approvedCount === 0
      ? `${numberWord(totalCount)} beats, awaiting approval.`
      : approvedCount === totalCount
        ? "All beats ready. Compose the cut."
        : `${numberWord(approvedCount)} of ${numberWord(totalCount)}, ready.`;

  return (
    <motion.aside
      initial={{ x: "calc(100% + 2rem)", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "calc(100% + 2rem)", opacity: 0 }}
      transition={SPRING.drawer}
      className={cn(
        // Bottom-sheet on <md, floating panel on >=md (#155). Same visual
        // weight, different geometry per viewport.
        "fixed inset-x-0 bottom-0 z-40 flex max-h-[85svh] w-full flex-col rounded-t-md",
        "md:absolute md:inset-x-auto md:right-6 md:top-20 md:bottom-6 md:max-h-none md:w-[40rem] md:max-w-[calc(100vw-3rem)] md:rounded-md",
        "overflow-hidden border border-brand-ember-dim/30",
        "bg-bg-elev-1/85 backdrop-blur-2xl",
        "shadow-[0_40px_80px_-24px_rgba(0,0,0,0.7),_0_0_0_1px_rgba(240,168,104,0.06)]",
      )}
    >
      {/* Header — caption + display headline + close */}
      <header className="flex items-start justify-between gap-4 border-b border-fg-tertiary/15 px-7 pb-5 pt-6">
        <div className="space-y-2">
          <div className="caption-track text-[10px] text-fg-tertiary">
            Stitch · Cloudinary · fl_splice
          </div>
          <h2 className="font-display text-3xl italic leading-tight text-fg-primary">
            {headline}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="mt-1 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-fg-tertiary/30 text-fg-tertiary transition-colors hover:border-fg-secondary hover:text-fg-primary"
          aria-label="Close stitch tray"
          title="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      {/* Scrolling content body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">
        {/* Thumbnail strip — numbered film slates */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="caption-track text-[10px]">Beat strip</span>
            <span className="font-mono text-[10px] tabular-nums text-fg-tertiary">
              {approvedCount.toString().padStart(2, "0")}/{totalCount.toString().padStart(2, "0")}
            </span>
          </div>
          <div
            ref={thumbsRef}
            tabIndex={0}
            aria-label="Beat strip — drag or scroll horizontally"
            style={{ touchAction: "pan-y" }}
            className={cn(
              "flex cursor-grab gap-3 overflow-x-auto pb-2 select-none",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "data-[dragging=true]:cursor-grabbing",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember-dim/60 rounded-md",
            )}
          >
            {manifest?.beats.map((b, i) => {
              const scene = b.scenes[0];
              const isApproved = b.status === "approved" || scene.approved;
              const tint = moodAccentColor(b.archetype.mood);
              const beatNumber = (i + 1).toString().padStart(2, "0");
              return (
                <div
                  key={b.beatId}
                  title={`${b.beatName} · ${b.archetype.mood}`}
                  className={cn(
                    "relative aspect-[4/5] w-[7.5rem] flex-shrink-0 overflow-hidden rounded-md border",
                    "transition-[border-color,opacity,box-shadow] duration-300 ease-out",
                    isApproved
                      ? "border-brand-ember/60 shadow-[0_0_24px_-6px_rgba(240,168,104,0.6)]"
                      : "border-fg-tertiary/25 opacity-70 hover:opacity-100",
                  )}
                >
                  {/* Backdrop image (when approved) or mood-gradient placeholder */}
                  {scene.clipPublicId ? (
                    <img
                      src={buildThumbnailUrl(scene.clipPublicId, { mood: b.archetype.mood })}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(140deg, ${tint}30 0%, #14110f 60%)`,
                      }}
                    />
                  )}

                  {/* Bottom mood-tint gradient for legibility of the caption */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
                    style={{
                      background: `linear-gradient(to top, rgba(10,9,8,0.92), transparent)`,
                    }}
                  />

                  {/* Beat number — top-left, mono, slate-style */}
                  <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                        isApproved
                          ? "bg-brand-ember/20 text-brand-ember"
                          : "bg-bg-base/70 text-fg-secondary",
                      )}
                    >
                      {beatNumber}
                    </span>
                    {isApproved ? (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-ember text-bg-base">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    ) : null}
                  </div>

                  {/* Beat name — bottom, display italic */}
                  <div className="absolute inset-x-2.5 bottom-2.5 space-y-0.5">
                    <div className="font-display text-base italic leading-tight text-fg-primary">
                      {b.beatName}
                    </div>
                    <div
                      className="font-mono text-[9px] uppercase tracking-[0.18em]"
                      style={{ color: tint }}
                    >
                      {b.archetype.mood.replace(/-/g, " ")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Live URL — the punchline, treated like a code editor card */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="caption-track text-[10px]">Live cut · {approvedCount} clip{approvedCount === 1 ? "" : "s"}</span>
            <button
              onClick={copy}
              disabled={!fullUrl}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-tertiary transition-colors hover:text-fg-primary disabled:opacity-40"
              aria-label="Copy Cloudinary URL"
            >
              <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
              Copy
            </button>
          </div>

          <motion.div
            initial={false}
            animate={{ opacity: segments ? 1 : 0.55 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            className={cn(
              "rounded-md border border-fg-tertiary/20 bg-bg-base/60 p-4",
              "shadow-[inset_0_0_0_1px_rgba(240,168,104,0.04)]",
            )}
          >
            {!segments ? (
              <div className="font-mono text-[11px] leading-relaxed text-fg-tertiary">
                Approve a clip to see the URL build itself, segment by segment.
              </div>
            ) : (
              <div className="break-all font-mono text-[11px] leading-[1.65] text-fg-secondary">
                <span className="text-fg-tertiary/80">{segments.head}</span>
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
                <span className="text-brand-ember">{segments.base}</span>
              </div>
            )}
          </motion.div>
        </section>
      </div>

      {/* Footer — render CTA */}
      <footer className="space-y-3 border-t border-fg-tertiary/15 px-7 pb-6 pt-5">
        {renderError ? (
          <div
            role="alert"
            className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-[11px] text-state-error"
          >
            {renderError}
          </div>
        ) : null}
        <Button
          size="lg"
          variant="primary"
          disabled={!allReady || rendering}
          onClick={handleRender}
          className={cn("w-full justify-between", allReady && !rendering && "ember-pulse")}
          aria-label="Render the final cinematic"
        >
          <span className="inline-flex items-center gap-2">
            {rendering ? (
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
            ) : (
              <Clapperboard size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            {rendering ? "Stitching the cut…" : allReady ? "Compose the cinematic" : "Render"}
          </span>
          <ArrowUpRight
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            className="opacity-80 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Button>
      </footer>
    </motion.aside>
  );
}
