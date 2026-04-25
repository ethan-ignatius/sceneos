import type { Beat } from "@/types/manifest";

/**
 * Single source of truth for the canvas beat layout.
 *
 * Both `BeatMap3D` (renders nodes + connecting path) and `CameraRig`
 * (computes glide targets) need each beat's [x, y, z] slot. Keeping the
 * math here prevents silent drift if layout ever changes.
 *
 * Current layout: a symmetric horizontal TIMELINE.
 *   - x: linear sweep, scaled by beat count, centred at 0
 *   - y: 0 (no arch — the previous sin-arch read as "uneven" rather than rhythmic)
 *   - z: 0 (no recession — every beat is the same camera distance, equal weight)
 *
 * Why timeline, not arch: per user direction. A beat-map is a STORY in time;
 * a perfectly symmetric horizontal line reads instantly as "first → last,"
 * the way a film strip or DAW track does. The arch was decorative — the
 * timeline is structural.
 *
 * Spread coefficient 0.85 (was 1.05) keeps all beats inside the default
 * frustum even at 7 beats — outer beats no longer peek off-screen on
 * landscape viewports.
 *
 * Returns a parallel array of [x, y, z] tuples — same length and order
 * as `beats`. Callers can `beats.map((b, i) => …, positions[i])`.
 */
export function computeBeatPositions(beats: Beat[]): Array<[number, number, number]> {
  const total = Math.max(beats.length - 1, 1);
  // Spread coefficient 1.55 (was 0.85). With baseScales now in the 0.6–0.85
  // range (max planet diameter ≈ 0.93), an inter-beat gap of ~1.55 leaves
  // ~0.6 units of breathing room between every planet on a 5-beat layout
  // and ~0.5 units on a 7-beat layout. Below this, neighbours visibly
  // intersect — Earth was clipping into Sun, Saturn's rings into Jupiter.
  return beats.map((_, i) => {
    const t = i / total;
    const x = (t - 0.5) * Math.max(beats.length, 5) * 1.55;
    return [x, 0, 0];
  });
}
