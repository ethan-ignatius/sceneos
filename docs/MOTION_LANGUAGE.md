# SceneOS — Motion Language

> Owned by Alex. Last updated: 2026-04-25.
> **Read this once, then keep it open in a tab while you build.** Motion is the SceneOS body language. Every choice that breaks cohesion breaks the pitch.

---

## 1. Why we use motion (the only four valid reasons)

Every animation in SceneOS must serve at least one of these. If it doesn't, **delete it**.

1. **Memorable, engaging experience.** A demo judge has watched 30 projects today. Motion makes us the one they remember.
2. **Elevated perceived quality.** Motion done right reads as craft. Craft reads as trust. Trust converts.
3. **Communication.** A scroll-tracked beat reveal tells the story better than a paragraph. Animated transitions teach the user what just happened.
4. **Guidance and persuasion.** Motion directs the eye, draws the user down the page, makes the next click feel inevitable. A button hover that flickers ember telegraphs interactivity louder than copy.

**Not valid reasons:** "It looks cool." "Framer Motion was already imported." "Stripe has one." If you catch yourself reaching for one of these, the right move is to add nothing.

---

## 2. The three principles (every animation gets these checked)

1. **Purpose.** Define which of the four reasons above this animation serves. If you can't, cut it.
2. **Brand expression.** SceneOS is *cinematic, editorial, restrained, opinionated*. Movements should feel filmic — slow eases on big shots, snappy springs on micro-interactions, never bouncy-for-the-sake-of-bouncy. We are not Duolingo.
3. **Cohesion.** Same easings, same timings, same direction language across the app. If two animations could feel like cousins, make sure they actually do.

---

## 3. Anti-patterns (the four common mistakes)

If you see any of these in a PR, reject it.

| Anti-pattern | Symptom | Fix |
|---|---|---|
| **Every element fades in** | Page load looks like a slot machine | Choreograph one master sequence; let secondary elements appear instantly with state, not entrance |
| **Too many things moving at once** | Bento grids that all wiggle | One continually moving box max; everything else moves only on hover or interaction |
| **Scroll effects for the sake of it** | Pinned sections that block reading | Scroll motion either *teaches* or *reveals* — never *delays* |
| **Fake preloaders** | A spinner that resolves in 200ms | If something genuinely takes ≥1s, show an honest progress UI; otherwise, ship instantly |

---

## 4. The motion system (single source of truth)

All values live in `frontend/src/lib/motion-presets.ts`. Hand-tuned for 60fps headroom on mid-range hardware.

### 4.1 Durations (seconds)

| Token | Duration | Use |
|---|---|---|
| `instant` | 0.12 | Button-press feedback, focus rings, micro-flicker |
| `quick` | 0.22 | Hover entry, small-element appear, tooltip |
| `smooth` | 0.36 | Drawer slide, panel swap, tab change |
| `cinematic` | 0.72 | Node expand/contract, route transition (non-showpiece) |
| `showpiece` | 1.6 | Page-crumple. Used once per session. |

**Rule:** if your animation's duration isn't one of these, you're freelancing. Stop.

### 4.2 Easing curves

| Curve | Bezier | Where |
|---|---|---|
| `outQuart` | `[0.25, 1, 0.5, 1]` | Default for elements appearing, hover-in |
| `inOutQuart` | `[0.76, 0, 0.24, 1]` | Layout transitions both directions |
| `filmIn` | `[0.16, 1, 0.3, 1]` | Hero loads, drawer entrances — overshoot-free, weighted |
| `filmOut` | `[0.7, 0, 0.84, 0]` | Exit transitions, drawer close |
| `flicker` | step-function | Power-up moments (loading hero, ember pulse) |

We borrow alexportfolio's easing library wholesale. The full set is exported from `motion-presets.ts`.

### 4.3 Springs

| Spring | Stiffness / Damping / Mass | Where |
|---|---|---|
| `bubble` | 380 / 30 / — | Chat bubbles, toast pops, button press |
| `drawer` | 220 / 32 / — | Detail drawer, stitch tray |
| `cloud` | 110 / 24 / 1.2 | Node expand/contract, the canvas's main affordance |

**Rule:** affordances → spring. Layout → ease. Page transition → ease. Showpiece → choreographed timeline (GSAP).

---

## 5. The page-load choreography (Landing)

Adopted from alexportfolio's flicker-reveal pattern. Total budget: **3.0s** maximum.

```
0.00 – 0.30s   Void holds. Film grain animates. Subtle radial ember pulse from center.
0.30 – 1.50s   Headline characters flicker in with randomized 100–300ms stagger
               (CSS keyframe per <span>, `animation-delay: random()`).
1.50 – 1.90s   Sub-line fades + slides up 8px. Mono caps tracking, fg-tertiary.
1.90 – 2.30s   Input field underline draws from left to right (scaleX, outQuart).
2.30 – 2.70s   Pills cascade in from right, 80ms stagger between each.
2.70 – 3.00s   Chrome fades in (logo, mute toggle, help icon). Quick + outQuart.
```

The flicker pattern uses CSS keyframes per character because the random offset is cheaper in CSS than in JS, and because random-per-frame doesn't matter — we want *deterministic-but-feels-random*.

```css
/* in src/index.css */
@keyframes flicker {
  0%   { opacity: 0; }
  10%  { opacity: 0.3; }
  20%  { opacity: 0; }
  35%  { opacity: 0.6; }
  60%  { opacity: 0; }
  80%  { opacity: 0.85; }
  100% { opacity: 1; }
}
```

The randomized delay (e.g. `style={{ animationDelay: `${0.4 + Math.random() * 0.9}s` }}`) is set once at mount via `<TextSplitter>` so each character locks in its own timing.

---

## 6. The page-transition choreography

Two flavours:

### 6.1 Standard transitions (≤500ms, linear RAF)

For routes that aren't showpieces (e.g. final-delivery → landing, error → home):
- 250ms fade out (current page → black)
- mount new page
- 250ms fade in (black → new page)

This matches alexportfolio's transition pattern — fast, snappy, no easing curves for the fade itself. The user feels they navigated, not that they watched an animation.

### 6.2 The showpiece — page-crumple (Landing → Canvas)

The one moment that justifies its 1.6s duration. Choreographed with GSAP timelines.

```
0.00 – 0.18s   Ember-flash radial gradient ignites at bottom-right of the screen.
               Opacity 0 → 1, 280ms easeOut.
0.00 – 0.95s   Landing content scales 1.00 → 0.92, rotates -3°, translates +24px Y,
               opacity → 0, blur 0 → 12px. easeIn (power3.in equivalent).
0.50 – 1.20s   Canvas page mounts beneath, opacity 0 → 1. Bloom builds.
0.40 – 0.80s   Ember-flash fades 1 → 0, easeIn.
0.20 – 1.40s   GLSL paper-curl shader reads landing snapshot as texture,
               curl angle uniform animates 0 → π. (Plan B if shader slips: skip,
               keep the GSAP scale/blur — the showpiece still lands.)
1.40 – 1.60s   Final canvas-page fade settles to full opacity.
```

`crumple-bridge-route.tsx` orchestrates this. The GSAP timeline drives uniforms or DOM transforms; the React mount of the canvas route happens at 0.50s in.

---

## 7. Hover & micro-interaction patterns

Three primitives. Use these. Don't invent new ones.

### 7.1 The flicker (alexportfolio's signature)

10ms-cycle CSS opacity flicker on a corner-frame SVG when a button is hovered. Telegraphs interactivity without lag — the eye reads it as electricity.

```scss
@media (hover: hover) and (pointer: fine) {
  .button:hover .button-frame {
    animation: flicker-corner 10ms infinite linear;
  }
}
@keyframes flicker-corner {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
```

Use sparingly: the primary CTA on each major surface, never on every link.

### 7.2 The magnetic pull

A subtle attraction toward the cursor when within ~80px of an interactive element. ≤6px translation, spring-damped. Used on canvas nodes (already implemented via R3F hover) and the landing's `Begin` button.

### 7.3 The ember pulse

A standing-state cue: when an element is "ready" (a node's sufficiency hit, the render CTA enabled), it pulses with a 1.6s `pulse` animation that grows the box-shadow's spread and softens it. Read as "act now, this is hot."

```css
@keyframes ember-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(240, 168, 104, 0.35); }
  50%      { box-shadow: 0 0 32px rgba(240, 168, 104, 0.55); }
}
```

---

## 8. Typography motion

### 8.1 Character splitting

`<TextSplitter>` (in `lib/text-splitter.tsx`) renders any string as `<span data-index="N">char</span>` so we can animate each character. Used for:
- Landing headline flicker reveal.
- Agent bubble character-by-character reveal (~25ms per char, capped 1.6s).
- Stitch tray live URL — each `fl_splice` segment slides in as a typewriter run.

### 8.2 Word splitting

For longer paragraphs that should reveal word-by-word on scroll into view (e.g. an "About SceneOS" section if we ever ship one), use `<WordSplitter>` with `IntersectionObserver` triggering an opacity-stagger over the words.

### 8.3 Italics rule

Display-serif italics on connectives (`the`, `into`, `of`, `&`), never on nouns. SceneOS — *the* — cinematic OS. This is a brand-voice rule, not a motion rule, but typographers will judge us on it.

---

## 9. Scroll-driven motion (the alexportfolio pattern)

We adopt their architecture wholesale. See `lib/use-scroll-velocity.ts`.

### 9.1 The architecture

```
window scroll → ScrollContextProvider (refs, no Recoil/Zustand reads)
              ↓
          velocityRef accumulates wheel/touch deltas
              ↓
          RAF loop interpolates: currentRef += (targetRef - currentRef) * 0.3
              ↓
          components read refs (NO RE-RENDERS)
              ↓
          components write to CSS variables: el.style.setProperty('--scroll-progress', ...)
              ↓
          CSS animations consume the variable
```

Why: decouples scroll input from render. No re-render storms. Works on mobile (passive listeners + touch deltas). No external smooth-scroll library — Lenis is overkill for our scope.

### 9.2 Where we use it

| Surface | What scroll drives |
|---|---|
| Canvas | Camera glide between nodes (z-axis push-in scaled by `--scroll-progress`) |
| Stitch tray | Horizontal thumbnail row with inertial drag |
| Final-delivery | Subtle parallax on the cinematic wrapper as the user scrolls past |

We do **not** use scroll-driven motion on the Landing. The landing is a single-screen experience; adding scroll-reveal sections below the fold violates pizza-ordering simplicity.

---

## 10. WebGL & shader strategy

### 10.1 What earns WebGL

- **The 3D beat-map canvas** — already R3F. Bloom + vignette post. Worth its bundle.
- **The page-crumple paper-curl** — GLSL shader reading landing-as-texture. Hard to fake in CSS. Worth the showpiece budget.
- **Atmospheric film grain** (optional polish) — could be a fragment shader, currently CSS noise. Stick with CSS unless 60fps drops.

### 10.2 What does NOT earn WebGL

- **Custom cursor** — alexportfolio explicitly avoids one. So do we. Standard `cursor: pointer` is the right answer.
- **Scroll background gradients** — CSS does this fine.
- **Liquid glass buttons** — `backdrop-filter: blur` is enough.
- **Anything we'd ship in JS that costs <1ms.** Don't reach for shaders on principle.

### 10.3 WebGPU — explicitly NOT for this hackathon

WebGPU is Chrome-mostly, partial elsewhere. Judges run on whatever they brought. WebGL via R3F gives us the same visual ceiling for our scope. Re-evaluate post-hackathon.

---

## 11. The cohesion checklist

Before you merge any motion:

- [ ] Duration is one of the five tokens in `DURATIONS`.
- [ ] Easing is one of the five named curves in `EASE`.
- [ ] If it's an affordance, it uses a `SPRING` not an ease.
- [ ] It runs at 60fps on a M2 MacBook Air. Verify with React DevTools.
- [ ] It respects `prefers-reduced-motion` (collapses to instant or 200ms fade).
- [ ] It doesn't use Tailwind's default `transition-all`. (Forbidden — too imprecise.)
- [ ] You can articulate, in one sentence, **which of the four reasons** in §1 it serves.
- [ ] Removing it would make the demo objectively worse, not just less busy.

If any box is unchecked, fix or cut.

---

## 12. The vibe in one sentence

> *"If a judge pauses on any screen for 30 seconds and just listens to the ambient hum, they should feel like they're in the cockpit of a Tesla designing a Christopher Nolan trailer."*

That's the bar. If a proposed motion change makes that sentence less true, push back.
