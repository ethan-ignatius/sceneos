import * as THREE from "three";
import type { Beat } from "@/types/manifest";

/**
 * Single source of truth for the canvas beat layout.
 *
 * Both `BeatMap3D` (renders nodes + connecting path) and `CameraRig`
 * (computes glide targets) need each beat's [x, y, z] slot. Keeping the
 * math here prevents silent drift if layout ever changes.
 *
 * The journey is a 3D spline that SNAKES through space. From the default
 * camera angle (looking down -z) the y/z modulation foreshortens, so the
 * row reads as a horizontal timeline at first glance. Tilt the camera
 * (left-drag-orbit) and the snake reveals itself — that's the "windy
 * road of checkpoints" feel.
 *
 * Spline construction:
 *   - x:  linear sweep across the journey, centred at 0
 *   - y:  sin(3πt) × YAMP — slow vertical S-curve, three crests across
 *   - z:  sin(2πt + φ) × ZAMP — out-of-phase forward/back wave so
 *         neighbouring beats are NOT at the same camera distance
 *
 * A Catmull-Rom curve through these control points becomes the canonical
 * journey path. Beats sample at evenly-spaced arc-length parameters via
 * `getPointAt(i / (n-1))` so the spacing along the curve is uniform —
 * NOT just uniform on the parameter t (which would bunch beats at sharp
 * bends). This is the centripetal type's whole point.
 *
 * Both `computeBeatPositions(beats)` and `buildJourneyCurve(beats)`
 * must be in sync — the curve is what the camera traverses, the
 * positions are where the planets sit. Same source data, two views.
 */

// Tuning constants. Pulled out so the camera rig can reference the same
// amplitudes when composing camera distances.
//
// Shoulder-view tuning: the camera sits at planet height, side-on. The
// path reads as an adventure-map road IF z-modulation is generous (the
// snake's swerve is what we see from this angle) and y-modulation is
// gentle (we're at planet height, so big y-bobs would put planets above
// or below the camera and break the "walking past them" feel).
//
// X_SPREAD = 2.1 (was 1.55) — clear separation between adjacent planets
// at the shoulder angle, so they don't visually overlap.
// Y_AMPLITUDE = 0.25 (was 0.55) — gentle roller-coaster, not big swings.
// Z_AMPLITUDE = 1.8 (was 1.4) — pronounced enough that orbiting from
// above or behind reveals the snake clearly, but not so wild that the
// shoulder-view side perspective puts back planets way behind front ones.
const X_SPREAD = 2.1;
const Y_AMPLITUDE = 0.25;
const Z_AMPLITUDE = 1.8;
// Phase offset on z so the y-wave and z-wave aren't synchronised — gives
// the path real 3D character instead of a 2D zig-zag traced into the y-z
// plane. (π/3 = the y-peak coincides with a z-zero-crossing.)
const Z_PHASE = Math.PI / 3;
// Arc-length subdivision count when querying getPointAt — Three.js
// builds a lookup table internally; 200 is enough resolution for our
// 5–12 beat journeys without measurable per-frame cost.
const ARC_LENGTH_DIVISIONS = 200;

/** Build a camera-traversable Catmull-Rom curve for the beat list. */
export function buildJourneyCurve(beats: Beat[]): THREE.CatmullRomCurve3 {
  const n = Math.max(beats.length, 2);
  // We oversample the spline with MORE control points than beats so the
  // path has real curvature between every pair of beats (otherwise a
  // 5-beat curve has only 4 segments and bends only at the beats).
  const controlPoints: THREE.Vector3[] = [];
  const SAMPLES = Math.max(n * 3, 8);
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const x = (t - 0.5) * Math.max(beats.length, 5) * X_SPREAD;
    const y = Math.sin(t * Math.PI * 3) * Y_AMPLITUDE;
    const z = Math.sin(t * Math.PI * 2 + Z_PHASE) * Z_AMPLITUDE;
    controlPoints.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.5);
  curve.arcLengthDivisions = ARC_LENGTH_DIVISIONS;
  return curve;
}

/**
 * Beat positions = evenly arc-length-spaced samples along the journey
 * curve. NOT just `t = i / (n-1)` because at sharp bends a uniform-t
 * walk bunches points; getPointAt re-parameterises to true arc length.
 *
 * Returns a parallel array of [x, y, z] tuples — same length and order
 * as `beats`. Callers can `beats.map((b, i) => …, positions[i])`.
 */
export function computeBeatPositions(beats: Beat[]): Array<[number, number, number]> {
  if (beats.length === 0) return [];
  if (beats.length === 1) return [[0, 0, 0]];
  const curve = buildJourneyCurve(beats);
  const total = beats.length - 1;
  return beats.map((_, i) => {
    const t = i / total;
    const p = curve.getPointAt(t);
    return [p.x, p.y, p.z];
  });
}

/**
 * Get the spline parameter t in [0, 1] for a given beat index. Used by
 * the camera rig to glide TO an active beat by setting `progressRef.t`
 * directly to this value (so the camera ends up on the path, not on a
 * straight line from camera-origin to beat-centre).
 */
export function beatTraversalT(beats: Beat[], beatIndex: number): number {
  if (beats.length <= 1) return 0;
  return beatIndex / (beats.length - 1);
}
