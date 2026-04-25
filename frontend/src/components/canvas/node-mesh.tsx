import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useAtmosphereMaterial } from "./atmosphere-material";

interface NodeMeshProps {
  beat: Beat;
  position: [number, number, number];
  /** Reports hover changes up to BeatMap3D so the camera rig can react. */
  onHoverChange?: (beatId: string | null) => void;
}

/**
 * One glowing planet-orb in the beat map. Three concentric layers per the
 * planetary research (docs/RESEARCH_PLANETARY.md):
 *
 *   1. Core sphere — `meshStandardMaterial` with strong emissive baseline
 *      so the orb is unconditionally legible, plus mild metalness for a
 *      reflective sheen when an Environment preset is in scope.
 *   2. Atmosphere shell — back-side-rendered slightly larger sphere using
 *      the lifted FakeGlowMaterial fresnel shader (see
 *      `atmosphere-material.tsx`). This is the single biggest visual upgrade
 *      from the previous flat halo.
 *   3. Active accent — drei `<Sparkles>` only when this node is selected;
 *      replaces a static decorative halo with depth-cued particles around
 *      the focused planet.
 *
 * State machine still derives from beat.status: pending → questioning →
 * ready-to-generate → generating → preview → approved.
 */
export function NodeMesh({ beat, position, onHoverChange }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereMatRef = useRef<THREE.ShaderMaterial>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const isActive = activeBeatId === beat.beatId;
  const isApproved = beat.status === "approved";
  const isReady = beat.status === "ready-to-generate";
  const reducedMotion = usePrefersReducedMotion();

  const [slotX, slotY, slotZ] = position;

  // Per-state palette — pending nodes still glow warm bronze (visible), not
  // grey (invisible). Active/approved go full ember.
  const palette = useMemo(() => {
    if (isApproved) {
      return {
        core: "#f0a868",
        emissive: "#ffb874",
        atmosphere: "#f0a868",
      };
    }
    if (isActive) {
      return {
        core: "#f0a868",
        emissive: "#ffc080",
        atmosphere: "#ffb874",
      };
    }
    if (isReady) {
      return {
        core: "#d4a373",
        emissive: "#f0a868",
        atmosphere: "#f0a868",
      };
    }
    return {
      // pending — warm bronze, *not* the old grey-blue
      core: "#a87447",
      emissive: "#c5895a",
      atmosphere: "#a87447",
    };
  }, [isActive, isApproved, isReady]);

  // Stable atmosphere material — uniforms mutated each frame for color/opacity.
  const atmosphereMat = useAtmosphereMaterial({
    glowColor: palette.atmosphere,
    falloff: 0.1,
    glowInternalRadius: 4.5,
    glowSharpness: 0.5,
    opacity: 1.0,
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // ── Core scale (subtle breath; dampened under reduced-motion) ──
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.025 : 1;
    const hoverBoost = hover ? 1.07 : 1;
    const activeBoost = isActive ? (reducedMotion ? 1.06 : 1.18) : 1;
    const approvedScale = isApproved ? 1.12 : 1;
    const target = breath * hoverBoost * activeBoost * approvedScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);

    // ── Group z-offset: active steps forward toward camera ──
    if (groupRef.current) {
      const desiredZ = slotZ + (isActive && !reducedMotion ? 0.4 : 0);
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        desiredZ,
        0.12,
      );
    }

    // ── Core emissive intensity: high baseline so the orb is always visible ──
    let baseEmissive: number;
    if (isApproved) baseEmissive = 1.0;
    else if (isActive) baseEmissive = 1.3;
    else if (isReady) baseEmissive = 0.85;
    else if (hover) baseEmissive = 0.7;
    else baseEmissive = 0.55;

    const pulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.25 + 0.25 : 0;
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = baseEmissive + pulse;
      materialRef.current.color.set(palette.core);
      materialRef.current.emissive.set(palette.emissive);
    }

    // ── Atmosphere uniforms (mutate, never recreate) ──
    if (atmosphereMatRef.current) {
      const uniforms = atmosphereMatRef.current.uniforms;
      const baseOpacity =
        isActive ? 0.95 : isReady ? 0.8 : hover ? 0.7 : 0.5;
      const readyPulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.15 + 0.15 : 0;
      uniforms.opacity.value = baseOpacity + readyPulse;
      (uniforms.glowColor.value as THREE.Color).set(palette.atmosphere);
    }
  });

  return (
    <group ref={groupRef} position={[slotX, slotY, slotZ]}>
      {/* ── Atmosphere shell (FakeGlowMaterial; BackSide; additive) ── */}
      <mesh scale={1.18}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <primitive object={atmosphereMat} ref={atmosphereMatRef} attach="material" />
      </mesh>

      {/* ── Solid glowing core (handles pointer events) ── */}
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
          setActiveBeat(isActive ? null : beat.beatId);
        }}
      >
        <sphereGeometry args={[0.55, 64, 64]} />
        <meshStandardMaterial
          ref={materialRef}
          color={palette.core}
          emissive={palette.emissive}
          emissiveIntensity={0.6}
          roughness={0.45}
          metalness={0.4}
          envMapIntensity={0.7}
        />
      </mesh>

      {/* ── Active-only sparkles for focal accent ── */}
      {isActive ? (
        <Sparkles count={20} scale={1.6} size={3} speed={0.4} opacity={0.7} color="#f0a868" noise={0.4} />
      ) : null}

      {/* Floating italic label above the orb. */}
      <Html center position={[0, 1.05, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap font-display text-base italic"
          style={{
            color: isActive || isApproved ? "#f0a868" : "#e6dfd2",
            textShadow: "0 1px 12px rgba(0,0,0,0.85), 0 0 24px rgba(240,168,104,0.18)",
            transition: "color 200ms ease",
          }}
        >
          {beat.beatName}
        </div>
      </Html>
    </group>
  );
}
