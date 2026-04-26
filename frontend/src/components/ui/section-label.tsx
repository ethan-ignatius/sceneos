import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small icon-in-rounded-square + caption combo, used to introduce a section.
 *
 * Adopted from Augen Pro's section labels and FlowBoard's category chips:
 * - 28x28 rounded square, dark or warm background depending on context
 * - icon centered, currentColor
 * - caption below, mono small uppercase tracking
 *
 * Use cases in SceneOS:
 *   - "Establishing", "Hook", "Rising" labels above each beat name in the
 *     drawer header (icon = lens / aperture / motion icon per archetype)
 *   - Section intros if we ever ship a marketing page below the fold
 *   - The stitch tray's "Live URL" label could use this with a link icon
 */
interface SectionLabelProps {
  icon?: ReactNode;
  children: ReactNode;
  /** Visual bias. Default `dark` — works on the dark canvas. Use `warm` for ember chrome. */
  variant?: "dark" | "warm" | "muted";
  className?: string;
}

export function SectionLabel({ icon, children, variant = "dark", className }: SectionLabelProps) {
  const iconColors = {
    dark: "bg-bg-elev-2 text-fg-primary ring-1 ring-fg-tertiary/30",
    warm: "bg-brand-ember/15 text-brand-ember ring-1 ring-brand-ember/40",
    muted: "bg-bg-elev-1 text-fg-tertiary ring-1 ring-fg-tertiary/20",
  } as const;
  const labelColors = {
    dark: "text-fg-secondary",
    warm: "text-brand-ember",
    muted: "text-fg-tertiary",
  } as const;

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            iconColors[variant],
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className={cn("font-body text-pill font-medium", labelColors[variant])}>
        {children}
      </span>
    </div>
  );
}
