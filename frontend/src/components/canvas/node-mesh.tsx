import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";

interface NodeMeshProps {
  beat: Beat;
  position: [number, number, number];
  index: number;
}

/**
 * Single node in the beat map. Idle = breathing scale. Active = ember glow + pulse.
 * Approved = ember-saturated steady state. Hover = bloom contribution rises.
 *
 * v0 uses standard meshStandardMaterial; later we'll move the glow to a shader pass
 * via @react-three/postprocessing's SelectiveBloom.
 */
export function NodeMesh({ beat, position }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const isActive = activeBeatId === beat.beatId;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    const breath = 1 + Math.sin(t * 0.9) * 0.02;
    const hoverBoost = hover ? 1.06 : 1;
    const activeBoost = isActive ? 1.15 : 1;
    const target = breath * hoverBoost * activeBoost;
    meshRef.current.scale.setScalar(target);

    if (materialRef.current) {
      const baseEmissive = beat.status === "approved" ? 0.45 : isActive ? 0.6 : hover ? 0.25 : 0.08;
      materialRef.current.emissiveIntensity = baseEmissive + Math.sin(t * 1.6) * 0.04;
    }
  });

  const color = beat.status === "approved" ? "#f0a868" : isActive ? "#f0a868" : "#9aa6ad";
  const emissive = beat.status === "approved" ? "#f0a868" : isActive ? "#ffb470" : "#5e7080";

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveBeat(beat.beatId);
        }}
      >
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={emissive}
          emissiveIntensity={0.15}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      <Html center position={[0, 0.95, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap font-display text-sm italic"
          style={{
            color: isActive ? "#f0a868" : "#c5b9a8",
            textShadow: "0 1px 8px rgba(0,0,0,0.6)",
          }}
        >
          {beat.beatName}
        </div>
      </Html>
    </group>
  );
}
