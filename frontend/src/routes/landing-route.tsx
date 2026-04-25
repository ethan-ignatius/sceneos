import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { Volume2, VolumeX, HelpCircle, ArrowUpRight } from "lucide-react";
import { usePromptStore } from "@/stores/prompt-store";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { CursorSpotlight } from "@/components/ui/cursor-spotlight";
import { TextSplitter } from "@/lib/text-splitter";
import { useLongPress } from "@/lib/use-long-press";
import { DEMO_PROMPT } from "@/lib/demo-project";
import { isAudioMuted, setAudioMuted } from "@/lib/audio-cues";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type { VideoType } from "@/types/manifest";

const HowItWorksModal = lazy(() =>
  import("@/components/landing/how-it-works-modal").then((m) => ({
    default: m.HowItWorksModal,
  })),
);

// Lazy — keeps R3F + three out of landing's initial bundle. Suspense
// fallback null so first paint doesn't wait on the chunk.
const AmbientOrb = lazy(() =>
  import("@/components/landing/ambient-orb").then((m) => ({ default: m.AmbientOrb })),
);

const VIDEO_TYPES: Array<{ value: VideoType; label: string; hint: string }> = [
  { value: "trailer", label: "Trailer", hint: "5 beats · ~60s" },
  { value: "short", label: "Short", hint: "3 beats · ~30s" },
  { value: "feature", label: "Feature", hint: "7 beats · ~3min" },
];

/**
 * Landing — 12-col editorial layout, off-axis anchor + counterweight.
 *
 *   col 1–8  : eyebrow → two-line display headline → input → CTA
 *   col 9–12 : ambient drifting orb above + vertical pill segmented control
 *   bottom   : 1px hairline strip, easter-egg slate left, mute/help right
 *   corners  : timestamp top-right, coordinate top-left (microcopy where
 *              empty space would otherwise live)
 *
 * Headline rule (philosophy doc §8.3): italic on connectives, never on
 * nouns. "Render *a* cinematic." — "a" is italic; "Render" / "cinematic"
 * are roman. The line break + indent is the second line of editorial
 * drama (no center-stack symmetry).
 */
export function LandingRoute() {
  const navigate = useNavigate();
  const { masterPrompt, videoType, setMasterPrompt, setVideoType } = usePromptStore();
  const initialize = useBeatGraphStore((s) => s.initialize);
  const reducedMotion = useReducedMotion();
  const [muted, setMuted] = useState(() => isAudioMuted());
  const [draft, setDraft] = useState(masterPrompt);
  const [inputFocused, setInputFocused] = useState(false);
  const [keystrokeKey, setKeystrokeKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  // Preload the page-crumple R3F+three chunk so that the bridge route
  // doesn't pay the network cost when the user submits.
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

  const loadDemoProject = useCallback(() => {
    setMasterPrompt(DEMO_PROMPT);
    setVideoType("trailer");
    initialize({ masterPrompt: DEMO_PROMPT, videoType: "trailer" });
    navigate("/transition");
  }, [setMasterPrompt, setVideoType, initialize, navigate]);

  const longPress = useLongPress({ delayMs: 1000, onLongPress: loadDemoProject });

  return (
    <MotionConfig reducedMotion="user">
      <main className="film-grain relative min-h-screen overflow-hidden bg-bg-base">
        <CursorSpotlight intensity={0.18} radius={420} />

        {/* Slow ember radial-pulse from off-center bottom-left. CSS keyframe; reduced-motion safe. */}
        <div
          aria-hidden="true"
          className="ember-radial-breath pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_85%,_rgba(240,168,104,0.07),_transparent_55%)]"
        />

        {/* Top-corner microcopy — reads as a slate, not a logo. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 0.6 }}
          className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-8 pt-7 sm:px-12"
        >
          <div className="caption-track text-[10px] text-fg-tertiary">
            <span>SceneOS</span>
            <span className="mx-2 text-fg-tertiary/50">·</span>
            <span>34.07° N · 118.45° W</span>
          </div>
          <div className="caption-track text-[10px] tabular-nums text-fg-tertiary">
            <span className="hidden sm:inline">LA Hacks 2026 · </span>
            <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}</span>
          </div>
        </motion.div>

        {/* 12-col grid hero */}
        <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[88rem] grid-cols-12 items-center gap-x-6 px-8 py-24 sm:gap-x-8 sm:px-12">
          {/* Headline + form — col 1–8 (off-axis left anchor). */}
          <div className="col-span-12 lg:col-span-8 lg:pr-8">
            {/* Kicker — small italic display, the "film slate label" */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.filmIn, delay: 0.25 }}
              className="caption-track mb-6 text-[10px] text-fg-tertiary"
            >
              <span className="text-brand-ember">●</span>
              <span className="ml-2">Cinematography, encoded</span>
            </motion.p>

            {/* Two-line display headline. Italic on the connective ('a'). */}
            <h1 className="text-display-xl leading-[0.92] tracking-[-0.035em]">
              <span className="flicker-on-mount block">
                <TextSplitter
                  text="Direct an idea."
                  baseDelay={0.3}
                  jitter={0.9}
                  seed={3}
                />
              </span>
              <span className="flicker-on-mount mt-1 block pl-[0.6em]">
                <TextSplitter text="Render " baseDelay={0.55} jitter={0.6} seed={5} />
                <span className="italic text-fg-secondary">
                  <TextSplitter text="a" baseDelay={0.6} jitter={0.4} seed={7} />
                </span>
                <TextSplitter text=" cinematic." baseDelay={0.65} jitter={0.6} seed={9} />
              </span>
            </h1>

            {/* Sub-line, mono caps, restrained — the "tagline." */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.4 }}
              className="caption-track mt-7 text-[10px] text-fg-tertiary"
            >
              One prompt. Five beats. One stitched cinematic — directed beat-by-beat.
            </motion.p>

            {/* Form — input + Begin CTA. Left-aligned, not centered. */}
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.7 }}
              className="mt-10 max-w-2xl"
            >
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
                  placeholder="A lone astronaut crosses the rust-red dunes of Mars at golden hour…"
                  className="w-full bg-transparent pb-3 pt-2 font-body text-lg text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-px overflow-visible bg-fg-tertiary/30">
                  <motion.span
                    className="absolute inset-y-0 left-0 origin-left bg-brand-ember"
                    style={{ width: "100%" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: ready || inputFocused ? 1 : 0 }}
                    transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.85 }}
                  />
                  {keystrokeKey > 0 && !reducedMotion ? (
                    <motion.span
                      key={keystrokeKey}
                      className="absolute inset-y-[-1px] left-0 origin-left bg-brand-ember"
                      style={{ width: "100%", filter: "blur(0.5px)" }}
                      initial={{ opacity: 0, scaleY: 1 }}
                      animate={{ opacity: [0, 1, 0], scaleY: [1, 3, 1] }}
                      transition={{ duration: DURATIONS.instant, ease: EASE.outQuart }}
                    />
                  ) : null}
                </span>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <motion.button
                  type="submit"
                  disabled={!ready}
                  data-cursor="hover"
                  data-ready={ready ? "true" : "false"}
                  className={cn(
                    "group inline-flex items-center gap-3 px-6 py-3 font-body text-base text-bg-base",
                    "bg-brand-ember rounded-md transition-colors duration-200",
                    "hover:bg-brand-ember/90",
                    "disabled:bg-bg-elev-2 disabled:text-fg-tertiary disabled:pointer-events-none",
                    ready && "magnetic-button",
                  )}
                >
                  <span>Begin</span>
                  <ArrowUpRight
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </motion.button>

                {/* Caption next to CTA — answers "what kind of cinematic?" */}
                <p className="caption-track text-[10px] text-fg-tertiary">
                  Format · {VIDEO_TYPES.find((v) => v.value === videoType)?.hint}
                </p>
              </div>
            </motion.form>
          </div>

          {/* Right column — col 9–12 — ambient orb + vertical segmented control */}
          <div className="col-span-12 mt-16 lg:col-span-4 lg:mt-0 lg:flex lg:flex-col lg:items-end lg:justify-center lg:gap-12">
            {/* Ambient orb — drifts slowly, anchors brand. Hidden on small viewports. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.6 }}
              className="hidden h-[18rem] w-[18rem] lg:block"
              aria-hidden="true"
            >
              <Suspense fallback={null}>
                <AmbientOrb />
              </Suspense>
            </motion.div>

            {/* Vertical segmented control — the format picker, no center-stack pills. */}
            <motion.fieldset
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 1.9 }}
              className="w-full max-w-xs lg:w-[12rem]"
            >
              <legend className="caption-track mb-3 block text-[10px] text-fg-tertiary">Format</legend>
              <div className="relative grid">
                {VIDEO_TYPES.map((t) => {
                  const isActive = videoType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setVideoType(t.value)}
                      data-cursor="hover"
                      className={cn(
                        "group relative flex items-baseline justify-between gap-3 py-3.5 text-left",
                        "border-t border-fg-tertiary/15 last:border-b",
                        "transition-colors duration-200",
                        isActive
                          ? "text-fg-primary"
                          : "text-fg-tertiary hover:text-fg-secondary",
                      )}
                    >
                      {/* Active rail — vertical ember bar on the left. layoutId morphs between active items. */}
                      {isActive ? (
                        <motion.span
                          layoutId="format-rail"
                          aria-hidden="true"
                          className="absolute -left-3 top-1/2 h-[60%] w-[2px] -translate-y-1/2 bg-brand-ember"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      ) : null}
                      <span className="font-display text-2xl italic leading-none">{t.label}</span>
                      <span className="caption-track text-[9px]">{t.hint}</span>
                    </button>
                  );
                })}
              </div>
            </motion.fieldset>
          </div>
        </section>

        {/* Bottom chrome — 1px hairline divider, slate label left, mute/help right. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart, delay: 2.2 }}
          className="absolute inset-x-0 bottom-0 z-10 border-t border-fg-tertiary/15 bg-bg-base/40 backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-[88rem] items-center justify-between px-8 py-4 sm:px-12">
            <button
              {...longPress.handlers}
              data-cursor="hover"
              aria-label="Hold to load demo project"
              title="Hold to load demo project"
              className="relative cursor-help select-none caption-track text-[10px] text-fg-tertiary transition-colors duration-200 hover:text-fg-secondary"
            >
              <span className="text-fg-tertiary/60">SceneOS / </span>
              <span>v0 — hold to demo</span>
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 h-px bg-brand-ember transition-opacity duration-200"
                style={{
                  width: `${longPress.progress * 100}%`,
                  opacity: longPress.isPressed ? 1 : 0,
                }}
              />
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleMute}
                data-cursor="hover"
                className="grid h-8 w-8 place-items-center text-fg-tertiary transition-colors hover:text-fg-primary"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={14} strokeWidth={1.5} /> : <Volume2 size={14} strokeWidth={1.5} />}
              </button>
              <span className="h-3 w-px bg-fg-tertiary/30" aria-hidden="true" />
              <button
                onClick={() => setHelpOpen(true)}
                data-cursor="hover"
                className="grid h-8 w-8 place-items-center text-fg-tertiary transition-colors hover:text-fg-primary"
                aria-label="How it works"
                title="How it works"
              >
                <HelpCircle size={14} strokeWidth={1.5} />
              </button>
              <span className="h-3 w-px bg-fg-tertiary/30" aria-hidden="true" />
              <span className="caption-track ml-2 text-[9px] text-fg-tertiary">⌘K</span>
            </div>
          </div>
        </motion.div>

        {helpOpen ? (
          <Suspense fallback={null}>
            <HowItWorksModal open={helpOpen} onOpenChange={setHelpOpen} />
          </Suspense>
        ) : null}
      </main>
    </MotionConfig>
  );
}
