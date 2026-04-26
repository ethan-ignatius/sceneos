import { Mic, MessagesSquare, Film } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface HowItWorksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  {
    icon: Mic,
    verb: "Direct",
    body: "You describe your idea in one sentence. No storyboards, no shot lists.",
  },
  {
    icon: MessagesSquare,
    verb: "Refine",
    body: "A directorial agent asks two questions per beat — lens, blocking, color — using the language of cinema, not 'what mood?'.",
  },
  {
    icon: Film,
    verb: "Cut",
    body: "Cloudinary stitches the final cinematic in a URL you can copy. Five clips become one, color-graded and timed.",
  },
] as const;

/**
 * 3-step explainer for first-time judges. Triggered from the landing
 * Help button. Static content; no state machine, no API calls.
 *
 * Resist auto-show on first visit — it would crash the flicker reveal
 * entrance. Help is opt-in.
 */
export function HowItWorksModal({ open, onOpenChange }: HowItWorksModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="How SceneOS works"
      caption="How it works"
      title="Direct. Refine. Cut."
    >
      <ol className="space-y-5">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.verb} className="flex items-start gap-4">
              <span
                className={cn(
                  "grid h-10 w-10 flex-shrink-0 place-items-center rounded-md",
                  "border border-brand-ember/40 bg-brand-ember/8 text-brand-ember",
                )}
                aria-hidden="true"
              >
                <Icon size={18} strokeWidth={1.5} />
              </span>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-body text-pill font-medium tabular-nums text-fg-tertiary">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="font-display text-lg italic text-fg-primary">{step.verb}</span>
                </div>
                <p className="max-w-prose font-body text-[0.875rem] leading-[1.55] text-fg-secondary">
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 border-t border-fg-tertiary/20 pt-4 font-body text-pill font-medium text-fg-tertiary">
        Built for LA Hacks 2026 · Cloudinary track
      </p>
    </Dialog>
  );
}
