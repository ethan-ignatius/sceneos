import { Canvas, useThree } from "@react-three/fiber";
import { Stars, Environment } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { useScrollVelocity } from "@/lib/use-scroll-velocity";
import { computeBeatPositions } from "@/lib/beat-layout";
import { NodeMesh } from "./node-mesh";
import { CameraRig, type PanState, type OrbitState, type ZoomState } from "./camera-rig";
import { ConnectingPath } from "./connecting-path";
import { AmbientParticles } from "./ambient-particles";
import { CosmicScene } from "./cosmic-scene";

// Camera-bridge events live in beat-map-events.ts so route-level
// consumers (Esc handler, command menu) don't drag the 3D module
// into their chunks just to read a string constant.
import { RESET_CAMERA_EVENT, GOTO_CAMERA_EVENT } from "./beat-map-events";

interface BeatMap3DProps {
  beats: Beat[];
}

/**
 * Recomputes camera FOV + z-distance when the viewport aspect changes
 * so portrait phones don't slice off outer beats (issue #152).
 *   horizontalFov = 2 * atan(tan(vfov/2) * aspect)
 * On portrait (aspect ≈ 0.46) the default 42° vfov collapses horizontal to
 * ~20° — outer beats vanish. We widen vfov + push camera back proportional
 * to the inverse aspect.
 */
function ResponsiveCamera({ baseFov, baseZ }: { baseFov: number; baseZ: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const fov = aspect < 1 ? Math.min(72, baseFov / aspect) : baseFov;
    const z = aspect < 1 ? baseZ + (1 - aspect) * 4 : baseZ;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.position.z = z;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height, baseFov, baseZ]);
  return null;
}

/**
 * The canvas — the second of the three demo-winning moments.
 *
 * Five beats arranged along a gentle z-recession curve. A custom CameraRig
 * replaces OrbitControls — clicking a node transports the camera; clicking
 * empty space (or the same node again) returns to overview. The ConnectingPath
 * threads the beat order. AmbientParticles drift behind everything.
 *
 * Hover is lifted here so the camera rig can react to it; node-internal hover
 * stays local to each NodeMesh for its own scale/halo response. This was the
 * cleanest way to share without lifting the entire hover into the store.
 */
export function BeatMap3D({ beats }: BeatMap3DProps) {
  const activeBeatId = useBeatGraphStore((s) => s.activeBeatId);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const [hoveredBeatId, setHoveredBeatId] = useState<string | null>(null);
  // Vignette overlay opacity tracks pan state; React-y way is fine here
  // since the overlay is HTML, not WebGL.
  const [panning, setPanning] = useState(false);

  // Bridge: scroll/wheel velocity → ambient particles' speed uniform.
  // The hook accumulates wheel/touch deltas, decays exponentially, and
  // exposes a velocityRef that we read each frame in <AmbientParticles>.
  const containerRef = useRef<HTMLDivElement>(null);
  const { velocityRef, registerElement } = useScrollVelocity();
  useEffect(() => {
    if (!containerRef.current) return;
    return registerElement(containerRef.current);
  }, [registerElement]);

  // Layout depends only on beat count, not per-beat data. Memoising on
  // `beats` directly meant every applyDecomposition (which spreads m.beats
  // into a new array reference) would rebuild positions, rebuild the
  // ConnectingPath geometry, and re-flash every NodeMesh's `<group
  // position=…>` prop — which read on screen as the orbs blinking out.
  const positions = useMemo(() => computeBeatPositions(beats), [beats.length]);

  // First unstarted beat — drives the "start here" guidance overlay.
  // Pending or questioning both count as "not yet committed." Once every
  // beat is past those states, guidance vanishes entirely (the canvas
  // becomes a working board, not an onboarding board).
  const guidedTargetId = useMemo(
    () => beats.find((b) => b.status === "pending" || b.status === "questioning")?.beatId ?? null,
    [beats],
  );

  // Camera distance scales with beat count. The new wider spread (1.55x)
  // means a 7-beat timeline is ~10.85 world-units wide; we need to be far
  // enough back that all of them sit comfortably inside the 42° vertical
  // frustum (which becomes a wider horizontal frustum at 16:9 aspect).
  //   5 beats → cameraZ 9.25  → world half-width ≈ 6.3 → spread half 3.875 (margin 2.4)
  //   7 beats → cameraZ 10.95 → world half-width ≈ 7.5 → spread half 5.43 (margin 2.0)
  //   12 beats → cameraZ 15.2 → world half-width ≈ 10.4 → spread half 9.3 (margin 1.1)
  // FOV widens on portrait viewports (#152) — see `<ResponsiveCamera>` below.
  const cameraZ = 5 + Math.max(beats.length, 5) * 0.85;

  // ── Pan state ──────────────────────────────────────────────────────────
  // The pan ref lives outside React so middle-drag never triggers a route
  // re-render. CameraRig reads it each frame; this component writes to it
  // from pointer events. RESET_CAMERA_EVENT (Esc / Re-center) zeros it.
  const panRef = useRef<PanState>({ offset: [0, 0], active: false });
  // Orbit state — left-click-and-hold on empty space. Sticky (Maya-convention).
  const orbitRef = useRef<OrbitState>({ azimuth: 0, polar: 0, active: false, didDrag: false });
  // Zoom — scroll-wheel adjusts camera distance on the overview view.
  // Sticky like orbit; reset on Esc / Re-center.
  const zoomRef = useRef<ZoomState>({ z: 0 });
  // Closure-free mirror of hoveredBeatId — pointer handlers read this to
  // decide whether a left-down should start orbiting (only if NOT on a planet).
  const hoveredBeatIdRef = useRef<string | null>(null);
  useEffect(() => {
    hoveredBeatIdRef.current = hoveredBeatId;
  }, [hoveredBeatId]);
  // Closure-free mirror of activeBeatId — wheel handler reads this to
  // decide whether wheel = zoom (overview) or wheel = ignored (active beat).
  const activeBeatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBeatIdRef.current = activeBeatId;
  }, [activeBeatId]);

  // Pointer bindings (Figma/Miro convention):
  //   Left drag on empty       → pan
  //   Shift + left drag        → orbit (power-user)
  //   Middle drag              → pan (still works for trackball mice)
  //   Wheel                    → zoom
  //
  // Left drag on a planet does nothing here (planet's onClick handles
  // activation). Click-vs-drag is decided by a 4 px threshold; below that
  // the click reaches onPointerMissed → toggle active beat.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let anchorX = 0;
    let anchorY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    const DRAG_THRESHOLD_PX = 4;

    // World units per screen pixel at z=0, given current camera distance + fov.
    // worldHeightAtZ0 = 2 * camDist * tan(vfov/2). Width = height * aspect.
    // We approximate with the rendering viewport size (containerRef.current).
    const worldPerPx = () => {
      const rect = el.getBoundingClientRect();
      const fovRad = (42 * Math.PI) / 180;
      const dist = cameraZ;
      const worldH = 2 * dist * Math.tan(fovRad / 2);
      const worldW = worldH * (rect.width / Math.max(rect.height, 1));
      return { x: worldW / Math.max(rect.width, 1), y: worldH / Math.max(rect.height, 1) };
    };

    const onPointerDown = (e: PointerEvent) => {
      // Maya/Blender-style binding (per user direction):
      //   Middle drag         → orbit around scene/active beat (NEW — was pan)
      //   Shift + left drag   → orbit (kept as a power-user alt for trackpad
      //                         users who don't have a middle button)
      //   Left drag on empty  → pan
      //   Wheel               → zoom
      //
      // No setPointerCapture: capture redirects pointermove events to the
      // captured target only, which broke the global CinematicCursor's
      // window-level pointermove listener — the cursor froze in place
      // mid-drag. Instead we bind move/up on WINDOW so the drag keeps
      // working off-canvas AND the cursor keeps tracking. (Pointer
      // capture was originally added so drags didn't break when the
      // pointer left the canvas; window-bound listeners solve the same
      // problem without the cursor side-effect.)
      const isMiddle = e.button === 1;
      const isLeftEmpty = e.button === 0 && hoveredBeatIdRef.current === null;
      if (!isMiddle && !isLeftEmpty) return;

      anchorX = e.clientX;
      anchorY = e.clientY;

      if (isMiddle || (isLeftEmpty && e.shiftKey)) {
        // Orbit. Middle preventDefault suppresses the browser's auto-
        // scroll cursor.
        if (isMiddle) e.preventDefault();
        orbitRef.current.active = true;
        orbitRef.current.didDrag = false;
      } else {
        // Pan (left-drag on empty space).
        panRef.current.active = true;
        setPanning(true);
        startOffsetX = panRef.current.offset[0];
        startOffsetY = panRef.current.offset[1];
        document.body.style.cursor = "grabbing";
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (panRef.current.active) {
        const { x: wpxX, y: wpxY } = worldPerPx();
        const dx = (e.clientX - anchorX) * wpxX;
        const dy = (e.clientY - anchorY) * wpxY;
        panRef.current.offset[0] = startOffsetX - dx;
        panRef.current.offset[1] = startOffsetY + dy; // screen-y flipped
        return;
      }
      if (orbitRef.current.active) {
        const dx = e.clientX - anchorX;
        const dy = e.clientY - anchorY;
        if (
          !orbitRef.current.didDrag &&
          (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)
        ) {
          orbitRef.current.didDrag = true;
          document.body.style.cursor = "grabbing";
        }
        if (orbitRef.current.didDrag) {
          orbitRef.current.azimuth += dx * 0.005;
          orbitRef.current.polar = THREE.MathUtils.clamp(
            orbitRef.current.polar + dy * 0.005,
            -0.6,
            0.6,
          );
          anchorX = e.clientX;
          anchorY = e.clientY;
        }
      }
    };

    const onPointerUp = () => {
      if (panRef.current.active) {
        panRef.current.active = false;
        setPanning(false);
        document.body.style.cursor = "";
        return;
      }
      if (orbitRef.current.active) {
        orbitRef.current.active = false;
        // Leave didDrag set so onPointerMissed can suppress the
        // click-deactivates-beat behavior; reset on next pointerdown.
        document.body.style.cursor = "";
      }
    };

    // Wheel — zoom on overview view only. When a beat is active we let the
    // event bubble (no preventDefault), so wheel-during-zoom doesn't fight
    // the camera glide. Negative deltaY = wheel up = zoom in; positive =
    // out. Clamped [-3, +5] so the user can't fly behind the planets nor
    // zoom out into deep space and lose them.
    const onWheel = (e: WheelEvent) => {
      if (activeBeatIdRef.current !== null) return;
      e.preventDefault();
      const delta = e.deltaY * 0.004;
      zoomRef.current.z = THREE.MathUtils.clamp(zoomRef.current.z + delta, -3, 5);
    };

    el.addEventListener("pointerdown", onPointerDown);
    // Move + up bound on WINDOW (not el) so drag continues if pointer
    // leaves the canvas AND the cinematic-cursor's window-level
    // pointermove listener keeps receiving events during the drag.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    // External reset (Esc / Re-center button) — zero pan + orbit + zoom.
    const onReset = () => {
      panRef.current.offset[0] = 0;
      panRef.current.offset[1] = 0;
      panRef.current.active = false;
      orbitRef.current.azimuth = 0;
      orbitRef.current.polar = 0;
      orbitRef.current.active = false;
      orbitRef.current.didDrag = false;
      zoomRef.current.z = 0;
      setPanning(false);
      document.body.style.cursor = "";
    };
    window.addEventListener(RESET_CAMERA_EVENT, onReset);

    // Minimap → camera-rig bridge. The minimap dispatches a CustomEvent
    // with { beatId } as detail; we activate that beat in the store, which
    // CameraRig already reacts to (it arcs into orbit).
    const onGoto = (e: Event) => {
      const detail = (e as CustomEvent<{ beatId?: string }>).detail;
      if (detail?.beatId) {
        // Clear pan first so the orbit lands on the beat center.
        panRef.current.offset[0] = 0;
        panRef.current.offset[1] = 0;
        useBeatGraphStore.getState().setActiveBeat(detail.beatId);
      }
    };
    window.addEventListener(GOTO_CAMERA_EVENT, onGoto);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener(RESET_CAMERA_EVENT, onReset);
      window.removeEventListener(GOTO_CAMERA_EVENT, onGoto);
    };
  }, [cameraZ]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0.4, cameraZ], fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        // DPR cap raised 1.75 → 2 so retina screens render the canvas at
        // native pixel density instead of an 87.5% downsample. Combined
        // with anisotropy 16 on each planet texture, surface detail stays
        // crisp under zoom. (1.5 max keeps mid-tier mobile from frying.)
        dpr={[1, Math.min(window.devicePixelRatio || 2, 2)]}
        // Force ACES tone mapping so postprocess Bloom uses correct luminance
        // space — prevents ember from clamping toward white. Issues #046 + #166.
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
        // Click on empty canvas (the missed event) returns to overview —
        // BUT only if we didn't just rotate. orbitRef.didDrag stays true
        // from the drag's pointerup until the next pointerdown, so this
        // check correctly tells "click" from "drag-then-release."
        onPointerMissed={() => {
          if (orbitRef.current.didDrag) return;
          if (activeBeatId) setActiveBeat(null);
        }}
      >
        <color attach="background" args={["#0a0908"]} />
        <ResponsiveCamera baseFov={42} baseZ={cameraZ} />

        {/* Lighting — pending planets must read clearly even with no emissive
            or atmosphere (per user: "initially none should be lit"). The
            previous 0.35 ambient was leaving Mercury and Moon at ~0.10
            brightness against bg-base 0.04 — borderline invisible. Bumped
            to 0.55 so non-luminous planets stay readable from texture +
            ambient alone, before they ever earn a glow. */}
        <ambientLight intensity={0.55} />
        <pointLight position={[2.5, 3, 5]} intensity={2.4} color="#f0a868" />
        <pointLight position={[-3, -1, 2]} intensity={1.0} color="#5e7080" />

        {/* Environment HDR in its OWN Suspense boundary so its (relatively
            slow) load doesn't gate the planets. Without this, the HDR
            being mid-flight would suspend the inner boundary that planets
            ALSO live in, leaving the canvas dark while we wait — exactly
            the "moment of dark space after Pulling focus disappears" the
            user flagged. Now planets render the moment their textures
            (already preloaded) resolve, regardless of HDR state. */}
        <Suspense fallback={null}>
          <Environment preset="night" background={false} />
        </Suspense>

        {/* Planets, stars, traces — share their own boundary so a single
            re-suspension here only briefly hides this subtree, not the
            full BeatMap3D via the outer canvas-route Suspense. */}
        <Suspense fallback={null}>
          {/* Distant starfield — drei's Stars sphere wrapped around the
              whole scene. Kept WITH the new <CosmicScene> below: stars are
              the deep-deep background twinkle; CosmicScene adds the
              foreground galaxy, asteroids, comets, and the distant ship. */}
          <Stars radius={140} depth={70} count={2400} factor={3.5} saturation={0} fade speed={0.25} />
          {/* The cosmic backdrop — galaxy nebula spiral, asteroid belt,
              comet trails, and a distant procedural spaceship. Sits
              behind the planets and the journey path. See cosmic-scene.tsx. */}
          <CosmicScene />
          <ConnectingPath positions={positions} />
          {beats.map((beat, i) => (
            <NodeMesh
              key={beat.beatId}
              beat={beat}
              position={positions[i]}
              onHoverChange={setHoveredBeatId}
              introIndex={i}
              // Guide the user to the first beat that hasn't been
              // worked yet. As soon as ANY beat is active, all guides
              // hide so the camera/drawer take focus. Once the user
              // closes the drawer, the guide returns on the next
              // unfinished beat — gentle nudge, not blocker.
              isGuidedTarget={
                activeBeatId === null &&
                guidedTargetId === beat.beatId
              }
            />
          ))}
        </Suspense>

        <AmbientParticles velocityRef={velocityRef} />

        <CameraRig
          beats={beats}
          positions={positions}
          activeBeatId={activeBeatId}
          hoveredBeatId={hoveredBeatId}
          overviewZ={cameraZ}
          panRef={panRef}
          orbitRef={orbitRef}
          zoomRef={zoomRef}
        />

        {/* Postprocessing stack:
              - Bloom: keeps the atmosphere shells glowing without over-blooming halos.
              - DepthOfField: focuses on the active node (pulled toward camera at z+0.4
                in NodeMesh). Subtle blur on the rest reads as a camera, not a viewport.
              - Vignette: soft edge fall-off; tightens the eye to the centre.
              See RESEARCH_PLANETARY.md §5 + 3D_PLAYBOOK.md §6. */}
        {/* Postprocessing recalibrated after the streak fix overshot:
              - Bloom threshold 0.6→0.32: orbs glow visibly again at idle,
                ember still doesn't clamp to white because tone-mapping +
                lower atmosphere opacity already prevent it.
              - DoF idle bokehScale 1.2→0.4: the canvas is no longer a
                blur-bath when nothing is selected. Inactive scenes need
                to *show*; only on-dive does the camera bias.
              - Vignette darkness eased so the orbs don't drown at the edges. */}
        {/* EffectComposer (Bloom + Vignette + DepthOfField) removed for proof
            of concept. Under React 19 + R3F 9 + @react-three/postprocessing
            3.0.4 wrapping postprocessing 6.39.1, the composer pipeline reads
            `.alpha` on a render-target/material that's null during the first
            commit, crashing the canvas. The nodes themselves render fine
            without it — atmosphere shells, holographic overlay on active,
            and Sparkles already give the scene visual weight. Re-introduce
            postprocess after the pipeline (Veo + stitch + delivery) is
            verified end-to-end. */}
      </Canvas>
      {/* Pan vignette removed (Tier 2 D3): the 5% edge-darkening was too
          quiet to register as feedback and added a persistent overlay layer
          during drags. The cursor's grabbing state already signals motion. */}
    </div>
  );
}
