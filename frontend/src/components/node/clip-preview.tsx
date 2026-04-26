import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
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

  // Auto-approve on preview — the user shouldn't have to click "Approve
  // scene" when the clip lands. Regenerate stays as the override. Fires
  // once per (beatId, sceneId, isApproved=false) transition; a per-mount
  // ref guard prevents double-fire on remount.
  const autoApprovedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isApproved) return;
    if (beat.status !== "preview") return;
    const key = `${beat.beatId}::${scene.sceneId}`;
    if (autoApprovedRef.current === key) return;
    autoApprovedRef.current = key;
    approveScene(beat.beatId, scene.sceneId);
    playApproveChime();
  }, [isApproved, beat.status, beat.beatId, scene.sceneId, approveScene]);

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

      {/* Approve button removed — auto-approve fires the moment the clip
          lands. Regenerate is the only manual override the user needs. */}
      <motion.div
        variants={fadeUp}
        transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
        className="mt-auto flex justify-end border-t border-fg-tertiary/30 pt-4"
      >
        <Button
          variant="ghost"
          size="lg"
          className="btn--edge-underline"
          onClick={handleRegenerate}
          title="Regenerate this beat"
        >
          <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
          Regenerate
        </Button>
      </motion.div>
    </motion.div>
  );
}
