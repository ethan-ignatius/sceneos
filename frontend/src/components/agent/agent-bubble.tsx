import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion-presets";
import type { AgentTurn } from "@/types/manifest";

interface AgentBubbleProps {
  turn: AgentTurn;
}

export function AgentBubble({ turn }: AgentBubbleProps) {
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
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isAgent
            ? "rounded-tl-sm bg-brand-ember/12 text-fg-primary ring-1 ring-brand-ember/20"
            : "rounded-tr-sm bg-brand-cool/15 text-fg-primary ring-1 ring-brand-cool/30",
        )}
      >
        {turn.content}
      </div>
    </motion.div>
  );
}
