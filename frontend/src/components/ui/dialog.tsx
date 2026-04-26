import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE, SPRING } from "@/lib/motion-presets";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Content rendered inside the dialog body. */
  children: ReactNode;
  /** aria-label for the dialog surface. Required for screen readers. */
  ariaLabel: string;
  /** Optional title shown in a small mono caption above the body. */
  caption?: string;
  /** Optional headline shown in display italic. */
  title?: string;
  className?: string;
  /** Show a close X button in the top-right. Default true. */
  showClose?: boolean;
}

/**
 * Project-styled wrapper around Radix Dialog. Keeps a11y (focus trap,
 * esc-to-close, overlay click) for free; gives us our visual language.
 *
 * Used for: CutOS handoff modal, How-it-works walkthrough.
 */
export function Dialog({
  open,
  onOpenChange,
  children,
  ariaLabel,
  caption,
  title,
  className,
  showClose = true,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
            className="fixed inset-0 z-50 bg-bg-base/70 backdrop-blur-sm"
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          aria-label={ariaLabel}
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={SPRING.bubble}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[min(36rem,90vw)] -translate-x-1/2 -translate-y-1/2",
              "rounded-md border border-fg-tertiary/30 bg-bg-elev-1/95 backdrop-blur-xl",
              "shadow-[0_32px_64px_-24px_rgba(0,0,0,0.7)]",
              "p-6 outline-none",
              className,
            )}
          >
            {showClose ? (
              <DialogPrimitive.Close asChild>
                <button
                  aria-label="Close dialog"
                  title="Close"
                  className="absolute right-4 top-4 text-fg-tertiary transition-colors hover:text-fg-primary"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </DialogPrimitive.Close>
            ) : null}

            <DialogPrimitive.Title asChild>
              {caption ? (
                <div className="font-body text-[12px] font-medium text-fg-tertiary">
                  {caption}
                </div>
              ) : (
                <span className="sr-only">{ariaLabel}</span>
              )}
            </DialogPrimitive.Title>

            {title ? (
              <h2 className="mt-1 font-display text-2xl italic text-fg-primary">{title}</h2>
            ) : null}

            <div className={cn(caption || title ? "mt-4" : undefined)}>
              {children}
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
