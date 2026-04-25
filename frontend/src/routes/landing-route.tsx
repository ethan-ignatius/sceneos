import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Volume2, VolumeX, HelpCircle } from "lucide-react";
import { usePromptStore } from "@/stores/prompt-store";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { api } from "@/lib/api";
import type { VideoType } from "@/types/manifest";
import type { DecomposeBeatInput } from "@/types/api";

const VIDEO_TYPES: Array<{ value: VideoType; label: string }> = [
  { value: "trailer", label: "Trailer" },
  { value: "short", label: "Short" },
  { value: "feature", label: "Feature" },
];

export function LandingRoute() {
  const navigate = useNavigate();
  const { masterPrompt, videoType, setMasterPrompt, setVideoType } = usePromptStore();
  const initialize = useBeatGraphStore((s) => s.initialize);
  const applyDecomposition = useBeatGraphStore((s) => s.applyDecomposition);
  const setDecompositionStatus = useBeatGraphStore((s) => s.setDecompositionStatus);
  const [muted, setMuted] = useState(true);
  const [draft, setDraft] = useState(masterPrompt);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMasterPrompt(trimmed);
    initialize({ masterPrompt: trimmed, videoType });

    // The crumple bridge runs ~1.5s. Fire the decomposition in parallel so the
    // canvas mounts with every beat already carrying a Higgsfield-ready prompt.
    const seeded = useBeatGraphStore.getState().manifest;
    if (seeded) {
      const beats: DecomposeBeatInput[] = seeded.beats.map((b) => ({
        beatId: b.beatId,
        template: b.template,
        beatName: b.beatName,
        archetype: b.archetype,
      }));
      setDecompositionStatus("pending");
      api
        .decompose({ masterPrompt: trimmed, videoType, beats })
        .then((res) => applyDecomposition(res.clips, res.continuityBible))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Decomposition failed";
          setDecompositionStatus("error", message);
        });
    }

    navigate("/transition");
  };

  return (
    <main className="film-grain relative grid min-h-screen place-items-center bg-bg-base px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(240,168,104,0.06),_transparent_60%)]" />

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-12 text-center"
      >
        <div className="space-y-3">
          <h1 className="text-display-lg italic">
            Direct your idea <span className="not-italic text-fg-secondary">into</span> a cinematic.
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-fg-tertiary">
            Creativity in. Cinematography handled.
          </p>
        </div>

        <form onSubmit={submit} className="w-full space-y-6">
          <div className="group relative">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe your idea — a trailer, a short, a feature."
              className="w-full bg-transparent pb-3 pt-2 text-center font-mono text-base text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-px bg-fg-tertiary/40">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 origin-left bg-brand-ember transition-transform duration-300 ease-out",
                  draft.length > 0 ? "scale-x-100" : "scale-x-0 group-focus-within:scale-x-100",
                )}
                style={{ width: "100%" }}
              />
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            {VIDEO_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setVideoType(t.value)}
                className={cn(
                  "rounded-full border px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] transition-colors duration-200",
                  videoType === t.value
                    ? "border-brand-ember/80 bg-brand-ember/10 text-brand-ember"
                    : "border-fg-tertiary/60 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center pt-4">
            <Button type="submit" size="lg" disabled={!draft.trim()}>
              Begin
            </Button>
          </div>
        </form>
      </motion.section>

      <footer className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">
          SceneOS · v0
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMuted((m) => !m)}
            className="text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} strokeWidth={1.5} /> : <Volume2 size={16} strokeWidth={1.5} />}
          </button>
          <button
            className="text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Help"
          >
            <HelpCircle size={16} strokeWidth={1.5} />
          </button>
        </div>
      </footer>
    </main>
  );
}
