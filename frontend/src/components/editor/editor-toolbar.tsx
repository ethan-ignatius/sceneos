import type { ReactNode } from "react";
import type { EditAudio, EditDecisions } from "@/types/api";

// Verified Cloudinary audio publicId — the lighthouse-bake's Lyria score
// (piano + strings, ducked low). Replaces the unverified "audio/demo-bed"
// sentinel which 404'd on Cloudinary because nobody had uploaded an
// asset under that path. Using a known-good publicId means the music
// bed actually plays the moment the user toggles it on.
const DEMO_MUSIC_TRACK = "sceneos/8dbb956c76a7/audio/music";

interface EditorToolbarProps {
  /** Null while /api/editor/init is in flight or after a reset. The toolbar
   *  early-returns null in that case; callers can mount unconditionally. */
  decisions: EditDecisions | null;
  onPatch: (patch: Partial<EditDecisions>) => void;
}

/**
 * Global controls for the cut. Per user direction ("really we just want
 * the fades and the trims and the appending — that's what's valuable.
 * music yeah and then otherwise we're good"), this column is reduced to
 * MUSIC ONLY. Trims + fades + per-clip transition live on the timeline /
 * per-clip detail surface in the left column; appending is the master
 * cut's `fl_splice` chain (already visible as the URL).
 *
 * Dropped from earlier versions: Look LUT picker, Captions anchor toggle,
 * Watermark toggle, fade-in / fade-out / duck sliders. All were either
 * non-essential ("verbose and overwhelming" per user feedback) or
 * silently broken (watermark publicId 404'd on the demo cloud).
 */
export function EditorToolbar({ decisions, onPatch }: EditorToolbarProps) {
  if (!decisions) return null;
  const audio = decisions.audio ?? null;
  const setAudio = (next: EditAudio | null) => onPatch({ audio: next });

  return (
    <div className="space-y-5">
      <ToolbarSection
        eyebrow="Music"
        hint={audio ? `${audio.volume ?? -10}dB` : "off"}
      >
        <button
          type="button"
          onClick={() =>
            setAudio(
              audio
                ? null
                : { publicId: DEMO_MUSIC_TRACK, volume: -10, fadeInMs: 800, fadeOutMs: 1200 },
            )
          }
          className="font-body text-pill font-medium text-fg-secondary transition-colors hover:text-brand-ember"
        >
          {audio ? "Remove score" : "Add score"}
        </button>
      </ToolbarSection>
    </div>
  );
}

function ToolbarSection({
  eyebrow,
  hint,
  children,
}: {
  eyebrow: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-fg-tertiary/15 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between">
        <span className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
          {eyebrow}
        </span>
        {hint ? (
          <span className="font-body text-caption text-fg-tertiary/70">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
