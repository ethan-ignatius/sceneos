import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import * as THREE from "three";
import { useAtmosphereMaterial } from "@/components/canvas/atmosphere-material";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Single drifting cinematic orb that sits in the top-right of the landing
 * grid. Anchors the brand from frame one — the canvas-as-product idea is
 * present before the user types anything.
 *
 * One R3F canvas, one sphere, atmosphere shell, two soft lights. Costs less
 * than a low-quality YouTube embed; carries 80% of the "premium 3D portfolio"
 * read.
 */
export function AmbientOrb() {
  return (
    <Canvas
      // Pull the camera back from 3.2 to 4.4 so the atmosphere shell (1.2×
      // the sphere radius) fits comfortably inside the 38° vfov frustum
      // with margin. Previous setup had the halo's silhouette tangent to
      // the canvas edge — visually clipped on every render.
      camera={{ position: [0, 0, 4.4], fov: 38 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.55} />
        <pointLight position={[3, 2, 4]} intensity={2.4} color="#f0a868" />
        <pointLight position={[-3, -1, 2]} intensity={1.0} color="#5e7080" />
        <DriftingOrb />
      </Suspense>
    </Canvas>
  );
}

function DriftingOrb() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const reducedMotion = usePrefersReducedMotion();
  const atmosphere = useAtmosphereMaterial({
    glowColor: "#f0a868",
    falloff: 0.1,
    glowInternalRadius: 4.2,
    glowSharpness: 0.6,
    opacity: 0.95,
  });

  useFrame((state) => {
    if (reducedMotion) return;
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      // Slow orbital drift — never stops, never repeats.
      groupRef.current.position.x = Math.sin(t * 0.18) * 0.18;
      groupRef.current.position.y = Math.cos(t * 0.13) * 0.12;
      groupRef.current.rotation.y = t * 0.08;
    }
    if (meshRef.current) {
      const breath = 1 + Math.sin(t * 0.7) * 0.025;
      meshRef.current.scale.setScalar(breath);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Atmosphere shell */}
      <mesh scale={1.2}>
        <sphereGeometry args={[1, 48, 48]} />
        <primitive object={atmosphere} attach="material" />
      </mesh>
      {/* Glowing core */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color="#a87447"
          emissive="#f0a868"
          emissiveIntensity={1.1}
          roughness={0.45}
          metalness={0.4}
        />
      </mesh>
    </group>
  );
}
