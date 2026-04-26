import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Lock, RotateCcw, X } from "lucide-react";
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
  /**
   * Inline error chip. When set, replaces the "Watching the cut" loader
   * with a state-error band anchored above the input. Mirrors the
   * agent-bubble-stream pattern so both surfaces report errors the
   * same way.
   */
  error?: string | null;
  /** Provided when the failed turn carried a user message worth retrying. */
  onRetry?: () => void;
  /** Dismiss the chip without retrying. */
  onDismissError?: () => void;
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
  error = null,
  onRetry,
  onDismissError,
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
          <p className="font-body text-meta leading-relaxed text-fg-tertiary">
            Tell me what to refine, or wait for a suggestion.
          </p>
        ) : null}

        {conversation.map((t, i) => (
          // Composite key matches agent-bubble-stream's pattern: role-index-
          // timestamp. Stable across appends; index alone churns when the
          // agent inserts a turn out-of-order or the list is filtered.
          <ConversationTurn key={`${t.role}-${i}-${t.timestamp}`} turn={t} />
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
                <span className="font-body text-overline font-medium uppercase tracking-[0.08em] text-fg-tertiary">
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
              key={`proposal-${conversation.length}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="space-y-3 border-t border-fg-tertiary/15 pt-3"
            >
              <p className="font-body text-meta leading-relaxed text-fg-primary">
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
                      className="cursor-pointer font-body text-pill font-medium text-brand-ember transition-colors hover:text-brand-ember/80"
                    >
                      Apply
                    </button>
                    <span aria-hidden="true" className="text-fg-tertiary/40">·</span>
                    <button
                      type="button"
                      onClick={onRevertProposal}
                      className="cursor-pointer font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary"
                    >
                      Keep mine
                    </button>
                  </>
                )}
              </div>

              {proposal.suggestedFollowups.length > 0 ? (
                <div className="border-t border-fg-tertiary/12">
                  {proposal.suggestedFollowups.map((s) => (
                    <button
                      key={s}
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
              key={`commit-${conversation.length}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="space-y-1.5 border-t border-state-success/40 pt-3"
            >
              <div className="font-body text-overline font-medium uppercase tracking-[0.08em] text-state-success">
                Locked
              </div>
              <p className="font-body text-meta font-medium leading-snug text-fg-primary">
                {commit.summary}
              </p>
              <p className="font-body text-pill leading-relaxed text-fg-tertiary">
                {commit.rationale}
              </p>
            </motion.div>
          ) : null}

          {error ? (
            <motion.div
              key="error"
              role="alert"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
              className="flex items-start justify-between gap-3 rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-body text-pill text-state-error"
            >
              <span className="leading-snug">{error}</span>
              <div className="flex shrink-0 items-center gap-3">
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex cursor-pointer items-center gap-1 text-fg-secondary transition-colors hover:text-fg-primary"
                  >
                    <RotateCcw size={11} strokeWidth={1.5} aria-hidden="true" />
                    Retry
                  </button>
                ) : null}
                {onDismissError ? (
                  <button
                    type="button"
                    onClick={onDismissError}
                    aria-label="Dismiss error"
                    className="cursor-pointer text-fg-tertiary transition-colors hover:text-fg-primary"
                  >
                    <X size={11} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
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
              "flex-1 bg-transparent py-2 font-body text-meta text-fg-primary outline-none",
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
    <p className="font-body text-meta leading-relaxed text-fg-secondary">
      {turn.content}
    </p>
  );
}
