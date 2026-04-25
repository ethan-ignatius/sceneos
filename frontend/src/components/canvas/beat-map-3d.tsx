import { Canvas } from "@react-three/fiber";
import { Stars, OrbitControls, Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { Beat } from "@/types/manifest";
import { NodeMesh } from "./node-mesh";

interface BeatMap3DProps {
  beats: Beat[];
}

/**
 * 3D canvas of beat nodes laid out along a gentle z-recession curve.
 * v0: nodes on a 1D path with subtle vertical staggering. Later we can morph
 * to a tree layout for feature mode (recursive nodes) and tweak camera rig
 * to a Forza-style fly-through.
 */
export function BeatMap3D({ beats }: BeatMap3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 5.5], fov: 42 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
    >
      <color attach="background" args={["#0a0908"]} />

      <ambientLight intensity={0.25} />
      <pointLight position={[2.5, 3, 5]} intensity={1.6} color="#f0a868" />
      <pointLight position={[-3, -1, 2]} intensity={0.6} color="#5e7080" />

      <Environment preset="night" />
      <Stars radius={28} depth={48} count={1800} factor={3} fade speed={0.4} />

      {beats.map((beat, i) => {
        const total = Math.max(beats.length - 1, 1);
        const t = i / total; // 0..1
        const x = (t - 0.5) * (beats.length * 1.05);
        const y = Math.sin(t * Math.PI) * 0.45 - 0.1;
        const z = -t * 1.1;
        return <NodeMesh key={beat.beatId} beat={beat} position={[x, y, z]} index={i} />;
      })}

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.9}
        rotateSpeed={0.35}
      />

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
