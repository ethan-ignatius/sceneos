import { describe, it, expect, beforeEach } from "vitest";
import { useBeatGraphStore } from "./beat-graph-store";
import type { EditDecisions } from "@/types/api";

// End-to-end resume cycle for a mid-edit session. Mirrors the manual
// smoke test plan from queue task #78: edit → archive → resume restores
// decisions, conversation, finalUrl, and committed flag.

const SAMPLE_DECISIONS: EditDecisions = {
  clips: [
    {
      beatId: "b1",
      publicId: "demo/clip1",
      durationSeconds: 5,
      trimStart: 0,
      trimEnd: 5,
    },
  ],
  audio: null,
  look: "warm-archive",
  captionPosition: "south",
};

beforeEach(() => {
  useBeatGraphStore.getState().reset();
  useBeatGraphStore.setState({ projects: [], manifest: null });
});

describe("editor session resume", () => {
  it("archives current editor state when resuming another project", () => {
    const store = useBeatGraphStore.getState();
    store.initialize({ masterPrompt: "first project", videoType: "trailer" });
    const firstId = useBeatGraphStore.getState().manifest!.projectId;

    // Edit the first project — populate decisions + conversation.
    useBeatGraphStore.getState().setEditorBaked({
      decisions: SAMPLE_DECISIONS,
      finalUrl: "https://example.com/first.mp4",
      thumbnailUrl: "https://example.com/first.jpg",
      durationSeconds: 5,
    });
    useBeatGraphStore.getState().appendEditorTurn({
      role: "user",
      content: "tighten beat 4",
      timestamp: "2026-04-26T01:00:00Z",
    });

    // Spin up a second project so resumeProject has somewhere to go.
    useBeatGraphStore.getState().initialize({
      masterPrompt: "second project",
      videoType: "trailer",
    });
    const secondId = useBeatGraphStore.getState().manifest!.projectId;

    // First project's editor state now lives nowhere — initialize() wipes
    // the slice without archiving. Manually seed projects[] with the
    // archived first project as the resume entry point.
    useBeatGraphStore.setState({
      projects: [
        {
          id: firstId,
          archivedAt: "2026-04-26T01:01:00Z",
          masterPrompt: "first project",
          manifest: {
            projectId: firstId,
            videoType: "trailer",
            masterPrompt: "first project",
            createdAt: "2026-04-26T00:55:00Z",
            beats: [],
          },
          editor: {
            decisions: SAMPLE_DECISIONS,
            conversation: [
              { role: "user", content: "tighten beat 4", timestamp: "2026-04-26T01:00:00Z" },
            ],
            finalUrl: "https://example.com/first.mp4",
            thumbnailUrl: "https://example.com/first.jpg",
            durationSeconds: 5,
            committed: false,
          },
        },
      ],
    });

    // Resume into the first project — the second project's state should
    // get archived (without an editor entry, since we never populated it),
    // and the first project's editor block should be restored verbatim.
    useBeatGraphStore.getState().resumeProject(firstId);
    const after = useBeatGraphStore.getState();

    expect(after.manifest?.projectId).toBe(firstId);
    expect(after.editor.decisions).toEqual(SAMPLE_DECISIONS);
    expect(after.editor.finalUrl).toBe("https://example.com/first.mp4");
    expect(after.editor.conversation).toHaveLength(1);
    expect(after.editor.conversation[0].content).toBe("tighten beat 4");

    // Second project (the one we just left) should be in the archive,
    // ahead of the now-promoted first project (which got removed).
    const archive = after.projects;
    expect(archive.some((p) => p.id === secondId)).toBe(true);
    expect(archive.some((p) => p.id === firstId)).toBe(false);
  });

  it("falls back to a fresh editor when the archived project predates the editor field", () => {
    const store = useBeatGraphStore.getState();
    store.initialize({ masterPrompt: "current", videoType: "trailer" });
    const currentId = useBeatGraphStore.getState().manifest!.projectId;

    // Older archived project — no `editor` field, simulating a project
    // saved before the persisted-editor work landed.
    const legacyId = "legacy-project";
    useBeatGraphStore.setState({
      projects: [
        {
          id: legacyId,
          archivedAt: "2026-04-20T00:00:00Z",
          masterPrompt: "legacy",
          manifest: {
            projectId: legacyId,
            videoType: "trailer",
            masterPrompt: "legacy",
            createdAt: "2026-04-20T00:00:00Z",
            beats: [],
          },
        },
      ],
    });

    useBeatGraphStore.getState().resumeProject(legacyId);
    const after = useBeatGraphStore.getState();

    expect(after.manifest?.projectId).toBe(legacyId);
    expect(after.editor.decisions).toBeNull();
    expect(after.editor.conversation).toEqual([]);
    expect(after.editor.committed).toBe(false);
    // Current project should be archived now that we left it.
    expect(after.projects.some((p) => p.id === currentId)).toBe(true);
  });

  it("preserves the committed flag through an archive/resume round-trip", () => {
    const store = useBeatGraphStore.getState();
    store.initialize({ masterPrompt: "lock-test", videoType: "trailer" });
    const projectId = useBeatGraphStore.getState().manifest!.projectId;

    useBeatGraphStore.getState().setEditorBaked({
      decisions: SAMPLE_DECISIONS,
      finalUrl: "https://example.com/locked.mp4",
      thumbnailUrl: "https://example.com/locked.jpg",
      durationSeconds: 5,
    });
    useBeatGraphStore.getState().markEditorCommitted();
    expect(useBeatGraphStore.getState().editor.committed).toBe(true);

    // Reset the live state but keep the project as an archive entry with
    // the locked editor block. resumeProject should bring back committed:true.
    const lockedEditor = useBeatGraphStore.getState().editor;
    const manifest = useBeatGraphStore.getState().manifest!;
    useBeatGraphStore.setState({
      manifest: null,
      projects: [
        {
          id: projectId,
          archivedAt: "2026-04-26T02:00:00Z",
          masterPrompt: "lock-test",
          manifest,
          editor: lockedEditor,
        },
      ],
    });
    useBeatGraphStore.getState().resetEditor();

    useBeatGraphStore.getState().resumeProject(projectId);
    expect(useBeatGraphStore.getState().editor.committed).toBe(true);
    expect(useBeatGraphStore.getState().editor.finalUrl).toBe(
      "https://example.com/locked.mp4",
    );
  });
});
