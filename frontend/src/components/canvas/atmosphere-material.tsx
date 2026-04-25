import { useMemo } from "react";
import { AdditiveBlending, BackSide, Color, ShaderMaterial } from "three";

/**
 * Atmosphere fake-glow shader, lifted (with thanks) from
 * https://github.com/ektogamat/fake-glow-material-r3f (MIT, Anderson Mancini)
 * — cloned to `examples/fake-glow-material-r3f/`. Adapted to a hook that
 * returns a `ShaderMaterial` instance, which the consumer attaches via the
 * `material` prop on a `<mesh>` (avoids the JSX-element augmentation dance).
 *
 * Pattern: an *inverted* (BackSide) sphere slightly larger than the core.
 * The fragment shader's view-direction-dependent fresnel produces a soft
 * atmospheric halo that's denser at the silhouette edges and falls off
 * toward the center. Reads as "planet with atmosphere," not "ball with bloom."
 *
 * Each call returns a STABLE material instance (memoised on construction
 * params) — uniform values are mutated each frame inside <NodeMesh>'s
 * useFrame for color/intensity changes; you do NOT rebuild the material.
 */

interface AtmosphereOptions {
  /** Initial halo color (mutate `material.uniforms.glowColor.value` later). */
  glowColor?: string;
  /** 0..1 falloff: lower = softer, higher = harder edge. */
  falloff?: number;
  /** Higher = tighter, sharper rim. 3–6 for ember atmospheres. */
  glowInternalRadius?: number;
  /** Edge sharpness multiplier. */
  glowSharpness?: number;
  /** Initial peak opacity (clamp). */
  opacity?: number;
}

const VERT = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    vec4 modelNormal = modelMatrix * vec4(normal, 0.0);
    vPosition = modelPosition.xyz;
    vNormal = modelNormal.xyz;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 glowColor;
  uniform float falloffAmount;
  uniform float glowSharpness;
  uniform float glowInternalRadius;
  uniform float opacity;

  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    vec3 normal = normalize(vNormal);
    if (!gl_FrontFacing) normal *= -1.0;
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = dot(viewDirection, normal);
    fresnel = pow(fresnel, glowInternalRadius + 0.1);
    float falloff = smoothstep(0., falloffAmount, fresnel);
    float fakeGlow = fresnel;
    fakeGlow += fresnel * glowSharpness;
    fakeGlow *= falloff;
    gl_FragColor = vec4(clamp(glowColor * fresnel, 0., 1.0), clamp(fakeGlow, 0., opacity));

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function useAtmosphereMaterial(opts: AtmosphereOptions = {}): ShaderMaterial {
  const {
    glowColor = "#f0a868",
    falloff = 0.1,
    glowInternalRadius = 6.0,
    glowSharpness = 1.0,
    opacity = 1.0,
  } = opts;
  return useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        glowColor: { value: new Color(glowColor) },
        falloffAmount: { value: falloff },
        glowInternalRadius: { value: glowInternalRadius },
        glowSharpness: { value: glowSharpness },
        opacity: { value: opacity },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    // The material is intentionally constructed once; the consumer mutates
    // uniforms each frame instead of recreating it on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
