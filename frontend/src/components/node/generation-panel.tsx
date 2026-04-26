import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type { GenerationProvider } from "@/types/api";

interface GenerationPanelProps {
  /** Suggested OUTPUT video duration in seconds. */
  suggestedDurationSeconds: number;
  /** Provider returned by /api/generate. Drives the timing estimate. */
  provider?: GenerationProvider | null;
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
 * The actual provider-side latency is opaque — these are tuned from observed
 * generation runs at trial-tier quotas. The panel renders progress against
 * THIS estimate, not against any backend signal, so the bar always advances
 * (no stalls) and the user gets a believable ETA. When the real clip lands
 * earlier, the polling loop closes the drawer to ClipPreview anyway.
 *
 * Without this map the panel was tuned to the mock backend's 1.6s lifecycle,
 * so under real Vertex Veo (~150s) every stage flashed by in the first second
 * and the ember bar stalled at "Uploading to Cloudinary" for 2+ minutes.
 */
const PROVIDER_BASE_SECONDS: Record<GenerationProvider, number> = {
  vertex: 150,
  higgsfield: 90,
  kling: 90,
  fal: 60,
  replicate: 90,
  cached: 4,
};

// Sentence-case stage labels. The previous tracked-uppercase variants
// ("STORYBOARD GENERATED", etc.) read as legacy enterprise dashboard chrome.
const STAGES = [
  { id: "storyboard", label: "Storyboard set." },
  { id: "render", label: "Clip rendering." },
  { id: "upload", label: "Uploading to Cloudinary." },
] as const;

/**
 * Visual feedback while a clip is generating.
 *
 * What it shows:
 *   - 16:9 placeholder framed with film-strip perforations and a frame counter
 *     that advances at 24fps. Reads as "an actual render is in flight," not
 *     a generic loading dashboard.
 *   - Three sentence-case stage steppers. The active row gets the ember dot
 *     via Motion's layoutId, so it slides between siblings instead of teleporting.
 *   - Live timer + estimated total + provider label.
 *
 * How progress is paced:
 *   - Each provider has a base wallclock estimate (PROVIDER_BASE_SECONDS).
 *     Vertex Veo on 8s output ~ 150s. Mock backend ~ 4s. We scale slightly
 *     by output duration so longer clips estimate longer.
 *   - The three stages divide the [0, 1] progress ratio into thirds, so the
 *     animation NEVER replays — it walks once, monotonically, from 0 to 1.
 *   - We cap visible ratio at 0.97 so the bar never reaches 100% before the
 *     real status comes back. The polling loop closes this panel out as
 *     soon as the clip is actually ready.
 */
export function GenerationPanel({ suggestedDurationSeconds, provider }: GenerationPanelProps) {
  const startMsRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startMsRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - startMsRef.current) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Per-provider estimate scaled lightly by output duration. Cached is the
  // mock path; everything else is a real provider with multi-minute latency.
  const baseSeconds = provider ? PROVIDER_BASE_SECONDS[provider] : 90;
  const totalEst = Math.max(baseSeconds + suggestedDurationSeconds * 4, 6);

  // Ratio drives BOTH the bar and the stepper. Capped at 0.97 so we never
  // hit the wall before the real status flips us out of this view.
  const ratio = Math.min(elapsed / totalEst, 0.97);

  // Stage from ratio: thirds. Storyboard 0–0.33, Render 0.33–0.85, Upload 0.85+.
  // The render middle is the longest because that's where Veo actually spends
  // most of its time; the storyboard + upload bookends are short.
  const activeIndex = ratio < 0.33 ? 0 : ratio < 0.85 ? 1 : 2;

  // Frame counter at 24fps gives the placeholder a real-render feel without
  // any actual frames. 24×elapsed clamped to a believable per-clip total.
  const fps = 24;
  const totalFrames = Math.max(Math.round(suggestedDurationSeconds * fps), 1);
  const currentFrame = Math.min(Math.round(elapsed * fps), totalFrames);

  // Resolution + codec stamp top-right. Consistent with what Veo 3.1 actually
  // outputs (1920×1080 mp4 h264). Constants for now; if the backend grows a
  // resolution selector, lift this to a prop.
  const resolutionLabel = "1920 × 1080";
  const codecLabel = "H.264";

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Cinematic placeholder — film-strip perforations frame the 16:9 area;
          a frame counter and resolution stamp give the moment data weight;
          the ember scanline travels top→bottom on a slow loop. The whole
          tile reads as a real render-in-progress monitor instead of a generic
          spinner box. */}
      <div className="relative aspect-video overflow-hidden rounded-lg border border-brand-ember/20 bg-[#0d0a07]">
        {/* Film-strip perforations — left + right edges. 8 holes vertically.
            Slight transparency so the placeholder bg shows through. */}
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

        {/* Soft blur-pulse layer behind the data — kept from the previous
            design but scoped inside the perforation frame. */}
        <div className="animate-blur-pulse absolute inset-y-2 left-6 right-6 rounded-sm" />

        {/* Slow ember scanline — travels top to bottom over ~6s. Drawn as a
            thin gradient that animates via inline style so it doesn't depend
            on a global keyframe. Subtle (8% ember) — adds life without noise. */}
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

        {/* Frame counter — top-left, mono tabular. */}
        <div className="absolute left-6 top-3 flex items-center gap-2 font-mono text-[11px] tabular-nums text-fg-tertiary">
          <span aria-hidden className="ember-pulse h-1.5 w-1.5 rounded-full bg-brand-ember" />
          <span>
            <span className="text-fg-secondary">FR</span>{" "}
            <span className="text-fg-primary">{currentFrame.toString().padStart(3, "0")}</span>
            <span className="mx-1 text-fg-tertiary/55">/</span>
            <span>{totalFrames.toString().padStart(3, "0")}</span>
          </span>
        </div>

        {/* Resolution + codec — top-right, mono tabular. */}
        <div className="absolute right-6 top-3 font-mono text-[11px] tabular-nums text-fg-tertiary/85">
          {resolutionLabel}
          <span className="mx-1.5 text-fg-tertiary/45">·</span>
          {codecLabel}
        </div>

        {/* Center copy — italic, switches per active stage so the user always
            knows what's happening RIGHT NOW (was static "Composing the frame."). */}
        <div className="absolute inset-0 grid place-items-center px-12">
          <div className="font-display text-[16px] italic text-brand-ember/90">
            {STAGES[activeIndex].label.replace(/\.$/, "")}
            <span className="ml-0.5 inline-block animate-pulse">.</span>
          </div>
        </div>

        {/* Progress streak — full-width hairline at the bottom edge. */}
        <motion.div
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand-ember"
          animate={{ scaleX: ratio }}
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

      {/* Live timer + provider stamp. */}
      <div className="flex items-baseline justify-between border-t border-fg-tertiary/15 pt-3 font-body text-[12px] text-fg-tertiary">
        <span>
          <span className="font-mono tabular-nums text-fg-secondary">{formatTime(elapsed)}</span>
          <span className="mx-2 text-fg-tertiary/55">/</span>
          <span className="font-mono tabular-nums">~{formatTime(totalEst)}</span>
        </span>
        <span>{provider ? PROVIDER_LABEL[provider] : "Connecting"}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
