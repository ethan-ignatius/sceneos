import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

interface CameraRigProps {
  beats: Beat[];
  /** Parallel array of [x, y, z] from `computeBeatPositions(beats)`. */
  positions: Array<[number, number, number]>;
  activeBeatId: string | null;
  hoveredBeatId: string | null;
}

const OVERVIEW_POS = new THREE.Vector3(0, 0.4, 5.5);
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
export function CameraRig({ beats, positions, activeBeatId, hoveredBeatId }: CameraRigProps) {
  const { camera } = useThree();
  const targetPos = useRef(OVERVIEW_POS.clone());
  const targetLook = useRef(OVERVIEW_LOOK.clone());
  const reducedMotion = usePrefersReducedMotion();

  const findPosition = (beatId: string | null) => {
    if (!beatId) return null;
    const i = beats.findIndex((b) => b.beatId === beatId);
    return i === -1 ? null : positions[i];
  };

  useFrame((state) => {
    const active = findPosition(activeBeatId);
    const hovered = findPosition(hoveredBeatId);

    if (active) {
      const [ax, ay, az] = active;
      targetPos.current.set(ax + 0.2, ay + 0.4, az + 1.2);
      targetLook.current.set(ax, ay, az);
    } else {
      targetPos.current.copy(OVERVIEW_POS);
      targetLook.current.copy(OVERVIEW_LOOK);
    }

    // Hover offset (≤0.05 units) only when nothing is actively selected —
    // otherwise the active glide dominates and hover would feel jittery.
    if (hovered && !active) {
      const [hx, hy] = hovered;
      targetPos.current.x += hx * 0.025;
      targetPos.current.y += hy * 0.025;
    }

    // Idle breath — sin wave on z, 8s period, ±0.04. Stays subtle but
    // reads as "the scene is breathing." Skipped under reduced-motion;
    // for vestibular-sensitive users the camera should hold still.
    if (!reducedMotion) {
      const t = state.clock.elapsedTime;
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
