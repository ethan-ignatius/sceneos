# SceneOS — Frontend TODO (motion-rich, ranked)

> Owned by Alex. Last updated: 2026-04-25.
> Companion to `FRONTEND_BUILDOUT.md` (surface-by-surface) and `MOTION_LANGUAGE.md` (the system). This is the **prioritised execution list** with motion specs baked in.

Each item has:
- **🔴 / 🟠 / 🟡 / 🟢** — demo-criticality (red = must ship; green = bonus)
- **Effort** — rough hours
- **Surface** — which route/component
- **Owner** — Alex unless noted
- **Acceptance** — when this is "done"

**Slip line:** if we hit 6 hours before deadline, we stop at items marked 🔴 only.

---

## Phase 0 — Foundation primitives ✅ COMPLETE (2026-04-25)

All foundation primitives are shipped. Every Phase 1+ task imports from these. Full inventory + signatures + when-to-use are in [`MASTER_FRONTEND_DEV.md §10`](MASTER_FRONTEND_DEV.md).

### 0.1 ✅ `lib/motion-presets.ts` — 5 durations · 4 named eases · 18-curve `easingFns` · 3 springs · 3 stagger presets
### 0.2 ✅ `lib/text-splitter.tsx` — `<TextSplitter>` + `<WordSplitter>` with deterministic seed
### 0.3 ✅ `lib/use-scroll-velocity.ts` — RAF inertial scroll bridge, refs only, CSS-var compatible
### 0.4 ✅ `src/index.css` — `flicker-reveal`, `ember-pulse`, `tick-flicker`, `blur-pulse`, `grain`, `marquee` keyframes + reduced-motion overrides
### 0.5 ✅ `components/ui/cursor-spotlight.tsx` — pointer-follow halo, CSS-only
### 0.6 ✅ `components/ui/magnetic-button.tsx` — magnetic pull + corner flicker + ember-pulse-when-ready
### 0.7 ✅ `components/ui/pill.tsx` — outline/filled · ember/cool/fg · sm/md · active state *(Augen Pro pattern)*
### 0.8 ✅ `components/ui/arrow-link.tsx` — stacked-arrow hover-swap, right/down/out · sm/md/lg · 3 tones *(Augen Pro pattern)*
### 0.9 ✅ `components/ui/live-clock.tsx` — tabular-num timestamp + label + pulsing dot *(Parinaz Kassemi pattern)*
### 0.10 ✅ `components/ui/section-label.tsx` — icon-square + caption *(Augen + FlowBoard pattern)*
### 0.11 ✅ `components/ui/marquee.tsx` — infinite-scroll, edge-fade mask, pause-on-hover *(NextSense pattern)*
### 0.12 ✅ `components/ui/announcement-bar.tsx` — rotating slides, hidden-tab pause, 3 tones *(NextSense pattern)*

**Documented but not yet shipped — defer until a Phase 1+ task needs it:**
- `components/ui/bracket-text.tsx` — `[Pha¹]`-style system tags *(Augen Pro pattern)*
- `components/ui/scroll-indicator.tsx` — chevron-down pill inviting scroll *(Augen Pro pattern)*
- `components/ui/pin-track.tsx` — sticky-child + tall-parent scroll-pin wrapper *(NextSense pattern)*
- `components/ui/color-shift-section.tsx` + `lib/use-color-shift.ts` — IO-driven CSS-var swap *(NextSense pattern)*

---

## Phase 1 — Landing surface ✅ COMPLETE (2026-04-25)

The first 30 seconds judges see. All 7 items shipped across rounds 4–6. Surface lives at `frontend/src/routes/landing-route.tsx`.

### 1.1 🔴 Landing load choreography (the cinematic entrance) — 2h
- **Surface:** `routes/landing-route.tsx`
- **Spec (from `MOTION_LANGUAGE.md` §5):** 3.0s total. Void → headline flicker → sub-line slide → underline draw → pills cascade → chrome fade.
- **Acceptance:**
  - Headline uses `<TextSplitter>`. Each char animates with CSS `flicker` keyframe at randomised 100–300ms delay over 1.2s.
  - Sub-line: `motion.div`, opacity 0→1, y 8→0, duration `quick`, ease `outQuart`, delay 1.5s.
  - Input underline: `motion.span` `scaleX 0→1`, transform-origin left, duration `quick`, ease `outQuart`, delay 1.9s.
  - Pills: `motion.button` x 16→0 + opacity 0→1, stagger 80ms via `staggerChildren`, delay 2.3s.
  - Chrome (logo, mute, help): `motion.div` opacity 0→1, duration `quick`, delay 2.7s.
  - Sequence respects `prefers-reduced-motion` → all elements appear at 200ms fade.
- **Demo bar:** the first 3 seconds of our demo video are this load. It must feel like a film opening.

### 1.2 🔴 Begin button — magnetic + flicker + ember-pulse-when-ready — 1h
- **Surface:** `components/ui/magnetic-button.tsx`, used in landing-route.
- **Spec:**
  - Magnetic pull: ≤6px translation toward cursor when within 80px. Spring-damped (use `bubble`).
  - Flicker corner: 10ms-cycle CSS opacity flicker on the four corner SVG ticks while hovered.
  - Ember pulse: when input has text, button glows with `ember-pulse` keyframe (1.6s loop). Tells the user the button is "live."
- **Acceptance:** all three behaviours compose. Disabled state turns all of them off cleanly.

### 1.3 🔴 Cursor spotlight on the landing only — 0.3h
- **Surface:** `routes/landing-route.tsx` (mount it scoped to this route initially; promote to App-wide if it feels good).
- **Spec:** 30%-opacity radial gradient (320px radius, ember-warm) follows pointer. CSS-only via custom property updates.
- **Acceptance:** cursor moves; warm halo follows; no jank; respects reduced-motion (turns off entirely).

### 1.4 ✅ Input field — focus + character-rhythm
- Three-layer underline: (1) base track at 40% fg-tertiary, (2) draw-in ember layer that scales-X on focus or has-content, (3) keystroke pulse that re-mounts per keystroke for a brief 180ms brightness boost. See `routes/landing-route.tsx`.

### 1.5 ✅ Pill selection — sliding ember underline via `layoutId`
- Active pill renders a `motion.span` with `layoutId="pill-active-bg"`. Only one pill renders it at a time (the active one); Motion morphs the box between pills using a 380/30 spring. The result is the sliding ember background that follows the click. See `routes/landing-route.tsx`.

### 1.6 ✅ Subtle background ember radial-pulse
- Already shipped in round 4. `motion.div` cycles opacity 0.4 → 0.7 → 0.4 over 6s, infinite. Behind everything else.

### 1.7 ✅ Easter-egg long-press on version label opens demo project
- `useLongPress` hook + version label button. Hold for 1s to load the cached demo project (`DEMO_PROMPT` + trailer + initialize). Visible thin ember progress bar fills under the label while held. See `lib/use-long-press.ts` and `routes/landing-route.tsx`.

**Phase 1 audit notes (post-implementation, against `UI_FUNDAMENTALS.md`):**
- ✓ 60-30-10: ember accent appears only on (a) input draw-in underline when focused/has-content, (b) keystroke pulse, (c) active pill ring + bg, (d) magnetic-button when ready, (e) long-press progress bar, (f) center radial breath. Total surface ≤ 8% — well under the 10% accent budget.
- ✓ Title-case CTAs: "Begin" (single word). Pill labels are mono-uppercase tracking — allowed for caption/microtype, not CTA.
- ✓ Border-radius family: pills `rounded-full`, magnetic button `rounded-lg`, input has no radius (underline-only). Cohesive.
- ✓ Hierarchy: headline (display large) → sub-line (mono caps tracking, fg-tertiary) → input (mono regular) → pills (mono caps small) → button (regular). Four levers used: size, color, weight, placement.

---

## Phase 2 — Page-crumple transition (THE showpiece) ✅ COMPLETE (2026-04-25)

The showpiece. All three items shipped. Lesson reflection lives in [`SHADERS_AUDIO.md`](SHADERS_AUDIO.md) — read that first if you're touching this surface.

### 2.1 ✅ GSAP timeline (six tracks, 1.6s) — `routes/crumple-bridge-route.tsx`
- Six tracks composed via `gsap.timeline()` with explicit position parameters.
- Track A (0–0.18s) ember-flash gradient ignites at bottom-right.
- Track B (0–0.95s) landing content collapses (scale + rotate + translate + blur + opacity, `power3.in`).
- Track C (0.50–1.20s) canvas silhouette fades up beneath.
- Track D (0.40–0.80s) ember-flash fades out.
- Track E (0.20–1.60s) **shipped** — see 2.2 below.
- Track F (1.40–1.60s) final veil for clean handoff.
- `onComplete` navigates to `/canvas`. Reduced-motion bypasses the timeline entirely.

### 2.2 ✅ Plan A: GLSL ember-burn shader — `components/transition/paper-curl-canvas.tsx`
- R3F Canvas with orthographic camera + screen-quad mesh + custom `ShaderMaterial`. The vertex shader bypasses view/projection — `gl_Position = vec4(position.xy, 0.0, 1.0)` writes NDC directly.
- Fragment shader procedurally draws an **ember-burn sweep** (not a paper curl — a simpler, lower-risk choice that reads identically on demo day). Burn axis: bottom-right `(1, 0)` → upper-left `(0, 1)`. Signed-distance `d = burnPos - projection + wobble` drives three smoothstep regions: `burned` (fills bg-base), `emberEdge` (hottest band), `emberHalo` (warm halo). Procedural value-noise wobbles the edge; hash-based sparks flicker in the halo. Palette matched to brand-ember `#f0a868`.
- GSAP-to-shader bridge: `progressRef = useRef({ value: 0 })`. GSAP mutates `progressRef.current.value` 0→1 over 1.4s. `useFrame` reads it and pushes into `materialRef.current.uniforms.uProgress.value`. **No React re-renders per frame.**
- Lazy-loaded via `React.lazy` so the 848kB R3F+three chunk doesn't ship on the landing route. Landing preloads the chunk on mount via dynamic import so the bridge route is hot when the user submits.
- **Plan B floor:** the GSAP-only choreography from 2.1 still lands the transition if the shader chunk fails to load (Suspense fallback is `null`).

### 2.3 ✅ Audio cues — `lib/audio-cues.ts`
- Web Audio synthesis (no sample files): `playEmberPop` (filtered noise burst, ~150ms, lowpass 2400Hz → 80Hz) at +0.04s, `playCinematicRiser` (sub-bass sine 28Hz → 95Hz + bandpass noise sweep 400Hz → 3500Hz, 1.2s) at +0.18s.
- Triggered via GSAP `tl.call()` so audio rides the same timeline as visuals.
- Mute persisted in `localStorage["sceneos:audio-muted"]`. Landing's mute toggle writes; every `play*` call reads. Defaults to muted.
- Form submit is the user gesture that unsuspends `AudioContext` — cues fire ~50–200ms later, well inside the activation window.

**Phase 2 lessons banked (see `SHADERS_AUDIO.md`):** GSAP timeline composition with position parameter, R3F screen-quad pattern, GLSL signed-distance fields + value noise, ref-bridge between GSAP and shader uniforms, Web Audio synthesis without sample files, lazy chunk preload strategy, reduced-motion graceful degradation.

---

## Phase 3 — Canvas surface (the map) ✅ COMPLETE (2026-04-25)

The second of the three winning moments. All six items shipped. Lesson reflection lives in [`CANVAS_3D.md`](CANVAS_3D.md) — read that before touching the canvas surface.

### 3.1 ✅ Custom camera rig — `components/canvas/camera-rig.tsx`
- Replaced `OrbitControls` with a custom `<CameraRig>` component that lerps each frame.
- Each frame computes target from app state: active beat → glide to `(x+0.2, y+0.4, z+1.2)`; hovered beat → ≤0.05 unit pull on x/y; idle → ±0.04 z breath on an 8s sin.
- Per-frame lerp (rate 0.06) handles user redirecting clicks mid-glide cleanly — no GSAP `tl.kill()` required.
- Toggle UX: clicking the active node deselects (returns to overview). Clicking empty canvas via `onPointerMissed` does the same.

### 3.2 ✅ Node mesh — five states + halo + group-z animation — `components/canvas/node-mesh.tsx`
- All five states derive purely from `beat.status` + local hover/active flags.
- Idle: scale breath ±2%. Hover: +6% + halo grows. Active: +15% + group steps forward `+0.4z`. Approved: ember-saturated, scale 1.12, no breath. Ready-to-generate: 1.6s ember pulse on `emissiveIntensity` + halo opacity pulse.
- Halo is its own additive-blended sphere (no depth-write) — composes with bloom.
- Group-position-z animation (not mesh-position-z) so the `<Html>` label tracks the active offset.
- `onHoverChange` reports up to BeatMap3D so the camera rig can pull subtly toward hovered nodes.

### 3.3 ✅ Connecting path — `components/canvas/connecting-path.tsx`
- `THREE.CatmullRomCurve3` through node positions; `getPoints(8 × beats.length)` samples the spline.
- Rendered as `<points>` with `pointsMaterial` size 0.04, `color="#9aa6ad"`, opacity 0.3, `sizeAttenuation`. Reads as a faint trail.
- `depthWrite={false}` so it composites behind nodes without z-fighting.

### 3.4 ✅ Ambient particles + scroll-velocity reaction — `components/canvas/ambient-particles.tsx`
- 200 drei `<Sparkles>` at scale `[14, 8, 8]`, brand-ember color, opacity 0.5.
- `useScrollVelocity()` registered on canvas container; `velocityRef` passed down. Each frame, `material.uniforms.speed.value = BASE_SPEED × (1 + min(|velocity| × 8, 1.5))` → 1× idle, up to ~2.5× when scrolling. Same ref-bridge pattern as Phase 2 shader.
- Calms back via the hook's exponential decay.

### 3.5 ✅ Postprocessing verified — already in `beat-map-3d.tsx`
- `<Bloom intensity={0.9} luminanceThreshold={0.25} mipmapBlur />` + `<Vignette offset={0.2} darkness={0.85} />`. Untouched. Degradation order if perf slips is documented in [`CANVAS_3D.md` §6](CANVAS_3D.md).

### 3.6 ✅ Ambient projector audio loop — `lib/audio-cues.ts`
- New `startAmbientProjector()` returning a stop fn. Looping noise buffer → bandpass at 480Hz → tremolo gain (LFO at 24Hz writing into the gain AudioParam) → master gain → dest.
- 0.8s ramp-in, 0.6s ramp-out for clean fades. Volume default 0.025 (≈ -32dB).
- Wired into `canvas-route.tsx` via `useEffect` mount/unmount. Mute checked at start time.
- The looping `bufferSource` + AudioParam-modulated tremolo are the new Web Audio idioms banked.

**Phase 3 lessons banked (see `CANVAS_3D.md`):** custom camera rigs vs OrbitControls (when each fits), per-frame lerp vs GSAP tween for continuous multi-source state, Catmull-Rom splines, drei `<Sparkles>` shader-instanced primitives, ref-bridge into Sparkles uniforms, looping Web Audio with LFO modulation on AudioParam, performance budgeting on MBA M2.

---

## Phase 4 — Node detail drawer + agent bubbles

### 4.1 🔴 Drawer slide-in with content stagger — 0.5h
- **Surface:** `components/node/node-detail-drawer.tsx`
- **Spec:**
  - Drawer: `motion.aside` x 100% → 0, spring `drawer`. Already wired.
  - Inside, header → status pill → CTA stagger by 60ms with `motion.div` + `staggerChildren`.

### 4.2 🔴 Agent bubble character-by-character reveal — 1h
- **Surface:** `components/agent/agent-bubble.tsx` (already exists; upgrade)
- **Spec:**
  - Each bubble's content runs through `<TextSplitter>`.
  - Characters reveal at ~25ms each, capped at 1.6s total per bubble.
  - User bubbles appear instantly (no typewriter — the user already knows what they wrote).
  - Bubble container itself springs in via `bubble`.
- **Acceptance:** feels like a director thinking out loud, not a chatbot dump.

### 4.3 🔴 "Sufficient" status pill ember-pulse — 0.3h
- **Spec:** when sufficiency hits, the status pill animates to ember-warm and starts the `ember-pulse` keyframe. Plus the "Generate scene" CTA gains the same pulse.
- **Why:** guidance — tells the user the next click is hot.

### 4.4 🟠 Generate-in-progress panel — 1h
- **Surface:** new `components/node/generation-panel.tsx`
- **Spec:**
  - 16:9 placeholder with `animate-blur-pulse` (already in CSS).
  - A noisy gradient that "develops" into a cinematic still — animate a `mask` or `clip-path` across.
  - Three steppers in mono with ember dot moving between them:
    1. "Storyboard generated"
    2. "Clip rendering"
    3. "Uploading to Cloudinary"
  - Live timer "0:32 / ~2:00" (mock backend returns ~1.6s lifecycle, so the timer moves).
- **Acceptance:** a generation never feels "stuck" — the steppers tell the story.

---

## Phase 5 — Scene + clip preview

### 5.1 🔴 Custom `<VideoPlayer>` with ember scrubber — 1h
- **Surface:** new `components/ui/video-player.tsx`
- **Spec:**
  - Big play overlay (Lucide `Play`, 96px, ember).
  - Custom progress bar — ember-tinted, click-to-seek.
  - Time display in mono.
  - Auto-pause on drawer close.
  - Mood-graded URL via `buildClipUrl({ mood })`.
- **Acceptance:** never shows native browser controls.

### 5.2 🔴 Approve / Regenerate split CTA — 0.3h
- **Spec:** Approve = primary ember, full-width. Regenerate = ghost, ¼ width on the right. Spring `bubble` on press.

---

## Phase 6 — Stitch tray (the Cloudinary moment)

### 6.1 🔴 Live URL build typewriter — 1h
- **Surface:** `components/stitch/stitch-tray.tsx` (exists; upgrade)
- **Spec:**
  - When a beat approves, the tray's URL text gets a new `l_video:<id>,fl_splice/` segment appended via typewriter (~30ms/char, stagger 100ms after approval).
  - The URL is mono, fg-tertiary; the new segment glows ember briefly (300ms) then settles.
- **Acceptance:** judges literally watch the post-production pipeline assemble.

### 6.2 🔴 Thumbnail row with mood tints — 0.5h
- **Spec:**
  - Each thumbnail = `<img src={buildThumbnailUrl(publicId, { mood })}>`.
  - Mood tint at the bottom edge of each thumb.
  - Approved thumbs glow ember-dim; unapproved are dimmed 50%.

### 6.3 🟠 Render CTA pulse + horizontal drag inertia — 0.5h
- **Spec:**
  - When all beats approve, the Render button gains `ember-pulse`.
  - The thumbnail row supports horizontal drag with inertial decay (use `lib/use-scroll-velocity.ts`).

---

## Phase 7 — Final delivery

### 7.1 🔴 Final-delivery route — 1h
- **Surface:** new `routes/final-delivery-route.tsx`
- **Spec:**
  - Fade-to-cinema: 250ms black wipe between Stitch tray and the cinematic.
  - Title `Your cinematic.` slides up + fades in.
  - Custom video player (from 5.1) at 70vw width, autoplay.
  - Three actions: Download MP4, Copy share link, Open in CutOS.
  - Subtle film-grain overlay on the entire screen.
  - Bottom-right "Make another" returns to landing.

### 7.2 🟡 Subtle parallax on the cinematic frame — 0.3h
- **Spec:** as the user scrolls past the player, the player itself translates 0 → -20px Y. Uses scroll-velocity hook.

---

## Phase 8 — Cohesion & polish pass

### 8.1 🔴 Performance audit — 0.5h
- **Acceptance:**
  - Landing initial bundle ≤200KB transferred (gzipped).
  - Canvas chunk ≤1MB (we're at ~999KB; hold the line).
  - Canvas runs ≥55fps on a 1080p MBA M2 stress test.
  - No console warnings, no React StrictMode double-render warnings.

### 8.2 🔴 `prefers-reduced-motion` audit — 0.3h
- **Acceptance:** all keyframes + Motion components fall back to instant or 200ms fade when the media query matches. Spot-check by toggling OS setting.

### 8.3 🔴 Visual cohesion sweep — 0.5h
- **Acceptance:** every screen reviewed against the §11 checklist in `MOTION_LANGUAGE.md`. If a section looks like a Tailwind UI starter, redesign before merging.

### 8.4 🟠 Soft sound design — 0.5h
- **Spec:** a tasteful set per `FRONTEND_PHILOSOPHY.md` §8. Default muted; one-tap unmute toggle in landing footer.

---

## Phase 9 — Stretch (only if everything 🔴 and 🟠 is shipped)

### 9.1 🟢 GLSL paper-curl shader (Plan A from 2.2) — 3h
### 9.2 🟢 CutOS handoff modal — 0.5h
### 9.3 🟢 Scrollable below-the-fold "About / How it works" — *probably skip*
### 9.4 🟢 Below-fold testimonials / partner logos — *skip*

---

## Sequencing (the order to actually do these)

The dependency graph forces this order. Don't skip ahead.

```
0.1 motion-presets ─┐
0.2 text-splitter ──┼──┬──> 1.1 landing load ─┬──> 1.2 magnetic button ─┐
0.3 use-scroll-vel ─┤  │                       │                          │
0.4 index.css ──────┘  │                       └──> 1.3 cursor spotlight ─┤
                       │                                                   ├──> 2.1 GSAP crumple ─┐
                       └──> 4.2 agent typewriter                                                  │
                                                                                                  ├──> 3.1 camera rig ──> 3.2 nodes ──> 3.3 path ──> 4.x drawer ──> 5.x preview ──> 6.x stitch ──> 7.x final
                                                                                                  │
                                                                       (2.2 GLSL only after canvas works)
```

Build in lanes. Don't wait for one to finish before starting the next where the deps allow.

---

## Definition of demo-ready

The hackathon demo passes when:

1. ⏱️ **First 30s of the video.** Headline flickers in. Pills cascade. Underline draws. User submits prompt. Page crumples. Canvas reveals. Five glowing nodes breathe.
2. ⏱️ **Next 60s.** User clicks a node. Drawer slides in. Agent asks 2 directorial questions. Sufficiency hits. Generate fires. Steppers march. Clip preview plays.
3. ⏱️ **Next 30s.** All five beats approve. Stitch tray live-builds the Cloudinary URL. Render button pulses. User clicks. Final cinematic plays at 70vw.

If those three runs work, we ship. Everything else is bonus.

---

## North star (one sentence)

> *"Three moments win us the room: the page-crumple, the canvas reveal, the live URL building. Protect those above all."*
