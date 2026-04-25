import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Manifest, Beat, Scene, AgentTurn, VideoType } from "@/types/manifest";
import type { DecomposedClip, EditDecisions } from "@/types/api";
import { buildInitialBeats } from "@/lib/beat-templates";
import { uuid, nowISO } from "@/lib/utils";

/** Conversation entries the editor session keeps separately from the per-beat questionnaire. */
export interface EditorTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;
  /**
   * Snapshot of the EditDecisions the agent emitted alongside this turn.
   * Lets the UI render undo/revert as "go back to turn N's decisions" rather
   * than computing inverse patches.
   */
  decisions?: EditDecisions;
}

/**
 * Transient lifecycle of the landing → /api/decompose call. Drives the
 * "Decomposing scenes…" indicator on the canvas. NOT persisted (excluded
 * via `partialize`) so a hard refresh never leaves the user staring at a
 * stale "pending" pill.
 */
export type DecomposeStatus = "idle" | "pending" | "success" | "error";

interface BeatGraphState {
  manifest: Manifest | null;
  activeBeatId: string | null;
  decomposeStatus: DecomposeStatus;
  /** Stage 7 editor state. Lives on the store so the route can mount/unmount without losing the user's edits. */
  editor: {
    decisions: EditDecisions | null;
    conversation: EditorTurn[];
    /** Last baked Cloudinary URL — drives the in-route <video> preview. */
    finalUrl: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    committed: boolean;
  };
  /**
   * Whether any modal-style chrome (stitch tray, command menu) is open.
   * Used by the 3D canvas to hide planet HTML labels — they're DOM siblings
   * of the Canvas and bleed through translucent overlays otherwise.
   */
  stitchTrayOpen: boolean;

  // mutations
  initialize: (params: { masterPrompt: string; videoType: VideoType }) => void;
  setDecomposeStatus: (status: DecomposeStatus) => void;
  setActiveBeat: (beatId: string | null) => void;
  setStitchTrayOpen: (open: boolean) => void;
  updateBeat: (beatId: string, patch: Partial<Beat>) => void;
  updateScene: (beatId: string, sceneId: string, patch: Partial<Scene>) => void;
  appendAgentTurn: (beatId: string, sceneId: string, turn: AgentTurn) => void;
  approveScene: (beatId: string, sceneId: string) => void;
  /**
   * Patches each beat's scenes[0] with the LLM-generated refinedPrompt +
   * clipPrompt envelope returned by /api/decompose. Best-effort: any beat
   * the response doesn't cover keeps its template defaults. Beats stay in
   * `pending` status — the per-beat questionnaire still runs.
   */
  applyDecomposition: (clips: DecomposedClip[], continuityBible?: string) => void;
  /**
   * Reset clip fields on a scene and flip the beat back to ready-to-generate.
   * Conversation is preserved — the user shouldn't lose the questionnaire
   * just because they want a different take.
   */
  regenerateScene: (beatId: string, sceneId: string) => void;
  /**
   * Patches the final cinematic URL + thumbnail + duration on the manifest
   * after /api/stitch/url succeeds. Drives the FinalDeliveryRoute.
   */
  setFinalCinematic: (params: {
    finalUrl: string;
    thumbnailUrl: string;
    durationSeconds: number;
  }) => void;
  // ── Stage 7 editor ────────────────────────────────────────────────────
  setEditorBaked: (params: {
    decisions: EditDecisions;
    finalUrl: string;
    thumbnailUrl: string;
    durationSeconds: number;
  }) => void;
  appendEditorTurn: (turn: EditorTurn) => void;
  resetEditor: () => void;
  markEditorCommitted: () => void;
  reset: () => void;
}

const EDITOR_INITIAL: BeatGraphState["editor"] = {
  decisions: null,
  conversation: [],
  finalUrl: null,
  thumbnailUrl: null,
  durationSeconds: null,
  committed: false,
};

export const useBeatGraphStore = create<BeatGraphState>()(
  persist(
    (set, get) => ({
      manifest: null,
      activeBeatId: null,
      decomposeStatus: "idle",
      editor: EDITOR_INITIAL,
      stitchTrayOpen: false,

      initialize: ({ masterPrompt, videoType }) => {
        const beats = buildInitialBeats(videoType);
        set({
          manifest: {
            projectId: uuid(),
            videoType,
            masterPrompt,
            createdAt: nowISO(),
            beats,
          },
          activeBeatId: null,
          decomposeStatus: "idle",
          editor: EDITOR_INITIAL,
          stitchTrayOpen: false,
        });
      },

      setDecomposeStatus: (status) => set({ decomposeStatus: status }),

      setActiveBeat: (beatId) => set({ activeBeatId: beatId }),

      setStitchTrayOpen: (open) => set({ stitchTrayOpen: open }),

      updateBeat: (beatId, patch) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) => (b.beatId === beatId ? { ...b, ...patch } : b)),
          },
        });
      },

      updateScene: (beatId, sceneId, patch) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) =>
              b.beatId === beatId
                ? {
                    ...b,
                    scenes: b.scenes.map((s) => (s.sceneId === sceneId ? { ...s, ...patch } : s)),
                  }
                : b,
            ),
          },
        });
      },

      appendAgentTurn: (beatId, sceneId, turn) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) =>
              b.beatId === beatId
                ? {
                    ...b,
                    scenes: b.scenes.map((s) =>
                      s.sceneId === sceneId
                        ? { ...s, conversation: [...s.conversation, turn] }
                        : s,
                    ),
                  }
                : b,
            ),
          },
        });
      },

      applyDecomposition: (clips, _continuityBible) => {
        const m = get().manifest;
        if (!m) return;
        const byBeatId = new Map(clips.map((c) => [c.beatId, c]));
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) => {
              const clip = byBeatId.get(b.beatId);
              if (!clip || b.scenes.length === 0) return b;
              return {
                ...b,
                scenes: b.scenes.map((s, idx) =>
                  idx === 0 ? { ...s, refinedPrompt: clip.refinedPrompt } : s,
                ),
              };
            }),
          },
        });
      },

      approveScene: (beatId, sceneId) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) => {
              if (b.beatId !== beatId) return b;
              const scenes = b.scenes.map((s) =>
                s.sceneId === sceneId ? { ...s, approved: true } : s,
              );
              const allApproved = scenes.every((s) => s.approved);
              return { ...b, scenes, status: allApproved ? "approved" : b.status };
            }),
          },
        });
      },

      regenerateScene: (beatId, sceneId) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            beats: m.beats.map((b) => {
              if (b.beatId !== beatId) return b;
              return {
                ...b,
                status: "ready-to-generate",
                scenes: b.scenes.map((s) =>
                  s.sceneId === sceneId
                    ? { ...s, jobId: undefined, clipPublicId: undefined, clipUrl: undefined, approved: false }
                    : s,
                ),
              };
            }),
          },
        });
      },

      setFinalCinematic: ({ finalUrl, thumbnailUrl, durationSeconds }) => {
        const m = get().manifest;
        if (!m) return;
        set({
          manifest: {
            ...m,
            finalCloudinaryUrl: finalUrl,
            thumbnailUrl,
            durationSeconds,
          },
        });
      },

      setEditorBaked: ({ decisions, finalUrl, thumbnailUrl, durationSeconds }) =>
        set((s) => ({
          editor: { ...s.editor, decisions, finalUrl, thumbnailUrl, durationSeconds },
        })),

      appendEditorTurn: (turn) =>
        set((s) => ({
          editor: { ...s.editor, conversation: [...s.editor.conversation, turn] },
        })),

      markEditorCommitted: () => set((s) => ({ editor: { ...s.editor, committed: true } })),

      resetEditor: () => set({ editor: EDITOR_INITIAL }),

      reset: () =>
        set({
          manifest: null,
          activeBeatId: null,
          decomposeStatus: "idle",
          editor: EDITOR_INITIAL,
          stitchTrayOpen: false,
        }),
    }),
    {
      name: "sceneos:beat-graph",
      // decomposeStatus is transient UI state; never persist it. A reload
      // mid-decompose should land on 'idle', not eternal 'pending'.
      partialize: (state) => ({
        manifest: state.manifest,
        activeBeatId: state.activeBeatId,
        editor: state.editor,
      }) as unknown as BeatGraphState,
    },
  ),
);

export function selectActiveBeat(state: BeatGraphState): Beat | null {
  if (!state.manifest || !state.activeBeatId) return null;
  return state.manifest.beats.find((b) => b.beatId === state.activeBeatId) ?? null;
}

export function selectApprovedClipPublicIds(state: BeatGraphState): string[] {
  const m = state.manifest;
  if (!m) return [];
  return m.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved && s.clipPublicId)
    .map((s) => s.clipPublicId!);
}
