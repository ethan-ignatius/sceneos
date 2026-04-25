import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Loader2, RotateCcw, Mic, MicOff } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { Beat } from "@/types/manifest";
import { AgentBubble } from "./agent-bubble";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { useSpeechSynthesis } from "@/lib/use-speech-synthesis";
import { isAudioMuted } from "@/lib/audio-cues";
import { nowISO } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AgentBubbleStreamProps {
  beat: Beat;
}

/**
 * Per-beat questionnaire chat UI wired to /api/agent.
 *
 * Lifecycle (see docs/AGENT_FLOW.md §7):
 *   - On mount with empty conversation → fetch the seed question.
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
  const cancelledRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingRetryMessage, setPendingRetryMessage] = useState<string | null>(null);

  // Voice input — Web Speech API. While recording, transcript replaces draft;
  // user can edit before submitting. Falls back gracefully if unsupported.
  const speech = useSpeechRecognition({ lang: "en-US" });
  useEffect(() => {
    if (speech.listening && speech.transcript) {
      setDraft(speech.transcript);
    }
  }, [speech.listening, speech.transcript]);

  // Voice OUTPUT — speak the agent's reply back when the last user submission
  // was via voice. This gives a true voice-chat feel; typed submissions stay
  // silent (the visual char reveal is the right affordance for type-mode).
  // Respects the global mute toggle.
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
  useEffect(() => {
    cancelledRef.current = false;
    if (!manifest || scene.conversation.length > 0) return;

    let active = true;
    setInFlight(true);
    setError(null);

    (async () => {
      try {
        const res = await api.agent({ manifest, beatId: beat.beatId });
        if (!active || cancelledRef.current) return;
        if (res.kind === "question") {
          appendAgentTurn(beat.beatId, scene.sceneId, {
            role: "agent",
            content: res.question,
            timestamp: nowISO(),
          });
          updateBeat(beat.beatId, { status: "questioning" });
        } else if (res.kind === "sufficient") {
          // Edge case: agent considers itself sufficient on first turn.
          updateScene(beat.beatId, scene.sceneId, {
            refinedPrompt: res.refinedPrompt,
            durationSeconds: res.suggestedDuration,
          });
          updateBeat(beat.beatId, { status: "ready-to-generate" });
        }
      } catch (err) {
        if (!active || cancelledRef.current) return;
        setError(err instanceof ApiError ? err.message : "Couldn't reach the director.");
      } finally {
        if (active && !cancelledRef.current) setInFlight(false);
      }
    })();

    return () => {
      active = false;
      cancelledRef.current = true;
    };
    // beat.beatId is the stable identity for this drawer instance; deps deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.beatId]);

  // Single source for the user-message → agent-reply round-trip. Used by
  // both the form submit (with optimistic local append) and the Retry
  // button (which doesn't re-append since the user turn is already in state).
  const callAgent = async (userMessage: string) => {
    if (!manifest) return;
    setInFlight(true);
    setError(null);

    try {
      const res = await api.agent({
        manifest,
        beatId: beat.beatId,
        userMessage,
      });
      if (cancelledRef.current) return;

      if (res.kind === "question") {
        appendAgentTurn(beat.beatId, scene.sceneId, {
          role: "agent",
          content: res.question,
          timestamp: nowISO(),
        });
      } else {
        updateScene(beat.beatId, scene.sceneId, {
          refinedPrompt: res.refinedPrompt,
          durationSeconds: res.suggestedDuration,
        });
        updateBeat(beat.beatId, { status: "ready-to-generate" });
        appendAgentTurn(beat.beatId, scene.sceneId, {
          role: "agent",
          content: `Got it. ${res.sceneSummary}. Ready to generate when you are.`,
          timestamp: nowISO(),
        });
      }
      setPendingRetryMessage(null);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof ApiError ? err.message : "Couldn't reach the director.");
      setPendingRetryMessage(userMessage);
    } finally {
      if (!cancelledRef.current) setInFlight(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || inFlight || !manifest) return;

    // If the user dictated this reply via voice (was listening when we
    // captured the transcript), flag the next agent turn for TTS playback.
    if (speech.transcript && trimmed === speech.transcript.trim()) {
      lastSubmitWasVoiceRef.current = true;
    }

    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: trimmed,
      timestamp: nowISO(),
    });
    setDraft("");
    await callAgent(trimmed);
  };

  const retry = async () => {
    if (!pendingRetryMessage || inFlight) return;
    await callAgent(pendingRetryMessage);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {scene.conversation.map((turn, i) => (
          <AgentBubble
            key={`${turn.role}-${i}-${turn.timestamp}`}
            turn={turn}
            // Only the most recent agent turn reveals; history snaps in.
            reveal={turn.role === "agent" && i === scene.conversation.length - 1}
          />
        ))}
        {inFlight && scene.conversation.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-fg-tertiary"
          >
            <Loader2 size={12} className="animate-spin" strokeWidth={1.5} aria-hidden="true" />
            Director is thinking…
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-[11px] text-state-error"
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

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 border-t border-fg-tertiary/30 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={inFlight}
          placeholder={
            inFlight
              ? "Director is replying…"
              : speech.listening
                ? "Listening…"
                : "Type or speak your reply…"
          }
          className="flex-1 bg-transparent px-1 py-2 font-body text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none disabled:opacity-50"
        />
        {speech.supported ? (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={inFlight}
            aria-label={speech.listening ? "Stop recording" : "Speak your reply"}
            title={speech.listening ? "Stop recording" : "Speak your reply"}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full border",
              "transition-[border-color,background-color,color,opacity] duration-200 ease-out",
              speech.listening
                ? "border-brand-ember bg-brand-ember/15 text-brand-ember ember-pulse"
                : "border-fg-tertiary/40 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
              inFlight && "opacity-40 pointer-events-none",
            )}
          >
            {speech.listening ? (
              <MicOff size={14} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Mic size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={!draft.trim() || inFlight}
          aria-label={inFlight ? "Sending message" : "Send message"}
        >
          {inFlight ? (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={14} strokeWidth={1.5} aria-hidden="true" />
          )}
          Send
        </Button>
      </form>
    </div>
  );
}
