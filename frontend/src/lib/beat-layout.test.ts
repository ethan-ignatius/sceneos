import { describe, it, expect } from "vitest";
import { computeBeatPositions, beatTraversalT, buildJourneyCurve } from "./beat-layout";
import type { Beat } from "@/types/manifest";

function makeBeat(id: string): Beat {
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
    scenes: [{ sceneId: `${id}-s1`, conversation: [], approved: false }],
  };
}

describe("computeBeatPositions", () => {
  it("returns an empty array for zero beats", () => {
    expect(computeBeatPositions([])).toEqual([]);
  });

  it("places a single beat at the origin", () => {
    expect(computeBeatPositions([makeBeat("a")])).toEqual([[0, 0, 0]]);
  });

  it("returns parallel array same length as beats", () => {
    const beats = ["a", "b", "c", "d", "e"].map(makeBeat);
    const positions = computeBeatPositions(beats);
    expect(positions).toHaveLength(beats.length);
    positions.forEach(([x, y, z]) => {
      expect(typeof x).toBe("number");
      expect(typeof y).toBe("number");
      expect(typeof z).toBe("number");
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    });
  });

  it("monotonically advances on x for a 5-beat journey", () => {
    const beats = ["a", "b", "c", "d", "e"].map(makeBeat);
    const positions = computeBeatPositions(beats);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i][0]).toBeGreaterThan(positions[i - 1][0]);
    }
  });

  it("first and last beats anchor the spline endpoints", () => {
    const beats = ["a", "b", "c", "d"].map(makeBeat);
    const positions = computeBeatPositions(beats);
    // Symmetric around x = 0 because the spline is centred.
    expect(positions[0][0]).toBeLessThan(0);
    expect(positions[positions.length - 1][0]).toBeGreaterThan(0);
  });

  it("is deterministic — same input, same output", () => {
    const beats = ["a", "b", "c"].map(makeBeat);
    const a = computeBeatPositions(beats);
    const b = computeBeatPositions(beats);
    expect(a).toEqual(b);
  });
});

describe("beatTraversalT", () => {
  it("returns 0 for a single-beat journey", () => {
    expect(beatTraversalT([makeBeat("a")], 0)).toBe(0);
  });

  it("returns 0 for the first beat and 1 for the last", () => {
    const beats = ["a", "b", "c", "d", "e"].map(makeBeat);
    expect(beatTraversalT(beats, 0)).toBe(0);
    expect(beatTraversalT(beats, beats.length - 1)).toBe(1);
  });

  it("evenly spaces traversal parameters across the journey", () => {
    const beats = ["a", "b", "c", "d", "e"].map(makeBeat);
    const ts = beats.map((_, i) => beatTraversalT(beats, i));
    // Differences should be equal (1/(n-1)).
    const expectedStep = 1 / (beats.length - 1);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i] - ts[i - 1]).toBeCloseTo(expectedStep, 10);
    }
  });
});

describe("buildJourneyCurve", () => {
  it("returns a Catmull-Rom curve that responds to getPointAt", () => {
    const beats = ["a", "b", "c"].map(makeBeat);
    const curve = buildJourneyCurve(beats);
    const start = curve.getPointAt(0);
    const end = curve.getPointAt(1);
    expect(start.x).toBeLessThan(end.x);
  });
});
