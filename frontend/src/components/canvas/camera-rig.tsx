import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";

interface CameraRigProps {
  beats: Beat[];
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
export function CameraRig({ beats, activeBeatId, hoveredBeatId }: CameraRigProps) {
  const { camera } = useThree();
  const targetPos = useRef(OVERVIEW_POS.clone());
  const targetLook = useRef(OVERVIEW_LOOK.clone());

  // Beat positions are derived in BeatMap3D from index. We mirror that math
  // here — keeping the layout function in one place would be the right
  // refactor, but for hackathon speed we duplicate.
  const beatPositions = useMemo(() => {
    const total = Math.max(beats.length - 1, 1);
    return beats.map((b, i) => {
      const t = i / total;
      const x = (t - 0.5) * (beats.length * 1.05);
      const y = Math.sin(t * Math.PI) * 0.45 - 0.1;
      const z = -t * 1.1;
      return { id: b.beatId, x, y, z };
    });
  }, [beats]);

  useFrame((state) => {
    const active = activeBeatId ? beatPositions.find((p) => p.id === activeBeatId) : null;
    const hovered = hoveredBeatId ? beatPositions.find((p) => p.id === hoveredBeatId) : null;

    if (active) {
      targetPos.current.set(active.x + 0.2, active.y + 0.4, active.z + 1.2);
      targetLook.current.set(active.x, active.y, active.z);
    } else {
      targetPos.current.copy(OVERVIEW_POS);
      targetLook.current.copy(OVERVIEW_LOOK);
    }

    // Hover offset (≤0.05 units) only when nothing is actively selected —
    // otherwise the active glide dominates and hover would feel jittery.
    if (hovered && !active) {
      targetPos.current.x += hovered.x * 0.025;
      targetPos.current.y += hovered.y * 0.025;
    }

    // Idle breath — sin wave on z, 8s period, ±0.04. Stays subtle but
    // reads as "the scene is breathing."
    const t = state.clock.elapsedTime;
    targetPos.current.z += Math.sin((t / 8) * Math.PI * 2) * 0.04;

    camera.position.lerp(targetPos.current, 0.06);
    // Manually lerp the lookAt target so it doesn't snap when active changes.
    const lookCurrent = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const desired = targetLook.current.clone().sub(camera.position).normalize();
    const blended = lookCurrent.lerp(desired, 0.08).normalize();
    camera.lookAt(camera.position.clone().add(blended));
  });

  return null;
}
