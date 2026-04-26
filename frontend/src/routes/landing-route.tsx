import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Mic } from "lucide-react";
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
  const projects = useBeatGraphStore((s) => s.projects);
  const resumeProject = useBeatGraphStore((s) => s.resumeProject);
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
          {/* Headline. One line, no wrap. Cap reduced from 9rem→6.5rem so
              it never overshoots the viewport vertically and the "Direct a
              cinematic." reads as a single composed line rather than a
              wrapped marquee. Sparkles are pinned to a relative wrapper
              so they drift over the headline area and only the headline. */}
          <div className="relative">
            <SparkleField count={12} className="text-brand-ember/85" />
            <motion.h1
              initial="hidden"
              animate="visible"
              className="whitespace-nowrap text-center font-display font-medium leading-[0.96] tracking-[-0.04em]"
              style={{
                fontSize: "clamp(2.5rem, 8.5vw, 6.5rem)",
                color: "#f5efe7",
              }}
            >
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
                      "inline-block",
                      isItalic && "italic text-fg-secondary",
                    )}
                    style={{ marginRight: i < 2 ? "0.28em" : 0 }}
                  >
                    {word}
                  </motion.span>
                );
              })}
            </motion.h1>
          </div>

          {/* Combined input pill — actions row BELOW the textarea so the
              mic doesn't drift down with the textarea as it grows.
              Matches the PromptInputBox reference exactly: textarea on top,
              flex-row beneath with mic on the left, submit on the right. */}
          <motion.form
            onSubmit={submit}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 w-full max-w-[40rem]"
          >
            <div
              className={cn(
                "rounded-[1.75rem] border bg-bg-elev-1/80 p-3 backdrop-blur-xl transition-all duration-300",
                "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
                focused
                  ? "border-brand-ember/45 shadow-[0_0_0_1px_rgba(240,168,104,0.22),_0_24px_60px_-20px_rgba(0,0,0,0.7)]"
                  : "border-fg-tertiary/22",
                speech.listening && "border-brand-ember/60",
              )}
            >
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
                className="block w-full resize-none bg-transparent px-2 pt-1.5 pb-1 text-base leading-snug text-fg-primary placeholder:text-fg-tertiary/80 focus:outline-none"
                style={{ maxHeight: 220 }}
              />

              {/* Action row. Mic on the left (when supported); submit on the
                  right. `mt-1` keeps a tight gap; the row is fixed-height so
                  the textarea can grow above without disturbing the mic
                  position — the bug the user flagged from the previous pass. */}
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5">
                  {speech.supported ? (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      aria-label={speech.listening ? "Stop dictation" : "Speak your idea"}
                      aria-pressed={speech.listening}
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-full transition-colors duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
                        speech.listening
                          ? "bg-brand-ember/15 text-brand-ember"
                          : "text-fg-tertiary hover:bg-bg-elev-2 hover:text-fg-secondary",
                      )}
                    >
                      {/* Always Mic — the BUTTON state (ember bg + ember
                          color + the pulsing bars beside it) communicates
                          "actively listening." Showing MicOff while the
                          mic is actively capturing read as a state
                          mismatch (icon said muted; mic was on). */}
                      <Mic size={15} strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  ) : null}

                  {/* Live listening indicator — three thin bars pulsing in
                      sequence. Only renders while the engine is active. */}
                  {speech.listening ? (
                    <div className="flex items-center gap-[3px] pl-1" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="block w-[2px] rounded-full bg-brand-ember"
                          animate={{ height: [6, 14, 6] }}
                          transition={{
                            duration: 0.85,
                            repeat: Infinity,
                            delay: i * 0.12,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <motion.button
                  type="submit"
                  disabled={!ready}
                  aria-label="Begin"
                  whileTap={ready ? { scale: 0.94 } : undefined}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
                    ready
                      ? "bg-brand-ember text-bg-base shadow-[0_0_18px_rgba(240,168,104,0.45)] hover:bg-brand-ember/90"
                      : "bg-fg-tertiary/15 text-fg-tertiary",
                  )}
                >
                  <ArrowUp size={15} strokeWidth={2.2} aria-hidden="true" />
                </motion.button>
              </div>
            </div>

            {/* Microhint — one line, fades in after the input lands. The
                only secondary copy on the page. */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.6 }}
              className="mt-4 text-center text-[12px] leading-snug text-fg-tertiary"
            >
              {!reducedMotion ? (
                <>
                  press <span className="font-mono text-fg-secondary">enter</span> or speak.
                </>
              ) : (
                <>press enter or speak.</>
              )}
            </motion.p>
          </motion.form>

          {/* Recent projects rail — the 3 most recent archived projects as
              clickable pills. Click resumes the project on /canvas with the
              manifest restored verbatim. Empty state collapses entirely so
              the empty landing stays clean (no "no projects yet" prose). */}
          {projects.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.8 }}
              className="mt-10 w-full max-w-[40rem]"
            >
              <div className="mb-2.5 text-center font-body text-[11px] font-medium text-fg-tertiary">
                Pick up where you left off
              </div>
              <div className="flex flex-col items-stretch gap-1.5">
                {projects.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      resumeProject(p.id);
                      navigate("/canvas");
                    }}
                    className="group inline-flex w-full items-center justify-between gap-3 rounded-full border border-fg-tertiary/20 bg-bg-elev-1/55 px-4 py-2 backdrop-blur-md transition-colors hover:border-brand-ember/40 hover:bg-bg-elev-1/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                  >
                    <span className="truncate text-left font-body text-[12.5px] text-fg-secondary transition-colors group-hover:text-fg-primary">
                      {p.masterPrompt}
                    </span>
                    <span className="flex-shrink-0 font-mono text-[10.5px] tabular-nums text-fg-tertiary/65">
                      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(p.archivedAt))}
                    </span>
                  </button>
                ))}
                {projects.length > 3 ? (
                  <Link
                    to="/projects"
                    className="mt-1 text-center font-body text-[11.5px] text-fg-tertiary transition-colors hover:text-brand-ember focus-visible:outline-none focus-visible:underline"
                  >
                    View all {projects.length} archived
                  </Link>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </section>
      </main>
    </MotionConfig>
  );
}
