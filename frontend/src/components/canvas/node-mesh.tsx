import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { planetForBeat, SATURN_RING_TEXTURE, type PlanetSpec } from "@/lib/planet-templates";
import { useAtmosphereMaterial } from "./atmosphere-material";
import { useHolographicMaterial } from "./holographic-material";

interface NodeMeshProps {
  beat: Beat;
  position: [number, number, number];
  /** Reports hover changes up to BeatMap3D so the camera rig can react. */
  onHoverChange?: (beatId: string | null) => void;
}

/**
 * One distinct beat-orb in the canvas — now a real textured planet.
 *
 * Per-template mapping in `lib/planet-templates.ts`:
 *   story.hook → Sun · story.exposition → Earth · story.inciting → Mercury
 *   story.rising → Mars · story.climax → Saturn (with rings)
 *   story.falling → Moon · story.resolution → Neptune
 *
 * Three layered passes per node:
 *   1. Atmosphere shell — fresnel halo (BackSide additive); tint from PlanetSpec.
 *   2. Core sphere     — meshStandardMaterial with the equirectangular texture
 *                         as both color map and (Sun only) emissive map.
 *   3. Holographic overlay — only when `isActive`; signals "you're inside this
 *                              beat" without a label.
 *
 * Saturn (and any future ringed planet) gets a fourth pass: an alpha-mapped
 * torus-disc rotated to its ring plane.
 *
 * Texture detail dominates silhouette detail at our render distances —
 * see RESEARCH_PLANETARY.md and CANVAS_PLANETARY_OVERHAUL.md §6.
 */
export function NodeMesh({ beat, position, onHoverChange }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const formRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const holoOverlayRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const stitchTrayOpen = useBeatGraphStore((s) => s.stitchTrayOpen);
  const isActive = activeBeatId === beat.beatId;
  const isApproved = beat.status === "approved";
  const isReady = beat.status === "ready-to-generate";
  // "Untouched": the user hasn't started work on this beat — needs to read
  // visually as 'to-do', not just as 'dim version of approved'.
  const isUntouched = !isActive && !isApproved && !isReady;
  // Hide my floating label whenever an overlay is layered above the canvas.
  // The active beat keeps its label so the drawer's subject is still named.
  const labelsHidden = stitchTrayOpen || (activeBeatId !== null && !isActive);
  const reducedMotion = usePrefersReducedMotion();

  const slotZ = position[2];
  const planet = planetForBeat(beat.template, beat.archetype.mood);

  // Texture preloaded by landing-route's effect; useTexture here returns
  // synchronously when warm, suspends the first time on cold cache.
  const planetTexture = useTexture(`/textures/planets/${planet.texture}`);
  const ringTexture = useTexture(planet.hasRing ? SATURN_RING_TEXTURE : "/textures/planets/2k_saturn_ring_alpha.png");

  // Texture color space — JPGs from Solar System Scope are sRGB.
  // Without this they read washed-out under ACES tone mapping.
  useMemo(() => {
    if (planetTexture instanceof THREE.Texture) {
      planetTexture.colorSpace = THREE.SRGBColorSpace;
      planetTexture.anisotropy = 8;
    }
  }, [planetTexture]);

  const atmosphereMat = useAtmosphereMaterial({
    glowColor: planet.atmosphereTint,
    falloff: 0.5,
    glowInternalRadius: 3.8,
    glowSharpness: 0.4,
    opacity: 0.65,
  });

  const holoMat = useHolographicMaterial({
    hologramColor: "#ffc888",
    fresnelAmount: 0.45,
    fresnelOpacity: 1.0,
    scanlineSize: 7.0,
    hologramBrightness: 1.0,
    signalSpeed: 0.5,
    hologramOpacity: 0.85,
  });

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    if (holoMat.uniforms.time) holoMat.uniforms.time.value += delta;

    // Continuous Y-axis spin — primary motion anchor that always reads as
    // "this is alive." Per-planet rate from PlanetSpec.spinY.
    if (formRef.current && !reducedMotion) {
      formRef.current.rotation.y += planet.spinY * delta;
    }

    // ── Core scale ──
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.025 : 1;
    const hoverBoost = hover ? 1.07 : 1;
    const activeBoost = isActive ? (reducedMotion ? 1.06 : 1.18) : 1;
    const approvedScale = isApproved ? 1.12 : 1;
    const target = breath * hoverBoost * activeBoost * approvedScale * planet.baseScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);
    if (atmosphereRef.current) atmosphereRef.current.scale.setScalar(target * 1.4);
    if (holoOverlayRef.current) holoOverlayRef.current.scale.setScalar(target * 1.18);
    if (ringRef.current) ringRef.current.scale.setScalar(target);

    // ── Group z-offset: subtle step forward when active ──
    // Reduced from 0.4 → 0.15 in Phase 2 because the camera now arcs in
    // closer (+0.6 instead of +1.2 in CameraRig). Two signals doubling up
    // would have over-shifted the planet relative to the camera target.
    if (groupRef.current) {
      const desiredZ = slotZ + (isActive && !reducedMotion ? 0.15 : 0);
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        desiredZ,
        0.12,
      );
    }

    // ── Core emissive intensity ──
    // For the Sun (planet.isEmissive), the texture itself drives emission;
    // the multiplier maps directly to "how bright is the corona right now."
    // For everything else, emissive is an ember-warm tint that reflects the
    // beat's status (idle / hover / active / ready / approved).
    let baseEmissive: number;
    if (planet.isEmissive) {
      // Sun: dramatic emissive ramp by beat status.
      if (isActive) baseEmissive = 1.2;
      else if (isApproved) baseEmissive = 1.0;
      else if (isReady) baseEmissive = 0.95;
      else if (hover) baseEmissive = 0.9;
      else baseEmissive = 0.8;
    } else {
      // Other planets: subtle emissive boost on focus, none at idle.
      if (isActive) baseEmissive = 0.45;
      else if (isApproved) baseEmissive = 0.35;
      else if (isReady) baseEmissive = 0.3;
      else if (hover) baseEmissive = 0.25;
      else baseEmissive = 0.0;
    }
    const pulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.2 + 0.2 : 0;
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = baseEmissive + pulse;
      // Untouched beats: tint the texture down toward a cool grey via the
      // material's color multiplier. This greys the planet's actual surface
      // (so Mars stops reading as a vivid red while it's still "to do") and
      // gives a strong visual distinction from the saturated active/ready
      // states. Hover lifts the tint so users feel the orb acknowledge them.
      const targetTint = isUntouched ? (hover ? 0.55 : 0.32) : 1.0;
      const c = materialRef.current.color;
      // Lerp toward target so status changes don't snap.
      c.r = THREE.MathUtils.lerp(c.r, targetTint, 0.12);
      c.g = THREE.MathUtils.lerp(c.g, targetTint, 0.12);
      c.b = THREE.MathUtils.lerp(c.b, targetTint * 1.05, 0.12);
    }

    // ── Atmosphere uniforms ──
    // Incomplete planets get a notably dimmer halo (max 0.22) so the cool
    // greyed core isn't smeared by an ember-tinted atmosphere fighting it.
    const auni = atmosphereMat.uniforms;
    if (auni) {
      const baseOpacity = isApproved
        ? 0.6
        : isActive
        ? 0.65
        : isReady
        ? 0.55
        : hover
        ? 0.32
        : 0.18;
      const readyPulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.08 + 0.08 : 0;
      auni.opacity.value = Math.min(baseOpacity + readyPulse, 0.7);
    }

    // ── Holographic uniforms ──
    if (holoMat.uniforms.hologramOpacity) {
      holoMat.uniforms.hologramOpacity.value = isActive ? 0.85 : 0;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Atmosphere shell — scale set in useFrame (target × 1.4) so it tracks
          the planet size and never gets swallowed when active. */}
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <primitive object={atmosphereMat} attach="material" />
      </mesh>

      {/* The form group (Y-spun each frame) */}
      <group ref={formRef}>
        {/* Pointer events handled here so the geometry catches clicks/hover. */}
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
          {/* The planet itself */}
          <PlanetCore
            spec={planet}
            texture={planetTexture as THREE.Texture}
            meshRef={meshRef}
            materialRef={materialRef}
          />

          {/* Saturn-style ring (alpha-mapped torus disc) — only when hasRing. */}
          {planet.hasRing ? (
            <mesh ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
              {/* Use a flat ring (RingGeometry would be flat too) — torus with
                  thin tube reads as a band when viewed near edge-on. */}
              <ringGeometry args={[0.78, 1.18, 96]} />
              <meshBasicMaterial
                map={ringTexture as THREE.Texture}
                alphaMap={ringTexture as THREE.Texture}
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ) : null}

          {/* Holographic overlay — only visible on active state. */}
          {isActive ? (
            <mesh ref={holoOverlayRef}>
              <sphereGeometry args={[0.6, 48, 48]} />
              <primitive object={holoMat} attach="material" />
            </mesh>
          ) : null}
        </group>
      </group>

      {/* Active-only sparkles drift around the focused planet. */}
      {isActive ? (
        <Sparkles count={20} scale={1.6} size={3} speed={0.4} opacity={0.7} color="#f0a868" noise={0.4} />
      ) : null}

      {/* Floating label — hidden whenever an overlay is layered above the
          canvas, since drei <Html> renders DOM siblings of the Canvas and
          would otherwise bleed through translucent panels. Untouched beats
          drop to a cool grey so the to-do state reads in 2D as well as 3D. */}
      {!labelsHidden ? (
        <Html center position={[0, 1.05, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="whitespace-nowrap font-body text-[14px] font-medium tracking-[-0.005em]"
            style={{
              color: isActive || isApproved
                ? "#f0a868"
                : isReady
                ? "#e6dfd2"
                : "#7e7c84",
              textShadow: "0 1px 14px rgba(0,0,0,0.85), 0 0 24px rgba(240,168,104,0.10)",
              transition: "color 220ms ease",
            }}
          >
            {beat.beatName}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/**
 * Just the textured sphere, materialRef captured separately so the parent's
 * useFrame can drive emissiveIntensity. Kept as a tiny helper so the JSX
 * tree above stays readable.
 */
function PlanetCore({
  spec,
  texture,
  meshRef,
  materialRef,
}: {
  spec: PlanetSpec;
  texture: THREE.Texture;
  meshRef: React.RefObject<THREE.Mesh | null>;
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.55, 64, 64]} />
      <meshStandardMaterial
        ref={materialRef}
        map={texture}
        emissive={spec.isEmissive ? "#ffb874" : "#f0a868"}
        // The Sun re-uses its own texture as an emissive map for a true
        // "this body is the light source" feel; everything else gets a
        // small ember tint that lifts off the dark side on focus.
        emissiveMap={spec.isEmissive ? texture : undefined}
        emissiveIntensity={spec.isEmissive ? 0.8 : 0}
        roughness={spec.isEmissive ? 1.0 : 0.6}
        metalness={spec.isEmissive ? 0.0 : 0.1}
        envMapIntensity={spec.isEmissive ? 0.0 : 0.7}
      />
    </mesh>
  );
}
