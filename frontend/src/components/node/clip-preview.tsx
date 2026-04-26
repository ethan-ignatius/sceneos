import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { Check, RotateCcw, AlertTriangle } from "lucide-react";
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
 * Approve: marks scene approved (drawer stays open — use the footer's
 *   "Next" to move to the next beat in the pipeline).
 * Regenerate: clears clip fields + flips status back to ready-to-generate;
 *   conversation is preserved.
 */
export function ClipPreview({ beat }: ClipPreviewProps) {
  const scene = beat.scenes[0];
  const approveScene = useBeatGraphStore((s) => s.approveScene);
  const regenerateScene = useBeatGraphStore((s) => s.regenerateScene);
  const isApproved = beat.status === "approved" || scene.approved;

  // Approval is explicit. The earlier "auto-approve the moment the clip
  // lands" behavior, combined with the 1.6s auto-advance in the parent
  // drawer, gave the user no time to actually watch the generated video
  // before being booted to the next beat. Now: Veo lands → user watches
  // → user clicks "Approve scene" → auto-advance fires after that.
  const handleApprove = () => {
    if (isApproved) return;
    approveScene(beat.beatId, scene.sceneId);
    playApproveChime();
  };

  // Mood-graded Cloudinary URL when a publicId exists. The real backend
  // always emits a publicId on success — null = an actual no-clip state,
  // which the empty render below handles.
  const src = scene.clipUrl
    || (scene.clipPublicId
      ? buildClipUrl(scene.clipPublicId, { mood: beat.archetype.mood })
      : "");

  if (!src) {
    return (
      <div className="grid h-full place-items-center font-display text-body-sm italic text-fg-tertiary">
        Clip not yet available.
      </div>
    );
  }

  // Two-step retake: click once → confirmation pops; click "Confirm
  // retake" → actual regeneration fires. Veo renders cost real money
  // (~$2-3 per take), and the user explicitly flagged that an
  // accidental click should not silently torch a finished take.
  const [confirmingRetake, setConfirmingRetake] = useState(false);
  const cancelConfirm = () => setConfirmingRetake(false);
  const handleRegenerate = () => {
    if (!confirmingRetake) {
      setConfirmingRetake(true);
      // Auto-dismiss confirmation after 5s if user doesn't act —
      // they probably hovered the wrong button and walked away.
      window.setTimeout(() => setConfirmingRetake(false), 5000);
      return;
    }
    setConfirmingRetake(false);
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

      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="flex min-h-0 flex-1 max-w-prose overflow-hidden rounded-md border border-fg-tertiary/20 bg-fg-primary/[0.02] p-3"
      >
        <p
          data-lenis-prevent
          className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words font-body text-[0.875rem] leading-[1.55] text-fg-secondary [scrollbar-width:thin]"
          title={scene.refinedPrompt ?? beat.archetype.intent}
        >
          {scene.refinedPrompt ?? beat.archetype.intent}
        </p>
      </motion.div>

      {/* Footer: Approve as the primary CTA (auto-approve was removed
          because the 1.6s downstream auto-advance gave the user no time
          to watch the clip). Regenerate is a destructive secondary —
          two-step confirmation arms first ("Confirm retake?"), second
          click within 5s actually fires regenerateScene. Without that,
          an accidental click silently torches a finished take that cost
          real Veo compute (~$2-3 per render). */}
      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="mt-auto flex items-center justify-between gap-2 border-t border-fg-tertiary/30 pt-4"
      >
        <AnimatePresence mode="wait">
          {confirmingRetake ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18, ease: EASE.outQuart }}
              className="flex items-center gap-2"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelConfirm}
                aria-label="Cancel retake"
                className="text-fg-tertiary hover:text-fg-secondary"
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={handleRegenerate}
                aria-label="Confirm retake — discard this clip and re-render"
                className="border border-state-warning/50 bg-state-warning/10 text-state-warning hover:bg-state-warning/15"
              >
                <AlertTriangle size={14} strokeWidth={1.7} aria-hidden="true" />
                Confirm retake
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE.outQuart }}
              className="flex items-center gap-2"
            >
              <Button
                variant="ghost"
                size="lg"
                className="btn--edge-underline"
                onClick={handleRegenerate}
                title="Regenerate this beat (asks for confirmation)"
              >
                <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
                Regenerate
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant="primary"
          size="lg"
          onClick={handleApprove}
          disabled={isApproved}
          aria-label={isApproved ? "Scene approved" : "Approve scene and continue"}
          title={isApproved ? "Already approved" : "Approve this take"}
        >
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          {isApproved ? "Approved" : "Approve scene"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
