import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import {
  useBeatGraphStore,
  selectApprovedClipPublicIds,
} from "@/stores/beat-graph-store";
import {
  buildSpliceUrl,
  buildSpliceUrlSegments,
} from "@/lib/cloudinary";
import { TextSplitter } from "@/lib/text-splitter";
import { toast } from "sonner";
import { Copy } from "lucide-react";

/**
 * Always-visible Cloudinary fl_splice URL strip on the canvas route.
 * Per VIABILITY §5 V2 — the Cloudinary track-hero feature must NOT be
 * gated by the user opening the stitch tray. Judges see the URL composing
 * itself in real time as beats approve, even if they never click anything.
 *
 * When the user clicks the URL, the full tray opens (handled by the parent
 * via onOpenTray). Approved-segment count + animated tail typewriter +
 * ember afterglow on new tail.
 */
interface PersistentUrlStripProps {
  onOpenTray: () => void;
}

export function PersistentUrlStrip({ onOpenTray }: PersistentUrlStripProps) {
  // useShallow: selectApprovedClipPublicIds constructs a fresh array on every
  // call. Without shallow equality, zustand v5 considers each call a state
  // change and re-renders on every store update — which under React 19 +
  // StrictMode can cascade into a max-update-depth crash.
  const approvedIds = useBeatGraphStore(useShallow(selectApprovedClipPublicIds));
  // Hide the strip while the stitch tray is open — the same content appears
  // (in fuller form) inside the tray, and leaving it visible underneath
  // creates the bottom-left bleed seen in the screenshot.
  const stitchTrayOpen = useBeatGraphStore((s) => s.stitchTrayOpen);

  // ALL hooks must run on every render — early returns mid-component cause
  // "Rendered fewer hooks than expected" under React 19. The visibility
  // gate moves to the bottom (after hooks).
  const prevCountRef = useRef(0);
  const [revealKey, setRevealKey] = useState(0);
  const [shouldType, setShouldType] = useState(false);
  useEffect(() => {
    if (approvedIds.length > prevCountRef.current && approvedIds.length >= 2) {
      setRevealKey((k) => k + 1);
      setShouldType(true);
      const t = window.setTimeout(() => setShouldType(false), 1000);
      prevCountRef.current = approvedIds.length;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = approvedIds.length;
  }, [approvedIds.length]);

  // Visibility gate now AFTER hooks (was a bug — early-return crash).
  if (stitchTrayOpen) return null;
  const segments = buildSpliceUrlSegments(approvedIds);
  const fullUrl = buildSpliceUrl(approvedIds);

  if (!segments) {
    // Empty state — keep it short. The user already knows what fl_splice is
    // by the time they're on the canvas; the teaser only needs to invite.
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.36, delay: 0.6 }}
        className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-6"
      >
        <button
          onClick={onOpenTray}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-fg-tertiary/25 bg-bg-elev-1/60 px-3 py-1.5 caption-track text-[10px] text-fg-tertiary backdrop-blur-xl transition-colors hover:border-brand-ember/50 hover:text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <span className="text-brand-ember">●</span>
          <span>fl_splice · approve a beat to begin</span>
        </button>
      </motion.div>
    );
  }

  const handleCopy = async () => {
    if (!fullUrl) return;
    await navigator.clipboard.writeText(fullUrl);
    toast.success("Final URL copied.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-6"
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-3rem)] items-center gap-2 rounded-full border border-fg-tertiary/25 bg-bg-elev-1/70 px-3 py-1.5 backdrop-blur-xl shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]">
        <span className="caption-track flex-shrink-0 text-[10px] text-fg-tertiary">
          fl_splice
        </span>
        <span className="h-3 w-px flex-shrink-0 bg-fg-tertiary/30" aria-hidden="true" />
        <button
          onClick={onOpenTray}
          className="overflow-hidden whitespace-nowrap font-mono text-[11px] tabular-nums text-fg-secondary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-brand-ember"
          aria-label="Open stitch tray to inspect URL"
          title="Open stitch tray"
        >
          <span className="text-fg-tertiary/80">…/upload/</span>
          {segments.middle ? (
            <span className="text-fg-secondary">{segments.middle}</span>
          ) : null}
          {segments.tail ? (
            shouldType ? (
              <span key={revealKey} className="url-segment-glow">
                <TextSplitter
                  text={segments.tail}
                  className="reveal-chars"
                  delayStrategy="sequential"
                  perCharStep={0.025}
                  maxTotalDelay={1.0}
                  ariaLabel={segments.tail}
                />
              </span>
            ) : (
              <span>{segments.tail}</span>
            )
          ) : null}
          <span className="text-brand-ember">{segments.base}</span>
        </button>
        <button
          onClick={handleCopy}
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-fg-tertiary transition-colors hover:text-fg-primary"
          aria-label="Copy Cloudinary URL"
          title="Copy URL"
        >
          <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
