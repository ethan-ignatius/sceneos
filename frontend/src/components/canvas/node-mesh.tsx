import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles, useTexture } from "@react-three/drei";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
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
  /** Order in the beat array — drives the L→R stagger of the intro
   *  animation so leftmost beat lands first. */
  introIndex?: number;
  /** When true, this is the "start here" beat. Renders a guidance
   *  overlay (pulsing halo + floating callout) drawing the user's eye
   *  to the right place. Set by BeatMap3D for the first unfinished beat. */
  isGuidedTarget?: boolean;
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
export function NodeMesh({ beat, position, onHoverChange, introIndex = 0, isGuidedTarget = false }: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const formRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const holoOverlayRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  // Intro animation — set on first useFrame call so the start time is
  // anchored to the actual canvas mount, not React render. Each beat
  // staggers its start by introIndex × INTRO_STAGGER for an L→R reveal.
  const introStartRef = useRef<number | null>(null);
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
  // Anisotropy maxed to 16 (was 8) so equator detail near the silhouette
  // doesn't smear into a low-res-looking band when the camera arcs in for
  // the active state.
  useMemo(() => {
    if (planetTexture instanceof THREE.Texture) {
      planetTexture.colorSpace = THREE.SRGBColorSpace;
      planetTexture.anisotropy = 16;
      planetTexture.minFilter = THREE.LinearMipmapLinearFilter;
      planetTexture.magFilter = THREE.LinearFilter;
      planetTexture.generateMipmaps = true;
      planetTexture.needsUpdate = true;
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

    // ── Intro animation ──
    // INTRO_DURATION  total ramp per planet (slide + grow + spin)
    // INTRO_STAGGER   gap between consecutive beats' starts (L→R reveal)
    // INTRO_BASE_SCALE  starting scale (was 0, now 0.35) so planets are
    //                   already visible the moment the canvas mounts —
    //                   no dark gap between fallback unmount and first
    //                   visible frame. They still grow into place, just
    //                   from a small visible orb instead of nothing.
    // Reduced-motion gets a fast fade-only — vestibular-sensitive users
    // shouldn't be subjected to a slide-and-spin.
    const INTRO_DURATION = reducedMotion ? 0.18 : 0.55;
    const INTRO_STAGGER = reducedMotion ? 0 : 0.05;
    const INTRO_BASE_SCALE = reducedMotion ? 1.0 : 0.35;
    if (introStartRef.current === null) {
      introStartRef.current = t;
    }
    const introElapsed = t - introStartRef.current - introIndex * INTRO_STAGGER;
    const introT = THREE.MathUtils.clamp(introElapsed / INTRO_DURATION, 0, 1);
    // Ease-out cubic — most of the motion happens early, settles smoothly.
    const introEase = 1 - Math.pow(1 - introT, 3);
    // Effective scale ramps from BASE_SCALE → 1 over the intro window.
    const introScale = INTRO_BASE_SCALE + (1 - INTRO_BASE_SCALE) * introEase;
    // Bonus rotational velocity decays from 6 rad/s → 0 over the intro.
    // Tighter than the previous 8 rad/s — at 0.55s duration that 8 rad/s
    // was a blur; 6 still reads as "spinning in" but stays clean.
    const introBonusSpin = reducedMotion ? 0 : (1 - introEase) * 6.0;

    // Continuous Y-axis spin — primary motion anchor that always reads as
    // "this is alive." Per-planet rate from PlanetSpec.spinY, with the
    // intro bonus added on top while the planet is still settling.
    if (formRef.current && !reducedMotion) {
      formRef.current.rotation.y += (planet.spinY + introBonusSpin) * delta;
    }

    // ── Core scale ──
    // Active boost capped at 1.04 (was 1.18). When zoomed in, scale boost +
    // breath + planet.baseScale (Sun 1.15, Jupiter 1.2) used to compound
    // past the camera's safety radius — read as "planet goes hollow."
    // Approved boost dropped (was 1.12); the ember haze + ✓ checkmark on
    // the label already signal completion, no need to inflate the geometry.
    const breath = !reducedMotion && !isApproved ? 1 + Math.sin(t * 0.9) * 0.025 : 1;
    const hoverBoost = hover ? 1.07 : 1;
    // Active boost 1.04 → 1.18: makes the targeted planet unmistakably
    // bigger, so the user knows which one is being referred to even at a
    // glance. Combined with the camera dolly toward the active beat,
    // the planet now FILLS the viewport's left half (with the drawer on
    // the right) rather than reading as just one of the row.
    const activeBoost = isActive ? (reducedMotion ? 1.06 : 1.18) : 1;
    const target = breath * hoverBoost * activeBoost * planet.baseScale;
    if (meshRef.current) meshRef.current.scale.setScalar(target);
    // Atmosphere shell scale: 1.16 for normal planets, 1.08 for emissive
    // (Sun). The Sun's body already self-illuminates via emissiveMap, so a
    // wide fresnel shell stacked on top produced the cross-planet bleed
    // the user flagged ("too jarring, glow too bright"). The tighter
    // shell keeps the halo as a thin rim, not a corona.
    if (atmosphereRef.current) {
      const shellScale = planet.isEmissive ? 1.08 : 1.16;
      atmosphereRef.current.scale.setScalar(target * shellScale);
    }
    if (holoOverlayRef.current) holoOverlayRef.current.scale.setScalar(target * 1.1);
    if (ringRef.current) ringRef.current.scale.setScalar(target);

    // ── Group position + intro scale ──
    // Intro: short slide from (0, -0.3, -0.8) offset + scale from
    // INTRO_BASE_SCALE (0.35) → 1. Tighter offset than before so the
    // motion feels snappy, not floaty. Scaling the GROUP (rather than
    // each mesh) lets every child — body, atmosphere, completion stars,
    // todo ring, label — grow together.
    if (groupRef.current) {
      const introOffsetY = (1 - introEase) * -0.3;
      const introOffsetZ = (1 - introEase) * -0.8;
      const desiredZ = slotZ + introOffsetZ + (isActive && !reducedMotion ? 0.15 : 0);
      groupRef.current.position.y = position[1] + introOffsetY;
      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        desiredZ,
        0.12,
      );
      groupRef.current.scale.setScalar(introScale);
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
      // Approved Sun bumped 0.32 → 0.42 — completion needs to be the
      // single brightest state on the canvas. The user flagged that
      // "earth needs to light up when done"; same applies to every
      // approved planet. The Sun's body already self-illuminates via
      // emissiveMap, so we keep a ceiling that doesn't bloom past
      // adjacent beats.
      if (isApproved) baseEmissive = 0.42;
      else if (isActive) baseEmissive = 0.3;
      else if (isPreviewState) baseEmissive = 0.24;
      else if (isGenerating) baseEmissive = 0.2;
      else if (isReady) baseEmissive = 0.15;
      else if (isQuestioning) baseEmissive = 0.06; // faint warmth — "in conversation"
      else if (hover) baseEmissive = 0.14;
      else baseEmissive = 0.10; // pending — soft warmth so the Sun never reads as a black sphere
    } else {
      // Approved 0.32 → 0.50 — Earth, Mars, etc. need to OBVIOUSLY
      // glow when their beat is locked in. Combined with the
      // completion-stars halo + boosted atmosphere opacity, the
      // approved state is now the brightest on the canvas.
      if (isApproved) baseEmissive = 0.5;
      else if (isActive) baseEmissive = 0.22;
      else if (isPreviewState) baseEmissive = 0.25;
      else if (isGenerating) baseEmissive = 0.18;
      else if (isReady) baseEmissive = 0.14;
      else if (isQuestioning) baseEmissive = 0.04; // faint warmth — "in conversation"
      else if (hover) baseEmissive = 0.10;
      else baseEmissive = 0.06; // pending — soft glow floor so the body has presence even before any work
    }
    // Pulses layered on the active states.
    //   ready      → anticipation pulse (waiting for trigger)
    //   generating → breathing pulse (faster, more present, "rolling")
    //   approved   → slow heartbeat, ±0.06, so completed beats feel
    //                ALIVE and locked-in rather than static. The sin
    //                period (4.2s) is intentionally slow so 5 approved
    //                planets all breathing in slightly different phases
    //                read as "the canvas is humming," not "they're all
    //                strobing in unison."
    const readyPulse = isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.18 + 0.18 : 0;
    const genPulse = isGenerating ? Math.sin((t * Math.PI * 2) / 1.0) * 0.12 + 0.12 : 0;
    const approvedPulse = isApproved && !reducedMotion
      ? Math.sin((t * Math.PI * 2) / 4.2 + introIndex) * 0.06
      : 0;
    if (materialRef.current) {
      // Lerp toward target so a status flip never snaps emissive in one frame.
      // Combined with the JSX-level emissiveIntensity={0} init, the planet
      // starts dark and either stays dark (pending) or ramps up smoothly
      // over ~10 frames to the active/approved level — no first-frame flash.
      const targetEmissive = baseEmissive + readyPulse + genPulse + approvedPulse;
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
      // Emissive bodies (the Sun) have their entire SURFACE acting as a
      // light source. Layering a strong fresnel halo on top doubled-up
      // the brightness and produced the cross-planet bleed flagged in
      // the screenshot. For these we drop the halo to a sliver — just
      // enough to round off the silhouette.
      const emissiveFactor = planet.isEmissive ? 0.45 : 1.0;
      if (isApproved) baseOpacity = 0.46; // bumped 0.34 → 0.46: completed beats need to read as the brightest halo on the canvas
      else if (isActive) baseOpacity = 0.22;
      else if (isPreviewState) baseOpacity = 0.24;
      else if (isGenerating) baseOpacity = 0.2;
      else if (isReady) baseOpacity = 0.16;
      else if (isQuestioning) baseOpacity = 0.06; // faint, "in conversation"
      else baseOpacity = hover ? 0.08 : 0.04; // pending — faint limb glow so silhouette reads warm, not inert
      baseOpacity *= emissiveFactor;
      // Approved planets get a slow halo breath synced with the
      // emissive heartbeat, phase-offset by introIndex so 5 approved
      // beats don't pulse in lockstep.
      const approvedHaloPulse = isApproved && !reducedMotion
        ? Math.sin((t * Math.PI * 2) / 4.2 + introIndex) * 0.04
        : 0;
      const pulse =
        (isReady ? Math.sin((t * Math.PI * 2) / 1.6) * 0.03 + 0.03 : 0) +
        (isGenerating ? Math.sin((t * Math.PI * 2) / 1.0) * 0.025 + 0.025 : 0) +
        approvedHaloPulse;
      // Multiply by introEase so the halo fades in along with the
      // geometry's grow-in.
      const targetOpacity = Math.min(baseOpacity + pulse, 0.55) * introEase;
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

      {/* "Start here" guidance — only on the first unfinished beat when
          no beat is active anywhere on the canvas. A pulsing ember ring
          camera-facing around the planet, plus a floating callout above
          the regular beat-name label with a bouncing chevron pointing
          down at the planet. Hides instantly the moment the user clicks
          any beat, returns when they Esc back to overview. */}
      {isGuidedTarget ? (
        <GuidedTargetOverlay
          baseScale={planet.baseScale}
          onActivate={() => setActiveBeat(beat.beatId)}
        />
      ) : null}

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
        <Html
          center
          position={[0, 1.05, 0]}
          style={{ pointerEvents: "none" }}
          // Cap below all canvas chrome — drei defaults to [16M, 0] which
          // bled the labels through the stitch tray (z-50) and drawer (z-40).
          // [8, 0] keeps labels above film-grain (z-5) but below the
          // persistent URL strip (z-10) and every modal layer above it.
          zIndexRange={[8, 0]}
        >
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
        // Use the planet's own texture as the emissive map for EVERY body
        // (was Sun-only). Without this, non-luminous planets used a flat
        // emissive color #f0a868 with no map, so emissiveIntensity > 0
        // added a uniform ember wash to every pixel of the texture —
        // visible on screen as a low-resolution / hazy overlay sitting on
        // top of the surface. With the texture as the emissive map the
        // ember tint multiplies through surface detail (mountain ridges,
        // continents, cloud bands) instead of overpainting it. The planet
        // reads as "lit from within," and zoom-in detail stays sharp.
        //
        // Sun emissive base dimmed (#ffb874 → #aa6d3e) so the corona stays
        // warm without saturating; non-luminous bodies use a deeper #c08858
        // (ember-dim) so the ember tint reads as warmth, not yellow wash.
        emissive={spec.isEmissive ? "#aa6d3e" : "#c08858"}
        emissiveMap={texture}
        // Initial emissiveIntensity is 0 for ALL planets — the per-frame
        // lerp ramps up to whatever the status warrants without flashing.
        emissiveIntensity={0}
        // Marble-feel material per the user's framing ("philosophy of
        // planets? maybe these should be more like marbles"). Lower
        // roughness (0.55 → 0.38) catches a sharper specular highlight
        // off the key light; metalness (0.05 → 0.18) pulls a touch of
        // chromatic glint into that highlight; envMapIntensity (0.7 →
        // 1.0) lets the night-preset HDR contribute the polished-glass
        // rim. Sun stays roughness 1.0 / metalness 0 because a star
        // isn't a marble — it's the light source.
        roughness={spec.isEmissive ? 1.0 : 0.38}
        metalness={spec.isEmissive ? 0.0 : 0.18}
        envMapIntensity={spec.isEmissive ? 0.0 : 1.0}
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
 * Approved-beat halo — twelve ember stars orbiting at a tilted plane.
 * Each "star" is a tiny solid core inside a larger additively-blended
 * outer disc, giving the dot a soft glow without requiring postprocess
 * bloom. The whole halo rotates slowly (~14s/turn) — reads as "this beat
 * is locked in and standing by," not "in progress."
 *
 * Star count went 8 → 12, core size 0.04 → 0.07, and each star now has
 * a glow disc at 2.4× radius. The previous halo was too subtle —
 * "completion obvious" was the user's exact requirement.
 *
 * `baseScale` tracks the planet's PlanetSpec scale so larger bodies
 * (Sun 1.15, Jupiter 1.2) get a proportionally larger halo, smaller
 * bodies (Moon 0.8) get a tighter one.
 */
function CompletionStars({ baseScale }: { baseScale: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();
  useFrame((_, delta) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.45;
    }
  });
  const radius = 0.55 * baseScale * 1.55;
  const STAR_COUNT = 12;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const angle = (i / STAR_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    stars.push(
      <group key={i} position={[x, 0, z]}>
        {/* Solid core — what the eye locks onto. */}
        <mesh>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#ffd9a8" toneMapped={false} />
        </mesh>
        {/* Glow disc — additive, larger, gives each star a halo. */}
        <mesh>
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshBasicMaterial
            color="#f0a868"
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>,
    );
  }
  return (
    <group ref={groupRef} rotation={[Math.PI / 6, 0, 0]}>
      {stars}
    </group>
  );
}

/**
 * "Start here" guidance overlay — drawn around the FIRST unfinished beat
 * when nothing else is active. Two layers, both ember:
 *
 *   1. A camera-facing pulsing ring at ~1.7× the planet radius. Pulses
 *      opacity AND scale on a 1.4s cycle so the eye locks onto it within
 *      one breath. Uses additive blending against the dark bg-base.
 *
 *   2. A floating Html callout above the planet's existing name label.
 *      Reads "start here" with a bouncing chevron pointing down at the
 *      planet — unmistakable directional cue, but not a popup.
 *
 * Hides the moment any beat becomes active (BeatMap3D's `isGuidedTarget`
 * prop already gates the mount). Returns when the user Esc's back to
 * overview if the beat is still unfinished.
 */
function GuidedTargetOverlay({
  baseScale,
  onActivate,
}: {
  baseScale: number;
  /** Called when the user clicks the "you are here" pill. The parent
   *  fires setActiveBeat for this beat; CameraRig handles the arc-in. */
  onActivate?: () => void;
}) {
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringGroupRef = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(({ clock }) => {
    if (reducedMotion) {
      if (ringMatRef.current) ringMatRef.current.opacity = 0.4;
      return;
    }
    const t = clock.elapsedTime;
    // 1.4s pulse cycle. Opacity 0.18 → 0.55 reads as a soft heartbeat;
    // scale ±5% gives the ring a "breathing" diameter without crowding
    // the existing atmosphere shell.
    const omega = (Math.PI * 2) / 1.4;
    const opacityPulse = Math.sin(t * omega) * 0.18 + 0.36;
    const scalePulse = 1 + Math.sin(t * omega) * 0.05;
    if (ringMatRef.current) ringMatRef.current.opacity = opacityPulse;
    if (ringGroupRef.current) ringGroupRef.current.scale.setScalar(scalePulse);
  });

  const inner = 0.55 * baseScale * 1.6;
  const outer = inner * 1.06;

  return (
    <>
      {/* Pulsing ring — XY plane, faces the camera by default at our
          camera setup (camera on +Z looking at origin). DoubleSide so
          a slight orbit doesn't hide it. AdditiveBlending so it stacks
          warmly on bg-base instead of looking pasted on. */}
      <group ref={ringGroupRef}>
        <mesh>
          <ringGeometry args={[inner, outer, 96]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color="#f0a868"
            transparent
            opacity={0.36}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Callout — Html element pinned above the existing beat label
          (which sits at y=1.05). Position 1.85 so the chevron tip lands
          near the top of the planet's atmosphere. fade-in delayed past
          the planet intro so the planet lands FIRST, then the cue
          materializes — reads as the canvas saying "ready when you are."
          zIndexRange forces this callout above every other Html in the
          scene (other planets' name labels, etc.) — without it, drei
          stacks Html elements by camera depth and the start-here pill
          can render BEHIND adjacent planets' name pips. */}
      <Html
        center
        position={[0, 1.85, 0]}
        // pointerEvents:auto — clicking the pill arcs the camera into
        // the planet via setActiveBeat, same path as clicking the orb.
        // pointer-events-auto is also re-asserted on the inner wrapper
        // because drei's portal sometimes inherits a none from the
        // canvas's container; double-asserting is cheap insurance.
        style={{ pointerEvents: "auto" }}
        // Range [9, 8] sits above the floating beat labels (z-8) but
        // BELOW every chrome layer — the persistent URL strip (z-10),
        // drawer (z-40), stitch tray (z-50). Was [16777400, 16777390]
        // which forced it above modal chrome and bled the pill through
        // the stitch tray's headline (the bug visible in the screenshot).
        zIndexRange={[9, 8]}
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
          // Re-assert pointer-events-auto so the click reliably reaches
          // React even if a parent set pointer-events:none (drei sometimes
          // does on the outer Html wrapper in certain configurations).
          className="pointer-events-auto flex select-none flex-col items-center gap-0.5"
        >
          <button
            type="button"
            onPointerDown={(e) => {
              // Use onPointerDown not onClick so the activation lands on
              // the press itself, not on the up-event — avoids "I clicked
              // and it didn't take" when a tiny pixel drift cancels the
              // synthetic click. stopPropagation prevents the canvas's
              // onPointerMissed from interpreting this as a click on
              // empty space (which would deselect the beat we just set).
              e.stopPropagation();
              onActivate?.();
            }}
            aria-label="Take me to this beat"
            title="Take me there"
            className="caption-track pointer-events-auto group whitespace-nowrap rounded-full border border-brand-ember/35 bg-bg-base/70 px-2.5 py-1 text-[9.5px] text-brand-ember backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 ease-out hover:border-brand-ember/65 hover:bg-bg-elev-1/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            style={{
              boxShadow: "0 0 18px rgba(240,168,104,0.22), inset 0 0 0 1px rgba(240,168,104,0.08)",
              textShadow: "0 1px 12px rgba(0,0,0,0.85)",
            }}
          >
            you are here
          </button>
          <motion.div
            className="text-brand-ember"
            animate={{ y: [0, 5, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(240,168,104,0.5))" }}
          >
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          </motion.div>
        </motion.div>
      </Html>
    </>
  );
}

