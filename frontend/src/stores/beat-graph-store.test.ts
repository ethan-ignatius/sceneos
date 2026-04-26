import { describe, it, expect } from "vitest";
import { selectActiveBeat, selectApprovedClipPublicIds } from "./beat-graph-store";
import type { Beat, Manifest } from "@/types/manifest";

function makeBeat(id: string, scenes: Array<{ approved?: boolean; clipPublicId?: string }>): Beat {
  return {
    beatId: id,
    template: "trailer.hook",
    beatName: "Hook",
    status: "pending",
    archetype: {
      mood: "intimate-hook",
      intent: "establish",
      suggestedDuration: 5,
      directorNotes: "",
    },
    scenes: scenes.map((s, i) => ({
      sceneId: `${id}-s${i}`,
      conversation: [],
      approved: s.approved ?? false,
      clipPublicId: s.clipPublicId,
    })),
  };
}

function makeManifest(beats: Beat[]): Manifest {
  return {
    projectId: "p1",
    videoType: "trailer",
    masterPrompt: "test",
    createdAt: "2026-04-26T00:00:00Z",
    beats,
  };
}

// Minimal cast — selectors only read manifest + activeBeatId, ignoring
// the ~30 mutator methods on the full BeatGraphState shape.
function makeState(over: { manifest?: Manifest | null; activeBeatId?: string | null }) {
  return {
    manifest: over.manifest ?? null,
    activeBeatId: over.activeBeatId ?? null,
  } as Parameters<typeof selectActiveBeat>[0];
}

describe("selectActiveBeat", () => {
  it("returns null when there is no manifest", () => {
    expect(selectActiveBeat(makeState({}))).toBeNull();
  });

  it("returns null when no beat is active", () => {
    const manifest = makeManifest([makeBeat("a", [])]);
    expect(selectActiveBeat(makeState({ manifest, activeBeatId: null }))).toBeNull();
  });

  it("returns null when the active beatId is not in the manifest", () => {
    const manifest = makeManifest([makeBeat("a", [])]);
    expect(selectActiveBeat(makeState({ manifest, activeBeatId: "ghost" }))).toBeNull();
  });

  it("returns the matching beat when activeBeatId is set", () => {
    const manifest = makeManifest([makeBeat("a", []), makeBeat("b", [])]);
    const beat = selectActiveBeat(makeState({ manifest, activeBeatId: "b" }));
    expect(beat?.beatId).toBe("b");
  });
});

describe("selectApprovedClipPublicIds", () => {
  it("returns an empty array when there is no manifest", () => {
    expect(selectApprovedClipPublicIds(makeState({}))).toEqual([]);
  });

  it("returns only public ids from approved scenes that have one", () => {
    const manifest = makeManifest([
      makeBeat("a", [{ approved: true, clipPublicId: "id-a" }]),
      makeBeat("b", [{ approved: false, clipPublicId: "id-b" }]),
      makeBeat("c", [{ approved: true }]), // approved but no public id
      makeBeat("d", [{ approved: true, clipPublicId: "id-d" }]),
    ]);
    expect(selectApprovedClipPublicIds(makeState({ manifest }))).toEqual(["id-a", "id-d"]);
  });

  it("preserves manifest beat order", () => {
    const manifest = makeManifest([
      makeBeat("a", [{ approved: true, clipPublicId: "first" }]),
      makeBeat("b", [{ approved: true, clipPublicId: "second" }]),
      makeBeat("c", [{ approved: true, clipPublicId: "third" }]),
    ]);
    expect(selectApprovedClipPublicIds(makeState({ manifest }))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
