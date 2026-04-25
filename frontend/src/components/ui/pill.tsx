import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Tag-style toggle. Outline by default, filled when active.
 *
 * Inspired by Augen Pro's pill component:
 * - hover swap is a 200ms color transition
 * - filled state uses the brand color
 * - outline state uses 0.72px ring
 *
 * Use for: video-type selector on landing, beat-archetype labels in the
 * drawer header, agent-confidence chips in the sufficiency status row.
 *
 * For primary CTAs, use <MagneticButton> instead.
 */
const pillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap font-mono uppercase transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-ember-dim",
  {
    variants: {
      variant: {
        outline: "border bg-transparent",
        filled: "border",
      },
      tone: {
        ember: "",
        cool: "",
        fg: "",
      },
      size: {
        sm: "h-6 rounded-full px-2.5 text-[10px] tracking-[0.18em]",
        md: "h-7 rounded-full px-3.5 py-0.5 text-[11px] tracking-[0.2em]",
      },
      active: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      // outline + tone + active
      { variant: "outline", tone: "ember", active: true, class: "border-brand-ember/80 bg-brand-ember/10 text-brand-ember" },
      { variant: "outline", tone: "ember", active: false, class: "border-fg-tertiary/60 text-fg-tertiary hover:border-brand-ember/60 hover:text-brand-ember" },
      { variant: "outline", tone: "cool", active: true, class: "border-brand-cool bg-brand-cool/10 text-brand-cool" },
      { variant: "outline", tone: "cool", active: false, class: "border-fg-tertiary/60 text-fg-tertiary hover:border-brand-cool hover:text-brand-cool" },
      { variant: "outline", tone: "fg", active: true, class: "border-fg-primary bg-fg-primary/5 text-fg-primary" },
      { variant: "outline", tone: "fg", active: false, class: "border-fg-tertiary/60 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary" },
      // filled + tone
      { variant: "filled", tone: "ember", class: "border-brand-ember bg-brand-ember text-bg-base" },
      { variant: "filled", tone: "cool", class: "border-brand-cool bg-brand-cool text-bg-base" },
      { variant: "filled", tone: "fg", class: "border-fg-primary bg-fg-primary text-bg-base" },
    ],
    defaultVariants: { variant: "outline", tone: "fg", size: "md", active: false },
  },
);

interface PillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "tone">,
    VariantProps<typeof pillVariants> {
  asChild?: boolean;
}

export const Pill = forwardRef<HTMLButtonElement, PillProps>(
  ({ className, variant, tone, size, active, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(pillVariants({ variant, tone, size, active }), className)}
      {...props}
    />
  ),
);
Pill.displayName = "Pill";
