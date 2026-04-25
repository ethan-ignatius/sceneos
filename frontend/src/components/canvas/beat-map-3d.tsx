import { Canvas } from "@react-three/fiber";
import { Stars, Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Beat } from "@/types/manifest";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { useScrollVelocity } from "@/lib/use-scroll-velocity";
import { computeBeatPositions } from "@/lib/beat-layout";
import { NodeMesh } from "./node-mesh";
import { CameraRig } from "./camera-rig";
import { ConnectingPath } from "./connecting-path";
import { AmbientParticles } from "./ambient-particles";

interface BeatMap3DProps {
  beats: Beat[];
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

  // Bridge: scroll/wheel velocity → ambient particles' speed uniform.
  // The hook accumulates wheel/touch deltas, decays exponentially, and
  // exposes a velocityRef that we read each frame in <AmbientParticles>.
  const containerRef = useRef<HTMLDivElement>(null);
  const { velocityRef, registerElement } = useScrollVelocity();
  useEffect(() => {
    if (!containerRef.current) return;
    return registerElement(containerRef.current);
  }, [registerElement]);

  const positions = useMemo(() => computeBeatPositions(beats), [beats]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0.4, 5.5], fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 1.75]}
        // Click on empty canvas (the missed event) returns to overview.
        onPointerMissed={() => {
          if (activeBeatId) setActiveBeat(null);
        }}
      >
        <color attach="background" args={["#0a0908"]} />

        {/* Brighter ambient + warm key + cool fill so the PBR core sphere
            has something to bounce off. Higher intensity than the previous
            setup because emissive carries most of the visual; this just
            adds form. */}
        <ambientLight intensity={0.6} />
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
        />

        {/* Bloom intensity dropped from 0.9 → 0.55 because the atmosphere
            shells now carry most of the glow. Keeping bloom at the previous
            level over-blooms the halos. See RESEARCH_PLANETARY.md §5. */}
        <EffectComposer>
          <Bloom intensity={0.55} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.7} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
