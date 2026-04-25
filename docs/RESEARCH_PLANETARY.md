# Research: Planetary / Glowing Sphere Techniques for SceneOS NodeMesh

Source repos cloned to `examples/` (gitignored). Goal: upgrade `frontend/src/components/canvas/node-mesh.tsx` from flat-shaded balls to premium glowing planet-orbs without adding dependencies.

---

## 1. TLDR — Top techniques to lift

The 5–7 small dark-canvas glowing spheres in our scene want these techniques, in priority order:

1. **Inverted-sphere additive halo** (a back-side-rendered sphere slightly larger than the planet, additive-blended, using a Fresnel falloff in the fragment shader). This is the single biggest visual upgrade — turns a "ball with bloom" into "orb with atmosphere." Source: `FakeGlowMaterial.jsx`.
2. **Fresnel rim term layered over a colored base** in a single shader (rim ≈ `pow(1 - dot(n,v), k)`). Use `MeshFresnelMaterial` style — base color + rim color mix, controllable `amount` / `offset` / `intensity`.
3. **Subtle vertex-noise breathing / surface deformation** with `drei`'s `MeshDistortMaterial` (or a custom variation) for ready-to-generate ember pulse — feels alive without per-frame allocations.
4. **`<Stars>` from drei** behind the scene — single line, instantly turns black background into "space."
5. **`<Sparkles>` around active node** — replaces our flat halo with depth-cued particles around the focused planet.
6. **Tone-mapping + bloom selective layers** — keep emissive intensity moderate (0.6–1.2) and let bloom handle the glow falloff, but tag halos as `depthWrite=false` to avoid bloom haloing the wrong meshes.

**Minimum viable upgrade**: replace `meshBasicMaterial` halo with a Fresnel-shader inverted sphere + keep `meshStandardMaterial` core but boost emissive workflow and add subtle distort.

---

## 2. Per-repo notes

### 2.1 `examples/fake-glow-material-r3f/` (MIT, ~10MB but src is tiny)

**What it does:** Drop-in custom `shaderMaterial` that produces a soft fresnel-driven glow halo. Demos pair an outer `<Sphere>` with `FakeGlowMaterial` over a smaller solid `meshPhysicalMaterial` sphere — the exact two-mesh layering we already use, but with a real shader instead of `MeshBasicMaterial`.

**Read first:**
- `examples/fake-glow-material-r3f/src/FakeGlowMaterial.jsx` — the entire shader (vertex + fragment) is here, ~80 lines, no dependencies beyond `@react-three/drei`'s `shaderMaterial`.
- `examples/fake-glow-material-r3f/src/Meshes.jsx` — shows the layering pattern (large halo sphere wrapping smaller solid sphere).

**Lift:** the entire `FakeGlowMaterial` component verbatim, parametrize `glowColor` per beat status (warm `#f0a868` for active/approved, cool `#5e7080` for idle), set `glowInternalRadius=4` and `falloff=1.5` for soft edges. `blending={AdditiveBlending}` + `depthWrite={false}` already matches our halo pattern.

### 2.2 `examples/fresnel-shader-material/` (Apache-2.0, 825KB)

**What it does:** Standalone Fresnel material that combines a Lambert-lit base color with a Fresnel rim — gives the sphere a body color and an iridescent rim, replacing `meshStandardMaterial` rather than wrapping it.

**Read first:**
- `examples/fresnel-shader-material/src/components/MeshFresnelMaterial.jsx` — full shader, ~95 lines. The `fresnelFunc(amount, offset, normal, view)` is the cleanest reusable rim formula in any of the three repos.

**Lift:** the `fresnelFunc` exactly:
```glsl
float fresnelFunc(float amount, float offset, vec3 normal, vec3 view) {
  return offset + (1.0 - offset) * pow(1.0 - dot(normal, view), amount);
}
```
Use this either as the core node material (for orb-with-iridescence look) or in a custom onBeforeCompile patch to `meshStandardMaterial` so we keep PBR shading and add a fresnel emissive boost on top.

### 2.3 `examples/threejs-holographic-material/` (MIT, ~7MB)

**What it does:** Time-animated holographic material with scanlines + fresnel + flicker. Way more than we need, but the **fresnel calculation pattern** (worldspace normals, view direction, blink-on-fresnel-only mode) is gold for our `ready-to-generate` pulse state.

**Read first:**
- `examples/threejs-holographic-material/src/HolographicMaterial.js` — fragment shader lines 139–183. The `flicker()` function and `blinkFresnelOnly` pattern are reusable.

**Lift:** the world-space fresnel block (lines 163–166) — slightly more correct than object-space, looks better when meshes rotate:
```glsl
vec3 viewDirectionW = normalize(cameraPosition - vPositionW);
float fresnelEffect = dot(viewDirectionW, vNormalW) * (1.6 - fresnelOpacity / 2.0);
fresnelEffect = clamp(fresnelAmount - fresnelEffect, 0., fresnelOpacity);
```
Skip the scanlines (too sci-fi for cinematic agent UI).

---

## 3. Recommended approach for our NodeMesh

**TL;DR**: keep our 3-mesh structure (halo + core + label) but upgrade halo from `meshBasicMaterial` to a Fresnel `shaderMaterial`, and patch the core's `meshStandardMaterial` to add a fresnel emissive boost. Add `<Stars>` once at the parent scene level, not per-node.

### 3.1 Core sphere (`meshRef`) — keep `meshStandardMaterial` but enhance

Stay with `meshStandardMaterial` for proper PBR lighting (we already have lights from `BeatMap3D`). Two changes:

```tsx
<sphereGeometry args={[0.42, 64, 64]} />  // bump 48→64 for cleaner rim
<meshStandardMaterial
  ref={materialRef}
  color={baseColor}
  emissive={emissiveColor}
  emissiveIntensity={baseEmissive + pulse}
  roughness={0.35}
  metalness={0.4}              // 0.1 → 0.4: subtle reflective sheen
  envMapIntensity={0.6}        // requires <Environment preset="night" /> at scene level
  toneMapped={true}
/>
```

Pair with **`<Environment preset="night" background={false} />`** at the `BeatMap3D` level — gives the spheres real reflections without textures.

### 3.2 Halo (`haloRef`) — swap to Fresnel shader, inverted sphere

Replace the current `meshBasicMaterial` halo with a custom shader material rendered on the **inside** of a slightly larger sphere (`side={THREE.BackSide}`). This is the single biggest visual win.

```tsx
<mesh ref={haloRef} scale={1.18}>
  <sphereGeometry args={[0.42, 32, 32]} />
  <atmosphereMaterial
    glowColor={isApproved ? "#f0a868" : "#5e7080"}
    falloff={1.4}
    glowInternalRadius={3.7}
    glowSharpness={0.5}
    opacity={haloOpacity}
    side={THREE.BackSide}
    transparent
    blending={THREE.AdditiveBlending}
    depthWrite={false}
  />
</mesh>
```

Lift the `FakeGlowMaterial` shader from the cloned repo verbatim into `frontend/src/components/canvas/atmosphere-material.tsx`.

### 3.3 Scene-level additions in `BeatMap3D` (NOT per node)

```tsx
import { Stars, Environment } from "@react-three/drei";

<Environment preset="night" background={false} />
<Stars
  radius={80}
  depth={40}
  count={1500}
  factor={3}
  saturation={0}
  fade
  speed={0.3}
/>
```

Both are **once per scene**, costing under 1 draw call each. `<Stars>` instantly transforms the void into space.

### 3.4 Active node only — Sparkles

Wrap the active beat in `<Sparkles>` — drei handles it with one shader-instanced mesh:

```tsx
{isActive && (
  <Sparkles
    count={20}
    scale={1.4}
    size={3}
    speed={0.4}
    opacity={0.7}
    color="#f0a868"
    noise={0.4}
  />
)}
```

### 3.5 Optional ember-pulse via MeshDistortMaterial

For `ready-to-generate` only, swap the core `meshStandardMaterial` for `<MeshDistortMaterial speed={1.2} distort={0.08} radius={1} />` — gives a subtle "breathing skin" effect tighter than scaling. Keep `distort` ≤ 0.1 or it goes blob-monster.

---

## 4. Copy-paste shader / drei snippets

### 4.1 Atmosphere material (lift from fake-glow-material-r3f)

Place in `frontend/src/components/canvas/atmosphere-material.tsx`:

```tsx
import { useMemo } from "react";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import { Color, AdditiveBlending, BackSide } from "three";

export const AtmosphereMaterial = ({
  falloff = 1.4,
  glowInternalRadius = 3.7,
  glowColor = "#f0a868",
  glowSharpness = 0.5,
  opacity = 0.7,
}) => {
  const Mat = useMemo(
    () =>
      shaderMaterial(
        {
          falloffAmount: falloff,
          glowInternalRadius,
          glowColor: new Color(glowColor),
          glowSharpness,
          opacity,
        },
        /* glsl */ `
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vec4 mp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * mp;
          vPosition = mp.xyz;
          vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
        }`,
        /* glsl */ `
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
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = dot(viewDir, normal);
          fresnel = pow(fresnel, glowInternalRadius + 0.1);
          float falloff = smoothstep(0., falloffAmount, fresnel);
          float glow = fresnel + fresnel * glowSharpness;
          glow *= falloff;
          gl_FragColor = vec4(clamp(glowColor * fresnel, 0., 1.), clamp(glow, 0., opacity));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
      ),
    [falloff, glowInternalRadius, glowColor, glowSharpness, opacity]
  );
  extend({ AtmosphereMaterial: Mat });
  return (
    <atmosphereMaterial
      key={Mat.key}
      side={BackSide}
      transparent
      blending={AdditiveBlending}
      depthWrite={false}
      depthTest
    />
  );
};
```

### 4.2 Reusable Fresnel function (drop into any shader)

```glsl
float fresnelFunc(float amount, float offset, vec3 normal, vec3 view) {
  return offset + (1.0 - offset) * pow(1.0 - dot(normal, view), amount);
}
```
Typical values: `amount=2.0, offset=0.05` → soft rim. `amount=4.0, offset=0.0` → hard rim.

### 4.3 Patch `meshStandardMaterial` for emissive fresnel boost (no full rewrite)

```tsx
const matRef = useRef<THREE.MeshStandardMaterial>(null);
useEffect(() => {
  const m = matRef.current;
  if (!m) return;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `
      #include <emissivemap_fragment>
      vec3 _vd = normalize(cameraPosition - vWorldPosition);
      float _rim = pow(1.0 - max(dot(normalize(vNormal), _vd), 0.0), 3.0);
      totalEmissiveRadiance += emissive * _rim * 1.5;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `
      #include <worldpos_vertex>
      vWorldPosition = worldPosition.xyz;
      `
    );
    shader.vertexShader = "varying vec3 vWorldPosition;\n" + shader.vertexShader;
    shader.fragmentShader = "varying vec3 vWorldPosition;\n" + shader.fragmentShader;
  };
}, []);
```
This keeps full PBR but adds rim-driven emissive — best of both worlds, no shader rewrite.

### 4.4 Drei prop combos for the BeatMap3D scene

```tsx
import { Stars, Environment, Sparkles } from "@react-three/drei";

// behind the beat graph
<Stars radius={80} depth={40} count={1500} factor={3} saturation={0} fade speed={0.3} />
<Environment preset="night" background={false} />

// only on active beat
{isActive && (
  <Sparkles count={20} scale={1.4} size={3} speed={0.4} opacity={0.7} color="#f0a868" noise={0.4} />
)}
```

### 4.5 Soft surface noise via MeshDistortMaterial (drei) — for ember-pulse

```tsx
import { MeshDistortMaterial } from "@react-three/drei";

<MeshDistortMaterial
  color={baseColor}
  emissive={emissiveColor}
  emissiveIntensity={baseEmissive + pulse}
  roughness={0.35}
  metalness={0.4}
  distort={isReady ? 0.08 : 0.02}    // keep low or it warps
  speed={isReady ? 1.2 : 0.4}
/>
```

---

## 5. Pitfalls

1. **Bloom over-blooms the halo**: if you keep our existing UnrealBloomPass + an additive halo, the halo gets bloomed *again*. Fix: render halos on a separate layer or set `material.toneMapped=false` on halo, and lower bloom intensity to ~0.4–0.6.
2. **Depth-fighting between core sphere and halo**: solved by `depthWrite={false}` on halo. Already correct in current code; keep it.
3. **Fresnel looks wrong with non-uniform scale**: if you scale the halo with `scale.setScalar()`, normals stay correct. If you do non-uniform scaling, you must `.normalMatrix` the normals or the rim wraps weirdly.
4. **`MeshDistortMaterial` distort > 0.15** turns spheres into blobs and breaks the planet read. Cap at 0.1.
5. **`<Stars>` count > 5000** drops frame rate fast on integrated GPUs. We have 5–7 nodes; 1500 stars is enough.
6. **`<Environment>` preset loads a 3MB HDR** — dev hot-reload feels slow. Use `preset="night"` once at scene root, not inside NodeMesh.
7. **`extend({ AtmosphereMaterial })` inside the component re-extends every render** — wrap in `useMemo` or hoist to module scope. Repos do `extend` inside the component but with `useMemo` guarding the material creation.
8. **Per-node Sparkles for 7 nodes** = 7 instanced shader meshes ticking each frame. Only render Sparkles around the *active* node.
9. **`#include <tonemapping_fragment>`** is required at the end of any custom fragment shader if your renderer has `toneMapping !== NoToneMapping`. Without it, colors look washed out vs. drei components.
10. **Don't double-bloom**: if you add `FakeGlowMaterial`-style halo, you can probably *reduce* the post-process bloom intensity by 30–40%. The halo carries the glow now.

---

## Sources

- [ektogamat/fake-glow-material-r3f](https://github.com/ektogamat/fake-glow-material-r3f) — MIT, primary lift target
- [OtanoStudio/Fresnel-Shader-Material](https://github.com/OtanoStudio/Fresnel-Shader-Material) — Apache-2.0, reusable `fresnelFunc`
- [ektogamat/threejs-holographic-material](https://github.com/ektogamat/threejs-holographic-material) — MIT, world-space fresnel pattern
- [Maxime Heckel — Study of Shaders with R3F](https://blog.maximeheckel.com/posts/the-study-of-shaders-with-react-three-fiber/) — concept reference
- [Sangil Lee — Realistic Earth with Shaders](https://sangillee.com/2024-06-07-create-realistic-earth-with-shaders/) — atmosphere fresnel walkthrough
- [pmndrs/lamina](https://github.com/pmndrs/lamina) — layer-based shader alternative (heavier, skipped)
- [drei MeshDistortMaterial](https://drei.docs.pmnd.rs/shaders/mesh-distort-material) — surface noise breathing
- [drei Sparkles](https://drei.docs.pmnd.rs/staging/sparkles) — active-node particle accent
- [MatiasGF Earth experiment](https://matiasgf.dev/experiments/earth) — visual reference for fresnel atmosphere
