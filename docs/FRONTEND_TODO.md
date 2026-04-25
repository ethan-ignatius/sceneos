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

## Phase 4 — Node detail drawer + agent bubbles ✅ COMPLETE (2026-04-25)

The middle 60 seconds of the demo. All four items shipped, plus the agent + generation API wiring needed to make the flow real (not theatre). Lesson reflection lives in [`AGENT_FLOW.md`](AGENT_FLOW.md) — read that before touching the agent stream or generation panel.

### 4.1 ✅ Drawer slide-in + content stagger — `components/node/node-detail-drawer.tsx`
- `motion.aside` springs in via `SPRING.drawer` (existing). Inside, a parent `motion.div` with `staggerChildren: STAGGER.drawerInner` (0.06s) and `delayChildren: 0.08` cascades header → body → footer.
- Each inner section uses `variants={fadeUp}` (`opacity: 0 → 1`, `y: 8 → 0`, `outQuart`).
- Footer is conditionally rendered: hidden during `generating`/`preview` so the generation panel speaks for itself.

### 4.2 ✅ Agent bubble character-by-character reveal — `components/agent/agent-bubble.tsx`
- New `delayStrategy="sequential"` mode added to `<TextSplitter>` — each char delays by `i × perCharStep`, with the step auto-scaled so total reveal ≤ 1.6s regardless of length.
- New CSS keyframe `.reveal-chars > span > span` (`reveal-char`, 0.18s ease-out, fade + 2px y).
- Only the most recent agent turn reveals; history snaps in (the `reveal` prop on `<AgentBubble>` controls this — prevents replaying past turns when the drawer reopens).
- User bubbles render plain text, instantly.
- Reduced-motion override added in `index.css` for `.reveal-chars` selector.

### 4.3 ✅ Sufficient pill + Generate-CTA ember-pulse
- The status pill toggles the existing `.ember-pulse` keyframe class when `beat.status === "ready-to-generate"` — plus border + bg + text shift to ember.
- The Generate CTA gets the same `.ember-pulse` class. Both share one infinite CSS animation; no JS per frame.
- Reasoning: Motion for transitions, CSS keyframes for indefinite loops. Reduced-motion already disables `.ember-pulse`.

### 4.4 ✅ Generation-in-progress panel — `components/node/generation-panel.tsx`
- 16:9 placeholder with the existing `.animate-blur-pulse` keyframe + a centered "Composing the frame" caption + a thin ember progress streak across the bottom edge (scaleX driven by ratio).
- Three steppers (`Storyboard generated → Clip rendering → Uploading to Cloudinary`) with an active ember dot that morphs between rows via Motion `layoutId="gen-active-dot"` (same sliding pattern as the landing pill underline). Done rows show a check icon; pending rows show a thin outline circle.
- Live timer: `mm:ss / ~mm:ss`, tabular-nums, updated every 250ms. Total estimate uses `suggestedDuration × 0.12 + 1.5` to stay tuned for both the mock backend's ~1.6s lifecycle and a longer real run.
- Read-only "Higgsfield · live" provider tag in the footer corner.

### 4.5 ✅ (bonus) Agent + generation API wired end-to-end
Not in the original spec but required for the flow to *work* during demo, not just look like it:
- `AgentBubbleStream` calls `api.agent()` on drawer mount (seed question) and on each user submit. Optimistic local append → POST → append agent reply or flip status to `ready-to-generate`. `cancelled` ref guards stale responses if the drawer unmounts mid-call.
- `NodeDetailDrawer` wires the Generate CTA to `api.generate()` + a polling loop on `api.status()` with a 30s safety timeout. On success, scene patches `clipPublicId` + `clipUrl` and beat status flips to `preview`.
- New `sleep(ms)` helper in `lib/utils.ts`.
- Error state: inline error bubble in the agent stream (Retry-friendly); inline error in the drawer footer for generation failures (status reverts to `ready-to-generate`).

**Phase 4 lessons banked (see `AGENT_FLOW.md`):** AnimatePresence + popLayout for keyed drawer remounts, `staggerChildren` + `delayChildren` Motion variants pattern, sequential vs jitter character reveal, Motion-vs-CSS rule of thumb (transitions vs indefinite loops), state machine on `beat.status` driving every visual, optimistic-update + cancelled-ref pattern for in-flight API calls, polling loop with safety timeout.

---

## Phase 5 — Scene + clip preview ✅ COMPLETE (2026-04-25)

The "proof the system delivered" moment. Both items shipped, plus the wiring to actually drive the state transitions. Lesson reflection lives in [`VIDEO_PLAYER.md`](VIDEO_PLAYER.md) — read that before touching the player or split CTA.

### 5.1 ✅ Custom `<VideoPlayer>` — `components/ui/video-player.tsx`
- Zero browser chrome (`controls={false}`); we draw our own.
- Big Play overlay: 96×96 ember disc with `Play` icon (96px would be the icon — we use a 36px icon inside a 96px disc for a softer feel + drop-shadow ember glow). AnimatePresence-fades between play and pause states.
- Click-to-seek progress bar at bottom: 2px idle, 2.5px on hover, ember fill with a faint glow shadow. `role="slider"` + `aria-valuenow` for screen-reader scrubbing.
- Top-right `mm:ss / mm:ss` mono time readout, tabular-nums, with backdrop-blur pill for legibility over varied frames. Top-left optional caption (passed by ClipPreview as `${beatName} · ${mood}`).
- Spacebar / `k` toggles play/pause when the player has focus. `tabIndex={0}` + `focus-visible:ring-2`.
- Auto-pause on unmount: the cleanup in the `src` effect calls `video.pause()`. Closing the drawer or switching beats (key remount) auto-pauses cleanly.
- `data-cursor="hide"` so the landing's CursorSpotlight (if it ever leaks here) doesn't glow over the clip frame.

### 5.2 ✅ Approve / Regenerate split CTA — `components/node/clip-preview.tsx`
- `<Button variant="primary" className="flex-1">` — full-width Approve in ember.
- `<Button variant="ghost" className="btn--edge-underline basis-1/4">` — ¼-width Regenerate ghost.
- New `.btn--edge-underline` CSS pattern (Unseen Studio reference): two `::before` / `::after` 50%-width underlines slide in from the left + right edges to meet in the middle on hover. 280ms `outQuart` cubic-bezier. Reduced-motion override disables the transition.
- Approve flow: `approveScene(beatId, sceneId)` → 220ms delay → `setActiveBeat(null)` so the user sees the approve happen before the drawer exit. The store's reducer flips beat status to `approved` if every scene is approved; the canvas's NodeMesh approved state takes over (Phase 3).
- Regenerate flow: new `regenerateScene` action on the store clears `clipPublicId` + `clipUrl` + `jobId` + `approved=false` and flips beat status to `ready-to-generate`. Conversation is preserved — the user shouldn't lose the questionnaire just because they want a different take. The drawer body swaps from `<ClipPreview>` back to `<AgentBubbleStream>` automatically (state-driven, see Phase 4 §1).

### 5.3 ✅ (audit fixes alongside)
Phase 4 audit findings fixed in the same commit, since they were demo-blockers:
- **Polling cancelRef now cleanup-safe**: `useEffect` returns `() => { cancelRef.current = true; }` so closing the drawer mid-generation no longer leaves an orphaned poll loop writing to a stale beat.
- **Retry button** in `AgentBubbleStream`: when `api.agent` fails, the failing user message is captured in `pendingRetryMessage`; an inline Retry button next to the error re-fires `callAgent` with the same message.
- **AgentBubble React.memo'd** with explicit comparator on turn fields — prevents the TextSplitter from recomputing animation-delays mid-reveal when the parent re-renders (which would visually flicker already-revealed chars).
- **Dynamic provider in GenerationPanel**: `provider` prop driven from the `/api/generate` response, with a `PROVIDER_LABEL` map. Shows "Connecting…" before the response arrives.
- **`aria-modal="true"` + `role="dialog"` + `aria-label` on the drawer**.
- **`aria-label`s on Loader2 icons**, `role="status"` / `role="alert"` on the loading + error containers.
- **Dropped pill ember-pulse** so only the CTA pulses (single attention signal, not split).
- **Removed invalid `role="text"`** from TextSplitter (not a valid ARIA role).
- **Combined double `cn` import** in node-detail-drawer.

**Phase 5 lessons banked (see `VIDEO_PLAYER.md`):** HTMLVideoElement event lifecycle (timeupdate/loadedmetadata/play/pause/ended), guard `currentTime/duration` against NaN, manual spacebar handler when `controls={false}`, click-to-seek with `getBoundingClientRect`, AnimatePresence for the play overlay, regen-via-state-machine pattern (clear scene fields + flip status, conversation preserved).

---

## Phase 6 — Stitch tray (the Cloudinary moment) ✅ COMPLETE (2026-04-25)

The third winning moment. Three items shipped + a new primitive (`usePointerDrag`). Lesson reflection lives in [`STITCH_TRAY.md`](STITCH_TRAY.md) — read that before touching the tray surface.

### 6.1 ✅ Live URL build typewriter — `components/stitch/stitch-tray.tsx`
- New `buildSpliceUrlSegments(orderedIds)` in `lib/cloudinary-transforms.ts` returns `{ head, middle, tail, base }` so the tray can render the URL as four pieces, only animating `tail`.
- Diff strategy: track `approvedIds.length` in a ref. Each render reads the current count; when it grows AND is ≥ 2 (so the first approval doesn't typewriter the whole URL — it just fades in), bump a `revealKey` and flip `shouldType=true`. After 1s, `shouldType` resets.
- `<TextSplitter delayStrategy="sequential" perCharStep={0.03} maxTotalDelay={1.4}>` runs on the tail, keyed by `revealKey` so the same segment doesn't re-reveal on re-renders.
- New CSS keyframe `.url-segment-glow` — ember color + 8px text-shadow at 0%, settles to fg-secondary by 100% over 1s. Reduced-motion override sets static fg-secondary.
- First approval → fade-in (no typewriter). Second+ → typewriter on the new tail with ember afterglow. Edge case (regenerate) handled by the count comparison naturally — going from N to N-1 doesn't trigger the reveal.

### 6.2 ✅ Mood-tinted thumbnail row — same file
- Each thumb is an `<img src={buildThumbnailUrl(scene.clipPublicId, { mood })}>` — Cloudinary's `so_auto` picks the most representative frame and applies the same per-mood color grade.
- New `moodAccentColor(mood)` helper maps each `BeatMood` → a brand-aligned hex (cool blue, ember, ember-warm, ember-dim, success-cool, error-warm). Lives in `cloudinary-transforms.ts` next to `colorGradeFor`.
- Bottom-edge linear-gradient tint at 0x66 (40%) opacity — a *hint* of mood, not a re-grade.
- Approved thumbs: `border-brand-ember/60` + `shadow-[0_0_18px_-4px_rgba(240,168,104,0.55)]` ember glow. Unapproved: `opacity-50`.
- Beat name overlay uses `mix-blend-difference` so it reads against either the thumbnail or the bg-base placeholder.

### 6.3 ✅ Render CTA pulse + horizontal drag with inertia
- New `lib/use-pointer-drag.ts` primitive. Pointer-down → pointer-move (read/write `el.scrollLeft`) → pointer-up triggers RAF inertia loop with exponential decay (factor 0.92, min velocity 0.2 px/frame). Boundary clamps kill inertia rather than bouncing.
- Only responds to `e.button === 0` (left mouse) — trackpad two-finger horizontal scroll uses wheel events, so it's untouched. Native overflow-x scroll (mousewheel, focus-arrow keys) stays intact.
- `data-dragging="true"` attribute on the container drives the `cursor: grabbing` swap via Tailwind's `data-[dragging=true]:cursor-grabbing` selector.
- Render CTA gets `.ember-pulse` class when `allReady`. Same single-source CSS keyframe; same reduced-motion override; no JS each frame.
- "Open in CutOS" ghost button gets `.btn--edge-underline` from Phase 5 for tasteful hover.

**Phase 6 lessons banked (see `STITCH_TRAY.md`):** Cloudinary `fl_splice` URL anatomy + segment diff strategy, ref-based length comparison for "what just changed" detection, keyed `<TextSplitter>` for one-shot reveals (vs flicker on re-render), pointer-drag with RAF inertia (separate from wheel-driven `useScrollVelocity`), `mix-blend-difference` for legible labels over arbitrary thumbnails, mood-as-tint instead of mood-as-regrade.

---

## Phase 7 — Final delivery ✅ COMPLETE (2026-04-25)

The exhale. The delivered product. Both items shipped, plus the StitchTray Render-CTA wiring that was previously a no-op. Lesson reflection lives in [`FINAL_DELIVERY.md`](FINAL_DELIVERY.md).

### 7.1 ✅ Final-delivery route — `routes/final-delivery-route.tsx`
- New `/final` route registered in `App.tsx`. Guards on `manifest?.finalCloudinaryUrl` — if missing, redirects to `/`.
- "Fade to cinema" is route content fading in over 250ms on a `bg-bg-base` route container — no black-overlay div needed; the absence of route transition + the staggered reveal reads as a wipe.
- Headline: `<motion.h1>` "Your cinematic." with `text-display-lg` italic, `EASE.filmIn` slide-up + fade over `DURATIONS.cinematic` (0.72s) at 0.15s delay. The trailing period is intentional — it's a statement of fact, not a label.
- Sub-line above the headline: mono caps tracking, `Delivered · {videoType} · {formatDuration}` — anchors the moment as concluded.
- Reused `<VideoPlayer>` at `w-[70vw] max-w-[1200px]`, `autoPlay`, `muted={false}` (user-gesture is in scope from the prior Render click), with a "Final cut · Cloudinary fl_splice" caption pill.
- Three actions: **Download MP4** (primary ember; uses `fl_attachment` Cloudinary transform to force `Content-Disposition: attachment`), **Copy share link** (ghost + edge-underline + clipboard + toast), **Open in CutOS** (ghost + edge-underline + `api.cutosImport` + `window.open(editUrl, "_blank", "noopener,noreferrer")` with inline loading state).
- Below-the-fold metadata: master prompt + numbered beat manifest in mono. Documents what was made; gives the parallax something to scroll past.
- "Make another" — bottom-right ghost with `btn--edge-underline`, ArrowRight icon. Resets BOTH stores (`useBeatGraphStore.reset()` and `usePromptStore.reset()`) before navigating to `/` — otherwise the persisted prompt-store would pre-fill the landing input with the previous session's text, and the user would start their new session with stale state leaking in.
- Existing `.film-grain` overlay class applied to the route's `<main>` — visual rhyme with the landing. Bookends the experience.

### 7.2 ✅ Subtle parallax on the player — same file
- `useScrollVelocity({ clamp: [0, 1] })` registered on `window`. Each RAF tick, the player wrapper's `transform: translate3d(0, progress * -20px, 0)` is mutated directly via ref. No React re-renders per frame.
- `willChange: transform` on the wrapper for compositor hints.
- Honors `useReducedMotion()` — when reduced-motion is active, the parallax effect short-circuits and the player stays static.

### 7.3 ✅ (bonus) Render CTA wired in StitchTray
- The Phase 6 Render CTA was a UI-only toggle. Phase 7 wires `onClick → api.stitchUrl({ manifest }) → setFinalCinematic({ finalUrl, thumbnailUrl, durationSeconds }) → navigate("/final")`.
- New `setFinalCinematic` store action patches the manifest's `finalCloudinaryUrl`, `thumbnailUrl`, `durationSeconds`.
- Inline error state in the StitchTray when the API call fails (state reverts; user can retry).
- `Loader2` spinner + "Stitching…" label while the call is in flight.

**Phase 7 lessons banked (see `FINAL_DELIVERY.md`):** route-level entrance choreography without an overlay div, when to reuse vs replace `<VideoPlayer>` (autoplay sound-on after a user gesture is in scope), `download` attribute + `fl_attachment` belt-and-braces, cross-store reset rules (BOTH stores before navigate to avoid leak), `useReducedMotion()` from Motion to gate ref-based parallax, native `window.open` with `noopener,noreferrer` for external handoffs.

---

## Phase 8 — Cohesion & polish pass ✅ COMPLETE (2026-04-25)

The integration test of taste. Methodology + results documented in [`POLISH_AUDIT.md`](POLISH_AUDIT.md).

### 8.1 ✅ Performance audit
- **Bundle review (gzipped):** main 192.08 KB ✅ (target ≤200 KB), R3F chunk 227.95 KB (lazy), beat-map-3d chunk 42.46 KB (lazy), paper-curl-canvas 1.92 KB (lazy), CSS 8.57 KB. **All within budget.**
- **60fps target:** documented degradation order if perf slips on demo hardware (sparkles 200→120, bloom mipmapBlur off, vignette off, dpr clamp). No drops observed in dev.

### 8.2 ✅ `prefers-reduced-motion` audit
- **Coverage matrix in POLISH_AUDIT.md §3** identified 9 surfaces with gaps. Closed via:
  - `<MotionConfig reducedMotion="user">` wrapper at three route boundaries (landing, canvas, final-delivery). Auto-degrades transform-based animations to opacity-only across drawer slide, agent bubble enter, generation panel layoutId dot, stitch tray slide, landing pills cascade, etc.
  - New `lib/use-prefers-reduced-motion.ts` hook (matchMedia bridge for components inside R3F where Motion context isn't available).
  - `CameraRig` skips idle-breath sin term under reduced-motion.
  - `NodeMesh` skips breath term, dampens active-scale boost (1.15→1.06), holds group-z still (no +0.4 step forward).
  - `AmbientParticles` clamps Sparkles speed to 0 — drift stops; sparkles render as still dots.

### 8.3 ✅ Visual cohesion sweep
- 60-30-10 ember accent budget verified per route — all under the 10% threshold (POLISH_AUDIT.md §4).
- Border-radius family confirmed cohesive across `rounded-full`/`-md`/`-lg`/`-xl`/`-2xl`.
- No UPPERCASE CTAs anywhere; title-case + sentence-case used appropriately.
- Mobile responsiveness fix: final-delivery player now `w-[90vw] sm:w-[70vw]` so the cinematic doesn't shrink to a postage stamp on narrow viewports.
- Typography rhythm confirmed: display italic on landing/bridge/final, mono caps on captions, Inter on prose/buttons.

### 8.4 ✅ Soft sound design
- New `playApproveChime` — two-note ascending sine (G4 → C5, perfect fourth, ~120ms total). Fires on Approve scene click. Quiet completion punctuation, ≈ -38dB peak (volume 0.05).
- New `playRenderWhoosh` — bandpass-noise sweep (300Hz → 4000Hz exponential, ~200ms). Fires at click-time on Render CTA so the cue's tail carries into /final's mount. ≈ -32dB peak (volume 0.045).
- Both check `isAudioMuted()` → mute toggle dominates. Both are short one-shots, synthesized via Web Audio (no sample files).
- Combined audio palette is now: ember pop + cinematic riser (bridge), ambient projector (canvas continuous), approve chime + render whoosh (state transitions). **Five cues total, all restrained.**

### 8.5 ✅ (alongside) Phase 7 audit fixes shipped
- `MotionConfig reducedMotion="user"` wrapping the /final route (entrance animations now reduced-motion-safe).
- `fl_attachment` URL transform now idempotent (`includes` guard).
- CutOS handler validates `editUrl` before `window.open`.
- StitchTray's in-flight render uses a `mountedRef` to skip post-unmount setState.
- Final-delivery beat manifest now uses `scene.durationSeconds ?? archetype.suggestedDuration` (actual refined duration, not template default).

**Phase 8 lessons banked (see `POLISH_AUDIT.md`):** route-boundary `MotionConfig` as the cleanest way to gate transform-based Motion across an entire surface, matchMedia bridge hook for R3F components outside Motion context, reduced-motion as design-friendly (preserving signal via opacity + minor scale rather than removing all feedback), audio palette restraint (5 cues across the entire flow, no more), bundle review as documented checkpoint not just `npm run build` output.

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
