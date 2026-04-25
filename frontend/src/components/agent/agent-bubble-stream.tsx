import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { Beat } from "@/types/manifest";
import { AgentBubble } from "./agent-bubble";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { nowISO } from "@/lib/utils";

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || inFlight || !manifest) return;

    // Optimistic local append — UI updates before the network round-trip.
    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: trimmed,
      timestamp: nowISO(),
    });
    setDraft("");
    setInFlight(true);
    setError(null);

    try {
      const res = await api.agent({
        manifest,
        beatId: beat.beatId,
        userMessage: trimmed,
      });
      if (cancelledRef.current) return;

      if (res.kind === "question") {
        appendAgentTurn(beat.beatId, scene.sceneId, {
          role: "agent",
          content: res.question,
          timestamp: nowISO(),
        });
      } else {
        // Sufficient — store refinedPrompt + flip status.
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
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof ApiError ? err.message : "Couldn't reach the director.");
    } finally {
      if (!cancelledRef.current) setInFlight(false);
    }
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
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-fg-tertiary">
            <Loader2 size={12} className="animate-spin" strokeWidth={1.5} />
            Director is thinking…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 font-mono text-[11px] text-state-error">
            {error}
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 border-t border-fg-tertiary/30 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={inFlight}
          placeholder={inFlight ? "Director is replying…" : "Type your reply…"}
          className="flex-1 bg-transparent px-1 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none disabled:opacity-50"
        />
        <Button type="submit" size="sm" disabled={!draft.trim() || inFlight}>
          {inFlight ? (
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Send size={14} strokeWidth={1.5} />
          )}
          Send
        </Button>
      </form>
    </div>
  );
}
