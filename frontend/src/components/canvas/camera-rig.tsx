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
  const overviewPos = useRef(new THREE.Vector3(0, 0.4, overviewZ));
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
    // Read the LIVE zoom offset from the ref each frame. Wheel events
    // mutate this ref directly without triggering a React render, so we
    // can't capture it at render time.
    const zoomOffset = zoomRef?.current.z ?? 0;
    const effectiveZ = Math.max(2.5, overviewZ + zoomOffset);
    overviewPos.current.set(0, 0.4, effectiveZ);

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
      // Drawer-aware offset: on desktop (md+, where the drawer is a fixed
      // ~34rem panel anchored to the right edge), the active planet should
      // sit in the LEFT half of the viewport so the drawer doesn't cover
      // it. Shifting both camera position AND lookAt by the same amount
      // preserves the look direction; only the framing shifts.
      // 1.4 world units ≈ ~28% of the viewport width at our zoom — matches
      // the drawer's screen footprint, so the planet ends up centered in
      // the not-drawer area rather than behind it.
      // On mobile, the drawer is a bottom sheet; no horizontal shift needed.
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
      const drawerOffsetX = isDesktop ? 1.4 : 0;
      const azimuth = !reducedMotion ? Math.sin(t * 0.15) * 0.08 : 0;
      targetPos.current.set(ax + 0.35 + drawerOffsetX + azimuth, ay + 0.25, az + 1.9);
      targetLook.current.set(ax + drawerOffsetX, ay, az);
    } else {
      // ── Free-orbit (left-drag on empty space) ──────────────────────
      // When the user drags on empty space, we orbit the camera around
      // the scene origin (look-at stays at OVERVIEW_LOOK). Spherical
      // coords: rotate position by azimuth (Y axis) and polar (X axis,
      // clamped). Sticky — no decay; Esc / Re-center zeros it.
      const azimuth = orbitRef?.current.azimuth ?? 0;
      const polar = orbitRef?.current.polar ?? 0;
      if (azimuth !== 0 || polar !== 0) {
        // Orbit radius uses effectiveZ so wheel-zoom and orbit compose:
        // user can rotate AND zoom simultaneously without one fighting
        // the other. Without this the rotation would always be at the
        // base distance and zoom-while-rotating felt broken.
        const rad = effectiveZ;
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
