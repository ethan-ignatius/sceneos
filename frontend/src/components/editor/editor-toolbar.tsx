import type { ReactNode } from "react";
import type { EditAudio, EditDecisions, EditLook } from "@/types/api";
import { cn } from "@/lib/utils";

const LOOKS: { value: EditLook; label: string; hint: string }[] = [
  { value: "neutral", label: "Neutral", hint: "no LUT" },
  { value: "warm-archive", label: "Warm archive", hint: "memoir, sepia bias" },
  { value: "cool-modern", label: "Cool modern", hint: "thriller, blue cast" },
  { value: "high-contrast-mono", label: "Mono", hint: "high contrast B&W" },
  { value: "punchy-trailer", label: "Punchy trailer", hint: "vibrance, contrast" },
  { value: "soft-romance", label: "Soft romance", hint: "haze, warmth" },
];

// Placeholder Cloudinary public ID for the music-bed feature. Real audio
// beds get uploaded under their own publicIds; this constant is the
// no-asset-yet sentinel the editor uses while the audio library is scaffolded.
const DEMO_MUSIC_TRACK = "audio/demo-bed";

interface EditorToolbarProps {
  /** Null while /api/editor/init is in flight or after a reset. The toolbar
   *  early-returns null in that case; callers can mount unconditionally. */
  decisions: EditDecisions | null;
  onPatch: (patch: Partial<EditDecisions>) => void;
}

/**
 * Global controls for the cut. Hairline-divided sections, no card chrome.
 * Each section: caption-track eyebrow + value hint on the right + control row.
 * Every change re-bakes the Cloudinary URL via /api/editor/apply.
 */
export function EditorToolbar({ decisions, onPatch }: EditorToolbarProps) {
  // The toolbar owns its loading-state contract — callers mount it
  // unconditionally and we early-return while decisions are still pending.
  if (!decisions) return null;
  const audio = decisions.audio ?? null;
  const look = decisions.look ?? "neutral";
  const captionPosition = decisions.captionPosition ?? "south";
  const setAudio = (next: EditAudio | null) => onPatch({ audio: next });

  return (
    <div className="space-y-5">
      {/* Look LUT — 3×2 grid, hairline-divided cells (no rounded chrome). */}
      <ToolbarSection eyebrow="Look" hint={LOOKS.find((l) => l.value === look)?.hint ?? ""}>
        <div className="grid grid-cols-3 border border-fg-tertiary/15 [&>button]:border-l [&>button]:border-t [&>button]:border-fg-tertiary/15 [&>button:nth-child(3n+1)]:border-l-0 [&>button:nth-child(-n+3)]:border-t-0">
          {LOOKS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => onPatch({ look: l.value })}
              className={cn(
                "px-2.5 py-2 text-left font-body text-pill",
                "transition-colors duration-200 ease-out",
                look === l.value
                  ? "bg-brand-ember/10 text-brand-ember"
                  : "text-fg-tertiary hover:text-fg-primary",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </ToolbarSection>

      {/* Music bed — text-button toggle + volume slider when on. */}
      <ToolbarSection
        eyebrow="Music bed"
        hint={audio ? `${audio.publicId} · ${audio.volume ?? 0}dB` : "off"}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setAudio(
                audio
                  ? null
                  : { publicId: DEMO_MUSIC_TRACK, volume: -20, fadeInMs: 800, fadeOutMs: 1200 },
              )
            }
            className="font-body text-pill font-medium text-fg-secondary transition-colors hover:text-brand-ember"
          >
            {audio ? "Remove" : "Add demo bed"}
          </button>
          {audio ? (
            <input
              type="range"
              min={-40}
              max={0}
              step={1}
              value={audio.volume ?? -20}
              onChange={(e) => setAudio({ ...audio, volume: Number(e.target.value) })}
              className="flex-1 accent-brand-ember"
              aria-label="Music volume"
            />
          ) : null}
        </div>
        {audio ? (
          <button
            type="button"
            onClick={() =>
              onPatch({
                duckOriginalAudioDb: decisions.duckOriginalAudioDb == null ? -12 : null,
              })
            }
            className={cn(
              "mt-2 font-body text-pill transition-colors",
              decisions.duckOriginalAudioDb != null
                ? "text-brand-ember hover:text-brand-ember/80"
                : "text-fg-tertiary hover:text-fg-primary",
            )}
          >
            Duck clip audio:{" "}
            {decisions.duckOriginalAudioDb != null
              ? `${decisions.duckOriginalAudioDb}dB`
              : "off"}
          </button>
        ) : null}
      </ToolbarSection>

      {/* Captions — anchor toggle as inline text affordances. */}
      <ToolbarSection eyebrow="Captions" hint={`anchored: ${captionPosition}`}>
        <div className="flex items-center gap-4">
          {(["south", "north"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => onPatch({ captionPosition: pos })}
              className={cn(
                "font-body text-pill transition-colors",
                captionPosition === pos
                  ? "font-medium text-brand-ember"
                  : "text-fg-tertiary hover:text-fg-primary",
              )}
            >
              {pos === "south" ? "Bottom" : "Top"}
            </button>
          ))}
        </div>
      </ToolbarSection>

      {/* Watermark — single text-button toggle. */}
      <ToolbarSection eyebrow="Watermark" hint={decisions.watermarkPublicId ?? "off"}>
        <button
          type="button"
          onClick={() =>
            onPatch({ watermarkPublicId: decisions.watermarkPublicId ? null : "sceneos-mark" })
          }
          className="font-body text-pill font-medium text-fg-secondary transition-colors hover:text-brand-ember"
        >
          {decisions.watermarkPublicId ? "Remove" : "Add corner mark"}
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
