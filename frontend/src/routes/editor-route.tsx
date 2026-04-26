import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/ui/video-player";
import { EditorTimeline } from "@/components/editor/editor-timeline";
import { EditorAgentPanel } from "@/components/editor/editor-agent-panel";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorClipDetail } from "@/components/editor/editor-clip-detail";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { api, ApiError } from "@/lib/api";
import { nowISO } from "@/lib/utils";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import type {
  EditClipDecision,
  EditDecisions,
  EditorTurnResponse,
} from "@/types/api";
import type { BeatMood } from "@/types/manifest";
import { toast } from "sonner";

/**
 * Stage 7 — the agentic editor.
 *
 * Layout (lg):
 *   ┌──────────────────────────────────────┬───────────────────┐
 *   │ Preview (Cloudinary live URL)         │ Director chat     │
 *   │                                       │                   │
 *   │ Timeline (drag handles to trim)       │                   │
 *   │ Selected-clip detail · Toolbar        │                   │
 *   └──────────────────────────────────────┴───────────────────┘
 *
 * State flow:
 *   1. Mount → /api/editor/init seeds decisions + a baked Cloudinary URL.
 *   2. Any decisions change (manual or accepted from agent) re-bakes via /api/editor/apply.
 *      The baked URL feeds the <video> preview.
 *   3. User chats → /api/editor/turn → agent returns a propose|commit.
 *      We DO NOT auto-apply proposals — the user must accept (so the cut
 *      doesn't change under their feet). Follow-up suggestions are shortcut
 *      messages that send a user reply.
 *   4. Commit → /final.
 */
export function EditorRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialize = useBeatGraphStore((s) => s.initialize);
  const updateBeat = useBeatGraphStore((s) => s.updateBeat);
  const updateScene = useBeatGraphStore((s) => s.updateScene);
  const manifest = useBeatGraphStore((s) => s.manifest);
  const editor = useBeatGraphStore((s) => s.editor);
  const setEditorBaked = useBeatGraphStore((s) => s.setEditorBaked);
  const appendEditorTurn = useBeatGraphStore((s) => s.appendEditorTurn);
  const markEditorCommitted = useBeatGraphStore((s) => s.markEditorCommitted);
  const setFinalCinematic = useBeatGraphStore((s) => s.setFinalCinematic);

  // Dev shortcut: ?seed=demo auto-populates an approved 3-beat manifest so the
  // editor can be tested without walking the full landing → canvas flow.
  // Mock-clip publicIds resolve against Cloudinary's public `demo` cloud.
  const seedRef = useRef(false);
  useEffect(() => {
    if (seedRef.current) return;
    if (searchParams.get("seed") !== "demo") return;
    seedRef.current = true;
    initialize({
      masterPrompt: "a monkey steals a banana from a zoo",
      videoType: "trailer",
    });
    // Approve the first 3 beats with mock-clip publicIds from Cloudinary's demo cloud.
    const approve = (beatId: string, publicId: string, durationSeconds: number) => {
      const m = useBeatGraphStore.getState().manifest;
      const beat = m?.beats.find((b) => b.beatId === beatId);
      const scene = beat?.scenes[0];
      if (!beat || !scene) return;
      updateScene(beatId, scene.sceneId, {
        clipPublicId: publicId,
        clipUrl: `https://res.cloudinary.com/demo/video/upload/${publicId}.mp4`,
        durationSeconds,
        approved: true,
      });
      updateBeat(beatId, { status: "approved" });
    };
    const m = useBeatGraphStore.getState().manifest;
    if (!m) return;
    const samples = [
      { publicId: "dog", duration: 5 },
      { publicId: "elephants", duration: 8 },
      { publicId: "dog", duration: 6 },
    ];
    m.beats.slice(0, 3).forEach((b, i) => approve(b.beatId, samples[i].publicId, samples[i].duration));
  }, [searchParams, initialize, updateBeat, updateScene]);

  const [latest, setLatest] = useState<EditorTurnResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const [baking, setBaking] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Beat metadata for the timeline labels (mood tint, beat name).
  const beatLabels = useMemo(() => {
    const out: Record<string, { name: string; mood: BeatMood }> = {};
    if (!manifest) return out;
    for (const b of manifest.beats) {
      out[b.beatId] = { name: b.beatName, mood: b.archetype.mood };
    }
    return out;
  }, [manifest]);

  // Boot — seed editor decisions + first baked URL on mount, once.
  useEffect(() => {
    if (!manifest) return;
    if (editor.decisions) return;
    let cancelled = false;
    (async () => {
      try {
        const init = await api.editorInit(manifest);
        if (cancelled || !mountedRef.current) return;
        setEditorBaked({
          decisions: init.decisions,
          finalUrl: init.finalUrl,
          thumbnailUrl: init.thumbnailUrl,
          durationSeconds: init.durationSeconds,
        });
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setBootError(
          err instanceof ApiError ? err.message : "Could not load the cut for editing.",
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
  const callAgent = useCallback(
    async (userMessage?: string) => {
      if (!manifest || !editor.decisions || thinking) return;
      setThinking(true);
      try {
        if (userMessage) {
          appendEditorTurn({ role: "user", content: userMessage, timestamp: nowISO() });
        }
        const res = await api.editorTurn({
          manifest,
          decisions: editor.decisions,
          conversation: editor.conversation,
          userMessage,
        });
        if (!mountedRef.current) return;
        setLatest(res);
        const agentText =
          res.kind === "commit"
            ? res.summary
            : res.rationale;
        appendEditorTurn({
          role: "agent",
          content: agentText,
          timestamp: nowISO(),
          decisions: res.decisions,
        });
        if (res.kind === "commit") {
          // Lock immediately — the user asked.
          await bake(res.decisions);
          markEditorCommitted();
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Agent turn failed.");
      } finally {
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

  // ── Manual edit handlers ─────────────────────────────────────────────
  const handlePatchClip = (idx: number, patch: Partial<EditClipDecision>) => {
    if (!editor.decisions) return;
    const next: EditDecisions = {
      ...editor.decisions,
      clips: editor.decisions.clips.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    };
    queueBake(next);
  };

  const handlePatchGlobal = (patch: Partial<EditDecisions>) => {
    if (!editor.decisions) return;
    queueBake({ ...editor.decisions, ...patch });
  };

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
    void callAgent("lock it");
  };

  // ── Routing guards ───────────────────────────────────────────────────
  // Both no-manifest and no-approvals used to redirect silently, which made
  // /edit feel identical to wherever the user landed next. Visible empty
  // states keep the user oriented — they SEE they're at /edit, just with
  // nothing to refine yet, and pick the explicit way back.
  const seedMode = searchParams.get("seed") === "demo";
  if (!manifest) {
    return seedMode ? <SeedingFallback /> : <EditorAwaitingApprovalsFallback hasManifest={false} />;
  }
  const hasApproved = manifest.beats.some((b) =>
    b.scenes.some((s) => s.approved && s.clipPublicId),
  );
  if (!hasApproved) {
    return seedMode ? <SeedingFallback /> : <EditorAwaitingApprovalsFallback hasManifest={true} />;
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
    <main className="film-grain min-h-screen bg-bg-base px-6 py-10 md:py-14">
      <div className="mx-auto max-w-[112rem] space-y-8">
        {/* Header — stacks vertically on mobile so the headline + prompt
            quote get full width, then the action row drops below. On md+
            the row sits to the right of the headline as a flex justify
            split. Previous flex-wrap caused two CTAs to crowd the headline
            unevenly on narrow viewports. */}
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-4">
          <div className="space-y-2">
            <div className="font-body text-[12px] font-medium text-fg-tertiary">
              Editor · Cloudinary
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
              className="font-display text-display-md italic text-fg-primary"
            >
              The cut, take one.
            </motion.h1>
            <p className="max-w-prose font-display italic text-lg text-fg-secondary">
              "{manifest.masterPrompt}"
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 self-start md:self-end">
            <Button variant="ghost" size="md" onClick={handleSaveAndExit}>
              <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
              Save &amp; exit
            </Button>
            <Button variant="ghost" size="md" onClick={handleBackToCanvas}>
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
              Back to canvas
            </Button>
            <Button
              size="md"
              variant="primary"
              onClick={handleShipIt}
              disabled={!editor.finalUrl || baking || thinking}
              className="ember-pulse"
            >
              Ship the cut
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
        </header>

        {bootError ? (
          <div className="rounded-md border border-state-error/40 bg-state-error/10 px-4 py-3 font-body text-[13px] text-state-error">
            {bootError}
          </div>
        ) : null}

        {/* Main grid: preview + chat */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-6">
            {/* Preview */}
            <div className="relative overflow-hidden rounded-md border border-fg-tertiary/15 bg-black shadow-[0_30px_60px_-24px_rgba(0,0,0,0.7)]">
              {editor.finalUrl ? (
                <VideoPlayer
                  src={editor.finalUrl}
                  suggestedDurationSeconds={editor.durationSeconds ?? undefined}
                  caption={`Live cut · ${editor.durationSeconds?.toFixed(1) ?? "—"}s`}
                  autoPlay
                  muted
                />
              ) : (
                <div className="flex h-[28rem] items-center justify-center font-display text-[15px] italic text-fg-tertiary">
                  Loading the cut.
                </div>
              )}
              <AnimatePresence>
                {baking ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
                    className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-bg-base/80 px-3.5 py-1.5 font-body text-[11.5px] font-medium text-fg-tertiary backdrop-blur"
                  >
                    <RefreshCw size={11} strokeWidth={1.5} className="animate-spin" />
                    Re-baking transform
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Timeline */}
            {editor.decisions ? (
              <EditorTimeline
                decisions={editor.decisions}
                beatLabels={beatLabels}
                selectedIndex={selectedIdx}
                onSelectClip={(i) => setSelectedIdx(i === selectedIdx ? null : i)}
                onPatchClip={handlePatchClip}
              />
            ) : (
              <div className="flex items-center gap-2 font-display text-[14px] italic text-fg-tertiary">
                <Loader2 size={12} className="animate-spin" />
                Loading timeline.
              </div>
            )}

            {/* Selected clip detail + global toolbar — two columns on lg */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {editor.decisions && selectedIdx !== null ? (
                <EditorClipDetail
                  index={selectedIdx}
                  label={beatLabels[editor.decisions.clips[selectedIdx].beatId ?? ""]?.name ?? `Beat ${selectedIdx + 1}`}
                  clip={editor.decisions.clips[selectedIdx]}
                  onPatch={(p) => handlePatchClip(selectedIdx, p)}
                  onClose={() => setSelectedIdx(null)}
                />
              ) : (
                <div className="rounded-md border border-dashed border-fg-tertiary/20 bg-bg-elev-1/40 p-4 font-body text-[13px] text-fg-tertiary">
                  Click a beat on the timeline to refine its trim, transition, and caption.
                </div>
              )}
              {editor.decisions ? (
                <EditorToolbar decisions={editor.decisions} onPatch={handlePatchGlobal} />
              ) : null}
            </div>

            {/* Cloudinary URL — shown like the stitch tray's URL strip, for the demo viewer */}
            {editor.finalUrl ? (
              <section className="space-y-2">
                <div className="font-body text-[12px] font-medium text-fg-tertiary">
                  Final delivery URL · regenerated on every change
                </div>
                <div className="break-all rounded-md border border-fg-tertiary/15 bg-bg-base/50 p-3.5 font-mono text-[12px] leading-[1.65] text-fg-secondary">
                  {editor.finalUrl}
                </div>
              </section>
            ) : null}
          </section>

          {/* Right column — agent panel */}
          <div className="lg:sticky lg:top-10 lg:h-[calc(100vh-5rem)]">
            <EditorAgentPanel
              conversation={editor.conversation}
              latest={latest}
              thinking={thinking}
              onUserMessage={(text) => void callAgent(text)}
              onAcceptProposal={handleAcceptProposal}
              onRevertProposal={handleRevertProposal}
              onCommitNow={handleCommitNow}
              committed={editor.committed}
              livingDecisions={editor.decisions}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function SeedingFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg-base">
      <div className="flex items-center gap-2 font-mono text-[11px] text-fg-tertiary">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Seeding demo…
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
        <div className="font-body text-[12px] font-medium text-fg-tertiary">
          Editor · Awaiting cut
        </div>
        <h1 className="font-display text-display-md italic text-fg-primary">
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
