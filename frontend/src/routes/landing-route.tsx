import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Volume2, VolumeX, HelpCircle } from "lucide-react";
import { usePromptStore } from "@/stores/prompt-store";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { CursorSpotlight } from "@/components/ui/cursor-spotlight";
import { TextSplitter } from "@/lib/text-splitter";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";
import type { VideoType } from "@/types/manifest";

const VIDEO_TYPES: Array<{ value: VideoType; label: string }> = [
  { value: "trailer", label: "Trailer" },
  { value: "short", label: "Short" },
  { value: "feature", label: "Feature" },
];

/**
 * Load choreography (see docs/MOTION_LANGUAGE.md §5):
 *   0.00–0.30s   Void holds. Grain animates. Ember radial breathes.
 *   0.30–1.50s   Headline characters flicker in (CSS keyframe per <span>).
 *   1.50–1.90s   Sub-line slides up + fades in.
 *   1.90–2.30s   Input underline draws from left.
 *   2.30–2.70s   Pills cascade in from right (80ms stagger).
 *   2.70–3.00s   Chrome fades in (logo / mute / help).
 *
 * Total budget: 3.0s. Respects prefers-reduced-motion (handled in CSS).
 */
const TIMING = {
  headlineDelay: 0.3,
  headlineJitter: 1.0,
  subLineDelay: 1.5,
  inputDelay: 1.9,
  pillsDelay: 2.3,
  chromeDelay: 2.7,
} as const;

export function LandingRoute() {
  const navigate = useNavigate();
  const { masterPrompt, videoType, setMasterPrompt, setVideoType } = usePromptStore();
  const initialize = useBeatGraphStore((s) => s.initialize);
  const [muted, setMuted] = useState(true);
  const [draft, setDraft] = useState(masterPrompt);
  const [inputFocused, setInputFocused] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMasterPrompt(trimmed);
    initialize({ masterPrompt: trimmed, videoType });
    navigate("/transition");
  };

  const ready = draft.trim().length > 0;

  return (
    <main className="film-grain relative grid min-h-screen place-items-center bg-bg-base px-6">
      <CursorSpotlight intensity={0.28} radius={360} />

      {/* Slow ember radial-pulse from center — almost imperceptible but reads as "alive." */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(240,168,104,0.06),_transparent_60%)]"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      />

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-12 text-center">
        {/* Headline — character-stagger flicker reveal */}
        <div className="space-y-3">
          <h1 className="text-display-lg italic">
            <span className="flicker-on-mount">
              <TextSplitter
                text="Direct your idea "
                baseDelay={TIMING.headlineDelay}
                jitter={TIMING.headlineJitter}
                seed={3}
              />
              <span className="not-italic text-fg-secondary">
                <TextSplitter
                  text="into "
                  baseDelay={TIMING.headlineDelay + 0.1}
                  jitter={TIMING.headlineJitter}
                  seed={5}
                />
              </span>
              <TextSplitter
                text="a cinematic."
                baseDelay={TIMING.headlineDelay + 0.2}
                jitter={TIMING.headlineJitter}
                seed={7}
              />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: TIMING.subLineDelay }}
            className="font-mono text-xs uppercase tracking-[0.32em] text-fg-tertiary"
          >
            Creativity in. Cinematography handled.
          </motion.p>
        </div>

        <form onSubmit={submit} className="w-full space-y-6">
          <div className="group relative">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Describe your idea — a trailer, a short, a feature."
              className="w-full bg-transparent pb-3 pt-2 text-center font-mono text-base text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-px bg-fg-tertiary/40">
              <motion.span
                className="absolute inset-y-0 left-0 origin-left bg-brand-ember"
                style={{ width: "100%" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ready || inputFocused ? 1 : 0 }}
                transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: TIMING.inputDelay }}
              />
            </span>
          </div>

          <motion.div
            className="flex items-center justify-center gap-2"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  delayChildren: TIMING.pillsDelay,
                  staggerChildren: STAGGER.pills,
                },
              },
            }}
          >
            {VIDEO_TYPES.map((t) => (
              <motion.button
                key={t.value}
                type="button"
                onClick={() => setVideoType(t.value)}
                variants={{
                  hidden: { opacity: 0, x: 16 },
                  visible: { opacity: 1, x: 0 },
                }}
                transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
                className={cn(
                  "rounded-full border px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] transition-colors duration-200",
                  videoType === t.value
                    ? "border-brand-ember/80 bg-brand-ember/10 text-brand-ember"
                    : "border-fg-tertiary/60 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
                )}
              >
                {t.label}
              </motion.button>
            ))}
          </motion.div>

          <motion.div
            className="flex items-center justify-center pt-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: TIMING.pillsDelay + 0.32 }}
          >
            <MagneticButton type="submit" size="lg" disabled={!ready} ready={ready}>
              Begin
            </MagneticButton>
          </motion.div>
        </form>
      </section>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: TIMING.chromeDelay }}
        className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-6"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">SceneOS · v0</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMuted((m) => !m)}
            className="text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} strokeWidth={1.5} /> : <Volume2 size={16} strokeWidth={1.5} />}
          </button>
          <button className="text-fg-tertiary transition-colors hover:text-fg-primary" aria-label="Help">
            <HelpCircle size={16} strokeWidth={1.5} />
          </button>
        </div>
      </motion.footer>
    </main>
  );
}
