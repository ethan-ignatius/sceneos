# CANVAS_3D — Phase 3 Lesson Reflection

> **Phase 3 surface:** the canvas. The "map" of beats. The second of the three demo-winning moments. Read this **before** touching `routes/canvas-route.tsx` or `components/canvas/*`.

The page-crumple (Phase 2) hands the user off to **the canvas reveal** — five glowing nodes breathing in 3D space, connected by a quiet path, sparkles drifting, the whole thing alive. This document is the lesson reflection on every concept Phase 3 needs before we start typing.

If you've shipped Phase 0–2, the new vocabulary here is: custom camera rigs in R3F, splines, drei `Sparkles`, selective bloom, scroll-reactive particles, ambient audio loops, performance budgeting.

---

## 1. The R3F frame loop (recap, sharpened)

`useFrame((state, delta) => …)` runs once per render frame *inside* a Canvas. It is **the** mutation point for animated 3D state.

```tsx
useFrame((state) => {
  meshRef.current.position.x = Math.sin(state.clock.elapsedTime);
});
```

**Rules of thumb:**

- Mutate refs, not React state. State triggers re-renders; refs don't.
- Per-frame React work is the #1 perf killer in R3F apps.
- Mutating `mesh.position.x = …` is fine — Three reads transforms each render.
- For interpolation: `THREE.MathUtils.lerp(current, target, alpha)` or `vec.lerp(targetVec, alpha)`.

**Why not just GSAP-tween the camera position?** Two reasons:
1. GSAP doesn't know about hover state changes between frames; if the user moves the cursor across two nodes, GSAP would queue two tweens that race.
2. Per-frame lerping handles continuous targets (idle breath + hover offset + active offset, all summed).

GSAP shines for one-shot timelines (Phase 2 page-crumple). Per-frame lerping shines for continuous, multi-source state (Phase 3 camera rig).

---

## 2. Custom camera rig vs `OrbitControls`

`<OrbitControls />` (from drei) gives you free orbit. Great for inspecting a 3D model. Wrong for SceneOS, because:

- The user shouldn't be able to fling the camera anywhere — they should feel **transported** to a node when they click it.
- Free orbit makes the canvas feel like a 3D viewer demo, not a directorial workspace.
- We need camera state driven by app state (`activeBeatId`), not just pointer drag.

**The custom rig pattern:**

```tsx
function CameraRig({ beats, activeBeatId, hoveredBeatId }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 0.4, 5.5));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state) => {
    // 1. Compute target each frame from current app state
    const active = beats.find((b) => b.beatId === activeBeatId);
    const hovered = beats.find((b) => b.beatId === hoveredBeatId);

    if (active) {
      targetPos.current.set(active.x + 0.2, active.y + 0.4, active.z + 1.2);
      targetLook.current.copy(active.position);
    } else {
      targetPos.current.set(0, 0.4, 5.5);
      targetLook.current.set(0, 0, 0);
    }

    // 2. Hover offset (≤0.05 units) — additive on top of base target
    if (hovered && !active) {
      targetPos.current.x += hovered.x * 0.025;
      targetPos.current.y += hovered.y * 0.025;
    }

    // 3. Idle breath — sin wave on z, 8s period, ±0.04
    targetPos.current.z += Math.sin(state.clock.elapsedTime / 8 * Math.PI * 2) * 0.04;

    // 4. Lerp camera toward target each frame
    camera.position.lerp(targetPos.current, 0.06);
    camera.lookAt(targetLook.current);
  });

  return null;
}
```

**Lerp constants:**
- `0.06` is a smooth glide (~60 frames to converge ≈ 1 second).
- Higher (0.12) feels snappy. Lower (0.03) feels dreamy.
- We want "transported" — `0.06` is the sweet spot.

**Why `lerp(targetPos, 0.06)` instead of GSAP-tweening?**
The user might click a *different* node mid-glide. With GSAP we'd have to `tl.kill()` and start a new tween. With per-frame lerp, the target just changes — the camera smoothly redirects without any orchestration. The interpolator never knows the targets are moving; it just chases them.

---

## 3. The five node states (`beat.status` derives everything)

Per spec, NodeMesh visualises five distinct states:

| status | scale | z-offset | emissive | extra |
|---|---|---|---|---|
| idle (`pending`) | breath ±2% | 0 | 0.08 | — |
| hover | +6% | 0 | 0.25 | halo grows |
| active (selected, but not approved) | +15% | +0.4 | 0.6 | halo + label glow |
| approved | +12% | 0 | 0.5 (steady) | no breath, ember saturated |
| ready-to-generate | +6% | 0 | ember-pulse 1.6s | the "next click is hot" cue |

**Implementation pattern:**

```tsx
useFrame((state) => {
  const t = state.clock.elapsedTime;
  const breath = 1 + Math.sin(t * 0.9) * 0.02;
  const hoverBoost = hover ? 1.06 : 1;
  const activeBoost = isActive ? 1.15 : 1;
  const target = beat.status === "approved" ? 1.12 : breath * hoverBoost * activeBoost;
  meshRef.current.scale.setScalar(target);

  // emissiveIntensity from status, then optional pulse
  let baseEmissive: number;
  if (beat.status === "approved") baseEmissive = 0.5;
  else if (isActive) baseEmissive = 0.6;
  else if (hover) baseEmissive = 0.25;
  else baseEmissive = 0.08;

  const isPulsing = beat.status === "ready-to-generate";
  const pulse = isPulsing ? Math.sin(t * (Math.PI * 2 / 1.6)) * 0.15 + 0.15 : 0;
  materialRef.current.emissiveIntensity = baseEmissive + pulse;
});
```

**Two key choices:**
1. State derives from `beat.status` (server-driven), not from local component state. UI is a pure function of the manifest.
2. The "halo" is its own additional mesh (slightly larger, additive blending, no depth-write) — *not* a CSS aura, not postprocessing trickery. This composes cleanly with bloom.

**Why animate `groupRef.current.position.z` instead of `meshRef.current.position.z` for the active offset?** Because the `<Html>` label is a child of the group. If we move only the mesh, the label floats while the node steps forward. Move the group; everything tracks.

---

## 4. Catmull-Rom splines (the connecting path)

We want a smooth path threading through five node positions. `THREE.CatmullRomCurve3` does the math.

```tsx
const curve = new THREE.CatmullRomCurve3(beats.map((b) => new THREE.Vector3(b.x, b.y, b.z)));
const points = curve.getPoints(beats.length * 8); // 8 samples per segment
```

- `getPoints(n)` returns `n + 1` evenly-distributed `Vector3`s along the curve.
- For five nodes, `8 * 5 = 40` points = perfectly smooth at small render size.
- We render as `<points>` (THREE.Points), **not** `<line>` — points read as dotted/textured trail, lines read as wireframe.

**The geometry:**

```tsx
const geo = new THREE.BufferGeometry().setFromPoints(points);
return (
  <points geometry={geo}>
    <pointsMaterial size={0.04} color="#9aa6ad" transparent opacity={0.3} sizeAttenuation />
  </points>
);
```

`sizeAttenuation: true` makes nearer points larger — gives perspective. Disable for billboard-style uniform dots.

---

## 5. Ambient particles via drei `<Sparkles>`

`<Sparkles>` is drei's pre-rolled particle field with shader-instanced sprites. We don't write the shader; we tune props.

```tsx
<Sparkles
  count={200}
  scale={[14, 8, 8]}    // bounding box
  size={1.6}            // px size at scale=1
  speed={0.3}           // per-particle drift speed
  noise={1}             // organic vs grid
  opacity={0.5}
  color="#f0a868"       // brand-ember
/>
```

**Performance:** 200 particles is cheap (~one drawcall, instanced). 1000 starts to hurt on mid-tier hardware. Stay ≤ 500 on demo machines.

**Scroll-velocity reaction:**
The spec says particle speed should scale `1× → 2.5×` based on scroll velocity. Sparkles' `speed` prop isn't reactive — it's read once at mount. To animate it, we have two options:

1. **Re-render the component when speed changes.** Hits React per-frame. ❌
2. **Mutate the underlying material's uniform via ref.** Sparkles forwards a ref to the underlying mesh, but the speed prop is internal. Workaround: wrap Sparkles in a sibling that mutates its material.uniforms.speed.value.

But the cleanest path is the ref+useFrame pattern *we already use* for the shader bridge in Phase 2:

```tsx
const sparklesRef = useRef<THREE.Points>(null);
useFrame(() => {
  // Sparkles internally has uniforms.speed; we can poke it
  const mat = sparklesRef.current?.material as THREE.ShaderMaterial;
  if (mat?.uniforms?.speed) {
    const baseSpeed = 0.3;
    const velocity = velocityRef.current; // from useScrollVelocity
    mat.uniforms.speed.value = baseSpeed * (1 + Math.min(Math.abs(velocity) * 8, 1.5));
  }
});
```

If `Sparkles` doesn't expose the uniforms cleanly, fall back to: just re-render when scroll state changes coarsely (every 100ms), accepting the React cost.

**Bridge to scroll-velocity:** wire `useScrollVelocity()` at the canvas-route level, register it on `window`, pass `velocityRef` down to the particle component.

---

## 6. Selective bloom (already wired — verify, don't reinvent)

`<EffectComposer>` with `<Bloom>` is in `beat-map-3d.tsx`. It bleeds light from any pixel above `luminanceThreshold` (0.25). High-emissive materials light up; everything else stays clean.

**The recipe is right.** Don't touch it unless perf forces a degradation:

1. First drop: `mipmapBlur` → `false` (cheaper sample pattern, slightly less smooth bleed).
2. Second drop: lower `intensity` 0.9 → 0.6.
3. Third drop: remove `<Vignette>` (it's the cheapest of the three; surprising drop order, but Vignette on a full-screen pass is more expensive than people think).
4. Last resort: remove the EffectComposer entirely — the scene still reads.

**Demo target:** ≥55fps on MBA M2 1080p. If we hit that, ship as-is.

---

## 7. Ambient audio loop — the projector whir

Phase 2 shipped one-shot synthesis (`playEmberPop`, `playCinematicRiser`). Phase 3 needs a **continuous** loop.

**The shape:** soft, mid-band noise modulated by a 24Hz tremolo, peaks ~480Hz, very low gain (-30dB ≈ 0.025 linear). Reads as old-projector room ambience.

**Web Audio recipe:**

```ts
export function startAmbientProjector({ volume = 0.025 }) {
  if (isAudioMuted()) return () => {};
  const ctx = getCtx(); if (!ctx) return () => {};

  // 1. Looping noise buffer
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  // 2. Bandpass to shape it
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 480; bp.Q.value = 0.7;

  // 3. Tremolo: LFO modulates a gain node's value
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 24;
  const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  const tremGain = ctx.createGain(); tremGain.gain.value = 0.5;
  lfoDepth.connect(tremGain.gain); // LFO writes into the .gain AudioParam

  // 4. Master + slow ramp-in
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.8);

  noise.connect(bp); bp.connect(tremGain); tremGain.connect(master); master.connect(ctx.destination);
  noise.start(); lfo.start();

  // 5. Return a stop function with graceful fade
  return () => {
    const stopAt = ctx.currentTime + 0.6;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, stopAt);
    noise.stop(stopAt); lfo.stop(stopAt);
  };
}
```

**Key Web Audio insights:**

- **An oscillator can be connected to a `GainNode`'s `.gain` AudioParam, not just to audio inputs.** This is how you get tremolo, vibrato, FM. The LFO's output adds to whatever value the AudioParam already has. We set the gain to a baseline of 0.5 and modulate ±0.5 via the LFO depth → result oscillates between 0 and 1.
- **`bufferSource.loop = true` + a buffer ≥ 1s** = imperceptible loop seam if the buffer is white noise (statistically uniform, no audible repeat).
- **Always provide a graceful fade-out** in the returned stop fn — abrupt stop creates a click.

**Mount/unmount in `canvas-route.tsx`:**

```tsx
useEffect(() => {
  const stop = startAmbientProjector();
  return stop;
}, []);
```

The mute check happens at start time. If the user toggles mute mid-canvas, the loop continues at its current state — acceptable for demo. (Reactive teardown is reserved for post-hackathon polish.)

---

## 8. Performance budget — non-negotiable

**Demo target: ≥55fps on MBA M2 1080p.** Below that and the canvas feels like a "demo," not a delivered product.

The frame budget at 60fps is **16.6ms**. Phase 3's allocation:

| pass | budget | reality on MBA M2 |
|---|---|---|
| scene render (5 nodes + path + sparkles + stars) | 4–6ms | safe |
| bloom + vignette | 3–5ms | safe with `mipmapBlur` |
| useFrame logic (camera lerp, node pulses, particle uniform) | <1ms | safe |
| React + everything else | ≤2ms | safe |

**Where it breaks:**
- 1000+ Sparkles → +5ms easy. Cap at 200.
- Multiple bloom passes → +3ms. One pass only.
- Per-frame React state setters → can spike 5–10ms on bad days. Use refs.
- High-poly node geometry. Sphere `widthSegments=48, heightSegments=48` is 4500 tris; fine. Don't go to 96.

**Profiling protocol:** open Chrome DevTools → Performance, record 3s of canvas interaction, look at frames panel. Anything over 16.6ms is a regression.

---

## 9. Decision matrix — what we ship vs cut

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 3.1 Custom camera rig | ✅ yes | low | OrbitControls (already works) |
| 3.2 Five-state nodes | ✅ yes | low | three states + halo cut |
| 3.3 Connecting path | ✅ yes | low | drop entirely (judges won't notice) |
| 3.4 Sparkles + scroll reaction | ✅ yes | medium | static Sparkles (no scroll reaction) |
| 3.4 Scroll-velocity reaction | 🟠 stretch | medium | static speed |
| 3.5 Postprocessing tuning | ✅ verify only | low | already shipped |
| 3.6 Ambient audio loop | ✅ yes | low | silence (mute respected) |

**Time budget:** 4 hours total. If we hit 3 hours and 3.4's scroll reaction is hurting, drop it — static Sparkles still adds atmosphere.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| Camera-rig click-twice-to-deselect feels weird | confirmed in spec; surface a subtle "click anywhere to deselect" hint via empty-space click handler on Canvas root |
| Hover offset jitters when cursor moves between two nodes quickly | clamp the offset magnitude; lerp the offset itself, not just the position |
| `<Sparkles>` `speed` prop is read-only after mount | mutate `material.uniforms.speed.value` directly via ref each frame |
| Bloom kills FPS on integrated graphics | demo on MBA M2; degradation order documented in §6 |
| Web Audio context starts suspended; loop is silent | landing's form submit is the gesture (already wired); canvas mount happens *after* that gesture, so the context is already running |
| Ambient loop running when user navigates back to landing | stop fn returned from `useEffect`; React's cleanup runs on unmount |
| Multiple loops if React re-mounts | unique stop fn per mount; cleanup always runs |
| Node label desync when active z-offset moves the mesh | animate the *group* position, not just the mesh; label is a group child |

---

## 11. Implementation map (what files, in what order)

1. `lib/audio-cues.ts` — add `startAmbientProjector` (returns stop fn).
2. `components/canvas/camera-rig.tsx` — new. Reads `activeBeatId` + `hoveredBeatId`, lerps camera each frame.
3. `components/canvas/connecting-path.tsx` — new. Catmull-Rom + `<points>`.
4. `components/canvas/ambient-particles.tsx` — new. Wraps `<Sparkles>` + scroll-velocity hookup.
5. `components/canvas/node-mesh.tsx` — upgrade. Five states, halo mesh, group-z animation, hover state writes to shared ref/setter.
6. `components/canvas/beat-map-3d.tsx` — wire it all. Drop `OrbitControls`. Mount `<CameraRig>`, `<ConnectingPath>`, `<AmbientParticles>`. Lift hover state.
7. `routes/canvas-route.tsx` — `useEffect` start/stop ambient audio.
8. Verify `tsc --noEmit` + `vite build` clean. Bundle stays under canvas-chunk budget.

---

## 12. Cross-references

- `MOTION_LANGUAGE.md` §6.3 — canvas motion specifics (camera, nodes, particles).
- `FRONTEND_PHILOSOPHY.md` §6 — "the second of three winning moments" framing.
- `SHADERS_AUDIO.md` — Phase 2 lesson reflection; the *ref-bridge* pattern from §3 there is reused here for scroll-velocity → particle speed.
- `MASTER_FRONTEND_DEV.md` — bestiary for `useScrollVelocity` and the EffectComposer recipe.

---

## 13. The prize

When this phase ships, judges land on the canvas and see:

- A camera that feels alive, not free-orbiting.
- Five glowing nodes that breathe — and *react* when hovered.
- A faint connecting path threading the trailer's beat order without arrows.
- Sparkles drifting, faster when the user scrolls.
- A whisper of projector ambience underneath everything.

That's the **second** of the three winning moments (page-crumple → canvas reveal → live URL build). Phase 3 is the moment that earns the time judges then spend on the rest of the flow.

Ship it.
