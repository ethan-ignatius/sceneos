import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

interface VoiceWaveformProps {
  /** True while the speech-recognition is listening. */
  active: boolean;
  /** Number of vertical bars (default 5). */
  bars?: number;
  /** Bar color override; defaults to currentColor. */
  color?: string;
  className?: string;
}

/**
 * 5 vertical 1px bars riding `AnalyserNode.getByteFrequencyData()`.
 *
 * Mounts when `active` flips true: requests mic permission, builds an
 * AudioContext + AnalyserNode, RAF-loops bar heights from the FFT bins.
 * Tears down everything on unmount or when `active` flips false.
 *
 * Reduced-motion: skip the analyser entirely, render a static ember-pulse
 * dot per LEARNINGS §4.
 */
export function VoiceWaveform({
  active,
  bars = 5,
  color = "currentColor",
  className,
}: VoiceWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!active || reducedMotion) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const Ctx = window.AudioContext ?? (window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        ctxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          // Spread the bars across the lower-mid frequencies; voice lives there.
          for (let i = 0; i < bars; i++) {
            const slice = Math.floor((i + 1) * (data.length / (bars + 1)));
            const v = data[slice] / 255;
            const h = 4 + v * 22; // 4–26px tall
            const el = barsRef.current[i];
            if (el) el.style.height = `${h}px`;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        /* mic permission denied or unavailable — static dot fallback below */
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [active, reducedMotion, bars]);

  if (!active) return null;

  // Reduced-motion: static ember pulse instead of FFT bars.
  if (reducedMotion) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <span
          className="ember-pulse"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
          }}
        />
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 26 }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el;
          }}
          style={{
            display: "inline-block",
            width: 1,
            height: 4,
            background: color,
            transition: "height 60ms linear",
          }}
        />
      ))}
    </div>
  );
}
