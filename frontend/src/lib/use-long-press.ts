import { useCallback, useRef, useState } from "react";

/**
 * Long-press hook with visual progress signal.
 *
 * Used for hidden affordances that judges might poke (the demo-project
 * easter egg on the landing's version label). Pointer Events handle
 * touch + mouse + pen uniformly.
 *
 * Returns a `progress` value (0..1) updated via RAF while pressed so
 * consumers can render their own progress indicator (a thin bar, a
 * filling ring, an opacity ramp). The action fires when progress hits 1.
 */
interface UseLongPressOptions {
  /** Total hold duration in milliseconds. Default 1000. */
  delayMs?: number;
  /** Fires when the user has held long enough. */
  onLongPress: () => void;
  /** Optional: fires if the user releases before delayMs. */
  onCancel?: () => void;
}

export interface LongPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

export interface UseLongPressReturn {
  isPressed: boolean;
  /** 0..1 — how much of the hold has completed. Use for visual feedback. */
  progress: number;
  handlers: LongPressHandlers;
}

export function useLongPress({ delayMs = 1000, onLongPress, onCancel }: UseLongPressOptions): UseLongPressReturn {
  const [isPressed, setIsPressed] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const tick = useCallback(() => {
    if (startedAtRef.current == null) return;
    const elapsed = performance.now() - startedAtRef.current;
    const p = Math.min(1, elapsed / delayMs);
    setProgress(p);
    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      onLongPress();
      // Reset after firing so a second press still works
      startedAtRef.current = null;
      setIsPressed(false);
      setProgress(0);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [delayMs, onLongPress]);

  const start = useCallback(() => {
    if (isPressed) return;
    firedRef.current = false;
    startedAtRef.current = performance.now();
    setIsPressed(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [isPressed, tick]);

  const cancel = useCallback(() => {
    if (!isPressed) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!firedRef.current) onCancel?.();
    startedAtRef.current = null;
    setIsPressed(false);
    setProgress(0);
  }, [isPressed, onCancel]);

  return {
    isPressed,
    progress,
    handlers: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
  };
}
