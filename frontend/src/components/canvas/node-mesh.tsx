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
  // Map every BeatStatus to its own visual register. Source of truth is
  // `beat.status` from the store — no derived flags pile up here.
  //   pending      → "todo": no atmosphere glow, no emissive. Texture only.
  //   questioning  → "in conversation": faint atmosphere, hint of emissive.
  //   ready-to-gen → "ready to roll": ember pulse on atmosphere + emissive.
  //   generating   → "rolling": steady ember atmosphere, breathing emissive.
  //   preview      → "clip ready": ember atmosphere, no pulse.
  //   approved     → "locked in": brightest atmosphere + emissive.
  // Active overlays a holographic shader on top of whichever state is current.
  const status = beat.status;
  const isPending = status === "pending";
  const isQuestioning = status === "questioning";
  const isReady = status === "ready-to-generate";
  const isGenerating = status === "generating";
  const isPreviewState = status === "preview";
  const isApproved = status === "approved";
  // "Needs work" = pending or questioning. The user is still figuring this
  // beat out; the planet should not glow.
  const isTodo = isPending || isQuestioning;
  // Hide my floating label whenever an overlay is layered above the canvas.
  // The active beat keeps its label so the drawer's subject is still named.
  const labelsHidden = stitchTrayOpen || (activeBeatId !== null && !isActive);
  const reducedMotion = usePrefersReducedMotion();

  const slotZ = position[2];
  const planet = planetForBeat(beat.template, beat.archetype.mood);

  // Texture preloaded by landing-route's effect; useTexture here returns
  // synchronously when warm, suspends the first time on cold cache. The
  // ring texture is now loaded inside <PlanetRing> which only mounts when
  // planet.hasRing is true — calling useTexture for the ring on every node
  // doubled the suspension surface area for a result we use 1/9 times,
  // and on a cold cache for ANY non-Saturn beat that suspension would
  // bubble up to the inner Suspense and briefly hide that node.
  const planetTexture = useTexture(`/textures/planets/${planet.texture}`);

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
    // Initial opacity 0 (was 0.65). Pending planets steady-state at 0,
    // so starting at 0.65 produced exactly one bright halo frame on
    // mount before useFrame snapped it to 0. The lerp inside useFrame
    // handles ramp-up for active/approved states.
    opacity: 0,
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
    // Active boost capped at 1.04 (was 1.18). When zoomed in, scale boost +
    // breath + planet.baseScale (Sun 1.15, Jupiter 1.2) used to compound
    // past the camera's safety radius — read as "planet goes hollow."
    // Approved boost dropped (was 1.12); the ember haze + ✓ checkmark on
    // the label already signal completion, no need to inflate the geometry.
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.025 : 1;
    const hoverBoost = hover ? 1.07 : 1;
    const activeBoost = isActive ? (reducedMotion ? 1.0 : 1.04) : 1;
    const target = breath * hoverBoost * activeBoost * planet.baseScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);
    // Atmosphere shell tightened: 1.4 → 1.16. The fresnel halo at 1.4 was
    // extending well past the planet body and bleeding into adjacent beats
    // on the timeline (visible as yellow streams between planets). 1.16
    // keeps a visible glow ring tight to the silhouette.
    if (atmosphereRef.current) atmosphereRef.current.scale.setScalar(target * 1.16);
    if (holoOverlayRef.current) holoOverlayRef.current.scale.setScalar(target * 1.1);
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
    // The previous version multiplied material.color toward a 0.32 grey for
    // todo planets, which lerped them toward invisible against bg-base over
    // ~2-3 seconds — visible to the user as "the planets disappear shortly
    // after entering". That tint is gone. The texture stays at full color so
    // each planet keeps its identity (Mars red, Earth blue, etc.); the only
    // status signal on the surface is emissiveIntensity.
    //
    // Per-status emissive ramp. The Sun (planet.isEmissive) carries the
    // texture as its emissive map, so its "off" state still has presence;
    // other planets ramp emissive from 0 (todo) up to 0.6 (approved).
    // Hard rule per user: ONLY completed beats glow. Pending + questioning
    // planets read as cold textured spheres lit by ambient + key/fill lights
    // alone. The previous "Sun pending = 0.55" baseline was leaving exactly
    // ONE planet visibly hot when none should be — fixed.
    // Active brightness is capped low — when zoomed in, the planet fills
    // ~50% of the viewport, so even a 0.5 emissive reads as overwhelming.
    // Sun active 0.55 (was 1.15) keeps it warm without being eye-burning.
    // Non-luminous active 0.22 (was 0.45) — just enough lift to say
    // "you're inside this beat."
    let baseEmissive: number;
    if (planet.isEmissive) {
      if (isActive) baseEmissive = 0.55;
      else if (isApproved) baseEmissive = 0.6;
      else if (isPreviewState) baseEmissive = 0.45;
      else if (isGenerating) baseEmissive = 0.4;
      else if (isReady) baseEmissive = 0.3;
      else if (hover) baseEmissive = 0.22;
      else baseEmissive = 0; // pending + questioning — DARK
    } else {
      // Non-luminous body: subtle ember layered onto the texture.
      if (isActive) baseEmissive = 0.22;
      else if (isApproved) baseEmissive = 0.32;
      else if (isPreviewState) baseEmissive = 0.25;
      else if (isGenerating) baseEmissive = 0.18;
      else if (isReady) baseEmissive = 0.14;
      else if (hover) baseEmissive = 0.1;
      else baseEmissive = 0; // pending + questioning — DARK
    }
    // Pulses layered on the active states. ready = anticipation pulse;
    // generating = breathing pulse (faster, more present).
    const readyPulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.18 + 0.18 : 0;
    const genPulse = isGenerating ? Math.sin((t * Math.PI * 2) / 1.0) * 0.12 + 0.12 : 0;
    if (materialRef.current) {
      // Lerp toward target so a status flip never snaps emissive in one frame.
      // Combined with the JSX-level emissiveIntensity={0} init, the planet
      // starts dark and either stays dark (pending) or ramps up smoothly
      // over ~10 frames to the active/approved level — no first-frame flash.
      const targetEmissive = baseEmissive + readyPulse + genPulse;
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        targetEmissive,
        0.18,
      );
    }

    // ── Atmosphere uniforms ──
    // Atmosphere opacity carries the strongest "glow" signal. Pending /
    // questioning planets have a near-invisible halo (0–0.16) — they read
    // as "to do" without disappearing. Ready+ states light up.
    // Atmosphere — strongest "this beat is alive" signal. Zero on pending
    // (no halo at all → planet reads as inert) so the user sees ONLY the
    // completed beats glowing.
    // Atmosphere active opacity dropped 0.65 → 0.4 — the halo was reading
    // as a yellow blaze when the camera arced in close. 0.4 keeps the
    // planet's silhouette clean while still signalling life.
    // Halo opacities halved across the board (e.g. active 0.4 → 0.2). The
    // tighter shell (1.16) plus halved opacity stops the cross-planet glow
    // bleed seen on the timeline. Each beat's atmosphere now reads as a
    // subtle ring around its silhouette — present, not dominant.
    const auni = atmosphereMat.uniforms;
    if (auni) {
      let baseOpacity: number;
      if (isActive) baseOpacity = 0.2;
      else if (isApproved) baseOpacity = 0.25;
      else if (isPreviewState) baseOpacity = 0.22;
      else if (isGenerating) baseOpacity = 0.18;
      else if (isReady) baseOpacity = 0.15;
      else baseOpacity = hover ? 0.06 : 0; // pending + questioning — completely dark
      const pulse =
        (isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.03 + 0.03 : 0) +
        (isGenerating ? Math.sin((t * Math.PI * 2) / 1.0) * 0.025 + 0.025 : 0);
      // Lerp atmosphere opacity toward target. The atmosphere material's
      // initial uniform is 0 (set below in the useAtmosphereMaterial
      // call), so first-frame paint shows no halo — useFrame then ramps
      // up to whatever the status warrants. Snapping from 0.65 → 0 in
      // one frame was the visible "flash then disappear" the user kept
      // reporting, even with the texture itself stable.
      const targetOpacity = Math.min(baseOpacity + pulse, 0.35);
      auni.opacity.value = THREE.MathUtils.lerp(auni.opacity.value, targetOpacity, 0.16);
    }

    // ── Holographic uniforms ──
    // Active overlay much subtler now (0.32 from 0.85) — when the planet
    // fills the viewport on zoom, a strong scanline overlay was reading
    // as "TV static" rather than "selected." A whisper is enough.
    if (holoMat.uniforms.hologramOpacity) {
      holoMat.uniforms.hologramOpacity.value = isActive ? 0.32 : 0;
    }

    // Reference these so TS doesn't flag them as unused — they're the
    // explicit status booleans the per-status branches above pivot on.
    void isPending;
    void isTodo;
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

          {/* Saturn-style ring (alpha-mapped disc) — only when hasRing.
              The component owns its own useTexture call so non-ringed
              planets never pay the ring's suspension cost. ringRef is
              passed through so useFrame can scale it. */}
          {planet.hasRing ? <PlanetRing ringRef={ringRef} /> : null}

          {/* Holographic overlay — only visible on active state. */}
          {isActive ? (
            <mesh ref={holoOverlayRef}>
              <sphereGeometry args={[0.6, 48, 48]} />
              <primitive object={holoMat} attach="material" />
            </mesh>
          ) : null}
        </group>
      </group>

      {/* Completion halo — orbital ring of glowing ember stars around any
          approved planet. The rotation is intentionally slow (rad/s) so it
          reads as "this beat is locked in" rather than "this beat is busy."
          Pending/questioning beats used to render a dashed orbital reticle
          via <TodoRing>; that turned the timeline into a row of saucers
          and added cross-planet visual noise. The floating-label hollow
          dot pip already says "this slot is open" — no 3D doubling. */}
      {isApproved ? <CompletionStars baseScale={planet.baseScale} /> : null}

      {/* Active-only sparkles drift around the focused planet.
          Halved (10 from 20) and lower opacity — they were reading as
          dust-storm yellow when the camera was zoomed close. */}
      {isActive ? (
        <Sparkles count={10} scale={1.6} size={2.4} speed={0.3} opacity={0.4} color="#f0a868" noise={0.3} />
      ) : null}

      {/* Floating label — hidden whenever an overlay is layered above the
          canvas, since drei <Html> renders DOM siblings of the Canvas and
          would otherwise bleed through translucent panels. Untouched beats
          drop to a cool grey so the to-do state reads in 2D as well as 3D.
          Approved beats get an explicit "✓" prefix so the completion state
          is unmistakable from any distance. */}
      {!labelsHidden ? (
        <Html center position={[0, 1.05, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="flex items-center gap-1.5 whitespace-nowrap font-body text-[14px] font-medium tracking-[-0.005em]"
            style={{
              color: isApproved
                ? "#f0a868"
                : isActive
                ? "#f0a868"
                : isPreviewState || isGenerating
                ? "#f0a868"
                : isReady
                ? "#e6dfd2"
                : isQuestioning
                ? "#a39885"
                : "#7e7c84",
              textShadow: "0 1px 14px rgba(0,0,0,0.85), 0 0 24px rgba(240,168,104,0.10)",
              transition: "color 220ms ease",
            }}
          >
            {isApproved ? (
              <span
                aria-label="Approved"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-ember/90 text-[10px] font-bold leading-none text-bg-base"
                style={{ boxShadow: "0 0 12px rgba(240,168,104,0.6)" }}
              >
                ✓
              </span>
            ) : isPending || isQuestioning ? (
              // Empty-ring pip — the visual mate of the approved ✓.
              // Hollow says "this slot is open"; the dashed border sells
              // the in-progress nature without needing a word.
              <span
                aria-label={isQuestioning ? "In conversation" : "Not yet"}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] leading-none"
                style={{
                  border: "1px dashed rgba(163,152,133,0.7)",
                  color: "rgba(163,152,133,0.85)",
                }}
              >
                ·
              </span>
            ) : null}
            <span>{beat.beatName}</span>
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
        // Initial emissiveIntensity is 0 for ALL planets (was 0.8 for Sun).
        // The Sun's pending state is dark — initializing at 0.8 gave one
        // bright frame on first paint, then useFrame snapped it to 0 the
        // very next frame. Read on screen as "the Sun briefly appears,
        // then disappears." Now it ramps up smoothly via the per-frame
        // lerp inside NodeMesh; pending Sun stays dark from frame 1.
        emissiveIntensity={0}
        roughness={spec.isEmissive ? 1.0 : 0.6}
        metalness={spec.isEmissive ? 0.0 : 0.1}
        envMapIntensity={spec.isEmissive ? 0.0 : 0.7}
      />
    </mesh>
  );
}

/**
 * Saturn-style ring (alpha-mapped disc). Mounted only when the parent
 * planet's spec.hasRing is true so non-ringed beats never call useTexture
 * for the ring at all — keeping each node's suspension surface to a
 * single texture (the planet body).
 */
function PlanetRing({ ringRef }: { ringRef: React.RefObject<THREE.Mesh | null> }) {
  const ringTexture = useTexture(SATURN_RING_TEXTURE);
  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2.5, 0, 0]}>
      <ringGeometry args={[0.78, 1.18, 96]} />
      <meshBasicMaterial
        map={ringTexture as THREE.Texture}
        alphaMap={ringTexture as THREE.Texture}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Approved-beat halo — eight ember "stars" orbiting at a tilted plane.
 * The slow rotation (~14s/turn) reads as "completed and standing by"
 * rather than "in progress." toneMapped={false} keeps the stars saturated
 * even under ACES — they should pop against the planet, not blend in.
 *
 * `baseScale` tracks the planet's PlanetSpec scale so larger bodies
 * (Sun 1.15, Jupiter 1.2) get a proportionally larger halo, smaller
 * bodies (Moon 0.8) get a tighter one. Without this the Moon's halo
 * would feel oversized and the Sun's cramped.
 */
function CompletionStars({ baseScale }: { baseScale: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();
  useFrame((_, delta) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.45;
    }
  });
  // 8 stars distributed evenly. Radius scales with planet — a 0.55-radius
  // sphere × baseScale × ~1.55 keeps the halo just outside the atmosphere
  // shell (target × 1.4) so they never overlap the glow.
  const radius = 0.55 * baseScale * 1.55;
  const stars = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    stars.push(
      <mesh
        key={i}
        position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
      >
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color="#f0a868" toneMapped={false} />
      </mesh>,
    );
  }
  return (
    <group ref={groupRef} rotation={[Math.PI / 6, 0, 0]}>
      {stars}
    </group>
  );
}

