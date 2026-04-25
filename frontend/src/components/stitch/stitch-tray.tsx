import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Copy,
  Clapperboard,
  Loader2,
  ArrowUpRight,
  Check,
  Play,
  RotateCw,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useBeatGraphStore,
  selectApprovedClipPublicIds,
} from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { TextSplitter } from "@/lib/text-splitter";
import {
  buildSpliceUrl,
  buildSpliceUrlSegments,
  buildClipUrl,
  buildThumbnailUrl,
} from "@/lib/cloudinary";
import { api, ApiError } from "@/lib/api";
import { playRenderWhoosh } from "@/lib/audio-cues";
import { SPRING, DURATIONS, EASE } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Beat } from "@/types/manifest";

interface StitchTrayProps {
  onClose: () => void;
}

/**
 * The stitch tray — where the user reviews each generated clip and either
 * approves it (locks it into the master cut) or sends it back for a re-take.
 *
 * Previously this was a read-only "look at the URL building" surface, which
 * read as decorative — judges had nothing to do here. Now each beat has its
 * own row with an inline video preview, a status pip, and actionable
 * buttons. The tray IS the editing console; the URL is its live receipt.
 *
 * Layout (top → bottom):
 *   1. Header  — "Stitch" eyebrow + status headline + close
 *   2. Beats   — vertical list of rows; each row is a clip preview + actions
 *   3. URL     — live master-cut URL with copy
 *   4. Render  — primary CTA, ember-pulses when every beat is approved
 *
 * The previous "Stitch · Cloudinary · fl_splice" eyebrow leaked API plumbing
 * into UI text. Dropped — fl_splice still appears in the URL string itself
 * (which is the actual receipt), but the human-facing chrome is just "Stitch."
 */
export function StitchTray({ onClose }: StitchTrayProps) {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const approveScene = useBeatGraphStore((s) => s.approveScene);
  const regenerateScene = useBeatGraphStore((s) => s.regenerateScene);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const setFinalCinematic = useBeatGraphStore((s) => s.setFinalCinematic);
  const setStitchTrayOpen = useBeatGraphStore((s) => s.setStitchTrayOpen);
  const approvedIds = useBeatGraphStore(useShallow(selectApprovedClipPublicIds));
  const totalCount = manifest?.beats.length ?? 0;
  const approvedCount = approvedIds.length;
  const allReady = approvedCount === totalCount && totalCount > 0;
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    setStitchTrayOpen(true);
    return () => {
      mountedRef.current = false;
      setStitchTrayOpen(false);
    };
    // setStitchTrayOpen is a stable Zustand action ref; lint doesn't see it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const segments = buildSpliceUrlSegments(approvedIds);
  const fullUrl = buildSpliceUrl(approvedIds);

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

  const copy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1400);
      toast.success("Master cut URL copied.");
    } catch {
      toast.error("Couldn't reach the clipboard.");
    }
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

  // Status-aware headline. Reads conversationally instead of the previous
  // "Three of seven, ready." word-spelled count, which felt overwritten.
  const headline =
    totalCount === 0
      ? "Compose to begin."
      : approvedCount === 0
        ? "Direct each beat, then approve the takes."
        : approvedCount === totalCount
          ? "Every take approved. Ready to compose."
          : `${approvedCount} of ${totalCount} takes approved.`;

  return (
    <motion.aside
      initial={{ x: "calc(100% + 2rem)", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "calc(100% + 2rem)", opacity: 0 }}
      transition={SPRING.drawer}
      className={cn(
        // Bottom-sheet on <md, floating panel on >=md.
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[88svh] w-full flex-col rounded-t-2xl",
        "md:absolute md:inset-x-auto md:right-6 md:top-20 md:bottom-6 md:max-h-none md:w-[42rem] md:max-w-[calc(100vw-3rem)] md:rounded-2xl",
        "overflow-hidden border border-fg-tertiary/15",
        "bg-[#14110f]/[0.97] backdrop-blur-2xl",
        "shadow-[0_40px_80px_-24px_rgba(0,0,0,0.65),_0_0_0_1px_rgba(255,255,255,0.03)]",
      )}
    >
      {/* Header — eyebrow + headline + close */}
      <header className="flex items-start justify-between gap-4 border-b border-fg-tertiary/15 px-7 pb-5 pt-6">
        <div className="space-y-2">
          <div className="caption-track text-[10px] text-fg-tertiary">Stitch</div>
          <h2 className="font-display text-[1.6rem] italic leading-[1.08] tracking-[-0.018em] text-fg-primary">
            {headline}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="mt-1 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-fg-tertiary/80 transition-colors hover:bg-bg-elev-2 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember"
          aria-label="Close stitch tray"
          title="Close (Esc)"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </header>

      {/* Body — vertical list of beat rows */}
      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-5">
        <ul className="space-y-2.5">
          {manifest?.beats.map((b, i) => (
            <li key={b.beatId}>
              <BeatRow
                beat={b}
                index={i}
                onOpen={() => {
                  setActiveBeat(b.beatId);
                  onClose();
                }}
                onApprove={() => approveScene(b.beatId, b.scenes[0].sceneId)}
                onRetake={() => regenerateScene(b.beatId, b.scenes[0].sceneId)}
              />
            </li>
          ))}
        </ul>

        {/* Live URL block */}
        <section className="space-y-2 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="font-body text-[12px] font-medium text-fg-secondary">
              Master cut URL
            </span>
            <button
              onClick={copy}
              disabled={!fullUrl}
              className="inline-flex items-center gap-1.5 font-body text-[11px] text-fg-tertiary transition-colors hover:text-fg-primary disabled:opacity-40"
              aria-label="Copy master cut URL"
            >
              <AnimatePresence mode="wait" initial={false}>
                {justCopied ? (
                  <motion.span
                    key="check"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 }}
                    className="inline-flex items-center gap-1.5 text-brand-ember"
                  >
                    <Check size={11} strokeWidth={2} aria-hidden="true" />
                    Copied
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.16 }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
                    Copy
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

          <motion.div
            initial={false}
            animate={{ opacity: segments ? 1 : 0.6 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            className={cn(
              "rounded-lg border border-fg-tertiary/15 bg-bg-base/60 p-4",
            )}
          >
            {!segments ? (
              <div className="font-body text-[12px] italic leading-relaxed text-fg-tertiary">
                Approve a take and watch the URL compose itself.
              </div>
            ) : (
              <div className="break-all font-mono text-[11px] leading-[1.65] text-fg-secondary">
                <span className="text-fg-tertiary/70">{segments.head}</span>
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
            className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-body text-[12px] leading-snug text-state-error"
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
            <span className="font-body text-[13px]">
              {rendering ? "Stitching the cut" : allReady ? "Compose the cinematic" : "Render"}
            </span>
          </span>
          <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" className="opacity-80" />
        </Button>
      </footer>
    </motion.aside>
  );
}

/**
 * One beat in the stitch list — a horizontal row with a 16:9 preview tile,
 * status, name, and the relevant action buttons. The row is the unit of
 * editorial: a clip you can play, approve, or send back.
 *
 * State → action map:
 *   pending / questioning  → "Direct" (opens the drawer to chat)
 *   ready-to-generate      → "Direct" (the user knows what to say; opens drawer)
 *   generating             → spinner, no actions
 *   preview                → Approve + Re-take buttons; clip plays inline
 *   approved               → ✓ stamp + "Re-take" only
 */
function BeatRow({
  beat,
  index,
  onOpen,
  onApprove,
  onRetake,
}: {
  beat: Beat;
  index: number;
  onOpen: () => void;
  onApprove: () => void;
  onRetake: () => void;
}) {
  const scene = beat.scenes[0];
  const status = beat.status;
  const isApproved = status === "approved" || scene.approved;
  const isPreview = status === "preview" && !isApproved;
  const isGenerating = status === "generating";
  const hasClip = Boolean(scene.clipPublicId);
  const canApprove = isPreview && hasClip;
  const canRetake = (isPreview || isApproved) && hasClip;

  // Derived URLs — only computed when there's a public id, otherwise empty.
  const videoUrl = hasClip
    ? scene.clipUrl ?? buildClipUrl(scene.clipPublicId!, { mood: beat.archetype.mood })
    : null;
  const thumbnailUrl = hasClip
    ? buildThumbnailUrl(scene.clipPublicId!, { mood: beat.archetype.mood })
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border bg-bg-elev-1/40 p-3 transition-colors",
        isApproved
          ? "border-brand-ember/45 shadow-[0_0_0_1px_rgba(240,168,104,0.08),0_12px_28px_-16px_rgba(240,168,104,0.35)]"
          : "border-fg-tertiary/15 hover:border-fg-tertiary/25",
      )}
    >
      {/* 16:9 preview tile — video when clip exists, gradient placeholder otherwise */}
      <div className="relative aspect-video w-32 flex-shrink-0 overflow-hidden rounded-lg bg-bg-base/60 sm:w-40">
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={thumbnailUrl ?? undefined}
            muted
            loop
            playsInline
            autoPlay
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <PreviewPlaceholder generating={isGenerating} />
        )}
        {/* Status pip — top-right corner */}
        <div className="absolute right-1.5 top-1.5">
          {isApproved ? (
            <span
              className="grid h-5 w-5 place-items-center rounded-full bg-brand-ember text-bg-base"
              style={{ boxShadow: "0 0 10px rgba(240,168,104,0.6)" }}
              aria-label="Approved"
            >
              <Check size={11} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : isGenerating ? (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-bg-base/80">
              <Loader2 size={11} strokeWidth={1.5} className="animate-spin text-brand-ember" />
            </span>
          ) : null}
        </div>
      </div>

      {/* Middle column — index, name, status text */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="caption-track text-[9px] tabular-nums text-fg-tertiary/80">
          {(index + 1).toString().padStart(2, "0")}
        </div>
        <div className="truncate font-display text-[17px] italic leading-[1.1] text-fg-primary">
          {beat.beatName}
        </div>
        <div className="font-body text-[11px] leading-snug text-fg-tertiary">
          <BeatStatusLabel status={status} approved={isApproved} />
        </div>
      </div>

      {/* Right column — actions */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {canApprove ? (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ember px-3 py-1.5 font-body text-[11px] font-medium text-bg-base transition-colors hover:bg-brand-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev-1"
            aria-label="Approve this take"
            title="Approve"
          >
            <Check size={12} strokeWidth={2.5} aria-hidden="true" />
            Approve
          </button>
        ) : null}
        {canRetake ? (
          <button
            type="button"
            onClick={onRetake}
            className="inline-flex items-center gap-1.5 rounded-full border border-fg-tertiary/25 px-3 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:border-fg-tertiary/50 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fg-tertiary"
            aria-label="Send this take back to be regenerated"
            title="Re-take"
          >
            <RotateCw size={11} strokeWidth={1.5} aria-hidden="true" />
            Re-take
          </button>
        ) : null}
        {!canApprove && !canRetake ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-full border border-fg-tertiary/25 px-3 py-1.5 font-body text-[11px] text-fg-secondary transition-colors hover:border-brand-ember/50 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
            aria-label={isGenerating ? "Open beat (generating)" : "Direct this beat"}
            title={isGenerating ? "Generating" : "Direct"}
          >
            <Play size={11} strokeWidth={1.5} aria-hidden="true" />
            {isGenerating ? "Generating" : "Direct"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The placeholder shown in a beat row's preview tile when no clip exists
 * yet. Two states:
 *   generating  → ember-pulse bar, "Generating" caption
 *   pending     → static dim pattern + "No take yet" caption
 *
 * Kept tiny on purpose — the tile is 160×90, anything richer fights the
 * actual video previews on rows that do have clips.
 */
function PreviewPlaceholder({ generating }: { generating: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-bg-elev-2 to-bg-base">
      {generating ? (
        <div className="flex flex-col items-center gap-1.5">
          <span
            aria-hidden
            className="ember-pulse h-1.5 w-8 rounded-full bg-brand-ember"
          />
          <span className="font-body text-[10px] text-brand-ember/85">Generating</span>
        </div>
      ) : (
        <span className="font-body text-[10.5px] italic text-fg-tertiary">
          No take yet
        </span>
      )}
    </div>
  );
}

/**
 * Right-column row caption mapped from beat status. Sentence-case body type
 * across the board — no tracked all-caps. Each line tells the user exactly
 * what state this beat is in and what they can do next.
 */
function BeatStatusLabel({
  status,
  approved,
}: {
  status: Beat["status"];
  approved: boolean;
}) {
  if (approved) return <span className="text-brand-ember/90">Locked into the cut.</span>;
  switch (status) {
    case "pending":
      return <span>Awaiting direction.</span>;
    case "questioning":
      return <span>In conversation with the director.</span>;
    case "ready-to-generate":
      return <span className="text-brand-ember/85">Ready to roll camera.</span>;
    case "generating":
      return <span className="text-brand-ember/85">Rolling.</span>;
    case "preview":
      return <span>Take ready — approve or re-take.</span>;
    case "approved":
      return <span className="text-brand-ember/90">Locked into the cut.</span>;
  }
}
