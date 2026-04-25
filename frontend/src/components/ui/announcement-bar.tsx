import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Top-of-page announcement bar with rotating slides.
 *
 * Pattern from NextSense — three messages, ~4.5s interval, opacity + small
 * translateY cross-fade. Pauses when the tab is hidden to save battery.
 *
 * Use for:
 *   - Demo-day banner ("Live at LA Hacks 2026 · Pauley Pavilion")
 *   - Status indicators on the canvas ("Generating beat 2 of 5 · Higgsfield · 32% saved over template")
 *   - Future commerce surfaces ("Free shipping · 30-night trial · 1-year warranty")
 *
 * Don't use for critical info — announcement bars are read by ~15% of users.
 */
export interface AnnouncementSlide {
  icon?: ReactNode;
  content: ReactNode;
}

interface AnnouncementBarProps {
  slides: AnnouncementSlide[];
  /** Milliseconds between slide swaps. Default 4500. */
  intervalMs?: number;
  className?: string;
  /** Tone of the bar. */
  tone?: "ember" | "cool" | "neutral";
}

export function AnnouncementBar({
  slides,
  intervalMs = 4500,
  className,
  tone = "ember",
}: AnnouncementBarProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      id = setInterval(() => {
        setActive((i) => (i + 1) % slides.length);
      }, intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };

    start();
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [slides.length, intervalMs]);

  const tones = {
    ember: "bg-brand-ember/10 text-brand-ember ring-1 ring-brand-ember/20",
    cool: "bg-brand-cool/10 text-brand-cool ring-1 ring-brand-cool/20",
    neutral: "bg-bg-elev-1 text-fg-secondary ring-1 ring-fg-tertiary/20",
  } as const;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex h-9 w-full items-center justify-center overflow-hidden",
        tones[tone],
        className,
      )}
    >
      {slides.map((slide, i) => (
        <span
          key={i}
          aria-hidden={i === active ? undefined : true}
          className={cn(
            "absolute left-1/2 top-1/2 inline-flex items-center gap-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] transition-[opacity,transform] duration-500 ease-out",
            i === active ? "opacity-100" : "opacity-0",
          )}
          style={{
            transform: `translate(-50%, ${i === active ? "-50%" : "calc(-50% + 6px)"})`,
            pointerEvents: i === active ? "auto" : "none",
          }}
        >
          {slide.icon ? <span className="inline-flex">{slide.icon}</span> : null}
          {slide.content}
        </span>
      ))}
    </div>
  );
}
