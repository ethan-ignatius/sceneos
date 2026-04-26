import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type { GenerationProvider } from "@/types/api";

interface GenerationPanelProps {
  /** Suggested OUTPUT video duration in seconds. */
  suggestedDurationSeconds: number;
  /** Provider returned by /api/generate. Drives the timing estimate. */
  provider?: GenerationProvider | null;
  /**
   * Backend-reported provider stage (e.g. "veo_running",
   * "cloudinary_uploading"). When present, overrides the ratio-derived
   * activeIndex so the visible stepper matches reality.
   */
  stage?: string | null;
  /**
   * ISO timestamp captured server-side when the provider job was first
   * dispatched. When present, elapsed time is computed against THIS value
   * instead of the panel's local mount time — closing & reopening the
   * drawer mid-generation keeps the bar honest. Null = local clock.
   */
  startedAt?: string | null;
  /**
   * Cancel handler — closes the active poll, resets the beat to
   * ready-to-generate. Surfaced inside the timeout banner.
   */
  onCancel?: () => void;
}

const PROVIDER_LABEL: Record<GenerationProvider, string> = {
  higgsfield: "Higgsfield · live",
  kling: "Kling · live",
  fal: "fal.ai · live",
  vertex: "Vertex · Veo 3.1",
  replicate: "Replicate · live",
  cached: "Cached · demo",
};

/**
 * Per-provider rough wallclock estimates, in seconds, for an 8-second clip.
 * Tuned from observed generation runs at trial-tier quotas. Vertex Veo
 * ~150s, fal.ai ~60s, cached ~4s. The bar paces against this estimate
 * rather than any backend signal — it always advances; the polling loop
 * closes us out the moment the real clip lands.
 */
const PROVIDER_BASE_SECONDS: Record<GenerationProvider, number> = {
  vertex: 150,
  higgsfield: 90,
  kling: 90,
  fal: 60,
  replicate: 90,
  cached: 4,
};

// Sentence-case stage labels.
const STAGES = [
  { id: "storyboard", label: "Storyboard set." },
  { id: "render", label: "Clip rendering." },
  { id: "upload", label: "Uploading to Cloudinary." },
] as const;

/**
 * Stage-weighted progress curve.
 *
 * Real renders aren't linear — Veo spends ~10% of its time on storyboard,
 * ~80% on the render itself, and ~10% on persisting + uploading. Mapping
 * elapsed/estimated linearly through that produces a bar that crawls
 * through the middle and races at the ends. We want the OPPOSITE: the bar
 * should advance briskly through the bookends (where work happens fast)
 * and decelerate through the render (where the user genuinely waits).
 *
 * The piecewise curve below maps `t` (elapsed/estimated, 0..1) to
 * `progress` (visible bar fill, 0..1):
 *
 *   t ∈ [0, 0.10]  → progress 0 → 0.30 (storyboard, accel out)
 *   t ∈ [0.10, 0.85] → progress 0.30 → 0.85 (render, slow)
 *   t ∈ [0.85, 1.0] → progress 0.85 → 0.97 (upload, accel in)
 *
 * Capped at 0.97 so the bar never reads "100% done" before the real
 * status comes back.
 */
function stageWeightedProgress(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  if (clamped < 0.1) {
    // Storyboard: ease-out cubic from 0 → 0.30 over the first 10% of time
    const u = clamped / 0.1;
    return 0.3 * (1 - Math.pow(1 - u, 3));
  }
  if (clamped < 0.85) {
    // Render: linear from 0.30 → 0.85 over middle 75% of time. The render
    // stage is where the user actually waits — feeling slower here is
    // honest, not a bug.
    const u = (clamped - 0.1) / 0.75;
    return 0.3 + 0.55 * u;
  }
  // Upload: ease-in from 0.85 → 0.97 over last 15% of time.
  const u = (clamped - 0.85) / 0.15;
  return Math.min(0.85 + 0.12 * (u * u), 0.97);
}

export function GenerationPanel({
  suggestedDurationSeconds,
  provider,
  stage,
  startedAt,
  onCancel,
}: GenerationPanelProps) {
  // Local fallback clock — used until backend startedAt arrives. Set on
  // first mount; once startedAt is present, the calculation below ignores
  // it. Surviving across drawer close/reopen is what makes the bar honest.
  const startMsRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    startMsRef.current = Date.now();
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // True elapsed: backend timestamp wins, local clock is fallback. Reading
  // `tick` here is what re-renders the component on each interval pulse.
  void tick;
  const startMs = startedAt ? Date.parse(startedAt) : startMsRef.current;
  const elapsed = Math.max(0, (Date.now() - startMs) / 1000);

  // Per-provider estimate scaled lightly by output duration.
  const baseSeconds = provider ? PROVIDER_BASE_SECONDS[provider] : 90;
  const totalEst = Math.max(baseSeconds + suggestedDurationSeconds * 4, 6);

  // Stage-weighted ratio — non-linear so the bar reads as a real render.
  const ratio = stageWeightedProgress(elapsed / totalEst);

  // Stage from ratio (thirds): Storyboard 0–0.30, Render 0.30–0.85, Upload 0.85+.
  // Backend stage signal overrides — when it reports cloudinary_uploading or
  // cloudinary_uploaded, jump the stepper to the upload row even if the
  // ratio-based curve hasn't reached it yet.
  const ratioStageIndex = ratio < 0.3 ? 0 : ratio < 0.85 ? 1 : 2;
  const activeIndex =
    stage === "cloudinary_uploading" || stage === "cloudinary_uploaded"
      ? 2
      : ratioStageIndex;

  // Timeout signal: elapsed has exceeded 1.5× the estimate AND we're
  // still on the upload stage (which means /api/status hasn't flipped to
  // succeeded yet). Surface a warning so the user knows the run is stuck
  // — and offer a cancel to break out instead of staring at "Connecting"
  // forever.
  const isStuck = elapsed > totalEst * 1.5;

  const fps = 24;
  const totalFrames = Math.max(Math.round(suggestedDurationSeconds * fps), 1);
  const currentFrame = Math.min(Math.round(ratio * totalFrames), totalFrames);

  const resolutionLabel = "1920 × 1080";
  const codecLabel = "H.264";

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Cinematic placeholder — film-strip perforations frame the 16:9 area;
          a frame counter and resolution stamp give the moment data weight;
          the ember scanline travels top→bottom on a slow loop. */}
      <div className="relative aspect-video overflow-hidden rounded-lg border border-brand-ember/20 bg-[#0d0a07]">
        <div aria-hidden className="pointer-events-none absolute inset-y-2 left-1.5 flex w-2 flex-col justify-between">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="block h-1.5 w-full rounded-[1px] bg-fg-primary/12" />
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-2 right-1.5 flex w-2 flex-col justify-between">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="block h-1.5 w-full rounded-[1px] bg-fg-primary/12" />
          ))}
        </div>

        <div className="animate-blur-pulse absolute inset-y-2 left-6 right-6 rounded-sm" />

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-12"
          style={{
            background: "linear-gradient(to bottom, transparent, rgba(240,168,104,0.08) 50%, transparent)",
          }}
          initial={{ y: "-100%" }}
          animate={{ y: "100%" }}
          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
        />

        <div className="absolute left-6 top-3 flex items-center gap-2 font-mono text-[11px] tabular-nums text-fg-tertiary">
          <span aria-hidden className="ember-pulse h-1.5 w-1.5 rounded-full bg-brand-ember" />
          <span>
            <span className="text-fg-secondary">FR</span>{" "}
            <span className="text-fg-primary">{currentFrame.toString().padStart(3, "0")}</span>
            <span className="mx-1 text-fg-tertiary/55">/</span>
            <span>{totalFrames.toString().padStart(3, "0")}</span>
          </span>
        </div>

        <div className="absolute right-6 top-3 font-mono text-[11px] tabular-nums text-fg-tertiary/85">
          {resolutionLabel}
          <span className="mx-1.5 text-fg-tertiary/45">·</span>
          {codecLabel}
        </div>

        <div className="absolute inset-0 grid place-items-center px-12">
          <div className="font-display text-[16px] italic text-brand-ember/90">
            {STAGES[activeIndex].label.replace(/\.$/, "")}
            <span className="ml-0.5 inline-block animate-pulse">.</span>
          </div>
        </div>

        <motion.div
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand-ember"
          animate={{ scaleX: ratio }}
          transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
        />
      </div>

      {/* Three steppers — sentence-case body type. */}
      <ul className="space-y-1">
        {STAGES.map((stage, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li
              key={stage.id}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 font-body text-[13px]",
                done && "text-fg-secondary",
                active && "text-brand-ember",
                !done && !active && "text-fg-tertiary",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="gen-active-dot"
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-brand-ember shadow-[0_0_12px_rgba(240,168,104,0.7)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              ) : done ? (
                <span
                  aria-hidden="true"
                  className="grid h-2 w-2 place-items-center text-state-success"
                >
                  <Check size={10} strokeWidth={2.5} />
                </span>
              ) : (
                <span aria-hidden="true" className="h-2 w-2 rounded-full border border-fg-tertiary/60" />
              )}
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ul>

      {/* Stuck banner — ONLY when elapsed has badly exceeded the
          estimate. Communicates that the job's overrunning, offers a
          cancel so the user can break out of "stuck on Connecting"
          loops without hard-closing the drawer. */}
      <AnimatePresence>
        {isStuck ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: EASE.outQuart }}
            role="alert"
            className="flex items-start gap-3 rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2.5 font-body text-[12px] leading-snug text-state-error"
          >
            <AlertTriangle size={13} strokeWidth={1.6} aria-hidden="true" className="mt-px flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="font-medium text-fg-primary">
                {provider == null
                  ? "Couldn't reach the render service."
                  : "This run is overrunning."}
              </div>
              <div className="text-state-error/85">
                {provider == null
                  ? "We're still trying to connect. If this keeps spinning, cancel and try again."
                  : `Veo usually finishes within ~${formatTime(totalEst)}; we're at ${formatTime(elapsed)}. The clip may still land — or you can retry.`}
              </div>
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-sm font-body text-[11.5px] font-medium text-fg-secondary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
                >
                  Cancel and retry
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Live timer + provider stamp. */}
      <div className="flex items-baseline justify-between border-t border-fg-tertiary/15 pt-3 font-body text-[12px] text-fg-tertiary">
        <span>
          <span className={cn("font-mono tabular-nums", isStuck ? "text-state-error" : "text-fg-secondary")}>
            {formatTime(elapsed)}
          </span>
          <span className="mx-2 text-fg-tertiary/55">/</span>
          <span className="font-mono tabular-nums">~{formatTime(totalEst)}</span>
        </span>
        <span>{stageLabel(stage, provider)}</span>
      </div>
    </div>
  );
}

function stageLabel(stage: string | null | undefined, provider: GenerationProvider | null | undefined): string {
  if (stage === "veo_running") return "Vertex · rendering";
  if (stage === "cloudinary_uploading") return "Cloudinary · uploading";
  if (stage === "cloudinary_uploaded") return "Cloudinary · uploaded";
  return provider ? PROVIDER_LABEL[provider] : "Connecting…";
}

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
