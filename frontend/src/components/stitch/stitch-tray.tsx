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
  Volume2,
  SkipForward,
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
import { renderHighlightedUrl } from "@/lib/url-display";
import { api, ApiError } from "@/lib/api";
import { playRenderWhoosh } from "@/lib/audio-cues";
import { useNarration } from "@/lib/use-narration";
import { isDemoMode } from "@/lib/demo-mode";
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
  const approvedIds = useBeatGraphStore(useShallow(selectApprovedClipPublicIds));
  const totalCount = manifest?.beats.length ?? 0;
  const approvedCount = approvedIds.length;
  const allReady = approvedCount === totalCount && totalCount > 0;
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);
  const narration = useNarration();
  const [narrationHeard, setNarrationHeard] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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
      // ── Bake the narrator into the master cut ──────────────────────
      // Per the video script: ElevenLabs reads the cinematic over the
      // final video. We call /api/narrate/summary first to generate the
      // narration audio (Gemini writes the script, ElevenLabs voices
      // it, Cloudinary uploads it as a public_id). Then we pass that
      // publicId to /api/stitch/url as audioPublicId — Cloudinary
      // composes l_audio:<narration> on top of the splice, so the
      // narrator's voice is permanently part of the rendered URL.
      // No client-side audio mixing needed; the cinematic IS the
      // narrated cinematic.
      let narrationPublicId: string | undefined;
      // Demo mode skips ElevenLabs entirely. The /api/narrate/summary
      // endpoint isn't mocked, so calling it during a live demo with
      // the backend offline would hang on a connection-refused/timeout
      // before falling through. The pre-stitched master cut already
      // carries its own audio bed.
      if (!isDemoMode()) {
        try {
          const narrationRes = await api.narrateSummary({ manifest });
          if (narrationRes?.publicId) {
            narrationPublicId = narrationRes.publicId;
          }
        } catch (err) {
          // Narration is best-effort — if it fails (ElevenLabs key
          // missing, quota, etc.) we fall through to a silent or
          // music-only stitch. Render must not block on narration.
          console.warn("[stitch] narration failed; rendering without narrator", err);
        }
      }

      // The stitch URL is the OPENING cut. The editor route will re-bake it
      // through /api/editor/apply once the user lands and refines the edit.
      // We seed the same fields here so the final-delivery route still works
      // as a fallback if the user skips the editor.
      const res = await api.stitchUrl({
        manifest,
        ...(narrationPublicId ? { audioPublicId: narrationPublicId } : {}),
      });
      if (!mountedRef.current) return;
      setFinalCinematic({
        finalUrl: res.finalUrl,
        thumbnailUrl: res.thumbnailUrl,
        durationSeconds: res.durationSeconds,
      });
      // Demo mode skips the editor route — its backend endpoints
      // (/api/editor/init, /api/editor/apply, /api/editor/stream) are
      // not part of the demo-mode mock surface, so a nav to /edit would
      // immediately surface "Couldn't load the cut for editing." For
      // the live judging round we land directly on /final with the
      // pre-stitched master cut playing.
      navigate(isDemoMode() ? "/final" : "/edit");
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
      id="stitch-tray"
      role="dialog"
      aria-modal="false"
      aria-label="Stitch tray — review and approve takes"
      initial={{ x: "calc(100% + 2rem)", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "calc(100% + 2rem)", opacity: 0 }}
      transition={SPRING.drawer}
      className={cn(
        // Bottom-sheet on <md, floating panel on >=md. select-text reverses
        // the canvas main's select-none — the URL string and beat names
        // here ARE meant to be copyable.
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[88svh] w-full select-text flex-col rounded-t-2xl",
        "md:absolute md:inset-x-auto md:right-6 md:top-20 md:bottom-6 md:max-h-none md:w-[42rem] md:max-w-[calc(100vw-3rem)] md:rounded-2xl",
        "overflow-hidden border border-fg-tertiary/15",
        "bg-bg-panel/97 backdrop-blur-2xl",
        "shadow-(--shadow-deep)",
      )}
    >
      {/* Header — eyebrow + headline + close */}
      <header className="flex items-start justify-between gap-4 border-b border-fg-tertiary/15 px-7 pb-5 pt-6">
        <div className="space-y-2">
          <div className="font-body text-pill font-medium text-fg-tertiary">Stitch</div>
          <h2 className="text-balance font-body text-lede font-semibold leading-[1.18] tracking-[-0.018em] text-fg-primary">
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
      <div
        data-lenis-prevent
        className="flex-1 space-y-6 overflow-y-auto px-7 py-5 [scrollbar-width:thin]"
      >
        <ul className="divide-y divide-fg-tertiary/12 border-t border-fg-tertiary/12">
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
            <span className="font-body text-pill font-medium text-fg-secondary">
              Master cut URL
            </span>
            <button
              onClick={copy}
              disabled={!fullUrl}
              className="inline-flex items-center gap-1.5 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary disabled:opacity-40"
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
              // overflow-hidden on the panel + overflow-wrap:anywhere on
              // the inner URL block. Without these, the master cut URL
              // (one ~600-char "word" when fl_splice'd across 5 beats)
              // bleeds past the panel's rounded right edge — TextSplitter's
              // per-word inline-block groups have whiteSpace:nowrap, so
              // break-all alone doesn't break inside them. overflow-wrap:
              // anywhere overrides that and forces the chars to wrap.
              "overflow-hidden rounded-lg border border-fg-tertiary/15 bg-bg-base/60 p-4",
            )}
          >
            {!segments ? (
              <div className="font-body text-pill italic leading-relaxed text-fg-tertiary">
                Approve a take and watch the URL compose itself.
              </div>
            ) : (
              <div className="font-mono text-caption leading-[1.65] text-fg-secondary [overflow-wrap:anywhere] [word-break:break-all]">
                <span className="text-fg-tertiary/70">{segments.head}</span>
                <span>{renderHighlightedUrl(segments.middle)}</span>
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
                    <span>{renderHighlightedUrl(segments.tail)}</span>
                  )
                ) : null}
                <span className="text-brand-ember">{segments.base}</span>
              </div>
            )}
          </motion.div>
        </section>
      </div>

      {/* Footer — narration + render CTA */}
      <footer className="space-y-3 border-t border-fg-tertiary/15 px-7 pb-6 pt-5">
        {renderError ? (
          <div
            role="alert"
            className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-body text-pill leading-snug text-state-error"
          >
            {renderError}
          </div>
        ) : null}

        {/* Narration — "Hear the story" or playing state */}
        <AnimatePresence>
          {allReady && !narrationHeard && narration.status === "idle" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Button
                size="lg"
                variant="ghost"
                className="w-full justify-center gap-2 border-brand-ember/40 text-fg-primary hover:bg-brand-ember/10 hover:text-brand-ember"
                onClick={() => manifest && narration.playSummaryNarration(manifest)}
                aria-label="Hear the narrator tell your story"
              >
                <Volume2 size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="font-body text-meta font-medium">Hear the story</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(narration.status === "loading" || narration.status === "playing") && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE.outQuart }}
              className="space-y-3"
            >
              {/* Waveform + status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 size={14} className="text-brand-ember" />
                  <div className="flex items-center gap-[3px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.span
                        key={i}
                        className="inline-block w-[2px] rounded-full bg-brand-ember"
                        animate={
                          narration.status === "playing"
                            ? { height: [3, 12, 3] }
                            : { height: 3 }
                        }
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.12,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-body text-pill text-fg-tertiary">
                    {narration.status === "loading" ? "Preparing narration..." : "Narrator"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    narration.stop();
                    setNarrationHeard(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary"
                  aria-label="Skip narration"
                >
                  <SkipForward size={12} strokeWidth={1.5} />
                  <span>Skip</span>
                </button>
              </div>

              {/* Subtitle text */}
              {narration.currentText && narration.status === "playing" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.85 }}
                  className="font-body text-body-sm italic leading-relaxed text-fg-secondary"
                >
                  {narration.currentText}
                </motion.p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {narration.status === "done" && !narrationHeard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onAnimationComplete={() => setNarrationHeard(true)}
              transition={{ duration: 0.5 }}
            />
          )}
        </AnimatePresence>

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
            <span className="font-body text-meta">
              {rendering ? "Stitching the cut" : allReady ? "Open the editor" : "Render"}
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
  // Tracks whether the <video> errored. Resuming an archived project may
  // surface stale Cloudinary URLs (rotated cloud, deleted public_id);
  // we hide the player and show "Clip unavailable" instead of letting
  // the row render a broken-image icon.
  const [mediaUnavailable, setMediaUnavailable] = useState(false);

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
        "relative flex items-center gap-3 py-3 pl-3 transition-colors sm:gap-4 sm:py-3.5",
        // Approved: a single 1px ember bar on the left edge (structural cue,
        // not a decorative outline). Replaces the old card-shadow+border.
        isApproved &&
          "before:absolute before:left-0 before:top-1/2 before:h-7 before:w-px before:-translate-y-1/2 before:bg-brand-ember",
      )}
    >
      {/* Left: a 16:9 video thumb when a clip exists; otherwise just the
          index in caption-track. Reserving a placeholder tile for "no take
          yet" rows was visual noise — the empty state earns no real estate
          until there's something to show. */}
      {hasClip ? (
        <div className="relative aspect-video w-20 flex-shrink-0 overflow-hidden rounded-md bg-bg-base/60 sm:w-24">
          {videoUrl && !mediaUnavailable ? (
            <video
              src={videoUrl}
              poster={thumbnailUrl ?? undefined}
              muted
              loop
              playsInline
              autoPlay
              onError={() => setMediaUnavailable(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {/* Stale Cloudinary URL fallback — when the video errors (404, expired,
              network), we hide the <video> tag and show a small "Clip
              unavailable" caption so the row doesn't render a broken-image
              icon. Resuming an old archived project hits this path most
              often. */}
          {mediaUnavailable ? (
            <div className="absolute inset-0 grid place-items-center bg-bg-base/80 px-1 text-center font-body text-overline text-fg-tertiary">
              Clip unavailable
            </div>
          ) : null}
          {isGenerating ? (
            <span className="absolute inset-0 grid place-items-center bg-bg-base/40">
              <Loader2 size={11} strokeWidth={1.5} className="animate-spin text-brand-ember" />
            </span>
          ) : null}
        </div>
      ) : (
        <span
          className={cn(
            "flex w-8 flex-shrink-0 items-center font-body text-pill font-medium tabular-nums sm:w-10",
            isApproved ? "text-brand-ember/80" : "text-fg-tertiary/65",
          )}
        >
          {(index + 1).toString().padStart(2, "0")}
        </span>
      )}

      {/* Middle: beat name + status caption. The index badge in the prior
          design lived here too; with the conditional left slot it lives
          there now, which removes a duplicate display. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Beat name now in body Geist, weight 600, tracking tight. The
            previous font-display italic at 15px was Fraunces italic on
            every row — five identical italic lines stacked read as
            wedding-invite, not editorial. Body weight + size separation
            from the status caption gives proper hierarchy without the
            display register fighting itself. */}
        <span
          className={cn(
            "truncate font-body text-body-sm font-semibold leading-[1.25] tracking-[-0.005em]",
            isApproved ? "text-brand-ember" : "text-fg-primary",
          )}
        >
          {beat.beatName}
        </span>
        <span className="font-body text-pill leading-snug text-fg-tertiary">
          <BeatStatusLabel status={status} approved={isApproved} />
        </span>
      </div>

      {/* Right: actions. Labels collapse to icon-only below `sm` so tight
          drawer widths (mobile / narrow split) stay usable. */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {canApprove ? (
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-full bg-brand-ember px-2.5 py-1.5 font-body text-caption font-medium text-bg-base transition-colors hover:bg-brand-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev-1"
            aria-label="Approve this take"
            title="Approve"
          >
            <Check size={11} strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden sm:inline">Approve</span>
          </button>
        ) : null}
        {canRetake ? (
          <button
            type="button"
            onClick={onRetake}
            className="inline-flex items-center gap-1 rounded-full border border-fg-tertiary/20 px-2.5 py-1.5 font-body text-caption text-fg-secondary transition-colors hover:border-fg-tertiary/45 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fg-tertiary"
            aria-label="Send this take back to be regenerated"
            title="Re-take"
          >
            <RotateCw size={10} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Re-take</span>
          </button>
        ) : null}
        {!canApprove && !canRetake ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-full border border-fg-tertiary/20 px-2.5 py-1.5 font-body text-caption text-fg-secondary transition-colors hover:border-brand-ember/50 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
            aria-label={isGenerating ? "Open beat (generating)" : "Direct this beat"}
            title={isGenerating ? "Generating" : "Direct"}
          >
            <Play size={10} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">{isGenerating ? "Generating" : "Direct"}</span>
          </button>
        ) : null}
      </div>
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
