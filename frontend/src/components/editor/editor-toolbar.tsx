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

const MOCK_MUSIC_TRACK = "audio/mock-bed";

interface EditorToolbarProps {
  decisions: EditDecisions;
  onPatch: (patch: Partial<EditDecisions>) => void;
}

/**
 * Global controls for the cut. Everything here patches the top-level
 * EditDecisions (not per-clip): look LUT, music bed, ducking, watermark,
 * caption position.
 *
 * The user can override the agent on any of these — every change re-bakes
 * the Cloudinary URL via /api/editor/apply.
 */
export function EditorToolbar({ decisions, onPatch }: EditorToolbarProps) {
  const audio = decisions.audio ?? null;
  const look = decisions.look ?? "neutral";
  const captionPosition = decisions.captionPosition ?? "south";

  const setAudio = (next: EditAudio | null) => onPatch({ audio: next });

  return (
    <div className="space-y-5 rounded-md border border-fg-tertiary/15 bg-bg-elev-1/60 p-4 backdrop-blur-md">
      <div className="caption-track text-[10px] text-fg-tertiary">
        Global · the whole cut
      </div>

      {/* Look LUT */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
            Look
          </span>
          <span className="font-mono text-[9px] text-fg-tertiary">
            {LOOKS.find((l) => l.value === look)?.hint ?? ""}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {LOOKS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => onPatch({ look: l.value })}
              className={cn(
                "rounded-sm border px-2 py-1.5 text-left text-[10.5px]",
                "transition-colors duration-200 ease-out",
                look === l.value
                  ? "border-brand-ember/70 bg-brand-ember/10 text-fg-primary"
                  : "border-fg-tertiary/20 bg-bg-base/40 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      {/* Music */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
            Music bed
          </span>
          <span className="font-mono text-[9px] text-fg-tertiary">
            {audio ? `${audio.publicId} · ${audio.volume ?? 0}` : "off"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setAudio(
                audio
                  ? null
                  : { publicId: MOCK_MUSIC_TRACK, volume: -20, fadeInMs: 800, fadeOutMs: 1200 },
              )
            }
            className={cn(
              "rounded-sm border px-3 py-1.5 text-[11px] text-fg-primary",
              audio
                ? "border-brand-ember/60 bg-brand-ember/10"
                : "border-fg-tertiary/30 bg-bg-base/40 hover:border-fg-secondary",
            )}
          >
            {audio ? "Remove music" : "Add demo bed"}
          </button>
          {audio ? (
            <input
              type="range"
              min={-40}
              max={0}
              step={1}
              value={audio.volume ?? -20}
              onChange={(e) =>
                setAudio({ ...audio, volume: Number(e.target.value) })
              }
              className="flex-1 accent-brand-ember"
              aria-label="Music volume"
            />
          ) : null}
        </div>
        {audio ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <DuckingToggle
              value={decisions.duckOriginalAudioDb ?? null}
              onChange={(v) => onPatch({ duckOriginalAudioDb: v })}
            />
          </div>
        ) : null}
      </section>

      {/* Captions */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
            Captions
          </span>
          <span className="font-mono text-[9px] text-fg-tertiary">
            anchored: {captionPosition}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(["south", "north"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => onPatch({ captionPosition: pos })}
              className={cn(
                "rounded-sm border px-2 py-1.5 text-[10.5px]",
                captionPosition === pos
                  ? "border-brand-ember/60 bg-brand-ember/10 text-fg-primary"
                  : "border-fg-tertiary/20 bg-bg-base/40 text-fg-tertiary hover:border-fg-secondary",
              )}
            >
              {pos === "south" ? "Bottom" : "Top"}
            </button>
          ))}
        </div>
      </section>

      {/* Watermark */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-secondary">
            Watermark
          </span>
          <span className="font-mono text-[9px] text-fg-tertiary">
            {decisions.watermarkPublicId ?? "off"}
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            onPatch({ watermarkPublicId: decisions.watermarkPublicId ? null : "sceneos-mark" })
          }
          className={cn(
            "w-full rounded-sm border px-3 py-1.5 text-[11px] text-fg-primary",
            decisions.watermarkPublicId
              ? "border-brand-ember/60 bg-brand-ember/10"
              : "border-fg-tertiary/30 bg-bg-base/40 hover:border-fg-secondary",
          )}
        >
          {decisions.watermarkPublicId ? "Remove watermark" : "Add corner mark"}
        </button>
      </section>
    </div>
  );
}

function DuckingToggle({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value == null ? -12 : null)}
      className={cn(
        "rounded-sm border px-3 py-1.5 text-[10.5px]",
        value != null
          ? "border-brand-ember/50 bg-brand-ember/10 text-fg-primary"
          : "border-fg-tertiary/20 bg-bg-base/40 text-fg-tertiary hover:border-fg-secondary",
      )}
    >
      Duck clip audio: {value != null ? `${value}dB` : "off"}
    </button>
  );
}
