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

## Phase 0 — Foundation primitives (do these first, everything builds on them)

### 0.1 🔴 Upgrade `motion-presets.ts` with full easing library — 0.5h
- **Acceptance:** exports `EASE` with `outQuart`, `inOutQuart`, `filmIn`, `filmOut`, plus the 18 named curves from alexportfolio's library (linear, ease[In/Out/InOut][Quad/Cubic/Quart/Quint/Expo/Sine/Circ]). Plus `DURATIONS` (5 tokens), `SPRING` (3 presets).
- **Why first:** every other motion task imports from here.

### 0.2 🔴 Add `lib/text-splitter.tsx` — 0.5h
- **Acceptance:** `<TextSplitter text="...">` renders each char as `<span data-index>` with deterministic random animationDelay seed. Used by the landing flicker reveal and agent bubbles.
- **Reference:** alexportfolio's `components/Common/TextSplitter/TextSplitter.tsx`.

### 0.3 🔴 Add `lib/use-scroll-velocity.ts` — 1h
- **Acceptance:** RAF-driven hook returning a `currentProgressRef`. Wheel + touch + drag deltas accumulate; exponential decay at rate 5; interpolation constant 0.3. CSS variable bridge (`el.style.setProperty('--scroll-progress', ...)`).
- **Reference:** alexportfolio's `app/ScrollVelocityProvider.tsx`.

### 0.4 🔴 Add `index.css` keyframes + utility classes — 0.5h
- **Acceptance:** keyframes `flicker`, `flicker-corner`, `ember-pulse`, `grain` (already present), `paper-curl-burn`. Utility classes `.glow-ember`, `.glow-cool`, `.film-grain` (present), `.ember-pulse-on-ready`.

### 0.5 🟠 Add `components/ui/cursor-spotlight.tsx` — 0.5h
- **Acceptance:** subtle radial-gradient at pointer position, ember-warm at 6% opacity. CSS-only via custom property `--mouse-x` / `--mouse-y` updated on `pointermove`. Mount once at App root, beneath all content.
- **Why:** elevates perceived quality without a custom cursor. Apple-Vision-Pro-page energy.

---

## Phase 1 — Landing surface (the first 30 seconds judges see)

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

### 1.4 🟠 Input field — focus + character-rhythm — 0.5h
- **Spec:**
  - On focus: underline draws from left (already in 1.1, but post-load this is on-focus).
  - On every keystroke: a 60ms ember-tinted underline pulse (subtle).
  - Placeholder fades in/out with `quick` instead of cutting.

### 1.5 🟡 Pill selection — sliding ember underline (`layoutId`) — 0.5h
- **Spec:** Motion's `layoutId` shared between the three pills' underlines so the active indicator slides between them on click instead of cutting. Spring `bubble`.

### 1.6 🟡 Subtle background ember radial-pulse — 0.3h
- **Spec:** the existing ember radial gradient pulses 40%→60%→40% over 6s. Almost imperceptible but reads as "alive." Single keyframe.

### 1.7 🟢 Easter-egg long-press on version label opens demo project — 0.3h
- **Spec:** holding the bottom-left "SceneOS · v0" for 1s triggers the cached demo trailer. Useful for judges who poke; safety net.

---

## Phase 2 — Page-crumple transition (THE showpiece)

### 2.1 🔴 GSAP timeline upgrade — 1.5h
- **Surface:** `routes/crumple-bridge-route.tsx`
- **Spec:** see `MOTION_LANGUAGE.md` §6.2. Six tracks running in parallel; total 1.6s.
  - Track A (0–0.18s): ember-flash gradient ignites.
  - Track B (0–0.95s): landing content collapse (scale + rotate + translate + blur + opacity).
  - Track C (0.50–1.20s): canvas page mounts beneath, fades up.
  - Track D (0.40–0.80s): ember-flash fades.
  - Track E (0.20–1.40s, optional Plan A): GLSL paper-curl shader.
  - Track F (1.40–1.60s): final settle.
- **Acceptance:** GSAP timeline composed once and `play()`ed on mount. `onComplete` navigates to `/canvas`. No double-mount, no flash of unstyled canvas.

### 2.2 🟠 Plan A: GLSL paper-curl shader — 3h (stretch)
- **Surface:** new `components/transition/paper-curl-canvas.tsx`
- **Spec:**
  - Snapshot the landing DOM via `html-to-image` → `data:image/png` → `THREE.Texture`.
  - Mount a full-viewport `<Plane>` in R3F with a custom fragment shader that applies a curl distortion uniformly seeded by a `uCurlAngle` uniform animated 0 → π by GSAP.
  - Optional: a noise mask that simulates the paper "burning" along the curl edge with an ember-warm emissive glow.
- **Plan B (always shipped):** the GSAP-only version from 2.1 is the floor. If the shader slips, the showpiece still works.
- **References:** see Codrops shader-paper-curl articles for shader sketch.

### 2.3 🟡 Audio cue (optional) — 0.3h
- **Spec:** at 0.4s into the timeline, play a short analog-fire pop sample at -32dB. Mute respected. Use Howler.js or native `<audio>` with autoplay-friendly user-gesture context.

---

## Phase 3 — Canvas surface (the map)

### 3.1 🔴 Camera rig — auto-glide between nodes — 1.5h
- **Surface:** `components/canvas/beat-map-3d.tsx`, new `camera-rig.tsx`
- **Spec:**
  - Replace `OrbitControls` with a custom rig.
  - On node click, GSAP-tween the camera position to (node.x + offset, node.y + 0.4, node.z + 1.2) over 720ms `inOutQuart`.
  - On hover, the camera lerps very subtly toward the hovered node (≤0.05 units).
  - Idle: camera breathes z by ±0.04 over 8s (sin), giving the scene "alive" feel without distraction.
- **Acceptance:** clicking a node visually transports you; clicking the same node again transports back to overview.

### 3.2 🔴 Node mesh — three states + breathe + ember-pulse-on-ready — 1h
- **Surface:** `components/canvas/node-mesh.tsx` (already there, upgrade)
- **Spec:**
  - Idle: subtle scale breath (already implemented).
  - Hover: scale +6%, emissiveIntensity 0.08 → 0.25, halo grows (selective bloom contribution).
  - Active: scale +15%, position.z +0.4, ember glow saturated.
  - Approved: ember-saturated steady state. No breathing.
  - Ready-to-generate: 1.6s ember-pulse on emissiveIntensity (matches `ember-pulse` CSS keyframe).
- **Acceptance:** all five states render distinctly without a state explosion. State derives from `beat.status` only.

### 3.3 🔴 Connecting path between nodes — 0.5h
- **Spec:** sample 32 points along a Catmull-Rom spline between adjacent nodes. Render as `<points>` with `pointsMaterial` size 0.04, color `fg-tertiary` at 30% opacity. The path quietly teaches the trailer's beat order without arrows.
- **Acceptance:** path visible on first paint; doesn't compete with nodes for attention.

### 3.4 🟠 Ambient particles + scroll-velocity reaction — 1h
- **Spec:**
  - 200 `<Sparkles>` (drei) at low density across the scene.
  - Scroll-velocity drives a `--scroll-velocity` CSS var → particles' speed scales 1× → 2.5× when the user scrolls/spins. Calms back when idle.
- **Acceptance:** scrolling / dragging on the canvas makes the world feel reactive without overwhelming.

### 3.5 🟠 Postprocessing — bloom + vignette + film grain — 0.3h
- **Already in `beat-map-3d.tsx`.** Verify it still runs at 60fps on a 1080p MBA M2. If not, drop bloom mipmapBlur first, vignette second.

### 3.6 🟡 Soft ambient audio loop — 0.3h
- **Spec:** faint film-projector whir loop, -30dB, mute toggle respects landing's mute state.

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
