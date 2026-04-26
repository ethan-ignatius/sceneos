import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Camera pan state shared between BeatMap3D (writes from pointer events)
 * and CameraRig (reads each frame, applies + decays). Lives in a ref so
 * dragging never triggers React renders.
 */
export interface PanState {
  /** World-unit XY offset added to the overview target. */
  offset: [number, number];
  /** True while the user is actively middle-dragging. */
  active: boolean;
}

/**
 * Free-orbit state. Left-click-and-hold on empty space rotates the camera
 * around the scene origin (Maya / Blender convention). Sticky — does NOT
 * decay on release; only Esc / Re-center zeros it.
 *   azimuth   horizontal rotation, radians
 *   polar     vertical rotation, radians, clamped ±0.6 to avoid flipping
 *   didDrag   set true when the gesture exceeded the click-vs-drag threshold;
 *             read by R3F's onPointerMissed to suppress the
 *             "click-on-empty-deactivates-beat" behaviour after a drag.
 */
export interface OrbitState {
  azimuth: number;
  polar: number;
  active: boolean;
  didDrag: boolean;
}

/**
 * Scroll-wheel zoom state. Lives outside React for the same reason pan +
 * orbit do — wheel events shouldn't trigger route re-renders. Range is
 * clamped to [-3, +5] world units of z-offset added to the overview Z.
 * Negative = zoom in (camera closer); positive = zoom out (further away).
 * Reset on Esc / Re-center.
 */
export interface ZoomState {
  z: number;
}

interface CameraRigProps {
  beats: Beat[];
  /** Parallel array of [x, y, z] from `computeBeatPositions(beats)`. */
  positions: Array<[number, number, number]>;
  activeBeatId: string | null;
  hoveredBeatId: string | null;
  /** Camera z when no beat is active. Computed from beats.length so outer
   *  beats stay in frustum (issue #161). */
  overviewZ?: number;
  /** Pan state ref written from BeatMap3D's middle-mouse handler. */
  panRef?: MutableRefObject<PanState>;
  /** Orbit state ref written from BeatMap3D's left-mouse-on-empty handler. */
  orbitRef?: MutableRefObject<OrbitState>;
  /** Zoom state ref written from BeatMap3D's wheel handler. */
  zoomRef?: MutableRefObject<ZoomState>;
}

const OVERVIEW_LOOK = new THREE.Vector3(0, 0, 0);

/**
 * Custom camera rig that replaces OrbitControls.
 *
 * Each frame we recompute targetPos + targetLook from app state
 * (activeBeatId + hoveredBeatId), then lerp the camera toward them.
 * This naturally handles a user redirecting clicks mid-glide — the
 * target just changes; the interpolator chases.
 *
 * Three superimposed signals on the position target:
 *   1. Active node target  → (node + offset) when something is selected.
 *   2. Hover offset (≤0.05) → tiny pull toward hovered node when not active.
 *   3. Idle breath (sin / 8s) → ±0.04 on z, gives the scene "alive" feel.
 *
 * Rationale for not using GSAP: see docs/CANVAS_3D.md §2. Per-frame
 * lerping handles continuous, multi-source state better than tweens.
 */
export function CameraRig({ beats, positions, activeBeatId, hoveredBeatId, overviewZ = 5.5, panRef, orbitRef, zoomRef }: CameraRigProps) {
  const { camera } = useThree();
  // overviewPos is mutated each frame inside useFrame so it picks up the
  // live wheel-zoom offset — reading zoomRef at render time only would
  // freeze the scroll-wheel value (the ref updates outside React, so a
  // wheel event won't trigger a re-render to refresh the closure).
  //
  // Shoulder-view: camera sits AT PLANET HEIGHT (y=0.5, just above the
  // path's centerline so we look slightly down ON the planets) on the +z
  // side of the journey, looking at the journey midpoint. Reads as
  // "walking alongside the planets." y=1.6 was too high — felt like a
  // drone view, not a shoulder view.
  const overviewPos = useRef(new THREE.Vector3(0, 0.5, overviewZ));
  const targetPos = useRef(overviewPos.current.clone());
  const targetLook = useRef(OVERVIEW_LOOK.clone());
  const reducedMotion = usePrefersReducedMotion();
  // Track previous active so we can clear pan exactly when a beat becomes active
  // (one-shot, not every frame — prevents the rig from fighting an active drag).
  const prevActiveRef = useRef<string | null>(null);

  const findPosition = (beatId: string | null) => {
    if (!beatId) return null;
    const i = beats.findIndex((b) => b.beatId === beatId);
    return i === -1 ? null : positions[i];
  };

  /**
   * Returns the position of the NEXT beat in the journey, used as the
   * lookAt anchor when active. For the LAST beat, extrapolates one step
   * forward along the journey direction so the camera still has a
   * "looking ahead" axis to angle toward.
   *
   * Per user direction — when active beat is N, the camera's view
   * direction should aim TOWARD beat N+1, not directly at N. The active
   * planet ends up in the foreground, the next-up planet is the visual
   * destination of the eye. Reads as "we're traveling, looking at
   * what's coming next, with the current planet right in front of us."
   */
  const findNextAnchor = (beatId: string | null): [number, number, number] | null => {
    if (!beatId) return null;
    const i = beats.findIndex((b) => b.beatId === beatId);
    if (i === -1) return null;
    if (i === beats.length - 1) {
      // Last beat — extrapolate one step FORWARD using the vector from
      // beat N-1 to beat N (or a default if there's only one beat).
      const cur = positions[i];
      const prev = positions[i - 1] ?? [cur[0] - 2, cur[1], cur[2]];
      const dx = cur[0] - prev[0];
      const dy = cur[1] - prev[1];
      const dz = cur[2] - prev[2];
      return [cur[0] + dx, cur[1] + dy, cur[2] + dz];
    }
    return positions[i + 1];
  };

  useFrame((state) => {
    const active = findPosition(activeBeatId);
    const hovered = findPosition(hoveredBeatId);
    const t = state.clock.elapsedTime;
    // Read the LIVE zoom offset from the ref each frame. Wheel events
    // mutate this ref directly without triggering a React render, so we
    // can't capture it at render time.
    const zoomOffset = zoomRef?.current.z ?? 0;
    const effectiveZ = Math.max(2.5, overviewZ + zoomOffset);
    // Shoulder-view: y=0.5 (planet-height + slight elevation), z=+effectiveZ
    // (looking from in front of the journey toward midpoint).
    overviewPos.current.set(0, 0.5, effectiveZ);

    // ── Pan: clear instantly when transitioning from no-active → active ──
    // Clicking a beat is a deliberate cinematographic move; any residual pan
    // offset would feel like a missed cut. Zero it.
    if (panRef && activeBeatId && activeBeatId !== prevActiveRef.current) {
      panRef.current.offset[0] = 0;
      panRef.current.offset[1] = 0;
    }
    prevActiveRef.current = activeBeatId;

    if (active) {
      const [ax, ay, az] = active;
      // Active-beat camera framing — adventure-map composition:
      //   1. Camera looks DIRECTLY AT the next planet in the journey,
      //      so the visible horizon reads as "ahead, traveling forward."
      //   2. Camera position is offset right (in camera-space) so the
      //      active planet projects into the LEFT third of the viewport,
      //      with next at viewport-center down the journey axis.
      //   3. Active stays large in the foreground; next is the visible
      //      destination.
      //
      // Right-vector math:
      //   forward = (next − active).normalised
      //   In Three.js's right-handed system with worldUp=(0,1,0),
      //   camera-right (world) = forward × up = (-fz, 0, fx).
      //   The previous build used (fz, 0, -fx) which is up × forward —
      //   that's camera-LEFT in world coords, so a positive drawerMag
      //   shifted the camera LEFT and the active planet ended up on
      //   the SCREEN RIGHT (the bug the user flagged).
      //
      // Position math:
      //   camera = active
      //          − forward × 1.6     (pull back)
      //          + right   × drawerMag (shift camera-right →
      //                                 active projects to LEFT)
      //          + worldUp × 0.45    (slight elevation, looking down
      //                               on the journey plane)
      //   lookAt = next              (camera AIMS at next directly,
      //                               not at active+ε — gives the
      //                               "traveling forward" trajectory)
      //
      // drawerMag tuning: 1.0 desktop puts active at ~−18° horizontal
      // (left third of viewport), next at viewport-center. 0.5 mobile
      // because the drawer is a bottom-sheet on mobile, not a side
      // panel, so the right-shift only needs to land the active in
      // a tasteful left-of-center, not clear of an overlay.
      const next = findNextAnchor(activeBeatId);
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
      const drawerMag = isDesktop ? 1.0 : 0.5;
      const breath = !reducedMotion ? Math.sin(t * 0.15) * 0.08 : 0;
      if (next) {
        const [nx, ny, nz] = next;
        const fx = nx - ax, fy = ny - ay, fz = nz - az;
        const fmag = Math.max(Math.sqrt(fx * fx + fy * fy + fz * fz), 0.001);
        const fNx = fx / fmag, fNy = fy / fmag, fNz = fz / fmag;
        // Corrected camera-right: forward × up = (-fNz, 0, fNx).
        let rx = -fNz, rz = fNx;
        const rmag = Math.sqrt(rx * rx + rz * rz);
        if (rmag < 0.001) {
          // Forward is nearly vertical — degenerate case. Default to
          // world +X as the right axis so we don't divide by zero.
          rx = 1; rz = 0;
        } else {
          rx /= rmag; rz /= rmag;
        }
        const drx = rx * drawerMag, drz = rz * drawerMag;
        // Camera: pull back along -forward by 1.6, lift, shift camera-right.
        targetPos.current.set(
          ax - fNx * 1.6 + drx + breath,
          ay - fNy * 1.6 + 0.45,
          az - fNz * 1.6 + drz,
        );
        // LookAt: aim DIRECTLY at next so the camera's view axis reads
        // as forward motion through the journey. Active lands in the
        // left foreground naturally because the camera is shifted right.
        targetLook.current.set(nx, ny, nz);
      } else {
        // Defensive fallback — shouldn't fire because findNextAnchor
        // has the last-beat extrapolation, but keeps the rig robust.
        targetPos.current.set(ax - 0.7 + breath, ay + 0.45, az + 1.7);
        targetLook.current.set(ax, ay, az);
      }
    } else {
      // ── Free-orbit (left-drag on empty space) ──────────────────────
      // When the user drags on empty space, we orbit the camera around
      // the scene origin (look-at stays at OVERVIEW_LOOK). Spherical
      // coords: rotate position by azimuth (Y axis) and polar (X axis,
      // clamped). Sticky — no decay; Esc / Re-center zeros it.
      const azimuth = orbitRef?.current.azimuth ?? 0;
      const polar = orbitRef?.current.polar ?? 0;
      if (azimuth !== 0 || polar !== 0) {
        // Shoulder-view orbit: default (azimuth=0, polar=0) lands the
        // camera at (0, 0.5, +rad) — the shoulder-view spot in front of
        // the journey. Positive azimuth orbits clockwise around y from
        // there. Polar tilts the camera up/down from the y=0.5 baseline.
        const rad = effectiveZ;
        const cosPolar = Math.cos(polar);
        const x = rad * Math.sin(azimuth) * cosPolar;
        const z = rad * Math.cos(azimuth) * cosPolar;
        const y = 0.5 + rad * Math.sin(polar) * 0.4;
        targetPos.current.set(x, y, z);
      } else {
        targetPos.current.copy(overviewPos.current);
      }
      targetLook.current.copy(OVERVIEW_LOOK);

      // ── Pan offset (additive, only on overview) ──────────────────────
      // STICKY pan: where you dragged to is where you stay. The previous
      // build decayed the offset back to 0 over ~600ms post-release, which
      // read as "the camera fights me" — exactly what the user flagged
      // ("dragging behaviour is really hard"). Esc / Re-center / clicking
      // a beat all reset the pan; nothing else does.
      if (panRef) {
        const [px, py] = panRef.current.offset;
        targetPos.current.x += px;
        targetPos.current.y += py;
        targetLook.current.x += px;
        targetLook.current.y += py;
      }

      // Hover offset (≤0.05 units) only when nothing is actively selected —
      // otherwise the active glide dominates and hover would feel jittery.
      // Suppressed during pan so the camera doesn't fight the user's drag.
      const isPanning = panRef?.current.active ?? false;
      if (hovered && !isPanning) {
        const [hx, hy] = hovered;
        targetPos.current.x += hx * 0.025;
        targetPos.current.y += hy * 0.025;
      }
    }

    // Idle breath — sin wave on z, 8s period, ±0.04. Stays subtle but
    // reads as "the scene is breathing." Skipped under reduced-motion;
    // for vestibular-sensitive users the camera should hold still.
    if (!reducedMotion) {
      targetPos.current.z += Math.sin((t / 8) * Math.PI * 2) * 0.04;
    }

    camera.position.lerp(targetPos.current, 0.06);
    // Lerp the lookAt direction so it doesn't snap when active changes.
    const lookCurrent = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const desired = targetLook.current.clone().sub(camera.position).normalize();
    const blended = lookCurrent.lerp(desired, 0.08).normalize();
    camera.lookAt(camera.position.clone().add(blended));
  });

  return null;
}
