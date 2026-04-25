import { memo } from "react";
import { motion } from "motion/react";
import { TextSplitter } from "@/lib/text-splitter";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion-presets";
import type { AgentTurn } from "@/types/manifest";

interface AgentBubbleProps {
  turn: AgentTurn;
  /**
   * If true, agent turns reveal char-by-char via the .reveal-chars keyframe.
   * Pass `false` for already-rendered turns from history (e.g., reopening a
   * drawer) where retroactive reveal would feel like a glitch.
   */
  reveal?: boolean;
}

/**
 * One agent or user message bubble.
 *
 * Agent bubbles type-reveal char-by-char via TextSplitter's sequential mode
 * (see docs/AGENT_FLOW.md §4). User bubbles render instantly — the user
 * already knows what they wrote; revealing it would feel patronising.
 *
 * Reveal cap: total reveal time ≤ 1.6s regardless of length. Long answers
 * scale per-char step down accordingly.
 *
 * Wrapped in React.memo so a parent re-render (e.g., a sibling in the stream
 * appending a new turn) doesn't recompute character delays mid-animation —
 * which would visually flicker as already-revealed chars get new delay
 * values.
 */
function AgentBubbleImpl({ turn, reveal = true }: AgentBubbleProps) {
  const isAgent = turn.role === "agent";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING.bubble}
      className={cn("flex w-full", isAgent ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          // Rounded "chat bubble" geometry — 2xl corners with one tail-style
          // tight corner that signals which side the message came from.
          "max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isAgent
            ? "rounded-bl-md bg-brand-ember/12 text-fg-primary ring-1 ring-brand-ember/20"
            : "rounded-br-md bg-brand-cool/15 text-fg-primary ring-1 ring-brand-cool/30",
        )}
      >
        {isAgent && reveal ? (
          <TextSplitter
            text={turn.content}
            className="reveal-chars"
            delayStrategy="sequential"
            perCharStep={0.025}
            maxTotalDelay={1.6}
            ariaLabel={turn.content}
          />
        ) : (
          turn.content
        )}
      </div>
    </motion.div>
  );
}

export const AgentBubble = memo(
  AgentBubbleImpl,
  (prev, next) =>
    prev.turn.content === next.turn.content &&
    prev.turn.role === next.turn.role &&
    prev.turn.timestamp === next.turn.timestamp &&
    prev.reveal === next.reveal,
);
