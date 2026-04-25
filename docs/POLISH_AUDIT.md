# POLISH_AUDIT — Phase 8 Lesson Reflection

> **Phase 8 surface:** the entire app. The cohesion + polish sweep before demo day. Read this **before** running the audit pass — it's the playbook for what we're checking and the rubric for "good enough to ship."

Phases 0–7 built the seven feature surfaces. Phase 8 is the **integration test of taste**: does the whole thing read as one product, or as seven well-built pieces taped together? Demo judges experience the app as one continuous flow; small inconsistencies — a misaligned border, a button that pulses while another doesn't, a transition that runs while reduced-motion is on — break the spell.

This phase is mostly *checking*, not *building*. The deliverables are: a documented audit pass, fixes for whatever's broken, and four tasteful sound cues that bind the experience together.

---

## 1. The four-axis audit

Phase 8 covers four discrete checks. Each has a pass/fail bar and a fixed rubric.

| § | axis | bar | tool |
|---|---|---|---|
| 8.1 | Performance | ≥55fps on MBA M2 1080p; gzipped initial bundle ≤200KB; canvas chunk ≤1MB | Chrome DevTools Perf, `vite build` output |
| 8.2 | `prefers-reduced-motion` | every keyframe + Motion component falls back to instant or opacity-only | OS-level toggle + visual sweep |
| 8.3 | Visual cohesion | every screen passes the [`UI_FUNDAMENTALS.md`] rubric | manual review against §11 checklist |
| 8.4 | Soft sound design | per `FRONTEND_PHILOSOPHY.md` §8 — tasteful, ≤4 cues, mute respected | manual playback test |

---

## 2. Performance audit (§8.1)

The actual perf characteristics of this app are determined by:

- **Landing route:** lightweight DOM, one Motion-driven cursor spotlight. ~0 cost outside paint.
- **Crumple bridge:** lazy R3F + GLSL shader chunk, 1 GSAP timeline. Loads on demand.
- **Canvas:** 5 nodes + Catmull-Rom path + 200 Sparkles + bloom + camera rig + ambient projector audio. **The fps battleground.**
- **Drawer/agent:** Motion stagger, AnimatePresence, 4×/sec timer in GenerationPanel. Cheap.
- **Stitch tray:** sequential TextSplitter on URL tail, mood-tinted thumbs. Cheap.
- **Final delivery:** one VideoPlayer at 70vw + RAF parallax. Cheap.

**Bundle review (acceptance):** the chunks the user actually pays for.

| chunk | budget | current (last build) | path |
|---|---|---|---|
| `index-*.js` (main) | ≤200KB gzipped | 191.65 KB | landing + canvas-route + drawer + agent + stitch + final |
| `react-three-fiber.esm-*.js` | ≤250KB gzipped | 227.95 KB | lazy on canvas + crumple |
| `beat-map-3d-*.js` | ≤50KB gzipped | 42.29 KB | lazy on canvas |
| `paper-curl-canvas-*.js` | ≤2KB gzipped | 1.92 KB | lazy on crumple |
| `index-*.css` | ≤10KB gzipped | 8.55 KB | global |

**All within budget.** Only the *raw* (un-gzipped) main is over 500KB which Vite warns about — but gzipped 191KB is well under our 200KB target. The R3F chunk is genuinely heavy but lazy-loaded; Phase 1 landing doesn't pay for it.

**Per-frame perf check (the canvas):** open Chrome DevTools → Performance. Record 3s of canvas interaction (hover nodes, click, hover another). Look for:

- Frames consistently ≤16.6ms (60fps) → green
- Frames 16.6–25ms occasionally → yellow, acceptable  
- Frames >25ms or repeated drops → fix

**Likely fix candidates if perf slips:**
1. Sparkles count 200 → 120 (still atmospheric, ~40% less compositor work).
2. Bloom `mipmapBlur: false` (cheaper sample pattern, marginally less smooth bleed).
3. Drop Vignette entirely (fullscreen pass; surprisingly expensive).
4. `dpr={[1, 1.5]}` instead of `[1, 1.75]` on the Canvas (1.5× DPR = 25% fewer fragment shader invocations on retina).

---

## 3. Reduced-motion audit (§8.2)

The promise: when the user's OS has `prefers-reduced-motion: reduce` set, every animation either:
- runs instantly (opacity 0→1 in 0s), OR
- falls back to a 200ms opacity-only fade (no transforms, no scaleX, no slide-up)

**Coverage matrix.** Each row should have an active reduced-motion guard.

| surface | mechanism | location | covered? |
|---|---|---|---|
| Landing flicker reveal | CSS `@media (prefers-reduced-motion: reduce)` in index.css | `.flicker-on-mount > span > span` set to `opacity: 1`, `animation: none` | ✅ |
| Landing ember pulse on radial bg | Motion `animate={{ opacity: [0.4, 0.7, 0.4] }}` | landing-route.tsx | ❌ — no guard. **Fix needed.** |
| Landing magnetic button hover | CSS — `@media (hover: hover) and (pointer: fine)` already gates it | index.css | ✅ |
| Landing input keystroke pulse | Motion variants | landing-route.tsx | ❌ — no guard, but it's a 0.18s opacity flash; arguably fine. **Verify.** |
| Crumple bridge GSAP timeline | manual `prefers-reduced-motion` check at top of effect | crumple-bridge-route.tsx | ✅ — bypasses to a 200ms timeout + navigate |
| Crumple shader (paper-curl-canvas) | not animated under reduced-motion (shader doesn't run because GSAP timeline is bypassed) | — | ✅ via the bridge bypass |
| Audio cues (ember pop, riser) | mute toggle is independent | audio-cues.ts | n/a |
| Canvas camera rig idle breath | runs always; transform-based | camera-rig.tsx | ❌ — minor; could gate via media query in JS |
| Canvas node mesh breath / hover scale | runs always | node-mesh.tsx | ❌ — minor; gate breath, keep hover signaling |
| Canvas sparkles | runs always | ambient-particles.tsx | ❌ — drift is gentle; arguably fine |
| Canvas ambient projector audio | mute toggle independent | audio-cues.ts | n/a |
| Drawer enter slide | Motion `SPRING.drawer` — transform-based | node-detail-drawer.tsx | ❌ — should fall back to opacity fade |
| Drawer staggered children | Motion variants, `y: 8 → 0` | node-detail-drawer.tsx | ❌ |
| Agent bubble char reveal | CSS `.reveal-chars` keyframe with reduced-motion override | index.css | ✅ |
| Generation panel blur-pulse | CSS `.animate-blur-pulse` with override | index.css | ✅ |
| Generation panel layoutId dot | Motion spring | generation-panel.tsx | ❌ — minor; transform-based |
| Sufficient pill / Generate CTA pulse | CSS `.ember-pulse` with override | index.css | ✅ |
| Stitch tray drawer | Motion spring, transform-based | stitch-tray.tsx | ❌ |
| Stitch URL segment glow | CSS `.url-segment-glow` with override | index.css | ✅ |
| Stitch thumbnail sequence | static, no anim | — | n/a |
| Stitch render CTA pulse | CSS `.ember-pulse` | index.css | ✅ |
| Final delivery entrance | Motion components | final-delivery-route.tsx | ✅ — wrapped in `<MotionConfig reducedMotion="user">` (Phase 7 audit fix) |
| Final delivery parallax | gated via `useReducedMotion()` hook | final-delivery-route.tsx | ✅ |
| Film grain overlay | CSS `.film-grain::before` with override | index.css | ✅ |

**Tally:** 9 surfaces have gaps. The most visible are the drawer enter slide and the canvas idle-breath — both are real perceived motion that bother users with vestibular sensitivity.

**Fix strategy:** wrap each Motion-driven route at the route boundary in `<MotionConfig reducedMotion="user">`. That's a one-line wrapper per route, no per-component edits. Motion's `"user"` mode auto-degrades transforms to opacity. The canvas-route's R3F-driven motion (camera breath, sparkles drift) needs a JS-side check via the `prefers-reduced-motion` media query in the components themselves.

---

## 4. Visual cohesion sweep (§8.3)

The rubric is `UI_FUNDAMENTALS.md` §11 (the per-screen audit checklist). For SceneOS:

**60-30-10 color rule.** The ember accent should appear on ≤10% of the visible surface area at any given time. Spot-check each route:

| route | ember accent surface | within budget? |
|---|---|---|
| Landing | input draw-in + keystroke pulse + active pill bg + magnetic-button when ready + radial breath + long-press progress | ~6% peak ✅ |
| Crumple bridge | radial flash + shader burn line + landing-vibe dot orbs | ~12% peak ⚠ — but it's a transient sweep, not a steady state |
| Canvas | active node + halo + connecting path tone + sparkles | ~5% steady ✅ |
| Drawer (questioning) | bubble bg ring + send button (when active) | ~3% ✅ |
| Drawer (ready) | sufficient pill + Generate CTA pulse | ~7% ✅ |
| Drawer (preview) | progress bar + Approve CTA + caption pill | ~8% ✅ |
| Stitch tray | URL segment glow (transient) + Render CTA pulse + approved thumb glows | ~9% ✅ |
| Final delivery | Download CTA + caption pill + headline (italic accent) | ~6% ✅ |

**All within budget. Good.**

**Border-radius family.** Everything should be one of: `rounded-full` (pills, dots), `rounded-md` (small cards/buttons), `rounded-lg` (drawer surfaces), `rounded-xl` (stitch-tray container), `rounded-2xl` (chat bubbles). Same family, scaled up.

**Title-case CTAs.** The rule is: button text is Title Case (e.g., "Generate Scene"), microcaps for labels (UPPERCASE TRACKING), display for headlines (italic). Spot-check:

| location | text | rule | result |
|---|---|---|---|
| Landing | "Begin" | Title Case | ✅ |
| Drawer footer | "Generate scene" | Title Case (sentence) | ⚠ "Generate scene" reads as sentence-case; spec said "Generate scene". Acceptable. |
| Drawer preview | "Approve scene" / "Regenerate" | Title Case | ✅ |
| Stitch tray | "Render final cinematic" | sentence-case | ⚠ should arguably be "Render Final Cinematic" Title Case — but stitch-tray is mono-uppercase context; "Render final cinematic" reads better as headline-case. **Keep as-is.** |
| Final delivery | "Download MP4", "Copy share link", "Open in CutOS" | mixed | "Download MP4" Title-Case ✅; "Copy share link" sentence-case ⚠; "Open in CutOS" ✅. **Fix:** "Copy Share Link" → no, sentence is more natural here. The rule is "no UPPERCASE CTAs"; both are fine. |
| Final delivery | "Make another" | sentence-case | ✅ |

No UPPERCASE CTAs anywhere. ✅

**Typography rhythm.** Display + body + mono used consistently:
- Display: italic Saol headline tier on landing, bridge, /final.
- Mono: caption labels (10px uppercase tracking 0.28–0.32em), URLs, numbers, mono buttons.
- Body: Inter regular for prose / button labels.

**Consistency check.** Across surfaces, the **same** primitives:
- `motion-presets.ts` durations + eases + springs — used by every Motion call ✅
- `Pill`, `MagneticButton`, `Button` shared shells ✅
- `TextSplitter` for char reveals on landing + agent + stitch ✅
- `useScrollVelocity` shared by canvas particles + final-delivery parallax ✅
- `useReducedMotion` consistently respected per the matrix above (after fixes)

**Mobile sanity:** the actual demo is on desktop. But:
- 70vw player at 375px → 262px wide — usable, but consider `w-[90vw] sm:w-[70vw]`.
- Button row at 375px wraps to multiple lines — acceptable.
- "Make another" at `bottom-6 right-6` (24px) is in iOS thumb-zone — bump to `bottom-10 sm:bottom-6` or accept (demo is desktop).

---

## 5. Soft sound design (§8.4)

Phase 0/2 shipped audio cues. Phase 8 adds one or two more so the experience has *consistent* sonic punctuation, not just two highlights. The rule: **mute toggle dominates**, every cue checks `isAudioMuted()` first.

**Existing cues:**
- `playEmberPop` — bridge ignition (+0.04s)
- `playCinematicRiser` — bridge thrust (+0.18s)
- `startAmbientProjector` — canvas room tone (continuous)

**Phase 8 additions:**
- `playApproveChime` — 2-note ascending sine (~120ms total) on Approve scene click. Hint of completion, no fanfare.
- `playRenderWhoosh` — bandpass-noise sweep (~200ms) on Render CTA click — pairs with the navigate to /final.

That's it. **Two more cues, not five.** Awwwards-tier sound design is *restrained* — the absence of sound makes the present sounds matter.

**Where the cues fire:**

| cue | trigger | location |
|---|---|---|
| `playApproveChime` | `approveScene` action in clip-preview's handleApprove | `clip-preview.tsx` |
| `playRenderWhoosh` | `handleRender` start in stitch-tray | `stitch-tray.tsx` |

Both respect `isAudioMuted()`; both are short one-shots (<250ms); both are synthesized via Web Audio (no sample files).

**Volume calibration.** All cues should peak at ≤-32dB (linear ≈ 0.025–0.07). Anything louder dominates the room tone and feels intrusive. Tune by playing through the demo flow and listening; if a cue stands out *too much*, drop volume by half.

---

## 6. Decision matrix

| item | ship | risk | floor if it slips |
|---|---|---|---|
| 8.1 Bundle review (already passing) | ✅ document | low | n/a |
| 8.1 60fps spot-check on MBA M2 | ✅ run | low | drop sparkles to 120 |
| 8.2 Drawer route MotionConfig wrap | ✅ yes | low | leave as-is (less polished) |
| 8.2 Canvas idle-breath JS-gate | ✅ yes | low | leave as-is |
| 8.2 Landing radial-pulse gate | ✅ yes | low | leave as-is |
| 8.3 Cohesion documentation | ✅ yes | low | n/a |
| 8.3 Mobile player width | ✅ yes | low | leave 70vw |
| 8.4 `playApproveChime` | ✅ yes | low | silence |
| 8.4 `playRenderWhoosh` | ✅ yes | low | silence |

**Time budget:** ~1.5 hours. Mostly drive-by polish, nothing architectural.

---

## 7. Risks & mitigations

| risk | mitigation |
|---|---|
| MotionConfig at the route level fights existing per-element variants | `reducedMotion="user"` mode is additive — when matching, transforms become opacity-only; when not, all variants run normally. Tested against landing flicker (no conflict). |
| Canvas idle-breath JS-gate needs `useEffect` listening to `matchMedia` | Use `window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", …)`; one listener per Canvas mount. |
| New audio cues stack with ambient projector → cluttered | Volume calibration. Approve chime peaks ≈ -38dB (0.013); render whoosh peaks ≈ -32dB (0.025). Both are transient. |
| Render whoosh fires before navigate (synchronous) → no overlap with /final entrance | the cue is ~200ms; the nav happens in parallel. The whoosh persists into /final's mount. Acceptable. |
| Approve chime fires before drawer close (220ms delay) — the chime is over by the time the drawer slides | Intentional. The chime says "approved"; the drawer slide says "moving on." Sequenced. |

---

## 8. Implementation map

1. `lib/audio-cues.ts` — add `playApproveChime` (sine, 2 notes ascending, ~120ms) and `playRenderWhoosh` (bandpass-noise sweep, 200ms).
2. `routes/canvas-route.tsx` — wrap with `<MotionConfig reducedMotion="user">`.
3. `routes/landing-route.tsx` — wrap with `<MotionConfig reducedMotion="user">` (handles radial breath, pills cascade, etc.).
4. `components/canvas/node-mesh.tsx` + `camera-rig.tsx` — add `useReducedMotion`-derived flag (matchMedia-based since these are inside R3F Canvas where Motion isn't available); skip the breath terms when active.
5. `components/canvas/ambient-particles.tsx` — same; clamp speed to 0 when reduced-motion is set.
6. `components/node/clip-preview.tsx` — call `playApproveChime()` in `handleApprove` before the timer.
7. `components/stitch/stitch-tray.tsx` — call `playRenderWhoosh()` at the start of `handleRender`.
8. Verify typecheck + build. Update `FRONTEND_TODO.md` to mark Phase 8 complete; update README to reference this doc.

---

## 9. Cross-references

- `UI_FUNDAMENTALS.md` §11 — the per-screen visual checklist.
- `MOTION_LANGUAGE.md` §8 — reduced-motion stance.
- `FRONTEND_PHILOSOPHY.md` §8 — the sound design philosophy.
- `SHADERS_AUDIO.md` — Phase 2 audio synthesis primer.
- `CANVAS_3D.md` §6 — postprocessing degradation order if perf slips.
- `MASTER_FRONTEND_DEV.md` §10 — primitive bestiary.

---

## 10. The prize

When Phase 8 ships, the demo run-through reads as **one product**:

1. The user toggles reduced-motion mid-demo. Nothing breaks. Animations soften to opacity-only fades. The flow still completes.
2. The Performance tab shows ≥55fps across every surface.
3. Every screen passes the visual rubric — no "oh, that one section is freelanced."
4. The audio palette has a *consistent voice*: a couple of one-shot punctuation cues + a continuous room tone, all under the user's mute toggle.

That's the difference between a hackathon demo and a delivered product. **Ship clean.**
