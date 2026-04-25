import { Canvas, useThree } from "@react-three/fiber";
import { Stars, Environment } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { useScrollVelocity } from "@/lib/use-scroll-velocity";
import { computeBeatPositions } from "@/lib/beat-layout";
import { NodeMesh } from "./node-mesh";
import { CameraRig, type PanState } from "./camera-rig";
import { ConnectingPath } from "./connecting-path";
import { AmbientParticles } from "./ambient-particles";

/**
 * Custom event the route chrome (Esc handler, Re-center button) dispatches
 * to clear the camera's pan offset without lifting the ref into a store.
 * Listened-for at the BeatMap3D level — see the useEffect below.
 */
export const RESET_CAMERA_EVENT = "sceneos:camera:reset";

/**
 * Minimap → camera bridge. Detail: { beatId } activates that beat (camera
 * arcs into orbit). Same one-shot CustomEvent pattern as RESET; lives at
 * the same level so the minimap stays decoupled from the WebGL tree.
 */
export const GOTO_CAMERA_EVENT = "sceneos:camera:goto";

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

  // Camera distance scales with beat count (#161): default 5.5 fits 5 beats;
  // 7 needs ~6.7, 12 needs ~10.5. Pull back so outer beats stay in frustum.
  // FOV widens on portrait viewports (#152) — see `<ResponsiveCamera>` below.
  const cameraZ = 4 + Math.max(beats.length, 5) * 0.6;

  // ── Pan state ──────────────────────────────────────────────────────────
  // The pan ref lives outside React so middle-drag never triggers a route
  // re-render. CameraRig reads it each frame; this component writes to it
  // from pointer events. RESET_CAMERA_EVENT (Esc / Re-center) zeros it.
  const panRef = useRef<PanState>({ offset: [0, 0], active: false });

  // Middle-button drag → world-unit translation on the XY plane.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let anchorX = 0;
    let anchorY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;

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
      // Middle button only. Left = node click; right = browser default.
      if (e.button !== 1) return;
      e.preventDefault(); // suppress browser auto-scroll cursor
      panRef.current.active = true;
      setPanning(true);
      anchorX = e.clientX;
      anchorY = e.clientY;
      startOffsetX = panRef.current.offset[0];
      startOffsetY = panRef.current.offset[1];
      el.setPointerCapture(e.pointerId);
      document.body.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panRef.current.active) return;
      const { x: wpxX, y: wpxY } = worldPerPx();
      // Drag-right moves camera target right → scene drifts left. Match
      // common 3D-tool convention where dragging brings the world with you.
      const dx = (e.clientX - anchorX) * wpxX;
      const dy = (e.clientY - anchorY) * wpxY;
      panRef.current.offset[0] = startOffsetX - dx;
      panRef.current.offset[1] = startOffsetY + dy; // screen-y is flipped
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 1 || !panRef.current.active) return;
      panRef.current.active = false;
      setPanning(false);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* released already; no-op */
      }
      document.body.style.cursor = "";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    // External reset (Esc / Re-center button) — zero the pan offset.
    const onReset = () => {
      panRef.current.offset[0] = 0;
      panRef.current.offset[1] = 0;
      panRef.current.active = false;
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
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener(RESET_CAMERA_EVENT, onReset);
      window.removeEventListener(GOTO_CAMERA_EVENT, onGoto);
    };
  }, [cameraZ]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0.4, cameraZ], fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 1.75]}
        // Force ACES tone mapping so postprocess Bloom uses correct luminance
        // space — prevents ember from clamping toward white. Issues #046 + #166.
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
        // Click on empty canvas (the missed event) returns to overview.
        onPointerMissed={() => {
          if (activeBeatId) setActiveBeat(null);
        }}
      >
        <color attach="background" args={["#0a0908"]} />
        <ResponsiveCamera baseFov={42} baseZ={cameraZ} />

        {/* Lighting recalibrated for textured planet bodies (Phase 2):
              ambient 0.6→0.35 — textures carry their own tonal range; over-
                lighting them flattens detail. Keep enough fill that the
                shadowed crescent still reads.
              warm key 2.4 — Sun-side accent; matches our "ember is the only
                hue language" rule (PHILOSOPHY §3).
              cool fill 1.0 — counterweight, prevents the dark side from
                disappearing into bg-base. */}
        <ambientLight intensity={0.35} />
        <pointLight position={[2.5, 3, 5]} intensity={2.4} color="#f0a868" />
        <pointLight position={[-3, -1, 2]} intensity={1.0} color="#5e7080" />

        {/* `background={false}` keeps the HDR for reflections only — we keep
            our explicit warm-near-black `<color>` background. */}
        <Environment preset="night" background={false} />
        <Stars radius={80} depth={40} count={1500} factor={3} saturation={0} fade speed={0.3} />

        <ConnectingPath positions={positions} />

        {beats.map((beat, i) => (
          <NodeMesh
            key={beat.beatId}
            beat={beat}
            position={positions[i]}
            onHoverChange={setHoveredBeatId}
          />
        ))}

        <AmbientParticles velocityRef={velocityRef} />

        <CameraRig
          beats={beats}
          positions={positions}
          activeBeatId={activeBeatId}
          hoveredBeatId={hoveredBeatId}
          overviewZ={cameraZ}
          panRef={panRef}
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
      {/* Edge-vignette feedback while panning. Gentle 5% darkening at the
          frame edges signals "you're in motion" without obstructing the
          scene. CSS-only; no per-frame React work. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out ${
          panning ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.18) 100%)",
        }}
      />
    </div>
  );
}
