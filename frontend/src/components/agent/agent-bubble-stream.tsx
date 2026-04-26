import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Loader2, RotateCcw, Mic } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { Beat } from "@/types/manifest";
import { AgentBubble } from "./agent-bubble";
import { Button } from "@/components/ui/button";
import { api, formatDirectorReachabilityError } from "@/lib/api";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { useSpeechSynthesis } from "@/lib/use-speech-synthesis";
import { useNarrationStore } from "@/lib/use-narration";
import { isAudioMuted } from "@/lib/audio-cues";
import { nowISO } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { renderThoughtMarkdown } from "@/lib/render-thought-markdown";

interface AgentBubbleStreamProps {
  beat: Beat;
}

/**
 * Per-beat questionnaire chat UI wired to /api/agent.
 *
 * Lifecycle (see docs/AGENT_FLOW.md §7):
 *   - On mount with empty conversation → POST /api/agent (one-shot) for
 *     the seed question — faster than the streaming endpoint used on turns.
 *   - On user submit → optimistically append user turn, POST, append agent reply.
 *   - When the agent returns kind="sufficient" → store refinedPrompt on the
 *     scene and flip beat.status to "ready-to-generate".
 *
 * Race-condition guard: a `cancelled` ref blocks late writes if the drawer
 * unmounts mid-call. The store-level mutation is fine to land late (data
 * persists), but we don't want to flip status on a stale response.
 */
export function AgentBubbleStream({ beat }: AgentBubbleStreamProps) {
  const scene = beat.scenes[0];
  const manifest = useBeatGraphStore((s) => s.manifest);
  const appendAgentTurn = useBeatGraphStore((s) => s.appendAgentTurn);
  const updateBeat = useBeatGraphStore((s) => s.updateBeat);
  const updateScene = useBeatGraphStore((s) => s.updateScene);

  const [draft, setDraft] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live thinking accumulator — populated by /api/agent/stream "thought"
  // events on *follow-up* turns (after the user has sent a message). The
  // initial seed uses faster one-shot /api/agent instead (no thinking
  // budget), so "Next beat" is not stuck behind streaming + think tokens.
  // Cleared when the "result" arrives (or on unmount).
  const [streamingThought, setStreamingThought] = useState("");
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingRetryMessage, setPendingRetryMessage] = useState<string | null>(null);
  // Collapse old turns by default — only the last few are visible. The user
  // can opt to expand via the button at the top of the scroller.
  const [showAllTurns, setShowAllTurns] = useState(false);
  // Latest quick replies from the agent. Can be:
  //   - null: no suggestion payload
  //   - []: explicit open-ended
  //   - 1..4 items: clickable pre-answers
  const [latestSuggestions, setLatestSuggestions] = useState<readonly string[] | null>(null);

  // Voice input — Web Speech API. PURELY OPT-IN: the mic stays off until
  // the user clicks the mic button. Earlier we auto-started on mount and
  // auto-submitted on 2s silence — both behaviors were widely complained
  // about ("auto ingests my voice and instantly hits send before I can
  // edit transcription errors"). Now: mic only opens on explicit click,
  // transcript only fills the draft (user reviews + edits + presses Send).
  // Re-arming after each agent turn is also gone — one click to start,
  // one click to stop.
  //
  // Auto-grow + scroll for long answers. Textarea starts at one row,
  // expands to fit content up to ~5 rows, then becomes an internal
  // scroller. Rolled here (instead of `field-sizing: content`) so it
  // works across older Safari + Firefox the user might demo on.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechRecognition({
    lang: "en-US",
    // No onSettle: silence-based auto-submit was ripped out. The
    // transcript still streams into the draft via the effect below;
    // user reviews and submits manually.
  });

  // Hard stop: once the beat moves past questioning (markSufficient,
  // generating, preview, approved), kill any live listening session.
  // Without this, a mic that was open at the moment of commit keeps
  // capturing audio while Roll camera fires — and on orchestrate error
  // the user sees the mic glow as if the agent were still asking.
  useEffect(() => {
    if (beat.status === "pending" || beat.status === "questioning") return;
    if (speech.listening) speech.stop();
  }, [beat.status, speech]);

  // Mute the mic the instant the agent starts thinking (inFlight=true).
  // Otherwise the mic keeps capturing during the "Thinking…" period and
  // anything the user mumbles between turns gets concatenated onto the
  // transcript that's already been submitted. The user can re-engage the
  // mic with the mic button when the next question lands — no auto re-arm.
  useEffect(() => {
    if (!inFlight) return;
    if (speech.listening) speech.stop();
  }, [inFlight, speech]);
  useEffect(() => {
    if (speech.listening && speech.transcript) {
      setDraft(speech.transcript);
    }
  }, [speech.listening, speech.transcript]);

  // Voice OUTPUT — speak the agent's reply back when the last user submission
  // was via voice. This gives a true voice-chat feel; typed submissions stay
  // silent (the visual char reveal is the right affordance for type-mode).
  // Respects the global mute toggle. ALSO suppressed while the global
  // ElevenLabs narrator is mid-line — otherwise the browser's default voice
  // (Web Speech API) competes with the narrator and the user hears two
  // overlapping voices saying different things. ElevenLabs wins by deferral:
  // the agent's question can wait the few seconds until the narrator
  // finishes its moment-line.
  const tts = useSpeechSynthesis({ muted: isAudioMuted() });
  const lastSubmitWasVoiceRef = useRef(false);
  const lastSpokenIndexRef = useRef(-1);
  useEffect(() => {
    if (!lastSubmitWasVoiceRef.current) return;
    const turns = scene.conversation;
    const lastIdx = turns.length - 1;
    if (lastIdx < 0) return;
    const last = turns[lastIdx];
    if (last.role !== "agent") return;
    if (lastSpokenIndexRef.current >= lastIdx) return;
    // Defer if the ElevenLabs narrator currently has the floor — its
    // calm deep voice is the canonical "co-director" register, and we
    // don't want a competing browser TTS layered on top.
    const narrationStatus = useNarrationStore.getState().status;
    if (narrationStatus === "loading" || narrationStatus === "playing") return;
    lastSpokenIndexRef.current = lastIdx;
    tts.speak(last.content);
    // After the agent speaks, reset — user must submit via voice again to
    // re-engage TTS. Avoids surprising the user later with unexpected speech.
    lastSubmitWasVoiceRef.current = false;
  }, [scene.conversation, tts]);

  const toggleVoice = () => {
    if (speech.listening) {
      speech.stop();
    } else {
      speech.start();
    }
  };

  // Auto-scroll to bottom on new turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [scene.conversation.length]);

  // Seed question — fire on first mount when conversation is empty.
  // Drawer-lifetime unmount guard. The seed-effect below aborts its own
  // controller, but a user-turn callAgent fires AFTER the seed effect
  // has already returned; without this dedicated cleanup, an in-flight
  // user turn would leak its fetch on close. abortRef always points at
  // the most recent controller so aborting it covers either path.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  // First question on an empty beat: one-shot /api/agent (backend disables
  // "thinking" for that path) so the drawer does not pay streaming + think
  // overhead — critical when jumping beats with "Next beat". Follow-up
  // messages still use api.agentStream below.
  useEffect(() => {
    cancelledRef.current = false;
    // Skip the seed fire only when there's nothing to seed:
    //   - manifest isn't ready yet, OR
    //   - we already have conversation turns (agent asked + user replied)
    //
    // We deliberately do NOT short-circuit on `beat.status !== "pending"`.
    // The seed-effect optimistically flips status to "questioning" BEFORE
    // the API call (line below); if the request gets aborted (drawer closed
    // mid-fire, React StrictMode remount, network blip), status stays at
    // "questioning" with empty conversation — and a status-based guard
    // would deadlock that beat into showing only "Composing the shot."
    // forever. Conversation-length is the right invariant: re-fire when
    // we have nothing to show, no matter how status got there. Status
    // self-heals via the abort/error revert in the catch block.
    if (!manifest) return;
    if (scene.conversation.length > 0) return;

    let active = true;
    setInFlight(true);
    setError(null);
    setStreamingThought("");
    // Optimistically flip status to "questioning" so a remount mid-fire
    // (drawer close + reopen) sees the new status and short-circuits
    // instead of re-triggering "Composing the shot." On error we revert
    // to "pending" so the user can retry from a clean state.
    updateBeat(beat.beatId, { status: "questioning" });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // 60s ceiling — generous buffer for cold starts before we surface
    // a timeout and unstick the UI.
    const seedTimeoutId = window.setTimeout(() => {
      ctrl.abort();
      if (active && !cancelledRef.current) setError("Director took too long — try again.");
    }, 60_000);

    // Safety timeout — if no result arrives within 60s, abort the
    // connection. The backend has its own 45s ceiling, but this
    // catches network-level hangs the backend can't see.
    const safetyTimer = window.setTimeout(() => {
      if (!active || cancelledRef.current) return;
      ctrl.abort();
      setError("Connection timed out — the director took too long. Try again.");
      setStreamingThought("");
      setInFlight(false);
    }, 60_000);

    (async () => {
      try {
        const ev = await api.agent({ manifest, beatId: beat.beatId }, ctrl.signal);
        if (!active || cancelledRef.current) return;
        window.clearTimeout(safetyTimer);
        if (ev.kind === "question") {
          appendAgentTurn(beat.beatId, scene.sceneId, {
            role: "agent",
            content: ev.question,
            timestamp: nowISO(),
          });
          updateBeat(beat.beatId, { status: "questioning" });
          setLatestSuggestions(ev.suggestedAnswers ?? null);
        } else {
          // Edge case: agent considers itself sufficient on first turn.
          // Invalidate any speculative pre-bake — the refinedPrompt the
          // landing route fired with is now superseded by the agent's
          // sufficient payload, and Roll camera MUST re-render with the
          // user's voice in the prompt rather than short-circuit to the
          // stale clip.
          updateScene(beat.beatId, scene.sceneId, {
            refinedPrompt: ev.refinedPrompt,
            durationSeconds: ev.suggestedDuration,
            beatFacts: ev.beatFacts,
            speculativeJobId: undefined,
            jobId: undefined,
            clipPublicId: undefined,
            clipUrl: undefined,
            lastFrameUrl: undefined,
          });
          updateBeat(beat.beatId, { status: "ready-to-generate" });
        }
        setStreamingThought("");
      } catch (err) {
        if (!active || cancelledRef.current) return;
        if ((err as Error)?.name === "AbortError") return;
        const msg = formatDirectorReachabilityError(err);
        if (msg) setError(msg);
        // Revert the optimistic "questioning" flip so the next remount
        // re-runs the seed fire instead of short-circuiting on a status
        // that doesn't reflect a successful conversation.
        updateBeat(beat.beatId, { status: "pending" });
      } finally {
        window.clearTimeout(seedTimeoutId);
        window.clearTimeout(safetyTimer);
        if (active && !cancelledRef.current) setInFlight(false);
      }
    })();

    return () => {
      active = false;
      cancelledRef.current = true;
      ctrl.abort();
      window.clearTimeout(seedTimeoutId);
      window.clearTimeout(safetyTimer);
    };
    // beat.beatId is the stable identity for this drawer instance; deps deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.beatId]);

  // Single source for the user-message → agent-reply round-trip. Used by
  // both the form submit (with optimistic local append) and the Retry
  // button (which doesn't re-append since the user turn is already in state).
  // Streams via /api/agent/stream so the wait reads as live thinking,
  // not a frozen loader.
  const callAgent = async (userMessage: string) => {
    if (!manifest) return;
    setInFlight(true);
    setError(null);
    setStreamingThought("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Safety timeout — if no result arrives within 60s, abort the
    // connection and surface a retryable error. The backend has its own
    // 45s ceiling, but this catches network-level hangs.
    const safetyTimer = window.setTimeout(() => {
      if (cancelledRef.current) return;
      ctrl.abort();
      setError("Connection timed out — the director took too long. Try again.");
      setStreamingThought("");
      setPendingRetryMessage(userMessage);
      setInFlight(false);
    }, 60_000);

    try {
      for await (const ev of api.agentStream(
        { manifest, beatId: beat.beatId, userMessage },
        ctrl.signal,
      )) {
        if (cancelledRef.current) break;
        if (ev.type === "thought" || ev.type === "text") {
          // Gemini emits "text" when the model returns prose without a
          // tool call. Treat it the same as "thought" so the user sees
          // the agent's words instead of a frozen "Composing" loader.
          setStreamingThought((prev) => prev + ev.chunk);
        } else if (ev.type === "result") {
          window.clearTimeout(safetyTimer);
          if (ev.kind === "question") {
            appendAgentTurn(beat.beatId, scene.sceneId, {
              role: "agent",
              content: ev.question,
              timestamp: nowISO(),
            });
            setLatestSuggestions(Array.isArray(ev.suggestedAnswers) ? ev.suggestedAnswers : null);
          } else {
            // Mandatory re-bake on markSufficient: invalidate the
            // speculative clip + jobs so handleGenerate dispatches a
            // fresh /api/generate using the AGENT's refinedPrompt
            // (subject + setting + voiceLine etc) rather than the
            // decompose-time draft. Without this the user's
            // conversation has no effect on what Veo renders.
            updateScene(beat.beatId, scene.sceneId, {
              refinedPrompt: ev.refinedPrompt,
              durationSeconds: ev.suggestedDuration,
              beatFacts: ev.beatFacts,
              speculativeJobId: undefined,
              jobId: undefined,
              clipPublicId: undefined,
              clipUrl: undefined,
              lastFrameUrl: undefined,
            });
            updateBeat(beat.beatId, { status: "ready-to-generate" });
            appendAgentTurn(beat.beatId, scene.sceneId, {
              role: "agent",
              content: `Cued. ${ev.sceneSummary}. Call action when ready.`,
              timestamp: nowISO(),
            });
            // Beat is sufficient — no more questions, drop any stale pills.
            setLatestSuggestions(null);
          }
          setPendingRetryMessage(null);
          setStreamingThought("");
        } else if (ev.type === "error") {
          window.clearTimeout(safetyTimer);
          setError(ev.message);
          setPendingRetryMessage(userMessage);
        }
      }
    } catch (err) {
      if (cancelledRef.current) return;
      if ((err as Error)?.name === "AbortError") return;
      const msg = formatDirectorReachabilityError(err);
      if (msg) {
        setError(msg);
        setPendingRetryMessage(userMessage);
      }
    } finally {
      window.clearTimeout(safetyTimer);
      if (!cancelledRef.current) setInFlight(false);
    }
  };

  const submit = async (e: FormEvent | string) => {
    // Two call shapes: form submit (FormEvent) or voice settle (string).
    let voiceText: string | undefined;
    if (typeof e === "string") {
      voiceText = e;
    } else {
      e.preventDefault();
    }
    const trimmed = (voiceText ?? draft).trim();
    if (!trimmed || inFlight || !manifest) return;

    if (voiceText !== undefined || (speech.transcript && trimmed === speech.transcript.trim())) {
      lastSubmitWasVoiceRef.current = true;
    }

    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: trimmed,
      timestamp: nowISO(),
    });
    setDraft("");
    setLatestSuggestions(null);
    await callAgent(trimmed);
  };

  // The silence-based auto-submit bridge (submitVoiceRef) was removed —
  // voice transcripts now ONLY fill the draft textarea; the user reviews
  // and presses Send themselves. Auto-send produced too many "instantly
  // hit send before I could fix transcription errors" complaints.

  // Keep textarea height synced with draft. After submit clears draft
  // the field would otherwise stay tall — explicitly reset to one row.
  // Voice transcripts and suggestion-pill clicks update `draft` outside
  // the textarea's onChange path, so this also covers those.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const retry = async () => {
    if (!pendingRetryMessage || inFlight) return;
    await callAgent(pendingRetryMessage);
  };

  // Click on a suggested-answer pill = submit it as a user turn (skipping
  // the typing). Mirrors the editor's followup pattern.
  const handleSuggestion = async (suggestion: string) => {
    if (inFlight || !manifest) return;
    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: suggestion,
      timestamp: nowISO(),
    });
    setLatestSuggestions(null);
    await callAgent(suggestion);
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Conversation scroller — height-bounded so a long convo cannot
          push the input form off-viewport. The drawer body already has
          `overflow-hidden flex-1`, so `min-h-0` here is what actually
          enables the inner overflow-y-auto to clip rather than grow. */}
      <div
        ref={scrollRef}
        data-lenis-prevent
        className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1"
      >
        {(() => {
          const turns = scene.conversation;
          const VISIBLE = 4; // last ~2 questions + 2 answers
          const collapsedCount = Math.max(0, turns.length - VISIBLE);
          const visible = showAllTurns ? turns : turns.slice(-VISIBLE);
          const startIdx = showAllTurns ? 0 : collapsedCount;
          return (
            <>
              {!showAllTurns && collapsedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllTurns(true)}
                  className="mx-auto block rounded-full border border-fg-tertiary/25 bg-bg-elev-2/40 px-3.5 py-1.5 font-body text-pill font-medium text-fg-tertiary transition-colors hover:border-brand-ember/40 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
                  aria-label={`Show ${collapsedCount} earlier turn${collapsedCount === 1 ? "" : "s"}`}
                >
                  ↑ {collapsedCount} earlier turn{collapsedCount === 1 ? "" : "s"}
                </button>
              ) : null}
              {showAllTurns && collapsedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllTurns(false)}
                  className="mx-auto block rounded-full border border-fg-tertiary/25 bg-bg-elev-2/40 px-3.5 py-1.5 font-body text-pill font-medium text-fg-tertiary transition-colors hover:border-brand-ember/40 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
                  aria-label="Collapse earlier turns"
                >
                  ↓ collapse
                </button>
              ) : null}
              {visible.map((turn, i) => (
                <AgentBubble
                  key={`${turn.role}-${startIdx + i}-${turn.timestamp}`}
                  turn={turn}
                  // Only the most recent agent turn reveals; history snaps in.
                  reveal={turn.role === "agent" && startIdx + i === turns.length - 1}
                />
              ))}
            </>
          );
        })()}
        {/* Live thinking — its own register, distinct from chat bubbles.
            Hairline-bordered mini-panel with a "Thinking" eyebrow + a
            breathing ember dot so the user reads it as meta-content
            (the director's working out, not the director's reply).
            Markdown bold (**...**) is parsed inline so the agent's
            structured thoughts don't show raw asterisks. */}
        {inFlight ? (
          streamingThought ? (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              className="rounded-md border border-fg-tertiary/15 bg-bg-base/40 px-4 py-3"
            >
              <div className="mb-2 flex items-center gap-1.5 font-body text-overline font-medium uppercase tracking-[0.08em] text-fg-tertiary">
                <motion.span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-brand-ember"
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <span>Thinking</span>
              </div>
              <p className="font-body text-pill leading-relaxed text-fg-tertiary/85">
                {renderThoughtMarkdown(streamingThought)}
              </p>
            </motion.div>
          ) : (
            // Visible on EVERY in-flight turn (first OR follow-up). Used
            // to be gated to scene.conversation.length === 0, which left
            // the user staring at a frozen drawer for the 1-2s before the
            // first thought chunk arrives on a follow-up. Now they
            // always see motion.
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 font-body text-pill text-fg-tertiary"
            >
              <Loader2 size={12} className="animate-spin" strokeWidth={1.5} aria-hidden="true" />
              Composing the shot.
            </div>
          )
        ) : null}
        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className="flex items-center justify-between gap-3 rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-caption text-state-error"
          >
            <span>{error}</span>
            {pendingRetryMessage ? (
              <button
                type="button"
                onClick={retry}
                disabled={inFlight}
                className="inline-flex items-center gap-1 text-fg-secondary transition-colors hover:text-fg-primary disabled:opacity-50"
              >
                <RotateCcw size={11} strokeWidth={1.5} aria-hidden="true" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Suggested answers — optional quick replies from the latest
          question. The agent may return 0..4 based on context quality.
          Hairline-divided rows, no card chrome, no
          icon, no helper-text eyebrow — the affordance reads itself
          (clickable text rows beneath a hairline). Group fades in;
          clicking a row submits it as a user turn. Cleared on user
          submit, on a new agent turn without suggestions, or when
          the beat goes sufficient. */}
      <AnimatePresence initial={false}>
        {latestSuggestions && !inFlight ? (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 border-t border-fg-tertiary/15"
            role="group"
            aria-label="Agent suggestions — pick one or keep typing"
          >
            {latestSuggestions.length > 0 ? latestSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void handleSuggestion(s)}
                disabled={inFlight}
                className={cn(
                  "block w-full border-b border-fg-tertiary/12 px-1 py-2.5 last:border-b-0",
                  "text-left font-body text-meta-lg leading-snug text-fg-secondary",
                  "transition-colors duration-200 ease-out",
                  "hover:text-brand-ember focus-visible:outline-none focus-visible:text-brand-ember",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {s}
              </button>
            )) : (
              <div className="px-1 py-2.5 font-body text-pill text-fg-tertiary">
                Open response for this one - type your answer below.
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Input row — every interactive element shares h-9 (36px) so the
          form sits on a single horizontal baseline. Voice + Send only;
          we removed the image-attach affordance because the user should
          never need to hand the director reference frames — the prompt
          + conversation is enough.

          Hidden once the agent commits — the conversation is over and any
          further turn would be appended into a closed scene. The drawer's
          own footer takes over (Roll camera / Next beat). */}
      {(beat.status === "pending" || beat.status === "questioning") ? (
      <form onSubmit={submit} className="mt-3 flex items-end gap-2 border-t border-fg-tertiary/30 pt-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.currentTarget;
            // Auto-grow: reset to natural height, then expand to fit
            // content. CSS max-height clamps; overflow-y handles the
            // scroll when the user keeps typing past the cap.
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
          }}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter inserts newline. Matches the
            // editor agent panel's behavior — typing rhythm stays the
            // same across the two surfaces.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim() && !inFlight) void submit(draft);
            }
          }}
          disabled={inFlight}
          rows={1}
          placeholder={
            inFlight
              ? "On comms."
              : speech.listening
                ? "Listening…"
                : "Direct, or speak it."
          }
          className="min-h-9 max-h-[132px] flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 font-body text-sm leading-snug text-fg-primary placeholder:text-fg-tertiary focus:outline-none disabled:opacity-50"
        />
        {speech.supported ? (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={inFlight}
            aria-label={speech.listening ? "Mute mic" : "Unmute mic"}
            title={speech.listening ? "Mute mic" : "Unmute mic"}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full border",
              "transition-[border-color,background-color,color,opacity] duration-200 ease-out",
              speech.listening
                ? "border-brand-ember bg-brand-ember/15 text-brand-ember ember-pulse"
                : "border-fg-tertiary/40 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
              inFlight && "opacity-40 pointer-events-none",
            )}
          >
            {/* Always Mic — the button container's ember-pulse + ember
                bg communicates "actively listening." Flipping to MicOff
                while the mic was actively capturing read as the state
                being inverted. */}
            <Mic size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={!draft.trim() || inFlight}
          aria-label={inFlight ? "Sending message" : "Send message"}
          // Override size="sm" h-8 → h-9 so Send sits on the same
          // baseline as the round image / voice buttons.
          className="h-9 px-3.5 text-pill"
        >
          {inFlight ? (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={14} strokeWidth={1.5} aria-hidden="true" />
          )}
          Send
        </Button>
      </form>
      ) : null}
    </div>
  );
}
