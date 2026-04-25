# Planet Textures — Attribution

All textures in this directory are sourced from **Solar System Scope**:
- https://www.solarsystemscope.com/textures/

**License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
**Author:** Solar System Scope (https://www.solarsystemscope.com/)

This means we are free to use, modify, and redistribute these textures
commercially, **provided we credit the source**. The credit is satisfied by
this file plus a single line in the SceneOS About / How-it-works modal:

> Planet textures © Solar System Scope, CC BY 4.0.

Do not delete this file. Do not relocate the textures without copying this
attribution alongside them.

---

## Inventory

| File | Body | Used for beat mood | Recommended emissive map? |
|---|---|---|---|
| `2k_sun.jpg` | Sun | `intimate-hook` | Yes — its own emissive (intensity 0.8) |
| `2k_mercury.jpg` | Mercury | (spare) | No |
| `2k_venus_surface.jpg` | Venus surface | (spare) | No |
| `2k_venus_atmosphere.jpg` | Venus atmosphere | (overlay only) | No |
| `2k_earth_daymap.jpg` | Earth | `wide-establish` | No |
| `2k_earth_clouds.jpg` | Earth clouds | overlay (alpha) | No |
| `2k_mars.jpg` | Mars | `kinetic-rising` | No |
| `2k_jupiter.jpg` | Jupiter | `punchy-sting` | No |
| `2k_saturn.jpg` | Saturn body | `tense-climax` | No |
| `2k_saturn_ring_alpha.png` | Saturn rings | `tense-climax` (companion mesh) | No (alpha map for ring transparency) |
| `2k_uranus.jpg` | Uranus | (spare) | No |
| `2k_neptune.jpg` | Neptune | (spare) | No |
| `2k_moon.jpg` | Moon | `still-resolve` | No |
| `2k_stars.jpg` | Stars background | (already covered by drei `<Stars>`) | No (kept as fallback) |

All textures are equirectangular (2:1 aspect, 2048×1024 typical) and ready
for `THREE.SphereGeometry` with `meshStandardMaterial.map`. Use drei's
`useTexture()` hook to load them through R3F's Suspense.

## Loading recipe (reference — actual implementation in `node-mesh.tsx`)

```tsx
import { useTexture } from "@react-three/drei";

function Planet({ texture, isEmissive = false }) {
  const map = useTexture(`/textures/planets/${texture}`);
  return (
    <sphereGeometry args={[0.55, 64, 64]}>
      <meshStandardMaterial
        map={map}
        emissiveMap={isEmissive ? map : undefined}
        emissiveIntensity={isEmissive ? 0.8 : 0}
        roughness={0.6}
        metalness={0.1}
      />
    </sphereGeometry>
  );
}

// Preload during the page-crumple to avoid a Suspense gap on canvas mount.
useTexture.preload("/textures/planets/2k_sun.jpg");
useTexture.preload("/textures/planets/2k_earth_daymap.jpg");
// ...etc.
```

## Why these and not Blender glb models

See `docs/CANVAS_PLANETARY_OVERHAUL.md` §6.1: at SceneOS render distances
(planets occupy 0.5–1% of viewport most of the time), texture detail
dominates silhouette detail. A textured sphere reads correctly and costs
~5× less bandwidth + GPU than a 50MB glb model with multi-megabyte texture
maps. If a future revision wants Saturn with a 3D ring system that catches
proper lighting (instead of an alpha-mapped flat torus), Sketchfab CC0 +
Draco compression is the upgrade path documented there. **Don't pre-pull
those — only fetch when the textured-sphere approach has been visually
verified to fail the bar.**
