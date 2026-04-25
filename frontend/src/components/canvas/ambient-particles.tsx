import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface AmbientParticlesProps {
  /** Smoothed scroll velocity from useScrollVelocity. -1..1 ish. */
  velocityRef: React.MutableRefObject<number>;
}

/**
 * Drei <Sparkles> field with scroll-velocity-driven speed.
 *
 * Sparkles is a shader-instanced primitive — 200 particles cost ~1 drawcall.
 * Its `speed` prop is read once at mount, so to make it reactive we mutate
 * the underlying material's uniforms.speed.value via ref each frame. This
 * is the same ref-bridge pattern used in Phase 2 for the burn shader.
 *
 * Reaction shape: baseSpeed × (1 + min(|velocity| * 8, 1.5)) → 1× idle,
 * up to ~2.5× when the user scrolls or drags hard. Decays with the
 * scroll-velocity hook's exponential decay (rate 5 by default).
 */
const BASE_SPEED = 0.3;

export function AmbientParticles({ velocityRef }: AmbientParticlesProps) {
  const sparklesRef = useRef<THREE.Points>(null);

  useFrame(() => {
    const mat = sparklesRef.current?.material as
      | (THREE.ShaderMaterial & { uniforms: { speed?: { value: number } } })
      | undefined;
    if (!mat?.uniforms?.speed) return;
    const v = Math.min(Math.abs(velocityRef.current) * 8, 1.5);
    mat.uniforms.speed.value = BASE_SPEED * (1 + v);
  });

  return (
    <Sparkles
      ref={sparklesRef as unknown as React.Ref<THREE.Points>}
      count={200}
      scale={[14, 8, 8]}
      size={1.6}
      speed={BASE_SPEED}
      noise={1}
      opacity={0.5}
      color="#f0a868"
    />
  );
}
