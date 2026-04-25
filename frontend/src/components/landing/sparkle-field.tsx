import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "motion/react";

interface Sparkle {
  id: string;
  x: number;
  y: number;
  delay: number;
  scale: number;
  lifespan: number;
}

interface SparkleFieldProps {
  /** How many sparkles drift over the parent at any time. */
  count?: number;
  /** Per-sparkle hue. The sparkles use ember + a gentle warm white. */
  className?: string;
}

/**
 * Subtle ember + bone sparkles drifting over the headline. Inspired by the
 * SparklesText pattern in the user's reference set. Tuned restrained: tiny
 * dots, slow lifecycle, never decorative — they're the "glitchy" signal
 * that this product is alive without being a video-game UI.
 *
 * The parent must be `position: relative` for the absolute children to
 * pin to it.
 */
export function SparkleField({ count = 12, className }: SparkleFieldProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    const make = (): Sparkle => ({
      id: `${Math.random().toString(36).slice(2, 8)}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      scale: Math.random() * 0.7 + 0.3,
      lifespan: Math.random() * 8 + 4,
    });
    setSparkles(Array.from({ length: count }, make));
    const id = window.setInterval(() => {
      setSparkles((prev) =>
        prev.map((s) => (s.lifespan <= 0 ? make() : { ...s, lifespan: s.lifespan - 0.1 })),
      );
    }, 100);
    return () => window.clearInterval(id);
  }, [count]);

  return (
    <span aria-hidden className={className} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {sparkles.map((s) => (
        <motion.svg
          key={s.id}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, s.scale, 0],
            rotate: [0, 90, 180],
          }}
          transition={{ duration: 1.2, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
          width={10}
          height={10}
          viewBox="0 0 21 21"
          style={
            {
              position: "absolute",
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: "translate(-50%, -50%)",
            } as CSSProperties
          }
        >
          <path
            d="M9.82 0.84C10.05 0.21 10.94 0.21 11.17 0.84L11.86 2.72C12.4 4.19 12.39 6.39 13.5 7.5C14.6 8.6 16.8 8.6 18.27 9.13L20.15 9.82C20.78 10.05 20.78 10.94 20.15 11.17L18.27 11.86C16.8 12.4 14.6 12.39 13.5 13.5C12.39 14.6 12.4 16.8 11.86 18.28L11.17 20.15C10.94 20.78 10.05 20.78 9.82 20.15L9.13 18.28C8.59 16.8 8.6 14.6 7.5 13.5C6.39 12.39 4.19 12.4 2.72 11.86L0.84 11.17C0.21 10.94 0.21 10.05 0.84 9.82L2.72 9.13C4.19 8.6 6.39 8.6 7.5 7.5C8.6 6.39 8.59 4.19 9.13 2.72L9.82 0.84Z"
            fill="currentColor"
          />
        </motion.svg>
      ))}
    </span>
  );
}
