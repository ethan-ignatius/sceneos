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
 * Reveal pacing is adaptive: total reveal scales with text length, clamped
 * to [0.4s, 1.6s]. Short replies ("Got it.") get ~0.4s so they don't feel
 * laggy; long replies cap at 1.6s so the user isn't waiting on a slow type
 * animation. The previous fixed 1.6s cap made every short answer feel
 * artificially slow OR (when paired with a per-char step) flicker by
 * faster than the eye registers.
 *
 * Wrapped in React.memo so a parent re-render (e.g., a sibling in the stream
 * appending a new turn) doesn't recompute character delays mid-animation —
 * which would visually flicker as already-revealed chars get new delay
 * values.
 */
function AgentBubbleImpl({ turn, reveal = true }: AgentBubbleProps) {
  const isAgent = turn.role === "agent";
  // Adaptive total: ~25 chars/second feels like deliberate-but-quick typing.
  // 0.4s floor keeps "Got it." from being instant; 1.6s ceiling keeps long
  // answers from dragging on.
  const adaptiveTotalDelay = Math.max(0.4, Math.min(1.6, turn.content.length * 0.022));
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
            maxTotalDelay={adaptiveTotalDelay}
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
