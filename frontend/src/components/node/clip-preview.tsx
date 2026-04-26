import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { Button } from "@/components/ui/button";
import { buildClipUrl } from "@/lib/cloudinary-transforms";
import { playApproveChime } from "@/lib/audio-cues";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";
import type { Beat } from "@/types/manifest";

interface ClipPreviewProps {
  beat: Beat;
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Composes the custom <VideoPlayer> with the Approve / Regenerate split CTA.
 * Rendered by NodeDetailDrawer when beat.status is "preview" or "approved".
 *
 * The video URL is mood-graded at the Cloudinary CDN edge — same publicId,
 * different transform → different look. See lib/cloudinary-transforms.ts.
 *
 * Approve: marks scene approved + closes the drawer so the canvas's
 *   approved-state node visual takes over.
 * Regenerate: clears clip fields + flips status back to ready-to-generate;
 *   conversation is preserved.
 */
export function ClipPreview({ beat }: ClipPreviewProps) {
  const scene = beat.scenes[0];
  const approveScene = useBeatGraphStore((s) => s.approveScene);
  const regenerateScene = useBeatGraphStore((s) => s.regenerateScene);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  // Tracks the post-Approve close-drawer timer so unmount cancels it.
  // Without this, force-closing the drawer mid-approve fires setActiveBeat
  // on a stale state — and could close a *different* beat the user has
  // since opened.
  const approveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (approveTimerRef.current !== null) {
        window.clearTimeout(approveTimerRef.current);
        approveTimerRef.current = null;
      }
    };
  }, []);

  const isApproved = beat.status === "approved" || scene.approved;

  // Mood-graded Cloudinary URL when a publicId exists. The real backend
  // always emits a publicId on success — null = an actual no-clip state,
  // which the empty render below handles.
  const src = scene.clipPublicId
    ? buildClipUrl(scene.clipPublicId, { mood: beat.archetype.mood })
    : "";

  if (!src) {
    return (
      <div className="grid h-full place-items-center font-display text-body-sm italic text-fg-tertiary">
        Clip not yet available.
      </div>
    );
  }

  const handleApprove = () => {
    // Race guard: a double-click within the 220ms close-drawer window
    // would re-fire approveScene + the chime. The timer ref doubles as
    // an "in flight" flag — if it's set, we're already approving.
    if (isApproved || approveTimerRef.current !== null) return;
    approveScene(beat.beatId, scene.sceneId);
    // Two-note chime — quiet completion punctuation; mute toggle respected.
    playApproveChime();
    // Brief pause (DURATIONS.quick) so the user sees the approve happen
    // before the drawer exit animation runs — feels more deliberate.
    approveTimerRef.current = window.setTimeout(() => {
      approveTimerRef.current = null;
      setActiveBeat(null);
    }, DURATIONS.quick * 1000);
  };

  const handleRegenerate = () => {
    regenerateScene(beat.beatId, scene.sceneId);
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: STAGGER.drawerInner } },
      }}
      className="flex h-full flex-col gap-5"
    >
      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
      >
        <VideoPlayer
          src={src}
          suggestedDurationSeconds={scene.durationSeconds ?? beat.archetype.suggestedDuration}
          caption={`${beat.beatName} · ${beat.archetype.mood}`}
        />
      </motion.div>

      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="flex items-baseline justify-between font-body text-pill font-medium"
      >
        <span className="text-fg-tertiary">Refined prompt</span>
        <span className="font-mono text-pill tabular-nums text-fg-tertiary/70">
          {scene.durationSeconds ?? beat.archetype.suggestedDuration}s
        </span>
      </motion.div>

      <motion.p
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="line-clamp-3 max-w-prose font-body text-[0.875rem] leading-[1.55] text-fg-secondary"
      >
        {scene.refinedPrompt ?? beat.archetype.intent}
      </motion.p>

      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="mt-auto flex gap-2 border-t border-fg-tertiary/30 pt-4"
      >
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={handleApprove}
          disabled={isApproved}
        >
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          {isApproved ? "Approved" : "Approve scene"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="btn--edge-underline basis-1/4"
          onClick={handleRegenerate}
          disabled={isApproved}
          title="Regenerate"
        >
          <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
          Regenerate
        </Button>
      </motion.div>
    </motion.div>
  );
}
