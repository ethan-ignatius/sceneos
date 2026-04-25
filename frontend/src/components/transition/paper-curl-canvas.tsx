import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

/**
 * Full-viewport WebGL ember-burn overlay for the page-crumple transition.
 *
 * Mounted as a transparent overlay above the bridge route's DOM layers.
 * The fragment shader procedurally draws an ember-flame burn that sweeps
 * diagonally from bottom-right (1, 0) toward upper-left (0, 1) as
 * `progressRef.current.value` animates from 0 → 1 (driven by GSAP on the
 * outer route).
 *
 * Rendering setup:
 *   - Orthographic camera (no perspective, no projection math).
 *   - Single `<planeGeometry args={[2, 2]} />` mesh — a "screen quad" that
 *     fills NDC. The vertex shader bypasses view/projection and writes
 *     `gl_Position = vec4(position.xy, 0, 1)` directly.
 *   - `transparent` material with `depthTest: false` so it composites
 *     cleanly over the DOM behind it.
 *
 * Shader uniforms:
 *   - uTime     — accumulated frame time, drives noise wobble + spark flicker.
 *   - uProgress — 0..1, mirrored from the outer GSAP timeline via ref.
 *
 * Why a ref bridge instead of a prop: state-driven uniforms would re-render
 * the React tree every frame. Refs let GSAP mutate a JS object directly;
 * `useFrame` reads it and pushes into the shader.
 */
interface PaperCurlCanvasProps {
  progressRef: MutableRefObject<{ value: number }>;
}

export function PaperCurlCanvas({ progressRef }: PaperCurlCanvasProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], near: 0, far: 1, zoom: 1 }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      gl={{ alpha: true, premultipliedAlpha: false, antialias: false }}
      dpr={[1, 2]}
    >
      <BurnPlane progressRef={progressRef} />
    </Canvas>
  );
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;

  // Cheap deterministic hash for value noise.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Smooth 2D value noise, ~12 lines, zero deps.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Project this fragment's UV onto the burn-direction unit vector.
    // Burn axis: from bottom-right (1, 0) toward upper-left (0, 1).
    // Direction unit vec = (-1, 1) / sqrt(2). For each pixel:
    //   projection = ((vUv - origin) · dir) where origin = (1, 0)
    //              = ((vUv.x - 1) * -1 + vUv.y * 1) / sqrt(2)
    //              = (1 - vUv.x + vUv.y) / sqrt(2)
    // Range: 0 at bottom-right, sqrt(2) ≈ 1.41 at upper-left.
    float projection = (1.0 - vUv.x + vUv.y) / 1.4142;

    // Burn line position sweeps slightly beyond both endpoints so the
    // burn fully clears the screen at progress 0 and 1.
    float burnPos = mix(-0.10, 1.50, uProgress);

    // Wobble the burn edge with procedural noise — turns a clean diagonal
    // into something that reads as "real fire."
    float wobble = (noise(vUv * 6.0 + uTime * 0.6) - 0.5) * 0.08;

    // Signed distance from the burn line.
    //  d > 0  → burned (closer to bottom-right than the line)
    //  d == 0 → the burn edge (hottest)
    //  d < 0  → unburned (DOM still visible through the alpha)
    float d = burnPos - projection + wobble;

    // Visual regions via smoothstep ramps.
    float burned     = smoothstep(0.0, 0.08, d);                                            // fills bg-base in burned area
    float emberEdge  = smoothstep(-0.04, 0.0, d) * (1.0 - smoothstep(0.0, 0.06, d));        // hottest zone at the edge
    float emberHalo  = smoothstep(-0.18, -0.04, d) * (1.0 - smoothstep(0.0, 0.16, d));      // wider warm halo just before edge

    // Sparks: random hot pixels in the halo region, time-animated.
    vec2 sparkCoord = vUv * 60.0 + uTime * 1.2;
    float sparks = step(0.975, hash(floor(sparkCoord)))
                 * smoothstep(-0.18, -0.04, d)
                 * (1.0 - burned);

    // Ember palette — matched to brand-ember (#f0a868) family.
    vec3 emberHot  = vec3(1.00, 0.85, 0.55);
    vec3 emberWarm = vec3(0.94, 0.66, 0.41);
    vec3 emberDeep = vec3(0.66, 0.33, 0.18);
    vec3 bgBase    = vec3(0.039, 0.035, 0.031);

    // Composite the ember layer.
    vec3 emberColor = emberHot  * emberEdge * 1.6
                    + emberWarm * emberEdge * 0.8
                    + emberDeep * emberHalo * 0.6
                    + emberHot  * sparks    * 1.4;

    // Blend toward bg-base in burned regions (the "void" the user falls into).
    vec3 finalColor = mix(emberColor, bgBase, burned * 0.95);

    // Alpha = max of every visible region. Unburned region stays alpha 0
    // so the DOM beneath shows through.
    float alpha = max(burned * 0.96,
                  max(emberEdge,
                  max(emberHalo * 0.35, sparks * 0.9)));

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

function BurnPlane({ progressRef }: PaperCurlCanvasProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Uniforms must be stable across renders or Three rebuilds the program.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
    }),
    [],
  );

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    materialRef.current.uniforms.uProgress.value = progressRef.current.value;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default PaperCurlCanvas;
