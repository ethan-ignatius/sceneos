import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type { GenerationProvider } from "@/types/api";

interface GenerationPanelProps {
  /** Suggested duration in seconds — drives the `~est` part of the timer. */
  suggestedDurationSeconds: number;
  /** Provider returned by /api/generate. */
  provider?: GenerationProvider | null;
  /** Backend-reported provider stage. */
  stage?: string | null;
}

const PROVIDER_LABEL: Record<GenerationProvider, string> = {
  higgsfield: "Higgsfield · live",
  kling: "Kling · live",
  fal: "fal.ai · live",
  vertex: "Vertex · Veo 3.1",
  replicate: "Replicate · live",
  cached: "Cached · demo",
};

// Sentence-case stage labels. The previous tracked-uppercase variants
// ("STORYBOARD GENERATED", etc.) read as legacy enterprise dashboard chrome —
// loud, dated, and fighting the rest of the UI's quieter sentence-case voice.
const STAGES = [
  { id: "storyboard", label: "Storyboard set.", end: 0.5 },
  { id: "render", label: "Clip rendering.", end: 1.4 },
  { id: "upload", label: "Uploading to Cloudinary.", end: Infinity },
] as const;

/**
 * Visual feedback while a clip is generating.
 *
 * Three steppers progress over elapsed time, with an ember dot that morphs
 * between the active row via Motion's `layoutId` (same sliding pattern as
 * the landing's pill underline).
 *
 * The 16:9 placeholder uses the existing `.animate-blur-pulse` keyframe.
 *
 * The mock backend's lifecycle is ~1.6s — the stage thresholds align with
 * that. Real Higgsfield is much longer, so this panel will need real
 * progress signals from `/api/status` once the live provider is wired.
 */
export function GenerationPanel({ suggestedDurationSeconds, provider, stage }: GenerationPanelProps) {
  const startMsRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startMsRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - startMsRef.current) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const timedStageIndex = STAGES.findIndex((s) => elapsed < s.end);
  const activeIndex =
    stage === "cloudinary_uploading" || stage === "cloudinary_uploaded"
      ? 2
      : timedStageIndex === -1
        ? STAGES.length - 1
        : timedStageIndex;

  const totalEst = Math.max(suggestedDurationSeconds * 0.12 + 1.5, 2); // mock-tuned
  const ratio = Math.min(elapsed / totalEst, 0.99);

  return (
    <div className="flex h-full flex-col gap-5">
      {/* 16:9 blur-pulse placeholder. Display-italic line replaces the
          tracked-uppercase mono label — same information, less shouty.  */}
      <div className="relative aspect-video overflow-hidden rounded-lg border border-brand-ember/25 bg-bg-elev-2">
        <div className="animate-blur-pulse absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="font-display text-[15px] italic text-brand-ember/85">
            Composing the frame.
          </div>
        </div>
        {/* Faint progress streak across the bottom edge. */}
        <motion.div
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand-ember"
          style={{ scaleX: ratio }}
          transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
        />
      </div>

      {/* Three steppers — sentence-case body type. The active row's ember dot
          slides between siblings via Motion's layoutId. */}
      <ul className="space-y-1">
        {STAGES.map((stage, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li
              key={stage.id}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 font-body text-[12.5px]",
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

      {/* Live timer. Provider label lifted out of all-caps tracking — sit it
          in mono small-caps territory but no uppercase-transform shouting. */}
      <div className="flex items-baseline justify-between border-t border-fg-tertiary/20 pt-3 font-body text-[11.5px] text-fg-tertiary">
        <span>
          <span className="font-mono tabular-nums text-fg-secondary">{formatTime(elapsed)}</span>
          <span className="mx-2 text-fg-tertiary/60">/</span>
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
