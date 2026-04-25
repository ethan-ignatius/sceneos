import { useMemo } from "react";
import { AdditiveBlending, Color, FrontSide, ShaderMaterial } from "three";

/**
 * Holographic material — animated stripe + fresnel + flicker.
 * Lifted from ektogamat/threejs-holographic-material (MIT, Anderson Mancini)
 * — see `examples/threejs-holographic-material/src/HolographicMaterial.js`.
 *
 * Adapted to a TS hook returning a stable `ShaderMaterial`. Consumer mutates
 * `material.uniforms.time.value` each frame in useFrame; nothing else needs
 * to change once mounted.
 *
 * Used on the **active** beat node so the orb visibly *changes personality*
 * when activated — scanlines + fresnel rim + iridescent shift. The visual
 * story is "this beat is now in focus" without a label.
 */

interface HolographicOptions {
  hologramColor?: string;
  fresnelAmount?: number;
  fresnelOpacity?: number;
  scanlineSize?: number;
  hologramBrightness?: number;
  signalSpeed?: number;
  hologramOpacity?: number;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vPos;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vUv = uv;
    vPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vPositionW = vec3(vec4(position, 1.0) * modelMatrix);
    vNormalW = normalize(vec3(vec4(normal, 0.0) * modelMatrix));
    gl_Position = vPos;
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPositionW;
  varying vec4 vPos;
  varying vec3 vNormalW;

  uniform float time;
  uniform float fresnelOpacity;
  uniform float scanlineSize;
  uniform float fresnelAmount;
  uniform float signalSpeed;
  uniform float hologramBrightness;
  uniform float hologramOpacity;
  uniform vec3 hologramColor;

  float flicker(float amt, float t) {
    return clamp(fract(cos(t) * 43758.5453123), amt, 1.0);
  }
  float random(in float a, in float b) {
    return fract((cos(dot(vec2(a, b), vec2(12.9898, 78.233))) * 43758.5453));
  }

  void main() {
    vec2 vCoords = vPos.xy / vPos.w;
    vCoords = vCoords * 0.5 + 0.5;
    vec2 myUV = fract(vCoords);

    vec4 holo = vec4(hologramColor, mix(hologramBrightness, vUv.y, 0.5));

    // Scanlines
    float scanlines = 10.0;
    scanlines += 20.0 * sin(time * signalSpeed * 20.8 - myUV.y * 60.0 * scanlineSize);
    scanlines *= smoothstep(1.3 * cos(time * signalSpeed + myUV.y * scanlineSize), 0.78, 0.9);
    scanlines *= max(0.25, sin(time * signalSpeed) * 1.0);

    // Color noise
    float r = random(vUv.x, vUv.y);
    float b = random(vUv.y * 0.9, vUv.y * 0.2);

    holo += vec4(r * scanlines, b * scanlines, r, 1.0) / 84.0;
    vec4 scanlineMix = mix(vec4(0.0), holo, holo.a);

    // Fresnel
    vec3 viewDirectionW = normalize(cameraPosition - vPositionW);
    float fresnelEffect = dot(viewDirectionW, vNormalW) * (1.6 - fresnelOpacity / 2.0);
    fresnelEffect = clamp(fresnelAmount - fresnelEffect, 0.0, fresnelOpacity);

    // Blink-on-fresnel-only
    float blinkValue = 0.6 - signalSpeed;
    float blink = flicker(blinkValue, time * signalSpeed * 0.02);

    vec3 finalColor = scanlineMix.rgb + fresnelEffect * blink;
    gl_FragColor = vec4(finalColor, hologramOpacity);
  }
`;

export function useHolographicMaterial(opts: HolographicOptions = {}): ShaderMaterial {
  const {
    hologramColor = "#f0a868",
    fresnelAmount = 0.45,
    fresnelOpacity = 1.0,
    scanlineSize = 8.0,
    hologramBrightness = 1.2,
    signalSpeed = 0.45,
    hologramOpacity = 1.0,
  } = opts;
  return useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        fresnelAmount: { value: fresnelAmount },
        fresnelOpacity: { value: fresnelOpacity },
        scanlineSize: { value: scanlineSize },
        hologramBrightness: { value: hologramBrightness },
        signalSpeed: { value: signalSpeed },
        hologramOpacity: { value: hologramOpacity },
        hologramColor: { value: new Color(hologramColor) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: FrontSide,
      transparent: true,
      blending: AdditiveBlending,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
