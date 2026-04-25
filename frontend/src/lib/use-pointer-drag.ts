import { useEffect, useRef } from "react";

interface UsePointerDragOptions {
  /** Exponential decay factor per frame (0..1). 0.92 ≈ tasteful inertia. */
  decay?: number;
  /** Minimum velocity (px/frame) before inertia stops. */
  minVelocity?: number;
}

/**
 * Horizontal pointer-drag with simple inertial decay for native scroll
 * containers.
 *
 * Why custom and not `useScrollVelocity`: that hook is wheel/touch-driven
 * and writes to a 0..1 progress ref for canvas/scroll surfaces. This one
 * reads/writes el.scrollLeft directly for the stitch-tray thumbnail row.
 * Different operation, different code.
 *
 * Pass the result of `register(el)` to a ref callback or call inside
 * useEffect — it returns a cleanup. Native overflow-x scrolling stays
 * intact (mousewheel, trackpad, focus-arrow); drag is just an enhancement.
 *
 * Trackpad two-finger horizontal scroll is NOT intercepted because we
 * only respond to button=0 (left mouse) pointerdown.
 */
export function usePointerDrag(opts: UsePointerDragOptions = {}) {
  const decay = opts.decay ?? 0.92;
  const minVelocity = opts.minVelocity ?? 0.2;
  const elRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
  });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const register = (el: HTMLElement | null) => {
    elRef.current = el;
    if (!el) return () => {};

    const onPointerDown = (e: PointerEvent) => {
      // Only left mouse — trackpad two-finger horizontal scroll triggers
      // wheel events, not pointerdown, so it's already left alone.
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      stateRef.current = {
        active: true,
        startX: e.clientX,
        scrollLeft: el.scrollLeft,
        lastX: e.clientX,
        lastT: performance.now(),
        velocity: 0,
      };
      el.dataset.dragging = "true";
      // Cancel any existing inertia loop.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s.active) return;
      const dx = e.clientX - s.startX;
      el.scrollLeft = s.scrollLeft - dx;
      const now = performance.now();
      const dt = Math.max(now - s.lastT, 1);
      s.velocity = (e.clientX - s.lastX) / dt; // px per ms
      s.lastX = e.clientX;
      s.lastT = now;
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s.active) return;
      s.active = false;
      delete el.dataset.dragging;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* may already be released */
      }
      // Convert ms-velocity to px-per-frame (~16ms at 60fps).
      let v = -s.velocity * 16;
      const tick = () => {
        if (Math.abs(v) < minVelocity) {
          rafRef.current = null;
          return;
        }
        const max = el.scrollWidth - el.clientWidth;
        const next = Math.max(0, Math.min(max, el.scrollLeft + v));
        // Clamp at boundaries — kill inertia rather than bounce.
        if (next === 0 || next === max) {
          el.scrollLeft = next;
          rafRef.current = null;
          return;
        }
        el.scrollLeft = next;
        v *= decay;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  };

  return { register };
}
