import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
import { Check, Copy } from "lucide-react";

/**
 * Always-visible Cloudinary stitch URL strip on the canvas route.
 *
 * The label "Master cut" replaces the previous "fl_splice" — the latter was
 * a Cloudinary URL flag leaking out as a UI label, which read as engineering
 * jargon rather than a human surface. The flag itself stays IN the URL where
 * it belongs (judges still see fl_splice doing its work as the URL composes);
 * the human-facing label is film vocabulary.
 *
 * States:
 *   empty (0 approved)         → "Master cut · awaiting first approved beat"
 *   single (1 approved)        → URL with only base id (no overlay yet)
 *   multi  (2+ approved)       → URL with overlay segments + tail typewriter
 *
 * Visual hierarchy on the filled state:
 *   [● state-aware dot]  Eyebrow label  │  live URL …………………………  [Copy]
 *
 * Click the URL → opens the stitch tray (full inspection). Copy button is
 * a separate target so users can grab the URL without committing to the
 * tray. Copy success swaps the icon to a check for ~1.4s.
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
  // Copy-success microstate. Resets to false ~1.4s after a successful copy
  // so the user gets a brief but unmistakable "yes, that worked" response.
  const [justCopied, setJustCopied] = useState(false);
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

  // ── Empty state ────────────────────────────────────────────────────────
  // Aspirational, descriptive, no jargon. The dot is dim ember (signals the
  // surface is real but not yet active) and the copy promises what'll happen.
  if (!segments) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.36, delay: 0.6 }}
        className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-6"
      >
        <button
          onClick={onOpenTray}
          className="pointer-events-auto group inline-flex min-h-10 items-center gap-3 rounded-full border border-fg-tertiary/15 bg-bg-elev-1/60 px-5 py-2 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-[border-color,background-color] duration-200 hover:border-brand-ember/35 hover:bg-bg-elev-1/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          aria-label="Master cut — awaiting approvals. Click to open stitch tray."
        >
          <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-ember/35" />
          <span className="font-body text-pill font-medium text-fg-secondary transition-colors group-hover:text-brand-ember/90">
            Master cut
          </span>
          <span aria-hidden className="h-3.5 w-px flex-shrink-0 bg-fg-tertiary/20" />
          {/* Roman font-body, not display italic — italics are
              connectives-only per the typography doctrine, and display
              font below 14px reads as a cramped wedding-invite. The
              empty-state label is functional, not poetic. */}
          <span className="font-body text-pill text-fg-tertiary">
            awaiting approvals
          </span>
        </button>
      </motion.div>
    );
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  // ── Filled state ───────────────────────────────────────────────────────
  // ● ember dot │ Master cut │ live URL │ Copy
  // The dot pulses ember when at least one beat is approved (the URL is
  // "alive"). Eyebrow + URL + copy are three distinct surfaces with their
  // own focus rings — accessibility AND clarity of action.
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-6"
    >
      <div className="pointer-events-auto flex min-h-10 max-w-[calc(100vw-3rem)] select-text items-center gap-3 rounded-full border border-fg-tertiary/20 bg-bg-elev-1/75 py-2 pl-5 pr-2 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]">
        <span
          aria-hidden
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-ember shadow-[0_0_8px_rgba(240,168,104,0.55)]"
        />
        <span className="flex-shrink-0 font-body text-xs font-medium text-brand-ember/90">
          Master cut
        </span>
        <span aria-hidden className="h-3.5 w-px flex-shrink-0 bg-fg-tertiary/25" />
        <button
          onClick={onOpenTray}
          className="min-w-0 overflow-hidden whitespace-nowrap font-mono text-xs tabular-nums text-fg-secondary transition-colors hover:text-fg-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elev-1"
          aria-label="Open stitch tray to inspect the full URL"
          title="Open stitch tray"
        >
          <span className="text-fg-tertiary/70">…/upload/</span>
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
          aria-label={justCopied ? "Copied" : "Copy master cut URL"}
          title={justCopied ? "Copied" : "Copy URL"}
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-fg-tertiary transition-colors hover:bg-bg-elev-2/60 hover:text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elev-1"
        >
          <AnimatePresence mode="wait" initial={false}>
            {justCopied ? (
              <motion.span
                key="check"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.16 }}
                className="grid place-items-center text-brand-ember"
              >
                <Check size={12} strokeWidth={2} aria-hidden="true" />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.16 }}
                className="grid place-items-center"
              >
                <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
  );
}
