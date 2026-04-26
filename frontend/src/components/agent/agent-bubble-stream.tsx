import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Loader2, RotateCcw, Mic, MicOff, ImagePlus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
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

interface ImageRef {
  id: string;
  dataUri: string;
  name: string;
}

const MAX_REF_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_REFS = 4;

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
  // Collapse old turns by default — only the last few are visible. The user
  // can opt to expand via the button at the top of the scroller.
  const [showAllTurns, setShowAllTurns] = useState(false);
  // The latest agent question's three "or pick one" suggestions, surfaced
  // as clickable pills above the input. Cleared on user submit and
  // replaced when the next agent turn arrives. The data is on the wire
  // via AgentResponse.suggestedAnswers; the editor renders the same
  // shape via suggestedFollowups.
  const [latestSuggestions, setLatestSuggestions] = useState<
    readonly [string, string, string] | null
  >(null);

  // Reference frames — drag-drop or file picker. Stored as dataUris in
  // local component state and prefixed onto the userMessage with a marker
  // (`[refs:N]`) the mock backend reads to acknowledge ("noted the
  // reference frame, aiming for that mood"). See FINAL_HANDOFF §5 P0.4.
  const [imageRefs, setImageRefs] = useState<ImageRef[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestFiles = async (files: FileList | File[]) => {
    const accepted: ImageRef[] = [];
    let rejected = 0;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        rejected++;
        continue;
      }
      if (f.size > MAX_REF_BYTES) {
        rejected++;
        continue;
      }
      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(f);
        });
        accepted.push({
          id: `${f.name}-${f.size}-${Date.now()}`,
          dataUri,
          name: f.name,
        });
      } catch {
        rejected++;
      }
    }
    if (rejected > 0) toast.error("Image only, 4 MB max.");
    setImageRefs((prev) => [...prev, ...accepted].slice(0, MAX_REFS));
    if (accepted.length > 0) toast.success(`Reference logged (${accepted.length}).`);
  };

  const removeRef = (id: string) => {
    setImageRefs((prev) => prev.filter((r) => r.id !== id));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer.files.length) return;
    void ingestFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the outer container, not on inner crossings.
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void ingestFiles(e.target.files);
    e.target.value = ""; // allow re-selecting the same file
  };

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
          setLatestSuggestions(res.suggestedAnswers ?? null);
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
        setLatestSuggestions(res.suggestedAnswers ?? null);
      } else {
        updateScene(beat.beatId, scene.sceneId, {
          refinedPrompt: res.refinedPrompt,
          durationSeconds: res.suggestedDuration,
        });
        updateBeat(beat.beatId, { status: "ready-to-generate" });
        appendAgentTurn(beat.beatId, scene.sceneId, {
          role: "agent",
          content: `Cued. ${res.sceneSummary}. Call action when ready.`,
          timestamp: nowISO(),
        });
        // Beat is sufficient — no more questions, drop any stale pills.
        setLatestSuggestions(null);
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
    // Allow refs-only submissions when no text has been typed yet.
    if ((!trimmed && imageRefs.length === 0) || inFlight || !manifest) return;

    if (speech.transcript && trimmed === speech.transcript.trim()) {
      lastSubmitWasVoiceRef.current = true;
    }

    // Visible user-turn content includes a small ref tag the bubble can
    // render. Backend gets a `[refs:N]` marker prefix so the mock agent
    // can acknowledge.
    const refCount = imageRefs.length;
    const refMarker = refCount > 0 ? `[refs:${refCount}] ` : "";
    const visibleContent =
      refCount > 0
        ? `${trimmed}${trimmed ? " " : ""}— attached ${refCount} reference frame${refCount === 1 ? "" : "s"}`
        : trimmed;

    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: visibleContent,
      timestamp: nowISO(),
    });
    setDraft("");
    setImageRefs([]);
    setLatestSuggestions(null);
    await callAgent(`${refMarker}${trimmed}`);
  };

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
    <div
      className="relative flex h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag-over overlay: invisible until a file is dragged over the
          drawer. Communicates "drop here" without taking space at idle. */}
      {dragOver ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-md border-2 border-dashed border-brand-ember/60 bg-brand-ember/5 backdrop-blur-sm"
        >
          <div className="font-display text-[14px] italic text-brand-ember">
            Drop frames, mood, references.
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPickFiles}
        className="sr-only"
        aria-label="Add reference images"
      />

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
                  className="mx-auto block rounded-full border border-fg-tertiary/25 bg-bg-elev-2/40 px-3.5 py-1.5 font-body text-[12px] font-medium text-fg-tertiary transition-colors hover:border-brand-ember/40 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
                  aria-label={`Show ${collapsedCount} earlier turn${collapsedCount === 1 ? "" : "s"}`}
                >
                  ↑ {collapsedCount} earlier turn{collapsedCount === 1 ? "" : "s"}
                </button>
              ) : null}
              {showAllTurns && collapsedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllTurns(false)}
                  className="mx-auto block rounded-full border border-fg-tertiary/25 bg-bg-elev-2/40 px-3.5 py-1.5 font-body text-[12px] font-medium text-fg-tertiary transition-colors hover:border-brand-ember/40 hover:text-brand-ember focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember"
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
        {inFlight && scene.conversation.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 font-display text-[14px] italic text-fg-tertiary"
          >
            <Loader2 size={12} className="animate-spin" strokeWidth={1.5} aria-hidden="true" />
            Composing the shot.
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

      {/* Suggested answers — three "or pick one" options the agent emitted
          with its latest question. Clicking submits the suggestion as a
          user turn (skipping the typing). Cleared on user submit, on a
          new agent turn without suggestions, or when the beat goes
          sufficient. Mirrors the editor's followup pill pattern. */}
      {latestSuggestions && !inFlight ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-fg-tertiary/30 pt-3">
          {latestSuggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void handleSuggestion(s)}
              disabled={inFlight}
              className={cn(
                "rounded-md border border-fg-tertiary/20 bg-bg-base/60 px-3.5 py-2.5",
                "text-left font-body text-[13px] leading-snug text-fg-secondary",
                "transition-colors duration-200 ease-out",
                "hover:border-brand-ember-dim/60 hover:text-fg-primary",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ember",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Reference-frame thumbnail strip — appears above the input when
          images have been dropped. Each thumb has an X to remove. */}
      {imageRefs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-fg-tertiary/30 pt-3">
          {imageRefs.map((ref) => (
            <div
              key={ref.id}
              className="group relative h-14 w-14 overflow-hidden rounded-md border border-brand-ember-dim/40"
              title={ref.name}
            >
              <img
                src={ref.dataUri}
                alt={ref.name}
                className="h-full w-full object-cover"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => removeRef(ref.id)}
                aria-label={`Remove ${ref.name}`}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-bg-base/80 text-fg-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg-primary"
              >
                <X size={10} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 border-t border-fg-tertiary/30 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={inFlight}
          placeholder={
            inFlight
              ? "On comms."
              : speech.listening
                ? "Listening…"
                : "Direct, or speak it."
          }
          className="flex-1 bg-transparent px-1 py-2 font-body text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={inFlight || imageRefs.length >= MAX_REFS}
          aria-label="Attach reference frame"
          title="Attach reference frame"
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border",
            "transition-[border-color,background-color,color,opacity] duration-200 ease-out",
            "border-fg-tertiary/40 text-fg-tertiary hover:border-fg-secondary hover:text-fg-primary",
            (inFlight || imageRefs.length >= MAX_REFS) && "opacity-40 pointer-events-none",
          )}
        >
          <ImagePlus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
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
          disabled={(!draft.trim() && imageRefs.length === 0) || inFlight}
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
