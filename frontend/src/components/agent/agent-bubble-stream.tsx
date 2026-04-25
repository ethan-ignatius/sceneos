import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { Beat } from "@/types/manifest";
import { AgentBubble } from "./agent-bubble";
import { Button } from "@/components/ui/button";
import { nowISO } from "@/lib/utils";

interface AgentBubbleStreamProps {
  beat: Beat;
}

/**
 * Per-beat questionnaire chat UI. v0: appends user turn locally; backend wiring
 * (POST /api/agent) is left to Vishnu/Ethan and their Higgsfield/agent service.
 * The shape of conversation already matches AgentRequest.manifest payload.
 */
export function AgentBubbleStream({ beat }: AgentBubbleStreamProps) {
  const scene = beat.scenes[0];
  const appendAgentTurn = useBeatGraphStore((s) => s.appendAgentTurn);
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    appendAgentTurn(beat.beatId, scene.sceneId, {
      role: "user",
      content: trimmed,
      timestamp: nowISO(),
    });
    setDraft("");
    // TODO: trigger api.agent({...}) and append the agent's response.
  };

  const seedHint =
    scene.conversation.length === 0
      ? `Tell me about the ${beat.beatName.toLowerCase()} of your story. ${beat.archetype.intent}`
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {seedHint ? (
          <AgentBubble
            turn={{
              role: "agent",
              content: seedHint,
              timestamp: nowISO(),
            }}
          />
        ) : null}
        {scene.conversation.map((turn, i) => (
          <AgentBubble key={i} turn={turn} />
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 border-t border-fg-tertiary/30 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your reply…"
          className="flex-1 bg-transparent px-1 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          <Send size={14} strokeWidth={1.5} />
          Send
        </Button>
      </form>
    </div>
  );
}
