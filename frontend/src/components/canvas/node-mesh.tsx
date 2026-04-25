import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

interface NodeMeshProps {
  beat: Beat;
  position: [number, number, number];
  /** Reports hover changes up to BeatMap3D so the camera rig can react. */
  onHoverChange?: (beatId: string | null) => void;
}

/**
 * One node in the beat map. Five visual states, all derived from beat.status:
 *   - idle (pending)         → subtle scale breath, low emissive
 *   - hover                  → +6% scale, halo grows, emissive 0.25
 *   - active (selected)      → +15% scale, group +0.4z forward, ember saturated
 *   - approved               → ember-saturated steady, no breath
 *   - ready-to-generate      → ember-pulse on emissiveIntensity (1.6s loop)
 *
 * Implementation notes (see docs/CANVAS_3D.md §3):
 *   - We animate groupRef.position.z, not meshRef, so the <Html> label
 *     tracks the active offset cleanly.
 *   - Halo is its own additive-blended mesh slightly larger than the main
 *     sphere — composes naturally with the bloom postprocess pass.
 *   - Click toggles: clicking the active node deselects (returns to overview).
 */
export function NodeMesh({ beat, position, onHoverChange }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const isActive = activeBeatId === beat.beatId;
  const isApproved = beat.status === "approved";
  const isReady = beat.status === "ready-to-generate";
  const reducedMotion = usePrefersReducedMotion();

  const [slotX, slotY, slotZ] = position;

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // ── Scale on the inner mesh ──
    // Under reduced-motion: skip the breathing sine and the dramatic
    // active +15% boost. Hover still scales subtly so the affordance
    // is preserved for keyboard/pointer users.
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.02 : 1;
    const hoverBoost = hover ? 1.06 : 1;
    const activeBoost = isActive ? (reducedMotion ? 1.06 : 1.15) : 1;
    const approvedScale = isApproved ? 1.12 : 1;
    const target = breath * hoverBoost * activeBoost * approvedScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);

    // ── Group z-offset: active steps forward toward camera (+0.4 on top of slotZ) ──
    if (groupRef.current) {
      // Under reduced-motion, hold the node at its slot — no z drift.
      const desiredZ = slotZ + (isActive && !reducedMotion ? 0.4 : 0);
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        desiredZ,
        0.12,
      );
    }

    // ── Emissive intensity ──
    let baseEmissive: number;
    if (isApproved) baseEmissive = 0.5;
    else if (isActive) baseEmissive = 0.6;
    else if (hover) baseEmissive = 0.25;
    else baseEmissive = 0.08;

    // ready-to-generate beats pulse — guidance cue ("the next click is hot").
    const pulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.18 + 0.18 : 0;
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = baseEmissive + pulse;
    }

    // ── Halo (additive, grows with hover/active, pulses on ready) ──
    const haloScale = isActive ? 1.55 : hover ? 1.32 : 1.18;
    const haloOpacity =
      (isActive ? 0.22 : hover ? 0.14 : 0.05) +
      (isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.06 + 0.06 : 0);
    if (haloRef.current) haloRef.current.scale.setScalar(haloScale);
    if (haloMatRef.current) haloMatRef.current.opacity = haloOpacity;
  });

  const baseColor = isApproved || isActive ? "#f0a868" : "#9aa6ad";
  const emissiveColor = isApproved ? "#f0a868" : isActive ? "#ffb470" : "#5e7080";

  return (
    <group ref={groupRef} position={[slotX, slotY, slotZ]}>
      {/* Halo — additive blending, larger than main sphere, no depth-write
          so it composes cleanly with bloom. */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color="#f0a868"
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Main node sphere. */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          onHoverChange?.(beat.beatId);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          onHoverChange?.(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Toggle: clicking the active node returns to overview.
          setActiveBeat(isActive ? null : beat.beatId);
        }}
      >
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={0.15}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      <Html center position={[0, 0.95, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap font-display text-sm italic"
          style={{
            color: isActive || isApproved ? "#f0a868" : "#c5b9a8",
            textShadow: "0 1px 8px rgba(0,0,0,0.6)",
            transition: "color 200ms ease",
          }}
        >
          {beat.beatName}
        </div>
      </Html>
    </group>
  );
}
