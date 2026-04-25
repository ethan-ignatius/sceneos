# SceneOS — Shaders + Audio (Phase 2 lesson reflection)

> Last updated: 2026-04-25.
> Lesson reflection before shipping Phase 2 (the page-crumple showpiece). Captures every concept the implementation touches, the chosen approach over alternatives, the risks, the fallbacks. Read once before reading the code; reference it again when something feels confusing.

---

## 0. Why this surface matters

The page-crumple is one of the three moments that decide LA Hacks 2026 for us (page-crumple → 3D canvas reveal → live `fl_splice` URL build). It's the one moment where the user is unambiguously *between* surfaces, with no UI to read — the entire frame is owned by the transition. A judge who sees the crumple and feels nothing about it is a judge we lost.

Floor: a GSAP-only DOM choreography (already shipped in round 4) — the landing's vibe collapses, ember flashes, canvas silhouette emerges. Adequate.

Ceiling: a WebGL ember-burn shader overlay that progressively consumes the screen from bottom-right with a hot edge, halo, sparks, and procedurally-noised wobble. Plus synthesized Web Audio cues (analog pop + cinematic riser) that respect the landing's mute toggle.

Phase 2 ships the ceiling.

---

## 1. Concept inventory

The minimum vocabulary needed to read the Phase 2 code.

### 1.1 GSAP timelines (already in toolbelt, recap)

A GSAP `Timeline` composes multiple tweens with explicit start times (the *position parameter*). Tweens can run in parallel (same position), be chained (omit position), or be offset (`+=0.5`, `<0.2`, etc.).

Idioms we use:
- `tl.fromTo(target, fromVars, toVars, position)` — explicit start/end values + start time.
- `tl.to(target, vars, position)` — animate from the current state.
- `tl.call(fn, args, position)` — fire a side-effect at position. We use this for audio cues.
- `onComplete: () => navigate(...)` — declarative navigation when the timeline finishes.
- `return () => tl.kill()` — cleanup if the route unmounts before completion (otherwise GSAP keeps the tween alive and leaks).

GSAP can animate **any JavaScript object**, not just DOM. We exploit this for the shader: GSAP animates `progressRef.current.value` from 0 → 1 over 1.4s; `useFrame` reads that ref each frame and writes it into the shader uniform.

### 1.2 Web Audio API (synthesis approach)

We *don't* bundle audio sample files. Two reasons: (a) licensing/CC0 sourcing burns a budget we don't have; (b) shipping ~50–200KB per sample is wasteful. Instead, we synthesize on-the-fly with the Web Audio API.

The graph for an *ember pop* (filtered noise burst):

```
AudioBufferSourceNode (white noise w/ exponential decay envelope baked in)
  → BiquadFilterNode (lowpass, freq ramps 2400Hz → 80Hz over 120ms)
  → GainNode (volume envelope: linear to peak in 5ms, exponential decay over 145ms)
  → AudioContext.destination
```

The graph for a *cinematic riser* (sub-bass + filtered noise sweep):

```
OscillatorNode (sine, freq glissando 28Hz → 95Hz over 1.2s)
  → GainNode (envelope: linear up to 70% then down)
  → destination

AudioBufferSourceNode (white noise)
  → BiquadFilterNode (bandpass, freq sweeps 400Hz → 3500Hz over 1.2s)
  → GainNode
  → destination
```

Constraints:
- **User-gesture rule.** Browsers block `AudioContext.resume()` until a user gesture fires. The form submit is the gesture; the bridge route's audio cues fire ~50–200ms after that submit, well within the activation window.
- **State.** `AudioContext.state` is `"suspended"` after creation. We call `resume()` on first use.
- **Persistence.** The mute toggle on the landing footer writes to `localStorage` (`sceneos:audio-muted`). The audio module reads it before each play. No store needed.

### 1.3 WebGL via R3F — the screen-quad pattern

For full-screen post-processing-style effects, we don't need a perspective camera, lighting, or any 3D scene. We need:
- A full-viewport `<planeGeometry args={[2, 2]} />` (2 units in NDC = full viewport).
- An orthographic camera (or skip the camera entirely by writing `gl_Position = vec4(position.xy, 0.0, 1.0)` in the vertex shader — bypasses view/projection matrices).
- A `<shaderMaterial>` with custom vertex + fragment shaders.
- Transparent + no depth test/write so it composites cleanly over the DOM behind it.

This is exactly what we ship in `paper-curl-canvas.tsx`.

### 1.4 GLSL fragment shaders — what the burn shader actually computes

The fragment shader runs **once per pixel**. For each pixel, given its UV coordinate (0..1 in both axes), it returns an RGBA color.

Our burn shader's logic, per pixel:

1. **Project UV onto the burn axis.** The burn sweeps from bottom-right `(1, 0)` toward upper-left `(0, 1)`. The unit vector along that direction is `(-1, 1) / √2`. Each fragment's distance from the bottom-right corner along that axis is `(1 - vUv.x + vUv.y) / √2`. Range: 0 at bottom-right, √2 at upper-left.

2. **Determine the burn position from `uProgress`.** `burnPos = mix(-0.1, 1.5, uProgress)`. Slightly past both ends so the burn fully sweeps the screen.

3. **Compute signed distance `d` from the burn line.** `d = burnPos - projection`. `d > 0` means the pixel is "burned" (closer to bottom-right than the line); `d < 0` means "unburned" (still in front of the burn).

4. **Add organic wobble.** `d += (noise(vUv * 6.0 + uTime * 0.6) - 0.5) * 0.08`. Procedural noise modulates the burn edge so it doesn't read as a clean diagonal.

5. **Define visual regions via `smoothstep`:**
   - `burned`: 1 well past the edge, 0 before. Used to fill with `bg-base`.
   - `emberEdge`: a thin band around `d = 0` where the paper is currently burning (hot ember).
   - `emberHalo`: a wider warm halo just before the edge (orange glow).
   - `sparks`: random hot dots in the halo region (hashed coord + threshold + time animation).

6. **Composite.** Hot ember + warm orange + deep glow + sparks, then `mix(emberColor, bg-base, burned * 0.95)` to blend toward solid bg-base in burned regions.

7. **Alpha = max of all the bright regions and the burned mask.** This makes the shader transparent in unburned regions (DOM behind shows through), opaque in burned regions (DOM behind is hidden), and semi-transparent at the edge (ember glows over DOM).

### 1.5 Procedural noise — value noise via hash

Noise is the difference between "computer-perfect diagonal" and "real fire." We use a 2D value-noise built from a single hash function:

```glsl
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);  // smoothstep interpolation
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
```

The hash is a deterministic pseudo-random per integer coord; `noise()` interpolates smoothly between four corners using the cubic `f² * (3 - 2f)` smoothstep.

Why this and not `simplex` or `perlin` from a library: those add ~2–4KB. This is 12 lines and zero deps. The visual difference is negligible at the scale we're sampling.

### 1.6 Coordinate spaces

GLSL has multiple coord systems. We mostly stay in **UV space** (`vUv`, range 0..1, origin bottom-left). For aspect-correct math, multiply `vUv.x` by `resolution.x / resolution.y`. For our shader, we *don't* aspect-correct because the burn line being slightly off-45° in landscape mode is fine — the wobble + sparks hide the geometry.

NDC (Normalized Device Coordinates) is what `gl_Position` uses. -1 to +1 in both axes. Our vertex shader passes `position.xy` straight through because the plane geometry is already 2x2 (NDC-sized).

### 1.7 Compositing — alpha, additive, and the layer stack

Our crumple-bridge stacks layers in this z-order:

```
1. bg-base                         (page background)
2. .crumple-landing                (placeholder DOM text, collapses via GSAP)
3. .crumple-flash                  (DOM ember radial gradient)
4. PaperCurlCanvas                 (NEW WebGL shader overlay)
5. .crumple-canvas-silhouette      (5 glowing orbs, fade in via GSAP)
6. .crumple-veil                   (final solid bg fade)
```

The shader is layer 4. Its alpha controls what's hidden:
- Unburned region (alpha 0): everything below shows through.
- Edge region (alpha mid): ember glow blends over the DOM.
- Burned region (alpha 1, color = bg-base): DOM is hidden, replaced by void.

The silhouette is *above* the shader because we want it to peek through the burn rather than be overlaid by it. As the burn consumes the screen, the silhouette becomes the only visible content.

### 1.8 GSAP-to-shader bridge — refs, not React state

If we updated React state every frame to drive the uniform, we'd re-render on every tick (bad). The pattern we use:

```ts
const progressRef = useRef({ value: 0 });        // a JS object GSAP can mutate
gsap.to(progressRef.current, { value: 1, duration: 1.4 });

// Inside R3F:
useFrame(() => {
  materialRef.current.uniforms.uProgress.value = progressRef.current.value;
});
```

GSAP mutates `progressRef.current.value` directly (no React involvement). `useFrame` reads it and pushes into the shader. The whole loop is React-state-free.

This is the **same pattern** as `useScrollVelocity` — refs as the bridge between an external animation source and the WebGL render loop.

### 1.9 Lazy code splitting — keep the main bundle small

R3F + three + drei is ~1MB minified. We already lazy-load the canvas route's beat-map. We do the same for the paper-curl shader:

```ts
const PaperCurlCanvas = lazy(() =>
  import("@/components/transition/paper-curl-canvas").then((m) => ({ default: m.PaperCurlCanvas }))
);
```

Vite deduplicates shared chunks — both lazy modules pull R3F from the same shared chunk.

To keep the transition snappy: the landing route preloads the shader chunk on mount (`import("@/components/transition/paper-curl-canvas")` fired and discarded). By the time the user submits, the chunk is cached. If for any reason it isn't loaded by the time the bridge mounts, `<Suspense fallback={null}>` renders nothing — the GSAP-only DOM choreography still plays, just without the WebGL flame.

### 1.10 Reduced-motion graceful degradation

`prefers-reduced-motion: reduce` users get a 200ms fade instead of the full crumple. Already implemented in the bridge's `useEffect`. No shader, no audio — just a clean cut.

---

## 2. The chosen approach (Plan A) vs alternatives

| Plan | What it does | Cost | Visual ceiling |
|---|---|---|---|
| **C — already shipped** | DOM-only GSAP collapse + ember radial flash + canvas silhouette emerge | 0h | Convincing, not magical |
| **B — fake-shader middle ground** | Same as C + a wave/displacement shader (no real curl math) | 1.5h | Better, but the displacement reads as glitchy |
| **A — what we ship now** | C + procedural ember-burn shader (signed distance + noise + sparks) + Web Audio cues | ~2h | Cinematic; reads as "the page is on fire" |
| **A+ — optional stretch** | A + DOM snapshot via `html-to-image` so the user's actual headline burns, not a placeholder | +1.5h | True visual continuity; web-font + CORS gotchas |

**We ship A.** A+ adds visual continuity (user's typed prompt burns) but the snapshot pipeline has too many ways to fail in front of judges (web fonts not loaded, CORS, mobile inconsistencies). A is the right ceiling for hackathon scope.

---

## 3. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Audio context blocked.** Browsers block `AudioContext.resume()` without a user gesture. | Audio plays only after the form submit, which is the gesture. Worst case: silent transition. Visual still ships. |
| **Shader chunk slow to load.** Network slow, the chunk hasn't loaded by the time the bridge mounts. | `<Suspense fallback={null}>` renders nothing; the GSAP-only floor still plays. Visually acceptable. |
| **Shader compile error in production.** A typo in GLSL crashes the whole canvas. | Inline shaders are committed and we typecheck. We test the build locally before shipping. |
| **GPU compatibility.** Old GPUs render the shader poorly. | Canvas already requires WebGL2 for the main beat-map. If their machine renders the canvas, it can render the burn shader. |
| **Reduced-motion missed.** A user with the OS setting still sees the full crumple. | The bridge's `useEffect` checks `prefers-reduced-motion` first and short-circuits to a 200ms fade. |
| **Mute respected during the bridge but a user un-mutes mid-crumple.** Audio plays anyway because we read state at play-call. | Acceptable: each cue is short (≤1.2s), so worst case is one beat of audio. No need to interrupt. |
| **Audio context per-tab leak.** Repeated route enters create new contexts. | We cache the context module-level. Single AudioContext per session. |

---

## 4. Implementation map

The files we touch:

| File | New / Edit | Role |
|---|---|---|
| `frontend/src/lib/audio-cues.ts` | NEW | Web Audio synthesis (`playEmberPop`, `playCinematicRiser`); mute persistence via localStorage |
| `frontend/src/components/transition/paper-curl-canvas.tsx` | NEW | R3F Canvas + `<shaderMaterial>` + ember-burn fragment shader |
| `frontend/src/routes/crumple-bridge-route.tsx` | EDIT | Add audio cues to GSAP timeline, mount `<PaperCurlCanvas>` via `<Suspense>`, drive `progressRef` from GSAP |
| `frontend/src/routes/landing-route.tsx` | EDIT | Mute toggle now also calls `setAudioMuted`; preload the shader chunk on mount |
| `docs/FRONTEND_TODO.md` | EDIT | Mark Phase 2 ✅ COMPLETE |
| `README.md` | EDIT | Add this doc to the reading order |

---

## 5. Cross-references

- Motion-side rules: [`MOTION_LANGUAGE.md §6.2`](MOTION_LANGUAGE.md) (the page-crumple choreography spec)
- Pattern library entry: [`MASTER_FRONTEND_DEV.md §8.4`](MASTER_FRONTEND_DEV.md) (Plan A vs B vs C for the page-crumple)
- TODO entry: [`FRONTEND_TODO.md`](FRONTEND_TODO.md) Phase 2.1 / 2.2 / 2.3
- Pattern reuse: the GSAP-to-shader bridge pattern documented in §1.8 above is the same pattern as `useScrollVelocity` — refs over React state for any animation that runs every frame
