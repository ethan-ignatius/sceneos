import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Lock } from "lucide-react";
import type { EditDecisions, EditorTurnResponse } from "@/types/api";
import type { EditorTurn } from "@/stores/beat-graph-store";
import { cn } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { renderThoughtMarkdown } from "@/lib/render-thought-markdown";

interface EditorAgentPanelProps {
  conversation: EditorTurn[];
  latest: EditorTurnResponse | null;
  thinking: boolean;
  streamingThought?: string;
  onUserMessage: (text: string) => void;
  onAcceptProposal: () => void;
  onRevertProposal: () => void;
  onCommitNow: () => void;
  committed: boolean;
  livingDecisions: EditDecisions | null;
}

/**
 * Director chat for the post-stitch edit pass.
 *
 * Body-text register only — no Fraunces decoration, no eyebrows that just
 * say what the surface is. Conversation flows top to bottom, the proposal
 * sits inline with text-button affordances, and the input pins to the
 * bottom of the column.
 */
export function EditorAgentPanel({
  conversation,
  latest,
  thinking,
  streamingThought = "",
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
    <aside className="flex h-full flex-col">
      {/* Conversation */}
      <div
        ref={scrollRef}
        data-lenis-prevent
        className="flex-1 space-y-4 overflow-y-auto pb-4 pr-1 [scrollbar-width:thin]"
      >
        {conversation.length === 0 && !thinking && !latest ? (
          <p className="font-body text-[13px] leading-relaxed text-fg-tertiary">
            Tell me what to refine, or wait for a suggestion.
          </p>
        ) : null}

        {conversation.map((t, i) => (
          <ConversationTurn key={i} turn={t} />
        ))}

        {thinking ? (
          streamingThought ? (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <motion.span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-brand-ember"
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="font-body text-[10px] font-medium uppercase tracking-[0.08em] text-fg-tertiary">
                  Thinking
                </span>
              </div>
              <p className="font-body text-pill leading-relaxed text-fg-tertiary/85">
                {renderThoughtMarkdown(streamingThought)}
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 font-body text-pill text-fg-tertiary"
            >
              <Loader2 size={11} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              <span>Watching the cut.</span>
            </motion.div>
          )
        ) : null}

        <AnimatePresence mode="wait">
          {proposal ? (
            <motion.div
              key={proposal.rationale}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="space-y-3 border-t border-fg-tertiary/15 pt-3"
            >
              <p className="font-body text-[13px] leading-relaxed text-fg-primary">
                {proposal.rationale}
              </p>
              <div className="flex items-center gap-3">
                {livingMatchesProposal ? (
                  <span className="font-body text-chip text-fg-tertiary">Applied</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onAcceptProposal}
                      className="cursor-pointer font-body text-[12px] font-medium text-brand-ember transition-colors hover:text-brand-ember/80"
                    >
                      Apply
                    </button>
                    <span aria-hidden="true" className="text-fg-tertiary/40">·</span>
                    <button
                      type="button"
                      onClick={onRevertProposal}
                      className="cursor-pointer font-body text-[12px] text-fg-tertiary transition-colors hover:text-fg-primary"
                    >
                      Keep mine
                    </button>
                  </>
                )}
              </div>

              {proposal.suggestedFollowups.length > 0 ? (
                <div className="border-t border-fg-tertiary/12">
                  {proposal.suggestedFollowups.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSuggestion(s)}
                      disabled={thinking || committed}
                      className={cn(
                        "block w-full cursor-pointer border-b border-fg-tertiary/12 px-1 py-2",
                        "text-left font-body text-pill leading-snug text-fg-secondary",
                        "transition-colors duration-200 ease-out",
                        "hover:text-brand-ember focus-visible:text-brand-ember focus-visible:outline-none",
                        "disabled:pointer-events-none disabled:opacity-50 last:border-b-0",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {commit ? (
            <motion.div
              key={commit.summary}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="space-y-1.5 border-t border-state-success/40 pt-3"
            >
              <div className="font-body text-[10px] font-medium uppercase tracking-[0.08em] text-state-success">
                Locked
              </div>
              <p className="font-body text-[13px] font-medium leading-snug text-fg-primary">
                {commit.summary}
              </p>
              <p className="font-body text-pill leading-relaxed text-fg-tertiary">
                {commit.rationale}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Input — pinned to bottom of column with hairline above. */}
      <form onSubmit={handleSubmit} className="space-y-2 border-t border-fg-tertiary/15 pt-3">
        <div className="flex items-center gap-2 border-b border-fg-tertiary/25 px-1 transition-colors focus-within:border-brand-ember-dim/60">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={committed ? "Cut is locked" : "Tighten beat 4 by half a second…"}
            disabled={thinking || committed}
            className={cn(
              "flex-1 bg-transparent py-2 font-body text-[13px] text-fg-primary outline-none",
              "placeholder:text-fg-tertiary/60",
              "disabled:cursor-not-allowed",
            )}
            aria-label="Tell the director what to change"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking || committed}
            className={cn(
              "grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary",
              "transition-colors hover:text-brand-ember",
              "disabled:pointer-events-none disabled:opacity-30",
            )}
            aria-label="Send"
          >
            {thinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={1.5} />}
          </button>
        </div>
        <button
          type="button"
          disabled={committed || thinking}
          onClick={onCommitNow}
          className={cn(
            "flex w-full cursor-pointer items-center justify-center gap-1.5 py-1",
            "font-body text-chip text-fg-tertiary",
            "transition-colors hover:text-brand-ember",
            "disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          <Lock size={11} strokeWidth={1.5} aria-hidden="true" />
          Lock the cut
        </button>
      </form>
    </aside>
  );
}

function ConversationTurn({ turn }: { turn: EditorTurn }) {
  const isUser = turn.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <p className="max-w-[88%] border-l-2 border-brand-ember-dim/40 pl-3 font-body text-pill leading-relaxed text-fg-secondary">
          {turn.content}
        </p>
      </div>
    );
  }
  return (
    <p className="font-body text-[13px] leading-relaxed text-fg-secondary">
      {turn.content}
    </p>
  );
}
