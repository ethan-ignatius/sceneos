import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import { usePromptStore } from "@/stores/prompt-store";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { api, ApiError } from "@/lib/api";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { cn } from "@/lib/utils";
import { SparkleField } from "@/components/landing/sparkle-field";

/**
 * Landing — the hook.
 *
 * Stripped to one composition: a cinematic loop behind a single line of
 * display type, with one combined input that accepts text or voice. No
 * top slate. No bottom slate. No easter egg. No format picker. No
 * StageIndicator (suppressed via path). The first thing the user does
 * is type or speak — they are inside the canvas in under four seconds.
 *
 * The looping clip is one of the Veo-rendered cinematics from the
 * pipeline's own smoke run — the landing demonstrates what the product
 * makes the moment a visitor lands. Cloudinary's `q_auto:good,f_auto`
 * delivers the smaller, format-optimized variant.
 *
 * "Spinny + glitchy" comes from three layered passes: the slow drone-
 * descent video, ember sparkles drifting over the headline (SparkleField),
 * and a subtle 1px scan-band overlay on top.
 */

// Veo-rendered loop, our own asset on Cloudinary. Pre-stitched, no audio.
// `q_auto:good,f_auto,w_1920` keeps the bg payload around 1.5 MB on a
// 1080p viewport — heavy but justified: it IS the hook.
const HERO_VIDEO_URL =
  "https://res.cloudinary.com/dghelx0al/video/upload/q_auto:good,f_auto,w_1920/sceneos/smoke-1777151131/b1-establish/s1.mp4";

export function LandingRoute() {
  const navigate = useNavigate();
  const { masterPrompt, videoType, setMasterPrompt } = usePromptStore();
  const initialize = useBeatGraphStore((s) => s.initialize);
  const applyDecomposition = useBeatGraphStore((s) => s.applyDecomposition);
  const setDecomposeStatus = useBeatGraphStore((s) => s.setDecomposeStatus);
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState(masterPrompt);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice — Web Speech API, opt-in via the mic affordance inside the input.
  const speech = useSpeechRecognition({ lang: "en-US" });
  useEffect(() => {
    if (speech.listening && speech.transcript) setDraft(speech.transcript);
  }, [speech.listening, speech.transcript]);

  const toggleVoice = () => {
    if (speech.listening) speech.stop();
    else speech.start();
  };

  // Preload the bridge + canvas planet textures so the user doesn't pay
  // the network cost when they submit.
  useEffect(() => {
    void import("@/components/transition/paper-curl-canvas").catch(() => {});
    void import("@react-three/drei")
      .then(({ useTexture }) => {
        void import("@/lib/planet-templates").then(
          ({ PLANET_TEXTURE_PRELOAD_LIST, SATURN_RING_TEXTURE }) => {
            useTexture.preload([...PLANET_TEXTURE_PRELOAD_LIST, SATURN_RING_TEXTURE]);
          },
        );
      })
      .catch(() => {});
  }, []);

  // Auto-grow the textarea inside the input pill.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMasterPrompt(trimmed);
    initialize({ masterPrompt: trimmed, videoType });

    // Fire-and-forget enrichment. Bridge starts immediately; the canvas
    // gets refined per-beat prompts when the API returns. If it 502s, the
    // canvas falls back to the template defaults — nothing blocks.
    const fresh = useBeatGraphStore.getState().manifest;
    if (fresh) {
      setDecomposeStatus("pending");
      api
        .decompose({
          masterPrompt: trimmed,
          videoType,
          beats: fresh.beats.map((b) => ({
            beatId: b.beatId,
            template: b.template,
            beatName: b.beatName,
            archetype: b.archetype,
          })),
        })
        .then((res) => {
          applyDecomposition(res.clips, res.continuityBible);
          setDecomposeStatus("success");
        })
        .catch((err) => {
          setDecomposeStatus("error");
          const detail = err instanceof ApiError ? err.details : err;
          console.warn("[landing] decompose failed; keeping template beats", detail);
        });
    }

    navigate("/transition");
  };

  const ready = draft.trim().length > 0;

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-[100svh] overflow-hidden bg-bg-base">
        {/* Background video — slow drone descent over rust-red dunes.
            object-cover keeps the frame full-bleed at any viewport. */}
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.55]"
          src={HERO_VIDEO_URL}
        />

        {/* Vignette + warm-near-black wash. Top fade keeps the headline
            legible; bottom fade lets the input pill float on dark. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg-base/85 via-bg-base/55 to-bg-base/95"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 110% 70% at 50% 50%, transparent 30%, rgba(10,9,8,0.9) 100%)",
          }}
        />

        {/* Subtle horizontal scan-band — the "glitchy" register. 1px ember
            stripes at 2% opacity, never moves. Adds film-print texture
            without competing with the video. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(240,168,104,1) 2px, rgba(240,168,104,1) 3px)",
          }}
        />

        {/* Content — single centered composition. No nav. No corners. No chrome. */}
        <section className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-6 py-16 sm:px-10">
          {/* Headline. One line, four words, sparkles drifting over.
              Italic on the connective per the editorial rule. */}
          <motion.h1
            initial="hidden"
            animate="visible"
            className="relative inline-flex flex-wrap items-baseline justify-center text-center font-display font-medium leading-[0.95] tracking-[-0.045em]"
            style={{
              fontSize: "clamp(3rem, 11vw, 9rem)",
              color: "#f5efe7",
            }}
          >
            <SparkleField count={14} className="text-brand-ember" />
            {["Direct", "a", "cinematic."].map((word, i) => {
              const isItalic = word === "a";
              return (
                <motion.span
                  key={i}
                  initial={{ y: 28, opacity: 0, filter: "blur(8px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.9,
                    delay: 0.3 + i * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={cn(
                    "relative inline-block",
                    isItalic && "italic text-fg-secondary",
                  )}
                  style={{ marginRight: i < 2 ? "0.28em" : 0 }}
                >
                  {word}
                </motion.span>
              );
            })}
          </motion.h1>

          {/* Combined input pill — text + voice + submit, all one element.
              Pattern adapted from the PromptInputBox reference: rounded-3xl,
              dark surface, mic on the left, submit on the right. The
              auto-grow textarea avoids the "input vs textarea" choice. */}
          <motion.form
            onSubmit={submit}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12 w-full max-w-[40rem]"
          >
            <div
              className={cn(
                "relative flex items-end gap-2 rounded-[1.75rem] border bg-bg-elev-1/80 p-2 pl-3.5 backdrop-blur-xl transition-all duration-300",
                "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
                focused
                  ? "border-brand-ember/45 shadow-[0_0_0_1px_rgba(240,168,104,0.25),_0_24px_60px_-20px_rgba(0,0,0,0.7)]"
                  : "border-fg-tertiary/25",
                speech.listening && "border-brand-ember/60",
              )}
            >
              {/* Mic — toggles dictation. */}
              {speech.supported ? (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={speech.listening ? "Stop dictation" : "Speak your idea"}
                  aria-pressed={speech.listening}
                  className={cn(
                    "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition-colors duration-200",
                    speech.listening
                      ? "bg-brand-ember/15 text-brand-ember"
                      : "text-fg-tertiary hover:bg-bg-elev-2 hover:text-fg-secondary",
                  )}
                >
                  {speech.listening ? (
                    <MicOff size={16} strokeWidth={1.6} aria-hidden="true" />
                  ) : (
                    <Mic size={16} strokeWidth={1.6} aria-hidden="true" />
                  )}
                </button>
              ) : null}

              <textarea
                ref={inputRef}
                autoFocus
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={
                  speech.listening
                    ? "listening…"
                    : "tell me a moment you can't get out of your head…"
                }
                className={cn(
                  "flex-1 resize-none self-center bg-transparent py-2.5 text-base leading-snug text-fg-primary placeholder:text-fg-tertiary/80",
                  "focus:outline-none",
                )}
                style={{ maxHeight: 200 }}
              />

              {/* Submit — circular ember when ready, ghost otherwise. */}
              <motion.button
                type="submit"
                disabled={!ready}
                aria-label="Begin"
                whileTap={ready ? { scale: 0.94 } : undefined}
                className={cn(
                  "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition-all duration-200",
                  ready
                    ? "bg-brand-ember text-bg-base shadow-[0_0_18px_rgba(240,168,104,0.45)] hover:bg-brand-ember/90"
                    : "bg-fg-tertiary/15 text-fg-tertiary",
                )}
              >
                <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
              </motion.button>
            </div>

            {/* Microhint — one line, fades in after the input lands. The
                only secondary copy on the page; reads as a director's
                whisper, not a tooltip. */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.6 }}
              className="mt-4 text-center text-[12px] leading-snug text-fg-tertiary"
            >
              {!reducedMotion ? (
                <>
                  press{" "}
                  <span className="font-mono text-fg-secondary">enter</span>
                  {" "}or speak.
                </>
              ) : (
                <>press enter or speak.</>
              )}
            </motion.p>
          </motion.form>
        </section>
      </main>
    </MotionConfig>
  );
}
