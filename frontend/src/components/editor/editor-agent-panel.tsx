import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, Lock } from "lucide-react";
import type { EditDecisions, EditorTurnResponse } from "@/types/api";
import type { EditorTurn } from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";

interface EditorAgentPanelProps {
  conversation: EditorTurn[];
  /** The most recent agent emission. Drives the proposal card and follow-ups. */
  latest: EditorTurnResponse | null;
  thinking: boolean;
  onUserMessage: (text: string) => void;
  onAcceptProposal: () => void;
  onRevertProposal: () => void;
  onCommitNow: () => void;
  /** True after the agent committed via commitEdit. */
  committed: boolean;
  /** The decisions currently displayed on the timeline (not necessarily the latest agent emission). */
  livingDecisions: EditDecisions | null;
}

/**
 * The director's chat for the post-stitch edit pass.
 *
 * The agent emits one of:
 *   - propose: a new EditDecisions + rationale + 3 suggestedFollowups
 *   - commit:  the locked cut, with summary
 *
 * The proposal card sits at the top — clearly marked as "the agent suggests".
 * The user can Accept (merges decisions into livingDecisions), Revert (restores
 * pre-proposal state), or counter-propose by typing or clicking a follow-up.
 *
 * Voice rules — same as agent.py: warm, curious, no fake enthusiasm, no em dashes.
 */
export function EditorAgentPanel({
  conversation,
  latest,
  thinking,
  onUserMessage,
  onAcceptProposal,
  onRevertProposal,
  onCommitNow,
  committed,
  livingDecisions,
}: EditorAgentPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the chat scrolled to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversation.length, latest, thinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || thinking || committed) return;
    setDraft("");
    onUserMessage(trimmed);
  };

  const handleSuggestion = (text: string) => {
    if (thinking || committed) return;
    onUserMessage(text);
  };

  const proposal = latest?.kind === "propose" ? latest : null;
  const commit = latest?.kind === "commit" ? latest : null;
  const livingMatchesProposal =
    proposal && livingDecisions && JSON.stringify(livingDecisions) === JSON.stringify(proposal.decisions);

  return (
    <aside
      className={cn(
        "flex h-full flex-col rounded-md border border-fg-tertiary/15 bg-bg-elev-1/70 backdrop-blur-xl",
        "shadow-[0_30px_60px_-24px_rgba(0,0,0,0.6),_0_0_0_1px_rgba(240,168,104,0.04)]",
      )}
    >
      {/* Header — single Fraunces line. The "Editor · Director voice"
          eyebrow was redundant with the route header; the panel's
          content speaks for itself. */}
      <header className="border-b border-fg-tertiary/15 px-5 pb-4 pt-5">
        <h2 className="font-display text-2xl italic leading-tight text-fg-primary">
          {committed ? "Locked." : "What do you want to refine?"}
        </h2>
      </header>

      {/* Conversation scroller */}
      <div
        ref={scrollRef}
        data-lenis-prevent
        className="flex-1 space-y-4 overflow-y-auto px-5 py-5 [scrollbar-width:thin]"
      >
        {conversation.length === 0 && !thinking && !latest ? (
          <div className="rounded-md border border-dashed border-fg-tertiary/20 bg-bg-base/40 p-4 font-body text-[13px] leading-relaxed text-fg-tertiary">
            The cut just rendered. Tell me what you want to change, or wait for me to suggest something.
          </div>
        ) : null}

        {conversation.map((t, i) => (
          <ConversationTurn key={i} turn={t} />
        ))}

        {thinking ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 font-display text-[14px] italic text-fg-tertiary"
          >
            <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
            <span>Director is watching the cut.</span>
          </motion.div>
        ) : null}

        {/* Proposal card */}
        <AnimatePresence mode="wait">
          {proposal ? (
            <motion.div
              key={proposal.rationale}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className={cn(
                "space-y-3 rounded-md border border-brand-ember-dim/40 bg-brand-ember/[0.04] p-4",
                "shadow-[inset_0_0_0_1px_rgba(240,168,104,0.06)]",
              )}
            >
              <div className="flex items-center gap-1.5 font-body text-[12px] font-medium text-brand-ember">
                <Sparkles size={12} strokeWidth={1.5} aria-hidden="true" />
                <span>Director suggests</span>
              </div>
              <p className="font-body text-[13.5px] leading-relaxed text-fg-primary">{proposal.rationale}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {livingMatchesProposal ? (
                  <span className="font-body text-[11.5px] text-fg-tertiary">Applied</span>
                ) : (
                  <>
                    <Button size="sm" variant="primary" onClick={onAcceptProposal}>
                      Apply edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onRevertProposal}>
                      Keep mine
                    </Button>
                  </>
                )}
              </div>

              {/* Follow-up suggestions — same shape as the questionnaire pills. */}
              <div className="space-y-1.5 pt-2">
                <div className="font-body text-[11.5px] font-medium text-fg-tertiary">
                  Or try
                </div>
                <div className="flex flex-col gap-1.5">
                  {proposal.suggestedFollowups.map((s, i) => (
                    <motion.button
                      key={i}
                      type="button"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: DURATIONS.quick,
                        ease: EASE.outQuart,
                        delay: i * STAGGER.bubbles,
                      }}
                      onClick={() => handleSuggestion(s)}
                      disabled={thinking || committed}
                      className={cn(
                        "rounded-md border border-fg-tertiary/20 bg-bg-base/60 px-3.5 py-2.5",
                        "text-left font-body text-[13px] leading-snug text-fg-secondary",
                        "transition-colors duration-200 ease-out",
                        "hover:border-brand-ember-dim/60 hover:text-fg-primary",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}

          {commit ? (
            <motion.div
              key={commit.summary}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="space-y-2 rounded-md border border-state-success/40 bg-state-success/5 p-4"
            >
              <div className="font-body text-[12px] font-medium text-state-success">Locked</div>
              <p className="font-display text-lg italic leading-snug text-fg-primary">
                {commit.summary}
              </p>
              <p className="font-body text-[13px] leading-relaxed text-fg-tertiary">{commit.rationale}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="space-y-2 border-t border-fg-tertiary/15 px-5 pb-5 pt-4"
      >
        <div className="flex items-center gap-2 rounded-sm border border-fg-tertiary/25 bg-bg-base/60 px-3">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={committed ? "Cut is locked" : "Tighten beat 4 by half a second…"}
            disabled={thinking || committed}
            className={cn(
              "flex-1 bg-transparent py-2.5 text-[13px] text-fg-primary outline-none",
              "placeholder:text-fg-tertiary/60",
              "disabled:cursor-not-allowed",
            )}
            aria-label="Tell the director what to change"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking || committed}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-fg-tertiary",
              "transition-colors hover:text-brand-ember",
              "disabled:pointer-events-none disabled:opacity-30",
            )}
            aria-label="Send"
          >
            {thinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={1.5} />}
          </button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={committed || thinking}
          onClick={onCommitNow}
          className="w-full justify-center"
        >
          <Lock size={12} strokeWidth={1.5} aria-hidden="true" />
          Lock the cut
        </Button>
      </form>
    </aside>
  );
}

function ConversationTurn({ turn }: { turn: EditorTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-[12px] leading-relaxed",
          isUser
            ? "bg-fg-primary/8 text-fg-primary"
            : "bg-bg-base/50 text-fg-secondary",
        )}
      >
        {turn.content}
      </div>
    </div>
  );
}
