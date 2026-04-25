# Canvas Planetary Overhaul — Plan

> Owner: Alex. Status: 🟡 PLAN. Last updated: 2026-04-25.
>
> Pre-reqs: read `SENIOR_FRONTEND_TRANSMISSION.md` once. Refer back to
> `RESEARCH_PLANETARY.md` for shader recipes already lifted into the codebase.

This is the planning document for the next canvas pass. **Do not touch
code yet.** When the asset curation in §6 is approved and the implementation
checklist in §8 is read end-to-end, we move to a separate execution PR.

---

## 1. North star (one paragraph)

The user types a one-line idea. Lands on the canvas. **Sees a tiny solar
system** of 7 distinct planets, each one a beat of the dramatic arc, each
with its own visual personality (Saturn for `tense-climax`, Mars for
`kinetic-rising`, Sun for `intimate-hook`, etc.). The user can **pan freely
with middle-mouse-and-hold** to wander the system, or **click a planet to
fly into orbit around it** — the camera arcs in, the planet fills the
viewport, the chrome overlays a director's slate with the agent's question
and three suggested answers. Click empty space → camera lerps back to the
overview. The system is alive: each planet rotates, the chain ribbon
between them pulses faintly, sparkles drift, the ambient projector hum
underscores everything. **State persists across reloads** (zustand persist;
already in place); a hard refresh mid-pipeline lands the user back on
their canvas with progress intact.

This is `Tesla cockpit + Nolan trailer + planetarium`. Anything less is
generic.

## 2. Diagnosis: where the canvas is now

| Element | Current | Senior FE verdict |
|---|---|---|
| Per-beat geometry | Per-mood primitive (`sphere`, `icosahedron`, `torus-knot`, `dodecahedron`, `ring-disc`) — see `node-mesh.tsx:21-36` | **Reads as primitives, not planets.** Holographic overlay on active is the only reason it doesn't feel student-project. We need real planetary identity per node. |
| Atmosphere shell | Custom `useAtmosphereMaterial` shader (BackSide, additive blend) — `atmosphere-material.tsx` | **Keep as-is.** This is the moat from `RESEARCH_PLANETARY.md` and it's tuned. |
| Holographic active overlay | `useHolographicMaterial` time-uniform shader — `holographic-material.tsx` | **Keep.** Distinct active state without a label. |
| Lighting | ambient 0.6 + warm key 2.4 + cool fill 1.0 + `<Environment preset="night">` | **OK for primitives; will need re-tuning for textured planets** (PBR planet textures look flat under additive bloom; lower ambient when textures land). |
| Camera rig | `camera-rig.tsx` — lerp-based, summed signals (active target, hover offset, idle breath) | **Architecture is right.** Add a fourth signal: pan offset (middle-drag). |
| Navigation | Click node = fly. Click empty = back to overview. **No free pan.** | **Missing the wandering UX.** Adding middle-drag-to-pan is the centerpiece of this overhaul. |
| Connecting path | Catmull-Rom + `<points>` with sin-wave alpha — `connecting-path.tsx` | **Keep, but recolor to ember-dim and break the path at hard-cut beats** (chain primitive — see §5). |
| Ambient particles | drei `<Sparkles>` velocity-reactive — `ambient-particles.tsx` | **Keep.** |
| Stars | drei `<Stars>` 1500 count | **Keep.** |
| Postprocessing | EffectComposer disabled (`alpha`-null crash on first pass) | **Defer until end of overhaul.** Per `SENIOR_FRONTEND_TRANSMISSION.md` §11 — composer is the LAST thing to add back, and only behind a `requestAnimationFrame` mount gate. |
| Click-into-investigate | Active node z-offset +0.4, camera lerps to `[ax+0.2, ay+0.4, az+1.2]` looking at the node | **Acceptable but undersold.** "Orbit" is implied but the camera doesn't actually orbit. Add a slow azimuth drift while the active node holds focus, parallax-driven by mouse position. |
| Default-position return | `onPointerMissed` → `setActiveBeat(null)` → camera lerps to `[0, 0.4, cameraZ]` | **Works but feels accidental.** Add a deliberate "Re-center" affordance (subtle bottom-right chrome button + ⎋ Esc keybind). |
| Node label | `<Html>` floating italic display name | **Keep, but elevate** — add a subtle distance-faded sub-label ("Hook · 5s · 0/3 answered") on hover. |
| State persistence | Zustand persist (`sceneos:beat-graph`) — manifest, activeBeatId persisted; `decomposeStatus` excluded via `partialize` | **Already correct.** No change. |

## 3. The agentic pipeline lens (per `STATE.md`)

The 7-beat `story.*` arc is now canonical. The orchestrator runs deterministic
per-beat: motion preset → reference images (character + location) → clipPrompt
→ provider.generate. The agent emits **3 suggested-answer chips per question**
and a structured `beatFacts` object. Every clip exposes a **`lastFrameUrl`** that
seeds the next beat's I2V (chain primitive); some beats can have
`chainFromPrevious === false` (hard cut).

The canvas must surface, *without revealing structure*:

| Pipeline concept | Canvas treatment |
|---|---|
| 7 beats of a story arc | 7 distinct planets in a heliocentric arrangement (sun-at-center if we go with the metaphor, or arc-along-the-z-recession we already have) |
| Beat status (pending → questioning → ready → generating → preview → approved) | Per-state planet rendering: emissive intensity, halo scale, holographic overlay (already mapped — keep) |
| Chain between beats | Connecting path: ember-dim filaments threading from beat N's "exit" to beat N+1's "entrance" |
| Hard cut (`chainFromPrevious=false`) | Path **breaks** before that beat — visual cue without text |
| Reference images (character/location) | Two small thumbnails inside the active beat's drawer (not on the canvas itself — keep canvas clean) |
| `seedImageUrl` for the active beat (just-generated) | A 64×64 thumbnail in the bottom-right corner of the drawer header |
| Generation in flight | Planet emits a slow-pulsing ring (1.6s period), ember-warm; same `ember-pulse` already in tokens |

**Discipline**: the canvas is *the planetary system of the story*. The
director's slate (drawer) is where pipeline mechanics live. Don't bleed the
mechanics into the planetary view.

## 4. Navigation UX — middle-click pan + intuitive return

### 4.1 Goals

- Free pan: middle-mouse-button **press-and-drag** translates the camera target across the XY plane (no Z change). The camera lerps to the displaced target each frame; releasing the button keeps the displacement until the user clicks a node, presses Esc, or hits the Re-center affordance.
- Drag inertia: on release, velocity-driven decay (~600ms exp falloff) so the wander feels like a real camera, not a snap.
- Click a planet → camera arcs to its orbit; pan is **discarded** (we hand the user a deliberate cinematographic move).
- Click empty space (when no active node + no significant pan) → no-op.
- Click empty space (when a node is active OR pan offset is non-zero) → return to overview, including pan offset reset.
- **Esc** = return to overview from anywhere (including mid-pan).
- **Re-center button** in bottom-right chrome — subtle, ember-dim, cursor-target style — "Center the system." Always visible, only shown when the camera is non-default.

### 4.2 Camera signal stack (extension to `camera-rig.tsx`)

Each frame, the rig sums four signals to produce `targetPos`:

```
overviewBase = (0, 0.4, cameraZ)
activeOffset = active ? (active.x + 0.2, active.y + 0.4, active.z + 1.2 - overviewBase.z) : (0, 0, 0)
hoverOffset  = (hovered && !active) ? (hovered.x * 0.025, hovered.y * 0.025, 0) : (0, 0, 0)
panOffset    = panRef.current  // (x, y, 0), lerped to 0 when no pan & no active
breathOffset = (0, 0, sin(t/8 * τ) * 0.04)

target = overviewBase + activeOffset + hoverOffset + panOffset + breathOffset
camera.position.lerp(target, 0.06)
```

The pan layer is purely additive; existing logic stays.

### 4.3 Pan implementation sketch (no code yet)

In `beat-map-3d.tsx`:
- `containerRef.onPointerDown` (button === 1, i.e. middle-mouse): set `panActive = true`, store anchor pointer position, prevent default (stop browser auto-scroll cursor).
- `window.onPointerMove` (when active): translate delta into world-space XY using the camera's projected scale at z=0; write to `panRef.current` via setter.
- `window.onPointerUp` (button === 1): release with current velocity; let an inertia tick decay it via `vec.lerp` over ~600ms.
- When `activeBeatId` becomes set: instantly clear `panRef.current` (transported to a node = no residual pan).
- When `Esc` pressed or Re-center clicked: lerp `panRef.current` to (0,0,0) and clear `activeBeatId`.

Touch parity: pinch-to-zoom is out of hackathon scope; two-finger pan is in scope iff trivial (pointer events with multi-touch fallback).

### 4.4 Click-into-investigate refinement

When `activeBeatId` is set, the camera arcs to a closer orbit position than
the current `+1.2 z`. New target: `(ax + 0.2, ay + 0.4, az + 0.6)` — closer
to the planet so its surface fills more of the frame. Add a slow azimuth
drift: at full active-state, sum a tiny `(sin(t * 0.15) * 0.08, 0, 0)` to the
target so the camera *orbits the planet* over ~40s. Reads as Christopher
Nolan letting the camera breathe around the subject.

The orbit is **suspended when the user is panning** (their drag wins).

### 4.5 Affordance polish

- Cursor changes to `grab` on `pointerdown.button=1`, `grabbing` while held.
- Subtle vignette darkens the screen edges by ~5% during pan (CSS overlay,
  `transition-opacity duration-200`) — gives a "you're in motion" cue.
- The Re-center button uses `MagneticButton` primitive (already shipped),
  ember-dim variant, with a corner-tick flicker on hover.

## 5. Planetary identity — per-mood mapping

Each beat gets a planet whose visual personality matches its mood. The
existing per-mood `geometryForMood()` becomes per-mood `planetForMood()`,
swapping primitive geometries for textured spheres (or assets — see §6).

| Beat mood | Planet | Why |
|---|---|---|
| `wide-establish` | **Earth** (blue marble) | Calm, broad, world-establishing |
| `intimate-hook` | **Sun** (warm corona) | Intimate, warm, draws the eye |
| `kinetic-rising` | **Mars** (rust desaturated) | Kinetic, dry, conflict-coded |
| `tense-climax` | **Saturn** (with rings) | Heightened, dramatic — the rings carry visual weight |
| `still-resolve` | **Moon** (cool grey) | Stilled, resolved, settled palette |
| `punchy-sting` | **Jupiter** (graphic banded) | Punchy, iconic, graphic |

The 7-beat `story.*` arc maps to the same six moods (some moods repeat
across beats — `intimate-hook` is both Hook AND Inciting; `still-resolve` is
both Falling and Resolution). When two beats share a mood, **vary the camera
treatment** (different orbit altitude, different azimuth) so they don't feel
like duplicates.

The atmosphere shell shader (already lifted from `RESEARCH_PLANETARY.md` §3.2)
**stays**. We tint it per planet:
- Earth: `#5e7080` cool atmosphere
- Sun: `#ffb874` ember corona, +30% intensity
- Mars: `#a87447` ember-dim
- Saturn: `#c5b9a8` warm grey
- Moon: `#5e7080` cool, low intensity
- Jupiter: `#d4a373` warm banded

## 6. Asset curation — free, premium-quality, license-clean

The fastest path to "this looks like a film" is a **2K equirectangular planet
texture** applied to `<sphereGeometry args={[r, 64, 64]} />` with our existing
PBR `meshStandardMaterial`. We keep our atmosphere shell and holographic
overlay layered on top. **No need for full Blender models** — a textured
sphere reads correctly at the camera distances we use (planets are 0.5–1
viewport-percent of the screen most of the time; texture detail dominates
silhouette detail).

If we later want fine geometry (Saturn's rings as a separate ringed mesh,
asteroid belts, gas-giant volumetric clouds), §6.4 lists glb/gltf options.

### 6.1 Solar System Scope textures (recommended primary source)

**License**: CC BY 4.0 (attribution required — single line in About / footer).
**Quality**: 2K / 4K / 8K equirectangular maps, hand-tuned, NASA-grade.
**Why**: smallest delta from current code. Apply to existing sphere with
`textureLoader.load()`. Each texture is 1–4 MB at 2K; well within budget.

| Body | URL | Recommended res |
|---|---|---|
| Sun | https://www.solarsystemscope.com/textures/download/2k_sun.jpg | 2K |
| Mercury | https://www.solarsystemscope.com/textures/download/2k_mercury.jpg | 2K |
| Venus surface | https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg | 2K |
| Venus atmosphere | https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg | 2K |
| Earth daymap | https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg | 2K |
| Earth normal | https://www.solarsystemscope.com/textures/download/2k_earth_normal_map.tif | 2K |
| Earth specular | https://www.solarsystemscope.com/textures/download/2k_earth_specular_map.tif | 2K |
| Earth clouds | https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg | 2K (alpha overlay) |
| Mars | https://www.solarsystemscope.com/textures/download/2k_mars.jpg | 2K |
| Jupiter | https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg | 2K |
| Saturn | https://www.solarsystemscope.com/textures/download/2k_saturn.jpg | 2K |
| Saturn rings | https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png | 2K (alpha) |
| Uranus | https://www.solarsystemscope.com/textures/download/2k_uranus.jpg | 2K |
| Neptune | https://www.solarsystemscope.com/textures/download/2k_neptune.jpg | 2K |
| Moon | https://www.solarsystemscope.com/textures/download/2k_moon.jpg | 2K |
| Stars background | https://www.solarsystemscope.com/textures/download/2k_stars.jpg | 2K |

**Attribution needed (one line)**: "Planet textures © Solar System Scope, CC BY 4.0".
Add to `frontend/README.md` Attributions section + a tiny mention in the
About modal.

**Storage**: `frontend/public/textures/planets/` — Vite serves /textures/* as
static. Lazy-load with R3F's `useTexture()` hook (drei) which integrates with
Suspense.

**Total budget**: 8 needed planets × ~1.5 MB = ~12 MB on disk, but only the
ones for the current video type are loaded (5 for trailer, 7 for story, 3 for
short). 2K is cheap; 4K is overkill for a 0.5–1 viewport-percent rendered size.

### 6.2 NASA 3D Resources (public domain — no attribution needed)

**Why**: legally bulletproof, NASA-curated, several glb/gltf models for
spacecraft and celestial bodies.
**License**: Public domain. No restrictions.

Useful subset for SceneOS:
- Earth glb (with normal + specular built-in): https://nasa3d.arc.nasa.gov/detail/eyes-earth (older; check current 3D library at https://nasa3d.arc.nasa.gov/models)
- Spacecraft / asteroids — tasteful background objects if we ever want them

Most NASA glb models are over-detailed for our render distance. **Stick with
Solar System Scope textures unless a specific NASA model is irreplaceable.**

### 6.3 Poly Haven (already in use for HDRIs)

**License**: CC0 — no attribution required.
**Why**: the `<Environment preset="night">` HDR we use is from drei's bundled
presets, but we can swap to a Poly Haven HDR for more cinematic reflections:

- `dikhololo_night_4k.hdr` — already used by drei's "night" preset under the hood
- `kloppenheim_06_puresky_4k.hdr` — try as alternative for the stage scene
- `the_sky_is_on_fire_4k.hdr` — overkill for SceneOS, archived for reference
- https://polyhaven.com/hdris/skies (browse + filter "night")

**Storage**: Poly Haven HDRIs are large (8–60 MB at 4k); use 1k or 2k
versions, store at `frontend/public/hdris/`. The 1k night sky is ~1 MB.

### 6.4 Sketchfab CC0 (for future Blender-quality geometry)

**License filter**: CC0 only. https://sketchfab.com/search?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b&q=planet
**Why**: if at some point we want a proper Saturn-with-rings glb (instead of
two layered meshes), or a gas giant with volumetric clouds, Sketchfab is the
catalog.
**Caveat**: file sizes vary wildly (5–100 MB). Use Draco compression
(`gltf-pipeline -i a.glb -o a.draco.glb -d`) before committing.

Specific candidates to evaluate (once we approve §5's planet list):
- "Saturn with Rings" (search filtered to CC0)
- "Realistic Earth" (often ~20 MB; downsize textures to 2K)
- "Gas Giant" (procedural, often very small)

Approval gate: **only download if the textured-sphere approach in §6.1
visibly fails the bar after a real-canvas test.** Don't pre-pull.

### 6.5 Quaternius / Kenney (CC0) — stylized fallbacks

- https://quaternius.com/packs/ultimatespace.html — full space pack, low-poly stylized
- https://kenney.nl/assets/space-kit — toy-like

**These don't fit the cinematic-restraint brand**; document as a fallback if
performance forces low-poly. **Default approach is realistic textures.**

### 6.6 If the user wants custom planets — free generation paths

| Path | Free tier | Output | Notes |
|---|---|---|---|
| **Solar System Scope textures** | Free, CC BY 4.0 | 2K JPG equirectangular | Recommended default |
| **Stable Diffusion / SDXL** (locally or via free Hugging Face Spaces) | Free | Any aspect, can prompt "equirectangular planet texture, 2:1 ratio" | Inconsistent at the seam — manual cleanup needed in GIMP/Photopea (free) |
| **Midjourney** | Paid only ($10/mo) | High-quality | Not free; skip |
| **Meshy.ai** | 200 free credits / mo, ~10 generations | glb/gltf | Text-to-3D — generates a planet model with auto-texturing |
| **Tripo3D** | ~10 free per day | glb/gltf | Text-to-3D, similar to Meshy |
| **Luma AI Genie** | Free tier | glb | Text-to-3D, mobile-first |
| **NASA Eyes textures** | Public domain | High-res, niche bodies (Pluto, Europa, Titan) | https://nasa3d.arc.nasa.gov/images |

**My recommendation**: ship with §6.1 (Solar System Scope) for the demo.
Custom generation is an art project; we have 36 hours.

### 6.7 Asset directory layout (when we commit)

```
frontend/public/
├── textures/
│   └── planets/
│       ├── 2k_sun.jpg
│       ├── 2k_earth_daymap.jpg
│       ├── 2k_mars.jpg
│       ├── 2k_jupiter.jpg
│       ├── 2k_saturn.jpg
│       ├── 2k_saturn_ring_alpha.png
│       └── 2k_moon.jpg
├── hdris/
│   └── (optional — if we override drei's "night" preset)
└── models/
    └── (empty until §6.4 is needed)
```

`.gitignore` does NOT exclude `frontend/public/`, so these check in cleanly.
2K JPGs at ~1.5 MB each × 7 planets = ~10 MB in repo. Acceptable.

## 7. State persistence — already correct

Per `SENIOR_FRONTEND_TRANSMISSION.md` §11, the manifest is persisted via
zustand persist (`sceneos:beat-graph`), with `partialize` excluding
`decomposeStatus` so refreshes mid-decompose land on `idle` not eternal
`pending`. Beat status, conversation history, refinedPrompt, jobId,
clipPublicId, clipUrl, durationSeconds, approved are all on the manifest
and persist. No change needed.

The user explicitly asked: "ensure that the state of the nodes is kept until
the user navigates to the next page, or reprompts." Already in place. The
only state lost on refresh:
- Decompose status (intentional — see above)
- In-flight Veo polling loop (the jobId is persisted; on remount, the drawer
  must restart polling from `scenes[0].jobId` if status was `generating`).
  **This is a small bug to fix during the overhaul** — `node-detail-drawer.tsx`
  needs to detect "I came back to a beat that's mid-generation" and re-poll
  instead of hanging.

## 8. Implementation phases (NOT this PR — just the shape)

Phase 1 — **Pan + return-to-default** (camera UX)
1. Extend `camera-rig.tsx` with the pan signal in the sum.
2. Add middle-button drag handlers to `beat-map-3d.tsx`.
3. Add Esc keybind + Re-center button (chrome).
4. Cursor + edge-vignette feedback.
5. Test: pan-then-click-node clears pan; pan-then-Esc clears pan; pan-then-empty-click clears pan; idle breath continues during pan.

Phase 2 — **Planetary textures** (visual upgrade)
1. Download §6.1 picks to `frontend/public/textures/planets/`.
2. Replace per-mood primitive `<sphereGeometry>` + `<meshStandardMaterial>` block in `node-mesh.tsx` with a `<sphereGeometry>` + `<meshStandardMaterial map={...}>` per planet.
3. Tune atmosphere tint per planet (§5).
4. Add ring mesh + alpha texture for Saturn (one extra `<mesh>` per active node).
5. Adjust scene lighting (lower ambient to ~0.35; the textures carry tone).
6. Verify ≥55 fps on M2 1080p; if not, drop to 1K textures (drei `useTexture` accepts `loadingManager` for downscaling).

Phase 3 — **Click-into-orbit refinement**
1. Tighten active z-offset from `+1.2` to `+0.6` so the planet fills more frame.
2. Add slow azimuth drift on active state (§4.4).
3. Tune lerp constant (probably stays at 0.06 — don't chase).

Phase 4 — **Agentic-pipeline visual reflections**
1. Recolor connecting path to ember-dim, break at hard cuts (`Beat.chainFromPrevious === false`).
2. Add per-beat status ring (ember-pulse on `ready-to-generate`, `generating`).
3. Add reference-image thumbnails to drawer header (consumed from beat scene's pipeline-derived fields if/when wired — out of scope for this overhaul, just leave the slot).
4. Surface `seedImageUrl` thumbnail in drawer footer when set.

Phase 5 — **Postprocess reintroduction** (last, behind a gate)
1. Add `<EffectComposer>` back inside a `requestAnimationFrame`-gated `postprocessReady` flag.
2. Bloom WITHOUT `mipmapBlur` (Gaussian only, GPU-universal).
3. Add Vignette (cheap).
4. **Skip DepthOfField** until @react-three/postprocessing 3.1+ ships the alpha-null fix.
5. Test on M2 + Windows mid-tier; degradation order per `SENIOR_FRONTEND_TRANSMISSION.md` §7.

Phase 6 — **State-restore polish**
1. Detect `beat.status === "generating"` on canvas mount; re-attach polling.
2. Detect persisted `decomposeStatus` is impossible (excluded); ensure FE-flagged `pendingPipelineDispatch` reattaches if user mid-orchestration.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| 2K textures × 7 planets = 10–14 MB on canvas first paint | Lazy-load only the planets visible in current viewport; use Suspense with `<CanvasFallback>`; preload from landing's idle moment |
| `useTexture` triggers Suspense, freezing the scene momentarily | Preload textures during the page-crumple transition (already 1.6s of dead time) — call `useTexture.preload(['/textures/planets/2k_sun.jpg', ...])` from `landing-route.tsx`'s mount effect |
| Pan + click-on-node pointer event collision | Pan registers on `pointerdown.button === 1`; node clicks are left-click (button 0). No collision. |
| Saturn ring + atmosphere shell additive blending stack | Ring uses `meshStandardMaterial` with map+alphaMap, no additive; atmosphere shell stays additive. Render order: planet → ring → atmosphere. |
| Texture-loaded planets read flat without sufficient lighting | Lower ambient from 0.6 → 0.35; keep warm key + cool fill for shape; Sun planet is special — emissive map = its own texture, intensity 0.8 |
| Non-uniform scale on planets warps texture | Uniform `scale.setScalar(target)` only — already the case |
| Middle-button drag hijacked by browser (auto-scroll cursor) | `e.preventDefault()` on `pointerdown.button === 1` |
| Re-center button collides with stitch-tray button | Stitch button is top-right; Re-center is bottom-right; no collision |
| Postprocess crash returns | Guard with `requestAnimationFrame` mount delay; degradation order ready |

## 10. Definition of Done

- [ ] User can middle-mouse-drag the canvas; release decays with inertia; clicking a node clears pan; Esc clears pan + active.
- [ ] Re-center button is visible only when camera is non-default; clicking it returns to overview with `cinematic` (720ms) duration.
- [ ] 7 distinct planets (Sun / Earth / Mars / Jupiter / Saturn / Moon, with one repeat for the 7th beat varied by camera treatment) render with Solar System Scope textures.
- [ ] Saturn shows rings.
- [ ] Atmosphere shell tints per-planet.
- [ ] Click-into-orbit puts the active planet at ~50% screen height and slow-azimuth drifts at full active.
- [ ] Connecting path is ember-dim; breaks at `chainFromPrevious === false` beats (when the manifest carries that field — currently optional, so the visual is "if present, break it").
- [ ] State persistence: hard refresh on `/canvas` lands user on the canvas with all beat statuses intact; if a beat was generating, polling re-attaches.
- [ ] ≥55 fps on M2 1080p, full canvas, all 7 planets visible. Verified via DevTools Performance panel for 5 seconds of pan + click.
- [ ] No console errors. No StrictMode double-render warnings.
- [ ] `tsc --noEmit` clean. Bundle ≤1 MB for the canvas chunk.

## 11. What I am NOT planning to do here

- **No EffectComposer reintroduction in Phase 1–4.** It's Phase 5 only, behind a gate.
- **No Spline / Rive / Lottie imports.** The brand vocabulary doesn't accept them.
- **No middle-button drag = orbit (not pan).** Orbit-around-active is automatic from the camera rig's azimuth drift; manual orbit would conflict with click-to-fly and confuses users who expect Maya-style controls. Pan = translate XY only.
- **No infinite zoom.** Wheel scroll stays mapped to particle velocity (existing); zoom is implicit in click-into-orbit.
- **No two-finger touch pan.** Hackathon scope (desktop demo).

## 12. Approval gate

Before any code lands:

1. **§5's planet-mood mapping** is approved by Alex (creative call).
2. **§6.1's texture set** is downloaded (or I download it, if Alex approves the asset list verbatim).
3. **§4.1's pan UX** is acknowledged (middle-button = pan, not orbit; Esc returns; click-on-node clears).
4. **§8's phase order** is acknowledged — postprocess is last, not first.

When 1–4 are signed off, open the implementation PR with Phase 1.
