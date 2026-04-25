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
export function CameraRig({ beats, positions, activeBeatId, hoveredBeatId, overviewZ = 5.5, panRef, orbitRef }: CameraRigProps) {
  const { camera } = useThree();
  const overviewPos = useRef(new THREE.Vector3(0, 0.4, overviewZ));
  // Keep overview position in sync with the dynamic overviewZ — without this,
  // the rig would lock the camera to the initial z (5.5 was hardcoded before).
  overviewPos.current.set(0, 0.4, overviewZ);
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

  useFrame((state) => {
    const active = findPosition(activeBeatId);
    const hovered = findPosition(hoveredBeatId);
    const t = state.clock.elapsedTime;

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
      // Phase 3: closer orbit (+0.6 z instead of +1.2) so the planet fills
      // more of the viewport. Slow azimuth drift adds a Nolan-style breath
      // around the active subject.
      const azimuth = !reducedMotion ? Math.sin(t * 0.15) * 0.08 : 0;
      targetPos.current.set(ax + 0.2 + azimuth, ay + 0.4, az + 0.6);
      targetLook.current.set(ax, ay, az);
    } else {
      // ── Free-orbit (left-drag on empty space) ──────────────────────
      // When the user drags on empty space, we orbit the camera around
      // the scene origin (look-at stays at OVERVIEW_LOOK). Spherical
      // coords: rotate position by azimuth (Y axis) and polar (X axis,
      // clamped). Sticky — no decay; Esc / Re-center zeros it.
      const azimuth = orbitRef?.current.azimuth ?? 0;
      const polar = orbitRef?.current.polar ?? 0;
      if (azimuth !== 0 || polar !== 0) {
        const rad = overviewZ;
        const cosPolar = Math.cos(polar);
        const x = rad * Math.sin(azimuth) * cosPolar;
        const z = rad * Math.cos(azimuth) * cosPolar;
        const y = 0.4 + rad * Math.sin(polar) * 0.4;
        targetPos.current.set(x, y, z);
      } else {
        targetPos.current.copy(overviewPos.current);
      }
      targetLook.current.copy(OVERVIEW_LOOK);

      // ── Pan offset (additive, only on overview) ──────────────────────
      // The pan signal lives outside React so middle-drag never re-renders
      // the route tree; we just read & decay the ref each frame.
      if (panRef) {
        const [px, py] = panRef.current.offset;
        targetPos.current.x += px;
        targetPos.current.y += py;
        // Look-at also pans so the user sees the panned target straight-on.
        targetLook.current.x += px;
        targetLook.current.y += py;
        // Decay to 0 only when the user is NOT actively dragging.
        // Lerp 0.04 ≈ ~600ms inertial release. Feels like a real camera
        // settling, not a snap.
        if (!panRef.current.active) {
          panRef.current.offset[0] = THREE.MathUtils.lerp(px, 0, 0.04);
          panRef.current.offset[1] = THREE.MathUtils.lerp(py, 0, 0.04);
        }
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
