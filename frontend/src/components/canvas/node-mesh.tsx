import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { Beat, BeatMood } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useAtmosphereMaterial } from "./atmosphere-material";
import { useHolographicMaterial } from "./holographic-material";

interface NodeMeshProps {
  beat: Beat;
  position: [number, number, number];
  /** Reports hover changes up to BeatMap3D so the camera rig can react. */
  onHoverChange?: (beatId: string | null) => void;
}

type GeometryKind = "sphere" | "icosahedron" | "torus-knot" | "dodecahedron" | "ring-disc";

/** Per-mood geometry — one of five archetypal forms. */
function geometryForMood(mood: BeatMood): GeometryKind {
  switch (mood) {
    case "wide-establish":
      return "sphere"; // elongated via group scale
    case "intimate-hook":
      return "icosahedron";
    case "kinetic-rising":
      return "torus-knot";
    case "tense-climax":
      return "dodecahedron";
    case "punchy-sting":
      return "ring-disc";
    case "still-resolve":
      return "sphere";
  }
}

/** Subtle base rotation per mood — one always-moving anchor. */
function baseSpinForMood(mood: BeatMood): { x: number; y: number; z: number } {
  switch (mood) {
    case "wide-establish":
      return { x: 0, y: 0.05, z: 0 };
    case "intimate-hook":
      return { x: 0.04, y: 0.08, z: 0.02 };
    case "kinetic-rising":
      return { x: 0.06, y: 0.18, z: 0.04 };
    case "tense-climax":
      return { x: -0.04, y: 0.12, z: 0.06 };
    case "punchy-sting":
      return { x: 0, y: 0.1, z: 0 };
    case "still-resolve":
      return { x: 0, y: 0.03, z: 0 };
  }
}

/**
 * One distinct beat-orb in the canvas.
 *
 * Per-mood geometry (see RESEARCH_PLANETARY.md + 3D_PLAYBOOK.md §B):
 *   wide-establish  → elongated sphere
 *   intimate-hook   → icosahedron (sharp facets)
 *   kinetic-rising  → torus knot (slow tumble)
 *   tense-climax    → dodecahedron
 *   punchy-sting    → ring + central disc
 *   still-resolve   → simple sphere
 *
 * Layered shaders:
 *   - Atmosphere shell — fresnel halo (FakeGlowMaterial-derived)
 *   - Active state    — HolographicMaterial overlay (animated stripe + fresnel)
 *   - Core            — meshStandardMaterial with strong emissive baseline
 *   - Active accent   — drei <Sparkles>
 *
 * The active orb visibly changes *material*, not just color — judges read the
 * shift instantly without needing a label.
 */
export function NodeMesh({ beat, position, onHoverChange }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const formRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const holoOverlayRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const isActive = activeBeatId === beat.beatId;
  const isApproved = beat.status === "approved";
  const isReady = beat.status === "ready-to-generate";
  const reducedMotion = usePrefersReducedMotion();

  const [slotX, slotY, slotZ] = position;
  const mood = beat.archetype.mood;
  const geometryKind = geometryForMood(mood);
  const spin = baseSpinForMood(mood);

  const palette = useMemo(() => {
    if (isApproved) {
      return { core: "#f0a868", emissive: "#ffb874", atmosphere: "#f0a868", holo: "#ffb874" };
    }
    if (isActive) {
      return { core: "#f0a868", emissive: "#ffc080", atmosphere: "#ffb874", holo: "#ffc888" };
    }
    if (isReady) {
      return { core: "#d4a373", emissive: "#f0a868", atmosphere: "#f0a868", holo: "#f0a868" };
    }
    return { core: "#a87447", emissive: "#c5895a", atmosphere: "#a87447", holo: "#c5895a" };
  }, [isActive, isApproved, isReady]);

  // Atmosphere tuned to *tint*, not flood: falloff 0.1→0.5 softens the rim,
  // peak opacity 1.0→0.65 (controlled per-frame below) prevents bloom-clamp
  // to white. See issue #167.
  const atmosphereMat = useAtmosphereMaterial({
    glowColor: palette.atmosphere,
    falloff: 0.5,
    glowInternalRadius: 3.8,
    glowSharpness: 0.4,
    opacity: 0.65,
  });

  const holoMat = useHolographicMaterial({
    hologramColor: palette.holo,
    fresnelAmount: 0.45,
    fresnelOpacity: 1.0,
    scanlineSize: 7.0,
    hologramBrightness: 1.0,
    signalSpeed: 0.5,
    hologramOpacity: 0.85,
  });

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Holographic time uniform (only when used, but cheap to always tick).
    if (holoMat.uniforms.time) holoMat.uniforms.time.value += delta;

    // ── Continuous form rotation (never stops — primary motion anchor) ──
    if (formRef.current && !reducedMotion) {
      formRef.current.rotation.x += spin.x * delta;
      formRef.current.rotation.y += spin.y * delta;
      formRef.current.rotation.z += spin.z * delta;
    }

    // ── Core scale (subtle breath; dampened under reduced-motion) ──
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.025 : 1;
    const hoverBoost = hover ? 1.07 : 1;
    const activeBoost = isActive ? (reducedMotion ? 1.06 : 1.18) : 1;
    const approvedScale = isApproved ? 1.12 : 1;
    const target = breath * hoverBoost * activeBoost * approvedScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);
    // Atmosphere shell sized 1.4× the form's current scale (issues #164 + #170).
    // Was a static 1.2 — too coincident with the active form (1.18) and got
    // swallowed. Now always reads as a halo wrapping the body.
    if (atmosphereRef.current) atmosphereRef.current.scale.setScalar(target * 1.4);
    if (holoOverlayRef.current) holoOverlayRef.current.scale.setScalar(target * 1.18);

    // ── Group z-offset: active steps forward toward camera ──
    if (groupRef.current) {
      const desiredZ = slotZ + (isActive && !reducedMotion ? 0.4 : 0);
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        desiredZ,
        0.12,
      );
    }

    // ── Core emissive intensity ──
    // Idle baseline 0.55 → 0.95 — after the bloom-threshold + tone-mapping
    // fixes, the previous baseline left orbs nearly invisible. The ceiling
    // (active 1.3) is unchanged so the active state still reads as "lit up."
    let baseEmissive: number;
    if (isApproved) baseEmissive = 1.1;
    else if (isActive) baseEmissive = 1.35;
    else if (isReady) baseEmissive = 1.0;
    else if (hover) baseEmissive = 1.0;
    else baseEmissive = 0.95;
    const pulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.25 + 0.25 : 0;
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = baseEmissive + pulse;
      materialRef.current.color.set(palette.core);
      materialRef.current.emissive.set(palette.emissive);
    }

    // ── Atmosphere uniforms ──
    // Capped at 0.65 so additive bloom never blows the centre to white (#167).
    const auni = atmosphereMat.uniforms;
    if (auni) {
      const baseOpacity = isActive ? 0.65 : isReady ? 0.55 : hover ? 0.5 : 0.4;
      const readyPulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.08 + 0.08 : 0;
      auni.opacity.value = Math.min(baseOpacity + readyPulse, 0.7);
      (auni.glowColor.value as THREE.Color).set(palette.atmosphere);
    }

    // ── Holographic uniforms (color/opacity for active state) ──
    if (holoMat.uniforms.hologramColor) {
      (holoMat.uniforms.hologramColor.value as THREE.Color).set(palette.holo);
    }
    if (holoMat.uniforms.hologramOpacity) {
      holoMat.uniforms.hologramOpacity.value = isActive ? 0.85 : 0;
    }
  });

  // The geometry node, scaled to read at the same visual weight as a 0.55 sphere.
  const formNode = useMemo(() => {
    switch (geometryKind) {
      case "sphere":
        return (
          <mesh ref={meshRef}>
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
        );
      case "icosahedron":
        return (
          <mesh ref={meshRef}>
            <icosahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial
              ref={materialRef}
              color={palette.core}
              emissive={palette.emissive}
              emissiveIntensity={0.6}
              roughness={0.3}
              metalness={0.6}
              envMapIntensity={0.8}
              flatShading
            />
          </mesh>
        );
      case "torus-knot":
        return (
          <mesh ref={meshRef}>
            <torusKnotGeometry args={[0.4, 0.13, 96, 16]} />
            <meshStandardMaterial
              ref={materialRef}
              color={palette.core}
              emissive={palette.emissive}
              emissiveIntensity={0.6}
              roughness={0.4}
              metalness={0.5}
              envMapIntensity={0.8}
            />
          </mesh>
        );
      case "dodecahedron":
        return (
          <mesh ref={meshRef}>
            <dodecahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial
              ref={materialRef}
              color={palette.core}
              emissive={palette.emissive}
              emissiveIntensity={0.6}
              roughness={0.25}
              metalness={0.7}
              envMapIntensity={0.9}
              flatShading
            />
          </mesh>
        );
      case "ring-disc":
        return (
          <group>
            {/* Central disc */}
            <mesh ref={meshRef}>
              <sphereGeometry args={[0.32, 48, 48]} />
              <meshStandardMaterial
                ref={materialRef}
                color={palette.core}
                emissive={palette.emissive}
                emissiveIntensity={0.6}
                roughness={0.4}
                metalness={0.5}
                envMapIntensity={0.7}
              />
            </mesh>
            {/* Ring */}
            <mesh rotation={[Math.PI / 2.2, 0, 0]}>
              <torusGeometry args={[0.55, 0.04, 24, 96]} />
              <meshStandardMaterial
                color={palette.core}
                emissive={palette.emissive}
                emissiveIntensity={0.7}
                roughness={0.3}
                metalness={0.7}
                envMapIntensity={0.8}
              />
            </mesh>
          </group>
        );
    }
  }, [geometryKind, palette.core, palette.emissive]);

  return (
    <group ref={groupRef} position={[slotX, slotY, slotZ]}>
      {/* Atmosphere shell — scale set in useFrame (target × 1.4) so it tracks
          the form size and never gets swallowed when active. */}
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <primitive object={atmosphereMat} attach="material" />
      </mesh>

      {/* The form group (rotated each frame) */}
      <group
        ref={formRef}
        // wide-establish gets a vertical elongation per the playbook.
        scale={mood === "wide-establish" ? [1, 1.15, 1] : 1}
      >
        {/* Pointer events handled here so any geometry catches clicks/hover. */}
        <group
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
          {formNode}

          {/* Holographic overlay — only visible on active state (uniform opacity). */}
          {isActive ? (
            <mesh ref={holoOverlayRef}>
              <sphereGeometry args={[0.6, 48, 48]} />
              <primitive object={holoMat} attach="material" />
            </mesh>
          ) : null}
        </group>
      </group>

      {/* Active-only sparkles */}
      {isActive ? (
        <Sparkles count={20} scale={1.6} size={3} speed={0.4} opacity={0.7} color="#f0a868" noise={0.4} />
      ) : null}

      {/* Floating italic label */}
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
