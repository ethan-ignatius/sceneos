import { useEffect, useRef } from "react";

/**
 * 6px ember dot with a soft 1px outline ring that lags slightly behind the
 * actual pointer (lerp 0.18). Scales 2× and fills on hover over interactives
 * (any element with `data-cursor="hover"` or a button/link/role=button
 * ancestor). Hidden on touch devices and under prefers-reduced-motion —
 * the OS cursor takes over there.
 *
 * The lag is what reads as "deliberate." Instant-tracking cursor reads as
 * a screenshot, not a UI element.
 */
export function CinematicCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const targetX = useRef(0);
  const targetY = useRef(0);
  const dotX = useRef(0);
  const dotY = useRef(0);
  const ringX = useRef(0);
  const ringY = useRef(0);
  const hoverRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Touch / coarse pointer / reduced-motion → bail. The OS cursor wins.
    const isTouch = window.matchMedia("(hover: none) or (pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || reduced) return;

    document.documentElement.classList.add("hide-native-cursor");

    const onMove = (e: PointerEvent) => {
      targetX.current = e.clientX;
      targetY.current = e.clientY;
      // Detect interactive ancestor for the hover state.
      const t = e.target as HTMLElement | null;
      hoverRef.current = !!t?.closest(
        "button, a, [role='button'], [role='slider'], [data-cursor='hover'], input, textarea, select",
      );
    };

    const onLeave = () => {
      // Pointer left the window — fade the cursor out by parking it off-screen.
      targetX.current = -100;
      targetY.current = -100;
      hoverRef.current = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      // Dot tracks fast (lerp 0.4); ring tracks slower (lerp 0.18) so it lags.
      dotX.current += (targetX.current - dotX.current) * 0.4;
      dotY.current += (targetY.current - dotY.current) * 0.4;
      ringX.current += (targetX.current - ringX.current) * 0.18;
      ringY.current += (targetY.current - ringY.current) * 0.18;

      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot) {
        dot.style.transform = `translate3d(${dotX.current}px, ${dotY.current}px, 0) translate(-50%, -50%)`;
        dot.style.opacity = hoverRef.current ? "0" : "1";
      }
      if (ring) {
        const scale = hoverRef.current ? 2.4 : 1;
        const fill = hoverRef.current ? "1" : "0";
        ring.style.transform = `translate3d(${ringX.current}px, ${ringY.current}px, 0) translate(-50%, -50%) scale(${scale})`;
        ring.style.setProperty("--ring-fill", fill);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.documentElement.classList.remove("hide-native-cursor");
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="cinematic-cursor-ring pointer-events-none fixed left-0 top-0 z-[90] h-6 w-6 rounded-full"
        style={{
          // The fill swap on hover state — inner bg fades to ember.
          background:
            "radial-gradient(circle, rgba(240,168,104,calc(var(--ring-fill, 0) * 0.85)) 0%, transparent 70%)",
          border: "1px solid rgba(240, 168, 104, 0.55)",
          mixBlendMode: "difference",
          willChange: "transform",
          transition: "background 200ms cubic-bezier(0.25,1,0.5,1)",
        }}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className="cinematic-cursor-dot pointer-events-none fixed left-0 top-0 z-[91] h-1.5 w-1.5 rounded-full bg-brand-ember"
        style={{
          boxShadow: "0 0 8px rgba(240, 168, 104, 0.6)",
          willChange: "transform, opacity",
          transition: "opacity 180ms ease-out",
        }}
      />
    </>
  );
}
