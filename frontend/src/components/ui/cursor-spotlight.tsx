import { useEffect, useRef } from "react";

/**
 * Subtle radial-gradient halo that follows the pointer. Reads as
 * "this UI is alive without being needy." Apple-Vision-Pro-page energy.
 *
 * CSS-only via custom properties — no React state, no re-renders.
 * Respects prefers-reduced-motion (renders nothing).
 *
 * Usage:
 *   <CursorSpotlight intensity={0.3} radius={320} />  // mount once at the
 *                                                     // root of the route
 */
interface CursorSpotlightProps {
  /** Opacity at the spotlight center, 0..1. Default 0.3. */
  intensity?: number;
  /** Radius in px. Default 320. */
  radius?: number;
  /** CSS color (default: ember warm). */
  color?: string;
}

export function CursorSpotlight({
  intensity = 0.3,
  radius = 320,
  color = "#f0a868",
}: CursorSpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      el.style.setProperty("--mouse-x", `${e.clientX}px`);
      el.style.setProperty("--mouse-y", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{
        background: `radial-gradient(${radius}px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${color}${Math.round(
          intensity * 255,
        )
          .toString(16)
          .padStart(2, "0")}, transparent 60%)`,
        mixBlendMode: "screen",
        transition: "opacity 200ms ease-out",
      }}
    />
  );
}
