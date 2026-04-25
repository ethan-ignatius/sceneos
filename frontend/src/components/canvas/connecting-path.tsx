import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

interface ConnectingPathProps {
  positions: Array<[number, number, number]>;
}

/**
 * Animated dashed-flow path threading through the beat nodes.
 *
 * Catmull-Rom spline → sampled `<points>` with a custom shader that
 * pulses a wave along the curve (per-vertex alpha modulated by
 * sin(progress*N - time*speed)). Reads as a flowing film-reel sprocket
 * pointing the eye L→R.
 *
 * Reduced-motion: wave freezes (time uniform stops advancing).
 */
export function ConnectingPath({ positions }: ConnectingPathProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const reducedMotion = usePrefersReducedMotion();

  const { geometry, sampleCount } = useMemo(() => {
    if (positions.length < 2) return { geometry: null, sampleCount: 0 };
    const vectorPoints = positions.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(vectorPoints);
    const n = positions.length * 12;
    const samples = curve.getPoints(n);

    // Per-vertex parameter t in [0..1] along the curve, written into the
    // `aProgress` attribute the shader reads.
    const progress = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      progress[i] = i / Math.max(samples.length - 1, 1);
    }

    const geo = new THREE.BufferGeometry().setFromPoints(samples);
    geo.setAttribute("aProgress", new THREE.BufferAttribute(progress, 1));
    return { geometry: geo, sampleCount: samples.length };
  }, [positions]);

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 3.0 },
        // Issue #168 — dim base + ember-dim accent so the line never clamps
        // to white in the bloom pass. Tone-mapping disabled below.
        uColorBase: { value: new THREE.Color("#5a504a") },
        uColorAccent: { value: new THREE.Color("#a87447") },
      },
      vertexShader: /* glsl */ `
        attribute float aProgress;
        uniform float uTime;
        uniform float uSize;
        varying float vProgress;
        varying float vWave;
        void main() {
          vProgress = aProgress;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          // Size attenuation; nearer points larger.
          gl_PointSize = uSize * (250.0 / -mvPos.z);
          // Wave: a soft sin pulse that travels along the curve.
          float wave = sin(aProgress * 8.0 - uTime * 2.0);
          vWave = smoothstep(0.4, 1.0, wave) * 0.85 + 0.15;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorBase;
        uniform vec3 uColorAccent;
        varying float vWave;
        void main() {
          // Round, soft-edged points.
          vec2 xy = gl_PointCoord - 0.5;
          float r = length(xy);
          if (r > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, r);
          vec3 color = mix(uColorBase, uColorAccent, vWave);
          gl_FragColor = vec4(color, alpha * (0.25 + vWave * 0.55));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return m;
  }, []);

  useFrame((state, delta) => {
    if (matRef.current && !reducedMotion) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
    void delta; // marker
  });

  if (!geometry || sampleCount === 0) return null;

  return (
    <points geometry={geometry}>
      <primitive object={material} ref={matRef} attach="material" />
    </points>
  );
}
