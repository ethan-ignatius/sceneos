import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Live timestamp chrome. Updates every second, uses tabular-nums so the
 * width stays stable across digit changes. Optional location label and a
 * pulsing green dot to signal "live system."
 *
 * Borrowed from Parinaz Kassemi's portfolio: the small `NYC · 06:46:59 AM`
 * detail in the top chrome. Reads as "this is a real, live thing,"
 * which transfers to a feeling of trust without saying anything.
 *
 * Where to use:
 *   - Top-left chrome on the canvas route ("LA HACKS · 11:42:05 AM")
 *   - Bottom-right corner of the demo recording for a "captured live" detail
 *   - Footer of the final-delivery screen ("Rendered at 11:43:11 AM PT")
 */
interface LiveClockProps {
  /** Optional prefix label, e.g. "NYC" or "LA HACKS". */
  label?: string;
  /** When true, append a pulsing green dot. Default true. */
  showDot?: boolean;
  /** Use 24-hour format. Default false. */
  hour24?: boolean;
  className?: string;
}

function formatTime(d: Date, hour24: boolean) {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !hour24,
  });
}

export function LiveClock({ label, showDot = true, hour24 = false, className }: LiveClockProps) {
  const [time, setTime] = useState(() => formatTime(new Date(), hour24));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date(), hour24)), 1000);
    return () => clearInterval(id);
  }, [hour24]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] tabular-nums text-fg-secondary",
        className,
      )}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {label ? <span className="text-fg-tertiary">{label}</span> : null}
      <span aria-live="off">{time}</span>
      {showDot ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-state-success"
          style={{ animation: "ember-pulse 2.4s ease-in-out infinite" }}
        />
      ) : null}
    </span>
  );
}
