import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

interface ConnectingPathProps {
  positions: Array<[number, number, number]>;
}

/**
 * Circuit-trace flow path between beats.
 *
 * Replaces the previous Catmull-Rom spline with right-angle traces — between
 * each adjacent pair of beats, the path: exits the planet horizontally, lifts
 * to a "bus" elevation at the midpoint, runs along that bus, then drops back
 * down into the next planet. Reads like a logic-gate / PCB trace pattern,
 * which makes the beat sequence feel like a chained circuit (the user's ask).
 *
 * Rendered as evenly-spaced point dashes along the path with a sin-wave
 * alpha pulse — same "flow" effect as before, but the underlying geometry
 * now reads as deliberate routing, not soft drift.
 *
 * Reduced-motion: pulse freezes (time uniform stops advancing).
 */
export function ConnectingPath({ positions }: ConnectingPathProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const reducedMotion = usePrefersReducedMotion();

  const { geometry, sampleCount } = useMemo(() => {
    if (positions.length < 2) return { geometry: null, sampleCount: 0 };

    // Build the rectilinear path: for each adjacent beat pair, emit four
    // anchor points (exit · bus-up · bus-end · entry) and let the linear
    // interpolation between them sample the dashes evenly.
    //   p[i]──→──exitX──┐
    //                   │
    //                   └─────busBumpY─────┐
    //                                      │
    //                                      └──entryX──→──p[i+1]
    // BUS_HEIGHT 0.18 keeps the bump readable but still under the planet
    // labels. EDGE_OFFSET 0.38 is slightly inside the planet's visual
    // radius so the trace appears to dock to the surface; setting it to
    // the full radius (0.55) collides with the next beat's edge for the
    // 5-beat layout (beat spacing ~1.06; 2 × 0.55 > spacing) and the
    // trace would route backwards.
    const BUS_HEIGHT = 0.18;
    const EDGE_OFFSET = 0.38;

    const anchors: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const [ax, ay, az] = positions[i];
      const [bx, by, bz] = positions[i + 1];
      // Direction from a → b along the timeline x-axis.
      const dir = Math.sign(bx - ax) || 1;
      const exitX = ax + dir * EDGE_OFFSET;
      const entryX = bx - dir * EDGE_OFFSET;
      // Alternate bus-bump direction (up for even segments, down for odd)
      // so the trace zig-zags rather than always lifting up — feels more
      // like routed traces taking different paths past obstacles.
      const bumpY = i % 2 === 0 ? BUS_HEIGHT : -BUS_HEIGHT;
      anchors.push(
        new THREE.Vector3(exitX, ay, az),
        new THREE.Vector3(exitX, ay + bumpY, az),
        new THREE.Vector3(entryX, by + bumpY, bz),
        new THREE.Vector3(entryX, by, bz),
      );
    }

    // Densify each anchor segment with point samples — but ONLY within
    // a beat-pair. Each beat-pair contributes 4 anchors (exit · bus-up ·
    // bus-end · entry); we never lerp between one pair's `entry` and the
    // next pair's `exit` because that line would cut across the planet
    // body in between.
    const ANCHORS_PER_SEGMENT = 4;
    const numSegments = positions.length - 1;
    const samples: THREE.Vector3[] = [];
    for (let s = 0; s < numSegments; s++) {
      const base = s * ANCHORS_PER_SEGMENT;
      for (let i = 0; i < ANCHORS_PER_SEGMENT - 1; i++) {
        const a = anchors[base + i];
        const b = anchors[base + i + 1];
        const subSamples = 6;
        for (let k = 0; k < subSamples; k++) {
          samples.push(new THREE.Vector3().lerpVectors(a, b, k / subSamples));
        }
      }
      // Cap each segment with its own end-anchor so the dash doesn't
      // truncate one step short of the planet edge.
      samples.push(anchors[base + ANCHORS_PER_SEGMENT - 1]);
    }

    // Per-vertex parameter t in [0..1] along the path, written into the
    // `aProgress` attribute the shader reads. This drives the L→R pulse.
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
        // 4.5 (was 3.0) — circuit traces want crisp distinct dashes,
        // not a faint sampled curve. Larger points = each dash visible
        // on its own at any zoom level.
        uSize: { value: 4.5 },
        // Brighter accent to read as routed copper rather than dust.
        // Base stays low so the dim segments fall back into the void.
        uColorBase: { value: new THREE.Color("#6b5d50") },
        uColorAccent: { value: new THREE.Color("#c08858") },
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
