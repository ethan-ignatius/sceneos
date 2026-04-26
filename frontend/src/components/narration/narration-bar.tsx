/**
 * Persistent co-director narration bar.
 *
 * Mounts in App.tsx outside <Routes> so it survives navigation. When the
 * narrator is speaking, a slim bar slides up from the bottom with:
 *   - A waveform animation (when playing)
 *   - The narrator's text as subtitles
 *   - A skip button
 *
 * When idle, nothing renders — zero visual footprint. The bar auto-
 * dismisses 3 seconds after the narrator finishes speaking.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Volume2, SkipForward } from "lucide-react";
import { useNarrationStore } from "@/lib/use-narration";
import { EASE } from "@/lib/motion-presets";

const MOMENT_LABELS: Record<string, string> = {
  prompt_reaction: "Co-Director",
  decompose_intro: "Co-Director",
  beat_intro: "Co-Director",
  beat_locked: "Co-Director",
  beat_complete: "Co-Director",
  summary: "Narrator",
};

export function NarrationBar() {
  const status = useNarrationStore((s) => s.status);
  const currentText = useNarrationStore((s) => s.currentText);
  const currentMoment = useNarrationStore((s) => s.currentMoment);
  const stop = useNarrationStore((s) => s.stop);

  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    if (status === "loading" || status === "playing") {
      setVisible(true);
    } else if (status === "done") {
      dismissTimer.current = setTimeout(() => setVisible(false), 4000);
    } else if (status === "idle" || status === "error") {
      setVisible(false);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [status]);

  const label = MOMENT_LABELS[currentMoment ?? ""] ?? "Co-Director";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE.outQuart }}
          className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2"
        >
          <div className="flex max-w-[36rem] items-start gap-3 rounded-2xl border border-fg-tertiary/15 bg-bg-panel/95 px-5 py-3.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
            {/* Waveform + label */}
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <Volume2 size={15} className="text-brand-ember" />
              <div className="flex items-center gap-[3px]">
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    className="inline-block w-[2px] rounded-full bg-brand-ember"
                    animate={
                      status === "playing"
                        ? { height: [3, 10, 3] }
                        : { height: 3 }
                    }
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <span className="font-body text-pill font-medium text-fg-tertiary">
                {status === "loading" ? "Thinking..." : label}
              </span>
            </div>

            {/* Subtitle text */}
            {currentText && (status === "playing" || status === "done") && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                transition={{ duration: 0.3 }}
                className="min-w-0 flex-1 font-body text-body-sm italic leading-snug text-fg-secondary"
              >
                {currentText}
              </motion.p>
            )}

            {/* Skip button */}
            {(status === "playing" || status === "loading") && (
              <button
                onClick={() => {
                  stop();
                  setVisible(false);
                }}
                className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary"
                aria-label="Skip narration"
              >
                <SkipForward size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
