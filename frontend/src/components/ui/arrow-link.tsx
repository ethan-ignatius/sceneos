import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ArrowRight, ArrowDown, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline link with a stacked-arrow hover-swap animation.
 *
 * Adopted from Augen Pro: two arrow icons stacked inside an `overflow:hidden`
 * wrapper. On hover, the visible icon translates out and the hidden icon
 * translates in. Reads as "this is going somewhere."
 *
 * Use for tertiary CTAs that aren't loud enough to deserve <MagneticButton>:
 *   - "Open in CutOS to fine-edit" on the stitch tray
 *   - "Render final cinematic" on the final-delivery → landing return link
 *   - "Read more" on any future case-study card
 *   - footer links
 *
 * For primary CTAs, use <MagneticButton>.
 */
type ArrowDirection = "right" | "down" | "out";

const ICONS: Record<ArrowDirection, typeof ArrowRight> = {
  right: ArrowRight,
  down: ArrowDown,
  out: ArrowUpRight,
};

interface ArrowLinkProps extends ComponentPropsWithoutRef<"a"> {
  direction?: ArrowDirection;
  size?: "sm" | "md" | "lg";
  tone?: "ember" | "cool" | "fg";
}

export const ArrowLink = forwardRef<HTMLAnchorElement, ArrowLinkProps>(
  ({ className, direction = "right", size = "md", tone = "fg", children, ...props }, ref) => {
    const Icon = ICONS[direction];
    const sizes = {
      sm: { text: "text-xs", icon: 12, ring: "h-5 w-5" },
      md: { text: "text-sm", icon: 14, ring: "h-7 w-7" },
      lg: { text: "text-base", icon: 16, ring: "h-9 w-9" },
    } as const;
    const tones = {
      ember: "text-brand-ember",
      cool: "text-brand-cool",
      fg: "text-fg-primary",
    } as const;
    const s = sizes[size];

    return (
      <a
        ref={ref}
        className={cn(
          "group inline-flex items-center gap-2.5 font-body font-medium transition-colors duration-200",
          tones[tone],
          s.text,
          className,
        )}
        {...props}
      >
        <span className={cn("relative inline-flex items-center justify-center overflow-hidden rounded-full border border-current", s.ring)}>
          {/* The default-position icon slides out on hover */}
          <Icon
            size={s.icon}
            strokeWidth={1.5}
            className={cn(
              "transition-transform duration-300 ease-out",
              direction === "right" && "group-hover:translate-x-[110%]",
              direction === "down" && "group-hover:translate-y-[110%]",
              direction === "out" && "group-hover:translate-x-[110%] group-hover:-translate-y-[110%]",
            )}
          />
          {/* The hidden icon slides in from the opposite edge */}
          <Icon
            size={s.icon}
            strokeWidth={1.5}
            aria-hidden="true"
            className={cn(
              "absolute transition-transform duration-300 ease-out",
              direction === "right" && "-translate-x-[110%] group-hover:translate-x-0",
              direction === "down" && "-translate-y-[110%] group-hover:translate-y-0",
              direction === "out" && "-translate-x-[110%] translate-y-[110%] group-hover:translate-x-0 group-hover:translate-y-0",
            )}
          />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{children}</span>
      </a>
    );
  },
);
ArrowLink.displayName = "ArrowLink";
