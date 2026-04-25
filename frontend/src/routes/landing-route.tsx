import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Volume2, VolumeX, HelpCircle } from "lucide-react";
import { usePromptStore } from "@/stores/prompt-store";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { CursorSpotlight } from "@/components/ui/cursor-spotlight";
import { TextSplitter } from "@/lib/text-splitter";
import { useLongPress } from "@/lib/use-long-press";
import { DEMO_PROMPT } from "@/lib/demo-project";
import { isAudioMuted, setAudioMuted } from "@/lib/audio-cues";
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
  const [muted, setMuted] = useState(() => isAudioMuted());
  const [draft, setDraft] = useState(masterPrompt);
  const [inputFocused, setInputFocused] = useState(false);
  const [keystrokeKey, setKeystrokeKey] = useState(0);

  // Preload the page-crumple R3F+three chunk so that the bridge route
  // doesn't pay the network cost when the user submits. This makes the
  // showpiece feel like the same page, not a fresh load.
  useEffect(() => {
    void import("@/components/transition/paper-curl-canvas").catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setAudioMuted(next);
      return next;
    });
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMasterPrompt(trimmed);
    initialize({ masterPrompt: trimmed, videoType });
    navigate("/transition");
  };

  const ready = draft.trim().length > 0;

  // Easter egg: long-press the version label to load the cached demo
  // project — useful for judges who poke and as a guaranteed fallback
  // if the live form-submit flow ever flakes on demo day.
  const loadDemoProject = useCallback(() => {
    setMasterPrompt(DEMO_PROMPT);
    setVideoType("trailer");
    initialize({ masterPrompt: DEMO_PROMPT, videoType: "trailer" });
    navigate("/transition");
  }, [setMasterPrompt, setVideoType, initialize, navigate]);

  const longPress = useLongPress({ delayMs: 1000, onLongPress: loadDemoProject });

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
          {/* Input — three-layer underline:
                1) base track (fg-tertiary at 40%)
                2) draw-in ember layer (focus / has-content scale-x animation)
                3) keystroke pulse (re-mounts per keystroke, brief brightness boost) */}
          <div className="group relative">
            <input
              autoFocus
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setKeystrokeKey((k) => k + 1);
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Describe your idea — a trailer, a short, a feature."
              className="w-full bg-transparent pb-3 pt-2 text-center font-mono text-base text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-px overflow-visible bg-fg-tertiary/40">
              {/* (2) Steady ember underline — present whenever focus or content */}
              <motion.span
                className="absolute inset-y-0 left-0 origin-left bg-brand-ember"
                style={{ width: "100%" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ready || inputFocused ? 1 : 0 }}
                transition={{ duration: DURATIONS.quick, ease: EASE.outQuart, delay: TIMING.inputDelay }}
              />
              {/* (3) Keystroke pulse — re-keyed per keystroke for a brief brightness boost */}
              {keystrokeKey > 0 ? (
                <motion.span
                  key={keystrokeKey}
                  className="absolute inset-y-[-1px] left-0 origin-left bg-brand-ember"
                  style={{ width: "100%", filter: "blur(0.5px)" }}
                  initial={{ opacity: 0, scaleY: 1 }}
                  animate={{ opacity: [0, 1, 0], scaleY: [1, 3, 1] }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                />
              ) : null}
            </span>
          </div>

          {/* Pills row — sliding ember active background via Motion `layoutId`.
              Only one pill renders the layoutId span at a time (the active one);
              Motion morphs the box between pills as `videoType` changes. */}
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
            {VIDEO_TYPES.map((t) => {
              const isActive = videoType === t.value;
              return (
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
                    "relative rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] transition-colors duration-200",
                    isActive
                      ? "text-brand-ember"
                      : "text-fg-tertiary hover:text-brand-ember/80",
                  )}
                >
                  {/* Inactive pills get a static thin outline. */}
                  {!isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border border-fg-tertiary/60 transition-colors duration-200 group-hover:border-fg-secondary"
                    />
                  ) : null}

                  {/* The active pill renders a layoutId span — Motion morphs
                      this between sibling pills. The result is the sliding
                      ember background that follows the click. */}
                  {isActive ? (
                    <motion.span
                      layoutId="pill-active-bg"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border border-brand-ember/80 bg-brand-ember/12"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  ) : null}

                  <span className="relative z-[1]">{t.label}</span>
                </motion.button>
              );
            })}
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
        {/* Long-press easter egg — hold for 1s to load the cached demo project.
            Visible progress bar fills as the user holds. Ember when complete. */}
        <button
          {...longPress.handlers}
          aria-label="Hold to load demo project"
          title="Hold to load demo project"
          className="relative cursor-help select-none font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary transition-colors duration-200 hover:text-fg-secondary"
        >
          SceneOS · v0
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 left-0 h-px bg-brand-ember transition-opacity duration-200"
            style={{
              width: `${longPress.progress * 100}%`,
              opacity: longPress.isPressed ? 1 : 0,
            }}
          />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
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
