import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button with three layered behaviours:
 *   1. Magnetic pull — translates ≤ maxPull px toward cursor when within
 *      `radius` px of the button. Spring-damped.
 *   2. Corner flicker — 10ms-cycle CSS opacity flicker on the four corner
 *      ticks while hovered (telegraphs interactivity instantly).
 *   3. Ember-pulse-when-ready — apply `data-ready` to enable the standing
 *      pulse glow indicating "this is the next click."
 *
 * See docs/MOTION_LANGUAGE.md §7 for rationale.
 */
const magneticButtonVariants = cva(
  "magnetic-button group relative inline-flex items-center justify-center gap-2 font-body font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-ember-dim disabled:pointer-events-none disabled:opacity-40 transition-colors duration-200",
  {
    variants: {
      variant: {
        primary: "bg-brand-ember text-bg-base hover:bg-brand-ember/95",
        ghost: "border border-fg-tertiary/60 text-fg-primary hover:border-fg-secondary hover:bg-bg-elev-1/50",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

interface MagneticButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag">,
    VariantProps<typeof magneticButtonVariants> {
  /** Maximum translation toward cursor (px). Default 6. */
  maxPull?: number;
  /** Activation radius for magnetic pull (px). Default 80. */
  radius?: number;
  /** When true, button gains the standing ember-pulse glow. */
  ready?: boolean;
}

export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
  ({ className, variant, size, maxPull = 6, radius = 80, ready, children, ...props }, _ref) => {
    const wrapRef = useRef<HTMLButtonElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const sx = useSpring(x, { stiffness: 380, damping: 30 });
    const sy = useSpring(y, { stiffness: 380, damping: 30 });

    useEffect(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      const el = wrapRef.current;
      if (!el) return;

      const onMove = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) {
          x.set(0);
          y.set(0);
          return;
        }
        const strength = 1 - dist / radius;
        x.set((dx / radius) * maxPull * strength);
        y.set((dy / radius) * maxPull * strength);
      };
      const onLeave = () => {
        x.set(0);
        y.set(0);
      };

      window.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      return () => {
        window.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      };
    }, [maxPull, radius, x, y]);

    return (
      <motion.button
        ref={wrapRef}
        style={{ x: sx, y: sy }}
        data-ready={ready ? "true" : undefined}
        className={cn(magneticButtonVariants({ variant, size }), className)}
        {...(props as Omit<MagneticButtonProps, "ref">)}
      >
        {/* Corner ticks for flicker telegraph */}
        <span className="magnetic-button-tick magnetic-button-tick-tl" aria-hidden="true" />
        <span className="magnetic-button-tick magnetic-button-tick-tr" aria-hidden="true" />
        <span className="magnetic-button-tick magnetic-button-tick-bl" aria-hidden="true" />
        <span className="magnetic-button-tick magnetic-button-tick-br" aria-hidden="true" />
        <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
      </motion.button>
    );
  },
);
MagneticButton.displayName = "MagneticButton";
