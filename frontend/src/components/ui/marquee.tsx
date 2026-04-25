import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Infinite horizontal marquee. Two duplicates of the children scroll left
 * (or right) at a constant speed; the second copy is identical so the loop
 * appears seamless. CSS keyframes only — no JS, no requestAnimationFrame.
 *
 * Pattern from NextSense ("featured in" logo strip).
 *
 * Use for:
 *   - "Powered by" / "Tools used" strips on the final-delivery or about page
 *   - "Try with these prompt seeds" prompt-suggestion strip on the landing
 *
 * Don't use for primary content — marquees are background texture, not focus.
 */
interface MarqueeProps {
  /** Seconds for one full loop. Lower = faster. Default 30. */
  speed?: number;
  direction?: "left" | "right";
  pauseOnHover?: boolean;
  /** Children must be flex-shrink-0 with intrinsic widths or the loop becomes uneven. */
  children: ReactNode;
  className?: string;
  /** Gap between siblings. Default `gap-12`. */
  gap?: string;
}

export function Marquee({
  speed = 30,
  direction = "left",
  pauseOnHover = false,
  children,
  className,
  gap = "gap-12",
}: MarqueeProps) {
  const items = Children.toArray(children);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        // Soft fade at the edges so children don't pop in/out hard.
        "[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-max",
          gap,
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
        style={{
          animation: `marquee ${speed}s linear infinite`,
          animationDirection: direction === "left" ? "normal" : "reverse",
        }}
      >
        {/* Track A */}
        <div className={cn("flex shrink-0", gap)}>
          {items.map((child, i) => (
            <span key={`a-${i}`} className="shrink-0">
              {child}
            </span>
          ))}
        </div>
        {/* Track B — identical duplicate so the loop is seamless */}
        <div className={cn("flex shrink-0", gap)} aria-hidden="true">
          {items.map((child, i) => (
            <span key={`b-${i}`} className="shrink-0">
              {child}
            </span>
          ))}
        </div>
      </div>

      {/* Local keyframes — kept inline so the component is self-contained. */}
      <style>{`
        @keyframes marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
