import { useCallback, useEffect, useRef } from "react";

/**
 * RAF-driven inertial scroll/velocity hook.
 *
 * Architecture (from alexportfolio's ScrollVelocityProvider):
 *   wheel/touch deltas → velocityRef accumulates
 *   exponential decay (rate 5) drains the velocity each frame
 *   currentRef interpolates toward targetRef at 0.3 per frame
 *   consumers read refs (no re-renders) and write to CSS variables
 *
 * The whole thing runs in a single RAF loop and is reusable across
 * canvas camera rigs, stitch-tray drag, parallax, etc.
 *
 * Usage:
 *   const { progressRef, velocityRef, registerElement } = useScrollVelocity();
 *
 *   // tell the hook which element's scroll to track
 *   useEffect(() => registerElement(myDiv.current), []);
 *
 *   // in a useFrame or your own RAF, read progressRef.current
 *   useFrame(() => {
 *     camera.position.z = -progressRef.current * 1.2;
 *   });
 *
 *   // OR — write to a CSS variable so CSS animations can consume:
 *   useEffect(() => {
 *     const id = setInterval(() => {
 *       el.style.setProperty('--scroll-progress', String(progressRef.current));
 *       el.style.setProperty('--scroll-velocity', String(velocityRef.current));
 *     }, 16);
 *     return () => clearInterval(id);
 *   }, []);
 */

interface UseScrollVelocityOptions {
  /** Multiplier on wheel deltaY (mouse vs trackpad). */
  wheelGain?: number;
  /** Touch-drag delta gain. */
  touchGain?: number;
  /** Velocity exponential decay rate (higher = faster settle). */
  decayRate?: number;
  /** Interpolation constant 0..1 (higher = snappier). */
  interpolation?: number;
  /** Clamp progress to [min, max]. Pass null to leave unbounded. */
  clamp?: [number, number] | null;
}

export interface ScrollVelocityHandle {
  /** Smoothed scroll progress; updated each RAF tick. Read this in useFrame. */
  progressRef: React.MutableRefObject<number>;
  /** Instantaneous velocity (delta per frame, smoothed). */
  velocityRef: React.MutableRefObject<number>;
  /** Set the *target* progress directly (e.g., from a click-to-scroll). */
  setTargetProgress: (value: number) => void;
  /** Bind wheel + touch listeners to a specific element (default: window). */
  registerElement: (el: HTMLElement | Window | null) => () => void;
}

export function useScrollVelocity(opts: UseScrollVelocityOptions = {}): ScrollVelocityHandle {
  const wheelGain = opts.wheelGain ?? 0.0014;
  const touchGain = opts.touchGain ?? 0.003;
  const decayRate = opts.decayRate ?? 5;
  const interpolation = opts.interpolation ?? 0.3;
  const clamp = opts.clamp === undefined ? null : opts.clamp;

  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastTouchYRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const animate = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      const diff = targetRef.current - progressRef.current;
      progressRef.current += diff * interpolation;

      velocityRef.current += diff * 0.2;
      const decay = Math.exp(-decayRate * dt);
      velocityRef.current *= decay;

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [interpolation, decayRate]);

  // Stable across renders. `clamp`, `wheelGain`, `touchGain` are captured
  // once; if a caller actually wants those to change at runtime they should
  // remount the hook. Without this, BeatMap3D's `useEffect(... [registerElement])`
  // re-fires on every parent render, detaching + re-attaching wheel listeners
  // and re-triggering the canvas's pointer setup work.
  const setTargetProgress = useCallback(
    (value: number) => {
      if (clamp) {
        targetRef.current = Math.max(clamp[0], Math.min(clamp[1], value));
      } else {
        targetRef.current = value;
      }
    },
    [clamp],
  );

  const registerElement = useCallback(
    (el: HTMLElement | Window | null) => {
      if (!el) return () => {};
      const target: HTMLElement | Window = el;

      const onWheel = (e: WheelEvent) => {
        const delta = e.deltaY * wheelGain;
        setTargetProgress(targetRef.current + delta);
      };
      const onTouchStart = (e: TouchEvent) => {
        lastTouchYRef.current = e.touches[0]?.clientY ?? null;
      };
      const onTouchMove = (e: TouchEvent) => {
        const y = e.touches[0]?.clientY;
        if (y == null || lastTouchYRef.current == null) return;
        const deltaY = lastTouchYRef.current - y;
        lastTouchYRef.current = y;
        setTargetProgress(targetRef.current + deltaY * touchGain);
      };
      const onTouchEnd = () => {
        lastTouchYRef.current = null;
      };

      target.addEventListener("wheel", onWheel as EventListener, { passive: true });
      target.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
      target.addEventListener("touchmove", onTouchMove as EventListener, { passive: true });
      target.addEventListener("touchend", onTouchEnd as EventListener, { passive: true });

      return () => {
        target.removeEventListener("wheel", onWheel as EventListener);
        target.removeEventListener("touchstart", onTouchStart as EventListener);
        target.removeEventListener("touchmove", onTouchMove as EventListener);
        target.removeEventListener("touchend", onTouchEnd as EventListener);
      };
    },
    [wheelGain, touchGain, setTargetProgress],
  );

  return { progressRef, velocityRef, setTargetProgress, registerElement };
}
