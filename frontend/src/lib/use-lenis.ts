import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Mounts a Lenis smooth-scroll instance for the lifetime of the App.
 * Lenis is ~4 KB, frame-locked, RAF-driven. Kills the slight stutter
 * browsers add on touchpad inertial scroll. The canvas route is
 * `overflow-hidden` so Lenis is a no-op there — landing footer, drawer
 * scroll, and final-delivery scroll all benefit.
 *
 * Reduced-motion: Lenis respects the OS preference automatically when
 * `autoRaf` is left to default; we still keep our explicit check.
 */
export function useLenis(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      // Prevent runaway momentum on trackpad flicks.
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    let rafId = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
}
