import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Manifest, Beat, Scene, AgentTurn, VideoType } from "@/types/manifest";
import type { DecomposedClip, EditDecisions } from "@/types/api";
import { buildInitialBeats } from "@/lib/beat-templates";
import { uuid, nowISO } from "@/lib/utils";
import { api } from "@/lib/api";

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

/**
 * A project archived to the user's local history. `reset()` snapshots the
 * current manifest into this list before clearing, so the user can resume
 * past projects from the landing route's "Recent projects" rail or the
 * dedicated /projects view.
 *
 * Capped at 12 most recent (oldest dropped) so localStorage doesn't bloat.
 */
export interface ArchivedProject {
  /** Stable identifier — equals manifest.projectId. */
  id: string;
  /** ISO timestamp at the moment of archive. */
  archivedAt: string;
  /** Mirrored from the manifest for cheap rendering on list rows. */
  masterPrompt: string;
  /** Full manifest snapshot — restored verbatim on resume. */
  manifest: Manifest;
  /**
   * Editor slice snapshot. Restored on resume so a user who started
   * refining and then jumped away (Save & exit) picks up exactly where
   * they left off — same baked URL, same conversation, same proposal
   * card. Optional: projects archived before this field was added (or
   * never reaching the editor) won't have it; resume falls back to
   * EDITOR_INITIAL in that case.
   */
  editor?: BeatGraphState["editor"];
}

const PROJECTS_CAP = 12;

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
  /**
   * 2D minimap is now power-user chrome — off by default, toggled from the
   * command palette ("Toggle overview"). Beat order is already legible from
   * the L→R recession + connecting path; the minimap earns its real estate
   * only when the user asks for it.
   */
  minimapOpen: boolean;
  /**
   * Archived projects (most recent first). Populated by reset() and
   * resumeProject(); rendered on the landing recent-3 rail and on /projects.
   */
  projects: ArchivedProject[];

  // mutations
  initialize: (params: { masterPrompt: string; videoType: VideoType }) => void;
  setDecomposeStatus: (status: DecomposeStatus) => void;
  setActiveBeat: (beatId: string | null) => void;
  setStitchTrayOpen: (open: boolean) => void;
  setMinimapOpen: (open: boolean) => void;
  /** Promote an archived project back to the active manifest. Archives any
   *  current manifest first so nothing in flight is silently destroyed. */
  resumeProject: (projectId: string) => void;
  /** Permanently delete a single archived project. */
  discardProject: (projectId: string) => void;
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
      minimapOpen: false,
      projects: [],

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
          minimapOpen: false,
        });
      },

      setDecomposeStatus: (status) => set({ decomposeStatus: status }),

      setActiveBeat: (beatId) => set({ activeBeatId: beatId }),

      setStitchTrayOpen: (open) => set({ stitchTrayOpen: open }),

      setMinimapOpen: (open) => set({ minimapOpen: open }),

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
                    ? {
                        ...s,
                        jobId: undefined,
                        speculativeJobId: undefined,
                        clipPublicId: undefined,
                        clipUrl: undefined,
                        approved: false,
                        generateFallbackFrom: undefined,
                        generateFallbackReason: undefined,
                      }
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

      resumeProject: (projectId) => {
        const state = get();
        const target = state.projects.find((p) => p.id === projectId);
        if (!target) return;
        // Archive any current manifest first so resuming never silently
        // drops in-progress work. The target is then promoted, deduped from
        // the projects list (so it doesn't appear twice), and capped.
        // Editor slice is also archived alongside the manifest so the
        // current project's mid-edit state survives a hop into another.
        if (state.manifest) {
          api.saveProject({
            projectId: state.manifest.projectId,
            manifest: state.manifest,
            status: "archived",
            editor: state.editor.decisions ? state.editor : undefined,
          }).catch(() => {});
        }
        const archivedHead = state.manifest
          ? [
              {
                id: state.manifest.projectId,
                archivedAt: nowISO(),
                masterPrompt: state.manifest.masterPrompt,
                manifest: state.manifest,
                editor: state.editor.decisions ? state.editor : undefined,
              },
              ...state.projects.filter(
                (p) => p.id !== state.manifest!.projectId && p.id !== projectId,
              ),
            ]
          : state.projects.filter((p) => p.id !== projectId);
        set({
          manifest: target.manifest,
          activeBeatId: null,
          decomposeStatus: "idle",
          // Restore the target's editor session if one was archived. Falls
          // back to fresh state for older projects that pre-date this field.
          editor: target.editor ?? EDITOR_INITIAL,
          stitchTrayOpen: false,
          minimapOpen: false,
          projects: archivedHead.slice(0, PROJECTS_CAP),
        });
      },

      discardProject: (projectId) => {
        api.deleteProject(projectId).catch(() => {});
        set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) }));
      },

      reset: () => {
        const state = get();
        // Snapshot the active manifest into the archive before clearing.
        // No-op when there's nothing to archive (e.g., reset() called twice
        // in a row, or called on an already-empty session).
        if (state.manifest) {
          // Fire-and-forget: persist to MongoDB alongside local archive.
          api.saveProject({
            projectId: state.manifest.projectId,
            manifest: state.manifest,
            status: "archived",
            editor: state.editor.decisions ? state.editor : undefined,
          }).catch(() => {});
        }
        const projects = state.manifest
          ? [
              {
                id: state.manifest.projectId,
                archivedAt: nowISO(),
                masterPrompt: state.manifest.masterPrompt,
                manifest: state.manifest,
              },
              ...state.projects.filter((p) => p.id !== state.manifest!.projectId),
            ].slice(0, PROJECTS_CAP)
          : state.projects;
        set({
          manifest: null,
          activeBeatId: null,
          decomposeStatus: "idle",
          editor: EDITOR_INITIAL,
          stitchTrayOpen: false,
          minimapOpen: false,
          projects,
        });
      },
    }),
    {
      name: "sceneos:beat-graph",
      // decomposeStatus is transient UI state; never persist it. A reload
      // mid-decompose should land on 'idle', not eternal 'pending'.
      partialize: (state) => ({
        manifest: state.manifest,
        activeBeatId: state.activeBeatId,
        editor: state.editor,
        projects: state.projects,
      }) as unknown as BeatGraphState,
      // Clamp the rehydrated payload back onto the canonical shape. Older
      // persisted states pre-date the `editor` field; corrupted/forged
      // localStorage could ship missing or wrong-typed top-level keys.
      // Falling back to defaults keeps the app booting instead of
      // exploding inside a selector. The action methods come from
      // `current` (the live store factory) — they are never persisted.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BeatGraphState>;
        return {
          ...current,
          manifest: p.manifest ?? null,
          activeBeatId: typeof p.activeBeatId === "string" ? p.activeBeatId : null,
          editor:
            p.editor && typeof p.editor === "object"
              ? { ...EDITOR_INITIAL, ...p.editor }
              : EDITOR_INITIAL,
          projects: Array.isArray(p.projects) ? p.projects.slice(0, PROJECTS_CAP) : [],
        };
      },
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
