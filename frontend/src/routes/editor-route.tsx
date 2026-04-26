import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/ui/video-player";
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
 * Stage 7 — the agentic editor.
 *
 * Layout (lg):
 *   ┌──────────────────────────────────────┬───────────────────┐
 *   │ Header (Save & exit · Back · Ship)                       │
 *   ├──────────────────────────────────────┬───────────────────┤
 *   │ Preview (Cloudinary live URL)         │ Director chat     │
 *   │ ── live URL strip ──                  │ (the only edit    │
 *   │                                       │  surface)         │
 *   └──────────────────────────────────────┴───────────────────┘
 *
 * Architecture: agent-led. The director conversation IS the editor —
 * the user proposes a refinement in chat, the agent emits a kind:"propose"
 * with a new EditDecisions, and Apply edit re-bakes via /api/editor/apply.
 * No timeline scrubber, no per-clip detail panel, no global toolbar — those
 * were the NLE chrome we explicitly cut to keep the register cinematic and
 * the demo legible in 60 seconds.
 *
 * State flow:
 *   1. Mount → /api/editor/init seeds decisions + a baked Cloudinary URL.
 *   2. User chats → /api/editor/turn → agent returns propose|commit.
 *      Proposals are advisory; "Apply edit" queues a re-bake.
 *   3. handleAcceptProposal → queueBake → /api/editor/apply → finalUrl
 *      refreshes the preview.
 *   4. Ship the cut → setFinalCinematic → navigate /final.
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
  // Demo-cloud publicIds resolve against Cloudinary's public `demo` cloud.
  // Gated behind import.meta.env.DEV so production never auto-approves.
  const seedRef = useRef(false);
  useEffect(() => {
    if (seedRef.current) return;
    if (!import.meta.env.DEV) return;
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
  const [urlCopied, setUrlCopied] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
              Editing room · stitched by Cloudinary
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

        {/* Main grid: preview + timeline + global toolbar + agent rail.
            The agent is still the primary surface; timeline + toolbar give
            the user direct manipulation when they want it. Every patch
            queues a debounced re-bake against /api/editor/apply, so all
            three surfaces converge on the same Cloudinary URL. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="space-y-6">
            {/* Cinematic preview frame — letterbox-flavored, ember-tinted
                hairline border, soft shadow. The video carries the moment;
                everything around it stays out of its way. */}
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
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-bg-elev-2 to-black font-display text-[15px] italic text-fg-tertiary">
                  Composing the cut.
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
                    Re-baking the cut
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Live Cloudinary URL — THE artifact. Every edit, agent-led
                or direct-manipulation, deterministically rewrites this
                single CDN URL. No render server, no ffmpeg job — Cloudinary
                evaluates the transform on demand and CDN-caches the MP4.
                The chip rail shows the transform vocabulary baked in.
                The poster-frame derivative under it is the same publicId
                with `/so_auto/<id>.jpg` swapped onto the tail — proof that
                Cloudinary owns the entire delivery surface. */}
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

          {/* Right column — global toolbar above, agent panel below. The
              column scrolls naturally; the agent's flex-1 inner scroller
              keeps long chats out of the page scroll. */}
          <div className="space-y-5 lg:sticky lg:top-10 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
            {editor.decisions ? (
              <EditorToolbar decisions={editor.decisions} onPatch={patchGlobal} />
            ) : null}
            <div className="lg:min-h-[28rem]">
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

/**
 * The Cloudinary artifact panel.
 *
 * Every edit — agent-led or direct-manipulation — deterministically rewrites
 * the URL shown here. There is no render server. Cloudinary's CDN evaluates
 * the transform pipeline on demand and caches the result.
 *
 * Layout:
 *   - Header: "Master cut · live URL" + Copy + Open
 *   - Mono URL block (break-all)
 *   - Transform-vocabulary chip rail derived from the current EditDecisions —
 *     so the user can SEE which Cloudinary capabilities they're touching
 *     (fl_splice, e_fade, l_text, l_audio, look LUT, watermark, ducking).
 *   - Poster-frame thumbnail derivative — same publicId, /so_auto/<id>.jpg
 *     swapped onto the tail. Click-to-open in a new tab.
 *
 * This is the prize-winning surface for the Cloudinary Company Challenge:
 * the URL IS the artifact, the transform chips name the capabilities, and
 * the thumbnail proves Cloudinary owns the entire delivery layer.
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
    <section className="space-y-3 rounded-md border border-brand-ember-dim/30 bg-bg-elev-1/40 p-4">
      <div className="flex items-baseline justify-between">
        <div className="space-y-0.5">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ember">
            Cloudinary · single-URL bake
          </div>
          <div className="font-display text-[15px] italic text-fg-primary">
            Master cut · live URL
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            className="inline-flex items-center gap-1.5 font-body text-[11px] text-fg-tertiary transition-colors hover:text-fg-primary"
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
            className="inline-flex items-center gap-1.5 font-body text-[11px] text-fg-tertiary transition-colors hover:text-fg-primary"
            aria-label="Open master cut URL in a new tab"
          >
            <ExternalLink size={11} strokeWidth={1.5} aria-hidden="true" />
            Open
          </a>
        </div>
      </div>

      <div className="break-all rounded-md border border-fg-tertiary/15 bg-bg-base/50 p-3.5 font-mono text-[12px] leading-[1.65] text-fg-secondary">
        {url}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              title={c.hint}
              className="inline-flex items-center gap-1 rounded-full border border-brand-ember-dim/40 bg-brand-ember/[0.06] px-2.5 py-1 font-mono text-[10.5px] text-brand-ember"
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
          className="group inline-flex items-center gap-2 font-body text-[11px] text-fg-tertiary transition-colors hover:text-fg-primary"
          aria-label="Open poster-frame derivative in a new tab"
        >
          <ImageIcon size={11} strokeWidth={1.5} aria-hidden="true" />
          Poster-frame derivative
          <span className="font-mono text-[10.5px] text-fg-tertiary/70 group-hover:text-brand-ember">
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
