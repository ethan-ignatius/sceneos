import type { Beat } from "@/types/manifest";

/**
 * Single source of truth for the canvas beat layout.
 *
 * Both `BeatMap3D` (renders nodes + connecting path) and `CameraRig`
 * (computes glide targets) need each beat's [x, y, z] slot. Keeping the
 * math here prevents silent drift if layout ever changes.
 *
 * Current layout: beats arranged along a gentle z-recession curve.
 *   - x: linear sweep across the screen, scaled by beat count
 *   - y: sine arch (peaks in the middle)
 *   - z: linear recession away from camera
 *
 * Returns a parallel array of [x, y, z] tuples — same length and order
 * as `beats`. Callers can `beats.map((b, i) => …, positions[i])`.
 */
export function computeBeatPositions(beats: Beat[]): Array<[number, number, number]> {
  const total = Math.max(beats.length - 1, 1);
  return beats.map((_, i) => {
    const t = i / total;
    const x = (t - 0.5) * (beats.length * 1.05);
    const y = Math.sin(t * Math.PI) * 0.45 - 0.1;
    const z = -t * 1.1;
    return [x, y, z];
  });
}
