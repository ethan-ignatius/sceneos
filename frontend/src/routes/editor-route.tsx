import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
  FolderClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorPreview } from "@/components/editor/editor-preview";
import { EditorAgentPanel } from "@/components/editor/editor-agent-panel";
import { EditorTimeline } from "@/components/editor/editor-timeline";
import { EditorClipDetail } from "@/components/editor/editor-clip-detail";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { api, ApiError } from "@/lib/api";
import { nowISO } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type { EditClipDecision, EditDecisions, EditorTurnResponse } from "@/types/api";
import type { BeatMood } from "@/types/manifest";
import { toast } from "sonner";

/**
 * Stage 7 — the editor.
 *
 * Hybrid layout (lg+):
 *   Left  (1fr):    Preview · URL strip · Timeline · ClipDetail
 *   Right (24rem):  Toolbar · AgentPanel  (sticky)
 *
 * The agent and the direct-manipulation surfaces converge on the same
 * EditDecisions. Every patch — chat-led OR drag-led — debounces a re-bake
 * against /api/editor/apply, so the Cloudinary URL is always the truth.
 *
 * State flow:
 *   1. Mount → /api/editor/init seeds decisions + a baked Cloudinary URL.
 *   2. User chats OR drags → patch decisions → queueBake → /api/editor/apply.
 *   3. Ship the cut → setFinalCinematic → navigate /final.
 */
export function EditorRoute() {
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const editor = useBeatGraphStore((s) => s.editor);
  const setEditorBaked = useBeatGraphStore((s) => s.setEditorBaked);
  const appendEditorTurn = useBeatGraphStore((s) => s.appendEditorTurn);
  const markEditorCommitted = useBeatGraphStore((s) => s.markEditorCommitted);
  const setFinalCinematic = useBeatGraphStore((s) => s.setFinalCinematic);

  const [latest, setLatest] = useState<EditorTurnResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  // Live thinking accumulator for /api/editor/stream — populated by
  // "thought" events, surfaced through EditorAgentPanel so the wait
  // for the agent reads as live director thinking, not a frozen loader.
  const [streamingThought, setStreamingThought] = useState("");
  const [baking, setBaking] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  // Inline error chip for the agent panel (separate from boot/bake errors,
  // which use toast). Stream errors land here so the user sees them
  // anchored next to the conversation, with a retry hook.
  const [agentError, setAgentError] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const editorAbortRef = useRef<AbortController | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Boot — seed editor decisions + first baked URL on mount, once.
  // 30s client-side timeout so a hanging Vertex/Cloudinary call surfaces
  // an explicit error instead of leaving the user staring at a blank
  // video frame indefinitely. Vertex Gemini editor init runs ~6s warm /
  // ~10–15s cold; 30s is a generous ceiling.
  useEffect(() => {
    if (!manifest) return;
    if (editor.decisions) return;
    let cancelled = false;
    (async () => {
      try {
        const init = await Promise.race([
          api.editorInit(manifest),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error("Editor init timed out after 30 seconds")),
              30_000,
            ),
          ),
        ]);
        if (cancelled || !mountedRef.current) return;
        setEditorBaked({
          decisions: init.decisions,
          finalUrl: init.finalUrl,
          thumbnailUrl: init.thumbnailUrl,
          durationSeconds: init.durationSeconds,
        });
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        // Surface the ApiError details when we have them so the user sees
        // WHY init failed, not just that it did. Falls back to the generic
        // line for non-API errors (network, parse, abort, timeout).
        const detail =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : null;
        setBootError(
          detail
            ? `Couldn't load the cut for editing — ${detail}. Try refreshing.`
            : "Couldn't load the cut for editing. Try refreshing.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // editor.decisions intentionally omitted — we only seed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, setEditorBaked]);

  // Re-bake on every decisions change. Debounced so trim drags don't hammer the API.
  const bakeTimerRef = useRef<number | null>(null);
  const bake = useCallback(
    async (next: EditDecisions) => {
      if (!manifest) return;
      setBaking(true);
      try {
        const res = await api.editorApply({ manifest, decisions: next });
        if (!mountedRef.current) return;
        setEditorBaked({
          decisions: res.decisions,
          finalUrl: res.finalUrl,
          thumbnailUrl: res.thumbnailUrl,
          durationSeconds: res.durationSeconds,
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Apply failed.");
      } finally {
        if (mountedRef.current) setBaking(false);
      }
    },
    [manifest, setEditorBaked],
  );

  const queueBake = useCallback(
    (next: EditDecisions) => {
      // Optimistic decisions update — bake after 250ms idle.
      setEditorBaked({
        decisions: next,
        finalUrl: editor.finalUrl ?? "",
        thumbnailUrl: editor.thumbnailUrl ?? "",
        durationSeconds: editor.durationSeconds ?? 0,
      });
      if (bakeTimerRef.current) window.clearTimeout(bakeTimerRef.current);
      bakeTimerRef.current = window.setTimeout(() => {
        void bake(next);
      }, 250);
    },
    [bake, editor.finalUrl, editor.thumbnailUrl, editor.durationSeconds, setEditorBaked],
  );

  // ── Agent turn helpers ────────────────────────────────────────────────
  // Streamed via /api/editor/stream so the user sees thinking tokens
  // accumulate during the ~6s Vertex Gemini turn — the same UX pattern
  // we use for the per-beat agent. The result event carries either a
  // propose or commit payload; we branch on `ev.kind` after appending
  // the thinking trace.
  const callAgent = useCallback(
    async (userMessage?: string) => {
      if (!manifest || !editor.decisions || thinking) return;
      setThinking(true);
      setStreamingThought("");
      setAgentError(null);
      const ctrl = new AbortController();
      editorAbortRef.current = ctrl;
      // 60s ceiling — Vertex Gemini editor turns run ~6–10s warm; 60s
      // gives a generous buffer for cold starts before we surface a
      // timeout error and unstick the UI. Cleared in finally so a
      // healthy turn doesn't trigger after the result lands.
      const timeoutId = window.setTimeout(() => {
        ctrl.abort();
        if (mountedRef.current) {
          setAgentError("Director took too long — try again.");
          if (userMessage) setPendingRetry(userMessage);
        }
      }, 60_000);
      try {
        if (userMessage) {
          appendEditorTurn({ role: "user", content: userMessage, timestamp: nowISO() });
        }
        for await (const ev of api.editorStream(
          {
            manifest,
            decisions: editor.decisions,
            conversation: editor.conversation,
            userMessage,
          },
          ctrl.signal,
        )) {
          if (!mountedRef.current) break;
          if (ev.type === "thought" || ev.type === "text") {
            setStreamingThought((prev) => prev + ev.chunk);
          } else if (ev.type === "result") {
            // Re-shape the SSE result into the same EditorTurnResponse
            // discriminated union the rest of the route expects.
            const payload: EditorTurnResponse =
              ev.kind === "commit"
                ? {
                    kind: "commit",
                    decisions: ev.decisions,
                    rationale: ev.rationale,
                    summary: ev.summary,
                  }
                : {
                    kind: "propose",
                    decisions: ev.decisions,
                    rationale: ev.rationale,
                    suggestedFollowups: ev.suggestedFollowups,
                  };
            setLatest(payload);
            const agentText = payload.kind === "commit" ? payload.summary : payload.rationale;
            appendEditorTurn({
              role: "agent",
              content: agentText,
              timestamp: nowISO(),
              decisions: payload.decisions,
            });
            if (payload.kind === "commit") {
              await bake(payload.decisions);
              markEditorCommitted();
            }
            setStreamingThought("");
          } else if (ev.type === "error") {
            // Surface inline + clear thinking immediately so the panel
            // drops the "Watching the cut" loader at the moment of error
            // rather than waiting for the stream to close. Inline chip in
            // the agent panel keeps the error anchored next to the
            // conversation, with a retry hook tied to the last message.
            if (mountedRef.current) {
              setAgentError(ev.message);
              if (userMessage) setPendingRetry(userMessage);
              setThinking(false);
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        if (mountedRef.current) {
          setAgentError(err instanceof ApiError ? err.message : "Agent turn failed.");
          if (userMessage) setPendingRetry(userMessage);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (mountedRef.current) setThinking(false);
      }
    },
    [
      manifest,
      editor.decisions,
      editor.conversation,
      thinking,
      appendEditorTurn,
      bake,
      markEditorCommitted,
    ],
  );

  // Abort any in-flight editor stream when the route unmounts so
  // closing the editor doesn't leak a polling reader.
  useEffect(() => {
    return () => {
      editorAbortRef.current?.abort();
    };
  }, []);

  // First agent turn: invite the director to look at the cut once it's baked.
  const firstTurnFiredRef = useRef(false);
  useEffect(() => {
    if (firstTurnFiredRef.current) return;
    if (!editor.decisions || !editor.finalUrl) return;
    if (editor.conversation.length > 0) {
      // Resumed session — restore the latest agent emission for the proposal card.
      const lastAgent = [...editor.conversation].reverse().find((t) => t.role === "agent");
      if (lastAgent && lastAgent.decisions) {
        // We don't have the rationale here; show a minimal restored card.
        setLatest({
          kind: "propose",
          decisions: lastAgent.decisions,
          rationale: lastAgent.content,
          suggestedFollowups: [],
        });
      }
      firstTurnFiredRef.current = true;
      return;
    }
    firstTurnFiredRef.current = true;
    void callAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.decisions, editor.finalUrl]);

  // ── Direct-manipulation handlers (timeline + toolbar + clip detail) ──
  // The agent is the primary surface, but the user can also patch the cut
  // directly. Each patch merges into the living decisions and queues a
  // debounced re-bake against /api/editor/apply.
  const patchClip = useCallback(
    (index: number, patch: Partial<EditClipDecision>) => {
      if (!editor.decisions) return;
      const clips = editor.decisions.clips.map((c, i) => (i === index ? { ...c, ...patch } : c));
      queueBake({ ...editor.decisions, clips });
    },
    [editor.decisions, queueBake],
  );

  const patchGlobal = useCallback(
    (patch: Partial<EditDecisions>) => {
      if (!editor.decisions) return;
      queueBake({ ...editor.decisions, ...patch });
    },
    [editor.decisions, queueBake],
  );

  // beatLabels map for the timeline — name + mood keyed by beatId.
  const beatLabels = useMemo<Record<string, { name: string; mood: BeatMood }>>(() => {
    const map: Record<string, { name: string; mood: BeatMood }> = {};
    for (const b of manifest?.beats ?? []) {
      map[b.beatId] = { name: b.beatName, mood: b.archetype.mood };
    }
    return map;
  }, [manifest]);

  // ── Agent-driven edit handlers ───────────────────────────────────────
  // The agent emits proposals; Apply edit accepts the WHOLE decisions object.

  const handleAcceptProposal = () => {
    if (!latest || latest.kind !== "propose") return;
    queueBake(latest.decisions);
    toast.success("Edit applied.");
  };

  const handleRevertProposal = () => {
    if (!editor.decisions) return;
    // Just leave the timeline alone — the proposal was advisory; living
    // decisions are what's on the timeline. Reverting = not accepting.
    toast("Kept your cut. Tell me what to try next.");
  };

  const handleCommitNow = () => {
    // The editor agent's system prompt treats "lock it" / "ship it" /
    // "looks good" as explicit commit signals — the next turn will emit
    // kind:"commit" rather than another proposal. The result handler in
    // callAgent then bakes + flips editor.committed; no dedicated commit
    // endpoint exists by design.
    void callAgent("lock it");
  };

  // ── Routing guards ───────────────────────────────────────────────────
  // Both no-manifest and no-approvals used to redirect silently, which made
  // /edit feel identical to wherever the user landed next. Visible empty
  // states keep the user oriented — they SEE they're at /edit, just with
  // nothing to refine yet, and pick the explicit way back.
  if (!manifest) {
    return <EditorAwaitingApprovalsFallback hasManifest={false} />;
  }
  const hasApproved = manifest.beats.some((b) =>
    b.scenes.some((s) => s.approved && s.clipPublicId),
  );
  if (!hasApproved) {
    return <EditorAwaitingApprovalsFallback hasManifest={true} />;
  }

  // ── Final-step navigation ────────────────────────────────────────────
  const handleShipIt = () => {
    if (!editor.decisions || !editor.finalUrl) return;
    setFinalCinematic({
      finalUrl: editor.finalUrl,
      thumbnailUrl: editor.thumbnailUrl ?? "",
      durationSeconds: editor.durationSeconds ?? 0,
    });
    navigate("/final");
  };

  const handleBackToCanvas = () => navigate("/canvas");

  // Save & exit — archives the current project (via reset()'s archive) and
  // returns to landing. Resume from /projects or the landing recent-3 rail.
  const resetStore = useBeatGraphStore((s) => s.reset);
  const handleSaveAndExit = () => {
    resetStore();
    navigate("/");
  };

  return (
    <main className="film-grain min-h-screen bg-bg-base px-6 py-6 md:py-8">
      <div className="mx-auto max-w-[112rem] space-y-6">
        {/* Top bar — minimal. Status chips on the left, text actions on the
            right. No Fraunces hero, no master-prompt quote. The cut is the
            subject; chrome stays out of its way. */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-body text-caption tabular-nums text-fg-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-ember" />
              Editing
            </span>
            {editor.durationSeconds ? (
              <span className="font-mono">{editor.durationSeconds.toFixed(1)}s</span>
            ) : null}
            {bootError ? (
              <span className="text-state-error">{bootError}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary"
            >
              <FolderClock size={13} strokeWidth={1.5} aria-hidden="true" />
              Projects
            </button>
            <button
              type="button"
              onClick={handleSaveAndExit}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary"
            >
              <LogOut size={13} strokeWidth={1.5} aria-hidden="true" />
              Save &amp; exit
            </button>
            <button
              type="button"
              onClick={handleBackToCanvas}
              className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary"
            >
              <ArrowLeft size={13} strokeWidth={1.5} aria-hidden="true" />
              Canvas
            </button>
            <button
              type="button"
              onClick={handleShipIt}
              disabled={!editor.finalUrl || baking || thinking}
              className="inline-flex cursor-pointer items-center gap-1.5 bg-brand-ember px-3 py-1.5 font-body text-pill font-medium text-black transition-colors hover:bg-brand-ember/90 disabled:pointer-events-none disabled:opacity-40"
            >
              Ship the cut
              <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Hybrid grid: preview/timeline rail + sticky right rail (toolbar +
            director chat). Both converge on the same EditDecisions; every
            patch debounces a re-bake against /api/editor/apply. */}
        <div className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="space-y-7">
            {editor.finalUrl ? (
              <EditorPreview
                src={editor.finalUrl}
                durationSeconds={editor.durationSeconds ?? undefined}
                baking={baking}
              />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 border border-fg-tertiary/15 bg-black">
                <span
                  aria-hidden
                  className="ember-pulse h-2 w-2 rounded-full bg-brand-ember shadow-[0_0_18px_rgba(240,168,104,0.55)]"
                />
                <span className="font-body text-pill text-fg-tertiary">
                  Baking the cut.
                </span>
              </div>
            )}

            {/* Live Cloudinary URL — THE artifact. Hairline section: eyebrow
                + URL block + transform-vocabulary chips + poster-frame link. */}
            {editor.finalUrl ? <CloudinaryArtifactStrip url={editor.finalUrl} decisions={editor.decisions} thumbnailUrl={editor.thumbnailUrl} urlCopied={urlCopied} setUrlCopied={setUrlCopied} /> : null}

            {/* Timeline — scrubber + per-beat trim handles. Click a beat
                to open the per-clip detail panel (transition, caption,
                trim numerics) below. Drag the handles to retrim. Every
                change queues a re-bake. */}
            {editor.decisions && editor.decisions.clips.length > 0 ? (
              <EditorTimeline
                decisions={editor.decisions}
                beatLabels={beatLabels}
                selectedIndex={selectedClipIndex}
                onSelectClip={(i) =>
                  setSelectedClipIndex((curr) => (curr === i ? null : i))
                }
                onPatchClip={patchClip}
              />
            ) : null}

            {/* Per-clip detail — transition slider + caption input. */}
            <AnimatePresence mode="wait">
              {selectedClipIndex !== null && editor.decisions?.clips[selectedClipIndex] ? (
                <motion.div
                  key={selectedClipIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
                >
                  <EditorClipDetail
                    index={selectedClipIndex}
                    label={
                      beatLabels[editor.decisions.clips[selectedClipIndex].beatId ?? ""]
                        ?.name ?? `Beat ${selectedClipIndex + 1}`
                    }
                    clip={editor.decisions.clips[selectedClipIndex]}
                    onPatch={(p) => patchClip(selectedClipIndex, p)}
                    onClose={() => setSelectedClipIndex(null)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Right column — toolbar above, director chat below. The column
              is hairline-divided; no card chrome wraps either section. */}
          <aside className="space-y-8 lg:sticky lg:top-10 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:[scrollbar-width:thin]">
            {/* Toolbar early-returns null while decisions are still loading;
                mount unconditionally so callers don't have to gate. */}
            <EditorToolbar decisions={editor.decisions} onPatch={patchGlobal} />
            <div className="lg:min-h-[28rem]">
              <EditorAgentPanel
                conversation={editor.conversation}
                latest={latest}
                thinking={thinking}
                streamingThought={streamingThought}
                onUserMessage={(text) => void callAgent(text)}
                onAcceptProposal={handleAcceptProposal}
                onRevertProposal={handleRevertProposal}
                onCommitNow={handleCommitNow}
                committed={editor.committed}
                livingDecisions={editor.decisions}
                error={agentError}
                onRetry={
                  pendingRetry && !thinking
                    ? () => {
                        const msg = pendingRetry;
                        setPendingRetry(null);
                        void callAgent(msg);
                      }
                    : undefined
                }
                onDismissError={() => {
                  setAgentError(null);
                  setPendingRetry(null);
                }}
              />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/**
 * Visible empty state for two cases that used to redirect silently:
 *   hasManifest=false  → user navigated to /edit with no active project
 *   hasManifest=true   → project exists but no take is approved yet
 *
 * Reuses the editor route's chrome register (film-grain background,
 * Fraunces display headline, primary CTA) so the user sees they ARE at
 * /edit and isn't bounced silently to / or /canvas.
 */
function EditorAwaitingApprovalsFallback({ hasManifest }: { hasManifest: boolean }) {
  const navigate = useNavigate();
  return (
    <main className="film-grain min-h-screen bg-bg-base px-6 py-10 md:py-14">
      <div className="mx-auto flex min-h-[70vh] max-w-[60rem] flex-col items-start justify-center gap-6">
        <div className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
          Editor · Awaiting cut
        </div>
        <h1 className="text-balance font-display text-display-md italic text-fg-primary">
          {hasManifest ? "Nothing to refine yet." : "No project in flight."}
        </h1>
        <p className="max-w-prose font-display italic text-lg text-fg-secondary">
          {hasManifest ? (
            <>
              Approve a take on <em>the</em> canvas first. The editor opens once
              there's a cut to refine.
            </>
          ) : (
            <>
              Type a prompt to begin. The editor opens after the canvas builds
              and at least one take lands.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {hasManifest ? (
            <Button size="md" variant="primary" onClick={() => navigate("/canvas")}>
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              Back to canvas
            </Button>
          ) : (
            <Button size="md" variant="primary" onClick={() => navigate("/")}>
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              Begin a project
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * The Cloudinary artifact strip.
 *
 * Every edit — agent-led or drag-led — deterministically rewrites the URL
 * shown here. No render server, no ffmpeg job. Cloudinary's CDN evaluates
 * the transform pipeline on demand and caches the MP4.
 *
 * Hairline-anchored section, no card chrome. The eyebrow names the surface
 * ("Cloudinary · single-URL bake"), the mono block carries the URL, the
 * chips name the transform vocabulary, and the poster-frame derivative is
 * a one-line text link below.
 */
function CloudinaryArtifactStrip({
  url,
  decisions,
  thumbnailUrl,
  urlCopied,
  setUrlCopied,
}: {
  url: string;
  decisions: EditDecisions | null;
  thumbnailUrl: string | null;
  urlCopied: boolean;
  setUrlCopied: (v: boolean) => void;
}) {
  const chips = useMemo(() => deriveTransformChips(decisions), [decisions]);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="font-body text-micro font-medium uppercase tracking-[0.08em] text-brand-ember">
          Cloudinary · single-URL bake
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setUrlCopied(true);
                window.setTimeout(() => setUrlCopied(false), 1400);
                toast.success("Master cut URL copied.");
              } catch {
                toast.error("Couldn't reach the clipboard.");
              }
            }}
            className="inline-flex items-center gap-1.5 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Copy master cut URL"
          >
            {urlCopied ? (
              <>
                <Check size={11} strokeWidth={2} className="text-brand-ember" aria-hidden="true" />
                <span className="text-brand-ember">Copied</span>
              </>
            ) : (
              <>
                <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
                Copy
              </>
            )}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Open master cut URL in a new tab"
          >
            <ExternalLink size={11} strokeWidth={1.5} aria-hidden="true" />
            Open
          </a>
        </div>
      </div>

      <div className="break-all border border-fg-tertiary/15 bg-bg-base/40 p-3.5 font-mono text-pill leading-[1.65] text-fg-secondary">
        {url}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              title={c.hint}
              className="font-mono text-micro tabular-nums text-brand-ember/85"
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}

      {thumbnailUrl ? (
        <a
          href={thumbnailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 font-body text-caption text-fg-tertiary transition-colors hover:text-fg-primary"
          aria-label="Open poster-frame derivative in a new tab"
        >
          <ImageIcon size={11} strokeWidth={1.5} aria-hidden="true" />
          Poster-frame derivative
          <span className="font-mono text-micro text-fg-tertiary/70 group-hover:text-brand-ember">
            /so_auto/&lt;id&gt;.jpg
          </span>
        </a>
      ) : null}
    </section>
  );
}

/**
 * Derive a chip per Cloudinary capability the current EditDecisions touches.
 * Each chip names the transform segment that ends up in the URL — so the
 * user can read the URL and see which chip emitted what.
 */
function deriveTransformChips(decisions: EditDecisions | null): { label: string; hint: string }[] {
  if (!decisions) return [];
  const chips: { label: string; hint: string }[] = [];
  const clips = decisions.clips ?? [];
  if (clips.length > 1) {
    chips.push({
      label: `fl_splice × ${clips.length - 1}`,
      hint: "Cloudinary spliced overlay clips onto the base — one fl_splice per overlay.",
    });
  }
  const trimmed = clips.filter(
    (c) => (c.trimStart ?? 0) > 0 || (c.trimEnd ?? c.durationSeconds) < c.durationSeconds,
  ).length;
  if (trimmed > 0) {
    chips.push({
      label: `so / eo × ${trimmed}`,
      hint: "Per-beat trim — Cloudinary so_/eo_ on the layer opener.",
    });
  }
  const fades = clips.filter((c, i) => i > 0 && (c.transitionMs ?? 0) > 0).length;
  if (fades > 0) {
    chips.push({
      label: `e_fade × ${fades}`,
      hint: "Cross-fade transitions between beats.",
    });
  }
  const grades = clips.filter((c) => c.colorGrade && c.colorGrade.length > 0).length;
  if (grades > 0) {
    chips.push({
      label: `e_brightness/contrast × ${grades}`,
      hint: "Per-beat color grade.",
    });
  }
  const captions = clips.filter((c) => c.caption && c.caption.length > 0).length;
  if (captions > 0) {
    chips.push({
      label: `l_text × ${captions}`,
      hint: "Timeline-anchored caption overlay.",
    });
  }
  if (decisions.look && decisions.look !== "neutral") {
    chips.push({
      label: `look:${decisions.look}`,
      hint: "Global LUT applied across the whole cut.",
    });
  }
  if (decisions.audio?.publicId) {
    chips.push({
      label: "l_audio",
      hint: "Music bed overlay with volume + fade.",
    });
  }
  if (decisions.duckOriginalAudioDb != null) {
    chips.push({
      label: `e_volume:${decisions.duckOriginalAudioDb}`,
      hint: "Original clip audio ducked under the music bed.",
    });
  }
  if (decisions.watermarkPublicId) {
    chips.push({
      label: "l_watermark",
      hint: "Lower-right corner watermark.",
    });
  }
  return chips;
}
