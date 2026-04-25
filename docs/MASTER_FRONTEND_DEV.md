# SceneOS — Master Frontend Development Bible

> Owned by Alex. Last updated: 2026-04-25.
> **Read once. Keep open. Cross-reference before every PR.**
>
> This document is the synthesis layer. It ties together every lesson from every site, video, and codebase studied for SceneOS, plus everything codified in the team's other docs. If you find yourself googling "how do I do X in motion" — the answer is probably here.

---

## 0. The foundational truth (read this first, every time)

**SceneOS has 36 hours to win LA Hacks 2026 against rooms full of polished projects.** The bar is awwwards / godly.website / 21st.dev / dribbble. Generic does not survive.

Three things win the room. Protect them above all else:

1. **The page-crumple** (landing → canvas transition).
2. **The canvas reveal** (3D beat-map breathing under bloom).
3. **The live `fl_splice` URL building** in real time as beats approve.

Everything else is supporting cast. If a feature doesn't directly amplify one of those three moments, it gets cut before deadline — not after.

**Restraint is the skill.** Anyone can add motion. Almost no one knows when to stop. Watch the trained instinct: every single animation must justify itself.

---

## 1. Cross-reference map

This bible doesn't repeat what's already in the system. It synthesizes. For deep dives:

| Topic | Where it lives |
|---|---|
| Motion timing/easing/spring system | [`MOTION_LANGUAGE.md §4`](MOTION_LANGUAGE.md) |
| Color, typography, design tokens | [`FRONTEND_PHILOSOPHY.md §2-§3`](FRONTEND_PHILOSOPHY.md) |
| Surface-by-surface roadmap | [`FRONTEND_BUILDOUT.md`](FRONTEND_BUILDOUT.md) |
| Ranked execution list | [`FRONTEND_TODO.md`](FRONTEND_TODO.md) |
| Hackathon strategy + cross-prizes | [`HACKATHON_STRATEGY.md`](HACKATHON_STRATEGY.md) |
| Mock backend contract | [`MOCK_BACKEND.md`](MOCK_BACKEND.md) |
| Backend API + integrations | [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) |
| Stitch screen prompts | [`STITCH_PROMPTS.md`](STITCH_PROMPTS.md) |
| Demo video plan | [`DEMO_PHILOSOPHY.md`](DEMO_PHILOSOPHY.md) |
| Devpost copy | [`DEVPOST_DRAFT.md`](DEVPOST_DRAFT.md) |

This doc focuses on what the others don't cover: **decoded site exemplars, tools-vs-tools decisions, the pattern library, the component bestiary, and the snippet library**.

---

## 2. The four valid reasons to animate

Memorize. Every animation must serve one of these. Audit each PR against this list — if you can't articulate which, cut it.

1. **Memorable, engaging experience.** A judge has seen 30 projects today. Motion makes us the one they remember.
2. **Elevated perceived quality.** Motion done right reads as craft. Craft reads as trust. Trust converts.
3. **Communication.** A scroll-tracked beat reveal teaches faster than a paragraph.
4. **Guidance and persuasion.** Motion directs the eye, draws the user down the page, makes the next click feel inevitable.

**Not valid:** "It looks cool." "Framer Motion was already imported." "Stripe has one." Catch yourself reaching for those — add nothing instead.

---

## 3. The three principles

1. **Purpose** — define which of the four reasons this animation serves. Can't? Cut.
2. **Brand expression** — SceneOS is *cinematic, editorial, restrained, opinionated*. Filmic eases on big shots, snappy springs on micro-interactions. Never bouncy-for-bouncy. We are not Duolingo.
3. **Cohesion** — same easings, same timings, same direction language across the app. If two animations could feel like cousins, make sure they actually do.

---

## 4. The premium-frontend rule book

Distilled from the AG1 / Apple / Stripe / Bottega class of sites:

- **Custom graphics.** No stock. No emoji. No clip art.
- **Minimalism + whitespace.** Reduce cognitive load. Whitespace is the trust signal.
- **Micro-interactions.** Subtle, ≤200ms, never the focus, always present.
- **Sophisticated typography.** Curated serifs for emotion (Italiana, PP Editorial New). Clean sans-serifs for clarity (Inter, PP Neue Montreal).
- **Performance is polish.** A janky 30fps says "prototype." 60fps says "product." Premium = fast, always.

---

## 5. The four anti-patterns we reject

If you see one in a PR, reject it.

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Every element fades in | Page load looks like a slot machine | Choreograph one master sequence; let secondary elements appear instantly |
| Too many things moving | Bento grids that all wiggle | One continuously moving element max; everything else moves on hover |
| Scroll effects for the sake of it | Pinned sections that block reading | Scroll motion either *teaches* or *reveals* — never *delays* |
| Fake preloaders | A spinner that resolves in 200ms | If something genuinely takes ≥1s, show progress; else ship instantly |

---

## 6. Decoded site exemplars

For each site Alex has trained me on: what they're doing, why it works, what we steal, what we leave.

### 6.1 alexportfolio (Alex's own portfolio — local at `C:\Users\33576\alexportfolio`)

**Stack:** Next.js 14 + GSAP 3.12 + Framer Motion 11 + Splitting + R3F 8 + Three.js + Recoil + custom GLSL shaders.

**The killer pattern:** the `ScrollVelocityProvider` — a RAF loop that accumulates wheel/touch deltas with exponential decay (rate 5), interpolates current → target progress at 0.3 per frame, exposes refs (no React re-renders), and writes to CSS custom properties. Components consume `--scroll-progress` via CSS, not state. **We adopted this verbatim** as `lib/use-scroll-velocity.ts`.

**Other lessons:**
- **Char flicker reveal** — `<TextSplitter>` renders each char as `<span data-index>` with randomized 3.3–3.6s delay; CSS keyframe `flicker` animates each independently. Reads as "powering up." We adopted this as `lib/text-splitter.tsx` + the `flicker-on-mount` class in `index.css`.
- **DrumRoll** — 3D-perspective vertical carousel where items scale + translate-Z based on `--drumroll-progress` written by the velocity loop. Each item: `opacity = 1 - distance * 1.33`, `scale = 1 - distance * 0.5`, `translateZ = distance * -300px`. We don't ship DrumRoll for SceneOS but the pattern (scroll-driven CSS-var visual) is reused in the canvas camera glide.
- **Page transitions** — 500ms linear RAF fade out → mount new page → 500ms fade in. Snappy, not cinematic. **We use this for non-showpiece transitions** (final-delivery → landing). Showpiece transition = page-crumple is GSAP-driven.
- **Hover micro-interaction** — `animation: twincle 0.01s infinite linear` on corner SVG frame ticks. 10ms-cycle CSS opacity flip. Telegraphs interactivity instantly. We adopted this as the magnetic-button corner-tick behavior.
- **Refs > atoms.** Scroll values live in refs, not Recoil/Zustand. Atoms only fire when crossing thresholds. Prevents re-render storms.

### 6.2 Parinaz Kassemi (parinazkassemi.com)

**Stack:** Framer (their builder + Framer Motion under the hood), Inter font.

**What's working:**
- **Massive typographic name as hero.** SVG paths of "PARINAZ KASSEMI" sized to fill the viewport edge-to-edge. Bold black on light grey. Establishes scale immediately. **For SceneOS:** consider an oversized "SCENEOS" SVG bleed on the final-delivery screen.
- **Sidebar Awwwards "W." nominee badge.** Pinned left rail, white-on-black, vertical "Nominee" text. Looks intentional, not a wedge widget. **Take-away:** if we win an Awwwards Honorable Mention post-hackathon, mount it like this.
- **Awards row** — 4 round badges (CSS Design Awards, Best UX, Innovation, UI). Centered, evenly spaced. Use as inspo if we collect prize logos for the LA Hacks 2026 demo close.
- **Case-study grid** — 2×2, each card: aspect-ratio constrained image + dark gradient overlay + bold black title + small grey caption underneath. Hover scales the overlay opacity. **For SceneOS:** the stitch-tray thumbnails could borrow this exact treatment.
- **"NYC · 06:46:59 AM" chrome.** Live clock as ambient detail. Tabular numerals so width is stable. Gives the page a "live system" feel for free. We're shipping `<LiveClock>` as a primitive.
- **Personal copy density.** 3-paragraph intro at body size, with inline link styles (black + medium weight + underlined). Restraint that feels confident. **Take-away:** if we ship below-fold marketing on landing, mirror this density.

**What we leave:** the all-grey palette doesn't fit our cinematic register. Their inline link styling is great but we use ember accents instead.

### 6.3 NextSense (nextsense.io)

**Stack:** Shopify Horizon theme + custom CSS overrides + Lenis (smooth scroll) + GSAP + Lottie + Swiper + Vue 3 sprinkles + custom mega-dropdown JS.

**The flagship pattern: scroll-pinned color-shift narrative.**
Three sections vertically stacked:
1. "Tired isn't normal" — 180vh tall, 100vh sticky child. Lavender bg.
2. "Meet Smartbuds" — 180vh, sticky, dark navy bg.
3. Carousel — non-pinned, 100vh, near-black bg.

An `IntersectionObserver` (rootMargin `-45% 0px -45% 0px`) updates CSS custom properties (`--ns-bg`, `--ns-text`) when each section's center crosses viewport center, and the body transitions colors over 900ms `cubic-bezier(0.22, 1, 0.36, 1)`. Each pin track gets `.is-leaving` after 75% scroll-through to fade its content with a -40px translate before the next section takes over.

**We adopted this** as `<PinTrack>` and `<ColorShiftSection>` patterns (documented in §10, components shipped in Phase 1 when needed).

**Other lessons:**
- **Announcement bar with rotating slides.** 3 messages, 4.5s interval, 0.5s opacity + 0.5s translateY transition. setInterval with `document.visibilityState` pause. We're shipping `<AnnouncementBar>` as a primitive.
- **Mega-dropdown header.** Hover on nav item → fixed-positioned dropdown card opens with image + meta grid + CTA. Backdrop with blur. We don't ship this for SceneOS (single-page app, no nav menu), but the pattern lives in the bestiary for future.
- **Scroll-driven product bar.** On PDP, after ~450px scroll, the header's inner `.ns-header-inner` opacity fades to 0 and `.ns-product-bar` fades in with image + product name + ATC. Scroll-up reverses. **We don't need this for SceneOS** but the pattern is great for future commerce work.
- **Hero with rotating word in serif.** Display headline ends with one word (`performance.`) that swaps every 4.5s with a 400ms opacity fade between swaps. Same beat as the slide rotation. We can adapt: SceneOS landing's headline could end with a rotating verb (`direct`, `compose`, `imagine`).
- **Glassmorphic CTAs.** `backdrop-filter: blur(24px) saturate(1.5)` + 10% white bg + soft shadow. Three layered: top-edge inset glow, broad shadow, on-hover lavender accent shadow. We use this for tertiary CTAs where the ember-primary would be overkill.
- **Lottie + Swiper.** Lottie for product feature animations, Swiper for carousels. We probably don't ship Lottie for the hackathon (would need designer-owned JSON files), but the loading-state stepper could be a Lottie if we have time.
- **Inline-styled fonts to defeat theme leak.** They use `!important` on every font-family, font-size, font-weight, color in the announcement bar to prevent Shopify's parent theme from overriding. **Lesson:** if we ever embed in someone else's shell, use scoped CSS modules or inline styles for non-negotiable type.

**What we leave:** the cart drawer, the multi-page structure, the mobile sticky ATC. Not relevant for SceneOS.

### 6.4 Augen Pro (augen.pro)

**Stack:** Nuxt 3 + Vue + Lenis + PP Neue Montreal Light/Book + custom Storyblok CMS.

**What's working:**
- **Sticky logo as left rail.** A square glassmorphic "+" mark stays fixed bottom-left while the page scrolls. Becomes the brand anchor without a top bar. We're shipping a similar pattern as `<StickyAnchor>` in Phase 2 (TBD).
- **Five-column grid.** `--grid-columnCount: 5`, `--grid-gutter: 2.4vw` (desktop), `--grid-outerGutter: 4.8vw`. Used everywhere via `display: grid; grid-template-columns: repeat(var(--grid-columnCount), 1fr)`. **Adopted:** SceneOS marketing surfaces use a 5-col grid with the same vw-based gutter math.
- **PP Neue Montreal Light (300) for body, Book (350) for emphasis.** Tight letter-spacing (`-0.02em`) on display. Massive headlines paired with tiny labels. We use Italiana for display and Inter for body, but the Light/Book contrast pattern translates: thin display, regular body, medium for emphasis.
- **Bracket text indicators** — `[Pha¹]`, `[ICT²]`, `[AIWC³]`. Used to label process / methodology pills. Reads as a system tag without being heavy. We're shipping `<BracketText>` as a primitive (Phase 1, not Phase 0 — we don't yet know where we'd use it).
- **Pill components.** Outline by default, filled when active, hover swap text via stacked-layer trick. We're shipping `<Pill>` as a primitive.
- **Arrow-link with icon swap.** A round outlined right-arrow icon that has *two* SVGs stacked; on hover the first translates out and the second translates in. Smooth, ~200ms ease. We're shipping `<ArrowLink>` as a primitive.
- **Scroll indicator.** Tiny pill (24×51px) with chevron-down icon. Pulses or hovers to invite scroll. We're shipping `<ScrollIndicator>` as a primitive (used on the landing if we want to invite scroll for below-fold content).
- **Section labels** — small filled-square icon (28×28) above a centered caption. Used to introduce each section. We're shipping `<SectionLabel>`.
- **Logo marquee** — infinite-scroll partner logos, CSS keyframe translateX. Smooth, looped. We're shipping `<Marquee>` (used for "Powered by" or "Tools we used" strips).
- **Restraint everywhere.** Animation budget < 1 per section. Each animation justifies itself. We aspire to this, especially on body content.

**What we leave:** the all-grey + cool-blue palette is too cold for SceneOS. We use ember-warm.

### 6.5 FlowBoard (Alex's other local repo at `C:\Users\33576\FlowBoard`)

**Stack:** React 18 + Vite 7 + tldraw 3.15 + Framer Motion 12 + Tailwind v4 + Radix.

**One thing worth adopting:** `animate-blur-pulse` keyframe on the canvas during AI generation states. Backdrop-filter blur oscillates 0px → 8px over 2s, infinite. Glassmorphic, non-blocking, signals "thinking." **We've adopted this** as `.animate-blur-pulse` in `index.css`.

Everything else (tldraw, frame branching, glassmorphism throughout) is Alex's own work and not directly applicable to SceneOS — but the design language shows the team can ship at this bar.

---

## 7. Tools — when to use which

The hackathon-budget rule: **prefer one tool per concern** unless there's a clear win from combining.

| Concern | Tool | Why this tool | When NOT this tool |
|---|---|---|---|
| Page-load choreography | Motion + CSS keyframes | Declarative, springy, plays well with React | Anything beyond ~6 elements timed against each other → switch to GSAP |
| Choreographed multi-track timeline | GSAP | The page-crumple needs cross-track timing nothing else can match | Don't pull GSAP for a 200ms hover — use Motion |
| Scroll-driven motion | `useScrollVelocity` (custom) | RAF + CSS vars, no re-renders, matches alexportfolio | Don't use Lenis unless you've measured a Lenis-only feature you need |
| 3D scenes | R3F + drei + postprocessing | We already ship it, looks great, has prior art | Don't pull Three.js raw unless R3F gets in your way |
| Vector character/word reveal | `<TextSplitter>` (custom) | Owns the markup, deterministic seed, plays with `flicker-on-mount` | Don't use Splitting library — adds dependency for ~50 LoC of work |
| Carousels | Swiper | Battle-tested, accessible, mobile-friendly | Don't carousel if a row of 3 cards fits — fewer interactions = better |
| Inertial scroll smoothing | Lenis | Apple-feel everywhere | Skip unless we've shipped a long-scroll page that visibly judders |
| Vector micro-interactions | Rive | If we have a designer-owned `.riv` file | Don't pull Rive for the hackathon — too much setup, no designer file ready |
| 3D scenes from designer | Spline | If a designer drops a `.splinecode` | Don't pull Spline — R3F covers it |
| Lottie animations | `lottie-react` | If we have a JSON from a designer | Skip for hackathon |
| DOM → texture | `html-to-image` | For the page-crumple Plan A shader | Plan B (GSAP-only) is what we ship floor; A is a stretch |
| Custom shaders | Raw GLSL through R3F | The page-crumple paper-curl | Don't write a shader for what CSS can do |

**WebGPU:** explicitly NOT for this hackathon. Chrome-mostly support, we don't need its perf headroom.

---

## 8. Pattern library

Concrete patterns we use repeatedly. Each entry: what it is, when to reach for it, the snippet, the gotcha.

### 8.1 The cinematic load reveal

**What:** Headline characters flicker in with randomized stagger. Sub-line slides up. Pills cascade. Chrome fades in. Total ≤3s.

**Where:** Landing route. The first 30 seconds of the demo video.

**Snippet (already shipped):**
```tsx
// routes/landing-route.tsx
<h1 className="text-display-lg italic">
  <span className="flicker-on-mount">
    <TextSplitter text="Direct your idea " baseDelay={0.3} jitter={1.0} seed={3} />
    <TextSplitter text="into " baseDelay={0.4} jitter={1.0} seed={5} />
    <TextSplitter text="a cinematic." baseDelay={0.5} jitter={1.0} seed={7} />
  </span>
</h1>
```

**Gotcha:** if `jitter` is too high (>1.2), the reveal feels random not powering-up. Tuned at 1.0.

### 8.2 The magnetic + flicker + ember-pulse button

**What:** Cursor pulls the button toward it (≤6px / 80px radius), corner ticks flicker on hover, button gets standing ember-pulse when ready.

**Where:** Primary CTAs that demand attention (Begin button on landing, Generate scene on the drawer, Render final cinematic on stitch tray).

**Snippet (already shipped):**
```tsx
<MagneticButton type="submit" size="lg" disabled={!ready} ready={ready}>
  Begin
</MagneticButton>
```

**Gotcha:** disabled state must turn off all three behaviors. Our `<MagneticButton>` does this; if you fork it, preserve.

### 8.3 The cursor spotlight

**What:** Subtle ember-warm radial gradient follows the pointer.

**Where:** Mounted on the landing route. Optional on canvas.

**Snippet (already shipped):**
```tsx
<CursorSpotlight intensity={0.28} radius={360} />
```

**Gotcha:** `mix-blend-mode: screen` requires a dark-ish backdrop. On light surfaces, lower intensity.

### 8.4 The page-crumple (showpiece)

**What:** GSAP timeline with 6 tracks: ember flash, landing collapse (scale + rotate + blur + opacity), canvas silhouette emerge, flash fade, final veil. Plan A: GLSL paper-curl shader added to the timeline.

**Where:** Landing → Canvas, exactly once per session.

**Snippet (Plan B, already shipped — see `routes/crumple-bridge-route.tsx`):**
```ts
const tl = gsap.timeline({ onComplete: () => navigate("/canvas", { replace: true }) });
tl.fromTo(".crumple-flash", { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power2.out" }, 0)
  .to(".crumple-landing", {
    scale: 0.92, rotate: -3, y: 24, opacity: 0,
    filter: "blur(12px)", duration: 0.95, ease: "power3.in",
  }, 0)
  .to(".crumple-flash", { opacity: 0, duration: 0.4, ease: "power2.in" }, 0.4)
  .fromTo(".crumple-canvas-silhouette",
    { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" }, 0.5)
  .to(".crumple-veil", { opacity: 1, duration: 0.2, ease: "power2.out" }, 1.4);
```

**Plan A (stretch):**
```glsl
// Fragment shader sketch
uniform float uCurlAngle;          // animated 0 → π by GSAP
uniform sampler2D uTexture;        // landing snapshot via html-to-image
varying vec2 vUv;
void main() {
  float radius = mix(2.0, 0.05, uCurlAngle / 3.14159);
  // sample uv along curl cylinder, alpha fade past edge, ember-warm emissive
  vec2 curledUv = curl(vUv, uCurlAngle, radius);
  vec4 c = texture2D(uTexture, curledUv);
  // emissive ring along curl edge:
  float edge = smoothstep(0.0, 0.02, abs(distanceFromCurlEdge));
  c.rgb += vec3(0.94, 0.66, 0.41) * (1.0 - edge) * 0.6;
  gl_FragColor = c;
}
```

**Gotcha:** the timeline duration MUST be 1.6s. Anything longer and the transition drags. Anything shorter and it feels jumpy. Don't tune.

### 8.5 The scroll-pinned color shift (NextSense pattern)

**What:** Stack 3+ sections, each 180vh with 100vh sticky child. `IntersectionObserver` triggers `.is-leaving` at 75% and root-level CSS-var swap (`--ns-bg`, `--ns-text`) at center-crossing.

**Where:** Future marketing surfaces (a longer landing if we ship one). NOT for the canvas.

**Snippet:**
```tsx
// PinTrack.tsx
<section className="pin-track" data-section-bg="hero" style={{ height: "180vh" }}>
  <div className="sticky top-0 h-screen">{children}</div>
</section>

// useColorShift.ts
useEffect(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const key = (e.target as HTMLElement).dataset.sectionBg!;
        document.documentElement.style.setProperty("--ns-bg", colorMap[key].bg);
        document.documentElement.style.setProperty("--ns-text", colorMap[key].text);
      }
    });
  }, { rootMargin: "-45% 0px -45% 0px" });
  document.querySelectorAll("[data-section-bg]").forEach((el) => io.observe(el));
  return () => io.disconnect();
}, []);
```

**Gotcha:** the parent of the sticky child must have `overflow-x: clip` (NOT `hidden`) and must NOT have `overflow: hidden` on any ancestor — sticky breaks immediately. Also: respect `prefers-reduced-motion` by setting `.pin-track > .section { position: relative; height: auto; }`.

### 8.6 The inertial scroll velocity bridge (alexportfolio pattern)

**What:** RAF loop accumulates wheel/touch deltas with exp decay; refs (no React state) hold current/target/velocity; consumers read refs in `useFrame` or write to CSS vars.

**Where:** Canvas camera glide between nodes; horizontal drag on stitch-tray thumbnails.

**Snippet (already shipped — see `lib/use-scroll-velocity.ts`):**
```ts
const { progressRef, velocityRef, registerElement, setTargetProgress } = useScrollVelocity();
useEffect(() => registerElement(myDiv.current), []);
useFrame(() => { camera.position.z = -progressRef.current * 1.2; });
```

**Gotcha:** Don't read refs in render — that defeats the purpose. Always inside `useFrame` (R3F) or RAF loops.

### 8.7 The live URL build (Stitch tray typewriter)

**What:** When a beat is approved, append a new `l_video:<id>,fl_splice/` segment to the displayed URL with a 30ms-per-char typewriter reveal.

**Where:** Stitch tray.

**Snippet:**
```tsx
// As beats approve, the URL grows. The new segment is animated.
const previewUrl = buildSpliceUrl(approvedIds);
return (
  <div className="break-all font-mono text-[10px] leading-relaxed">
    <TextSplitter text={previewUrl ?? ""} baseDelay={0} jitter={0} seed={approvedIds.length} />
  </div>
);
```

**Gotcha:** the seed must change per state to re-mount the splitter. Otherwise React keeps the old typewriter timeline.

### 8.8 The glassmorphic "thinking" state

**What:** `backdrop-filter: blur` oscillates 0–8px over 2s, infinite. Used during AI generation.

**Where:** Generation panel inside the node-detail drawer.

**Snippet (already shipped — `index.css`):**
```css
.animate-blur-pulse { animation: blur-pulse 2s ease-in-out infinite; }
@keyframes blur-pulse {
  0%, 100% { backdrop-filter: blur(0px); background: ...0%; }
  50% { backdrop-filter: blur(8px); background: ...6%; }
}
```

**Gotcha:** `backdrop-filter` is GPU-heavy. Don't stack 3+ instances visible at once.

### 8.9 The hover icon-swap (Augen arrow-link)

**What:** Two icons stacked absolutely; on hover, the visible one translates out and the hidden one translates in. Reads as "this is going somewhere."

**Where:** Inline links, "go to updates" CTAs, "shop now" buttons that aren't primary CTA.

**Snippet:**
```tsx
<a className="arrow-link group">
  <span className="icon-wrapper relative overflow-hidden">
    <ArrowRight className="icon transition-transform group-hover:translate-x-3" />
    <ArrowRight className="icon absolute inset-0 -translate-x-3 transition-transform group-hover:translate-x-0" />
  </span>
  <span>Go to Updates</span>
</a>
```

**Gotcha:** the wrapper needs `overflow: hidden` for the slide-out to disappear cleanly. We ship `<ArrowLink>` as a primitive that handles this.

### 8.10 The announcement rotation

**What:** Stack of slides absolutely positioned; one is `.is-active` at a time; cross-fade with translateY between slides; setInterval swaps active.

**Where:** Top of every page or scoped to landing/final-delivery.

**Snippet (we ship `<AnnouncementBar>` as a primitive):**
```tsx
<AnnouncementBar
  slides={[
    { icon: <Check />, content: "60-second cinematics" },
    { icon: <Sparkles />, content: "Powered by Cloudinary" },
    { icon: <Film />, content: "30-night risk-free trial" },
  ]}
  intervalMs={4500}
/>
```

**Gotcha:** pause when `document.visibilityState === "hidden"` to save battery on background tabs.

### 8.11 The sticky logo / left-rail anchor

**What:** A square glass mark fixed to the bottom-left of the viewport, persistent across scroll.

**Where:** Marketing surfaces. Not for in-app routes.

**Snippet:**
```tsx
<aside className="fixed bottom-6 left-6 z-50">
  <div className="h-12 w-12 rounded-md bg-bg-elev-1/70 backdrop-blur-md ring-1 ring-fg-tertiary/20">
    <Logo />
  </div>
</aside>
```

**Gotcha:** must not overlap mobile sticky bars. Use `safe-area-inset-bottom` and viewport-conditional positioning.

### 8.12 The live clock chrome detail

**What:** Tiny mono `tabular-nums` timestamp in chrome that updates every second. Establishes "this is a live system" without saying it.

**Where:** Header chrome, dashboard surfaces, demo video bottom-right corner.

**Snippet (we ship `<LiveClock>`):**
```tsx
<LiveClock label="NYC" />
// → "NYC · 06:46:59 AM" with a pulsing green dot
```

**Gotcha:** `tabular-nums` (CSS `font-variant-numeric: tabular-nums`) is mandatory or the time jitters width-wise.

### 8.13 The infinite marquee (logo strip)

**What:** Two copies of the same children scrolling left at constant speed; CSS keyframe `translateX(-50%)`. Pause on hover optional.

**Where:** "Powered by" / "As featured in" strips. Not for primary content.

**Snippet (we ship `<Marquee>`):**
```tsx
<Marquee speed={20} direction="left" pauseOnHover>
  <img src="..." /> <img src="..." /> <img src="..." />
</Marquee>
```

**Gotcha:** the children must have a known intrinsic width or the loop becomes uneven. Set `flex-shrink: 0`.

### 8.14 The pinned scroll section (PinTrack)

**What:** Wrapper that takes a tall (180vh+) container parent + 100vh sticky child. Combine with `<ColorShiftSection>` for the NextSense narrative.

**Where:** Long-scroll marketing pages. Future feature, not Phase 0.

(See §8.5 for the full pattern.)

---

## 9. The motion system (single source of truth)

All values live in `frontend/src/lib/motion-presets.ts`. Don't freelance — if your value isn't a token, add it there first, then use it.

**Durations (seconds):** `instant: 0.12`, `quick: 0.22`, `smooth: 0.36`, `cinematic: 0.72`, `showpiece: 1.6`.

**Easings:** `outQuart`, `inOutQuart`, `filmIn`, `filmOut`. Plus the 18-curve `easingFns` library borrowed from alexportfolio for RAF/GSAP work.

**Springs:** `cloud (110/24/1.2)`, `bubble (380/30)`, `drawer (220/32)`.

**Stagger:** `pills (0.08)`, `bubbles (0.06)`, `drawerInner (0.06)`.

Full rules and examples in [`MOTION_LANGUAGE.md §4`](MOTION_LANGUAGE.md).

---

## 10. The component primitives bestiary

Every reusable primitive SceneOS ships, what it does, where to import.

| Primitive | Path | When to use |
|---|---|---|
| `Button` | `components/ui/button.tsx` | Default buttons (primary / ghost / link). |
| `MagneticButton` | `components/ui/magnetic-button.tsx` | Primary CTAs that demand magnetic + flicker + ember-pulse. |
| `Pill` | `components/ui/pill.tsx` | Tag-style toggles (video-type selector, beat-archetype labels, agent-confidence chips). |
| `ArrowLink` | `components/ui/arrow-link.tsx` | "Go to X" links with icon-swap on hover. |
| `TextSplitter` / `WordSplitter` | `lib/text-splitter.tsx` | Char or word splits for staggered reveals. |
| `CursorSpotlight` | `components/ui/cursor-spotlight.tsx` | Pointer-follow halo, scoped per-route. |
| `LiveClock` | `components/ui/live-clock.tsx` | Live timestamp chrome. |
| `SectionLabel` | `components/ui/section-label.tsx` | Small icon-square + caption above section headers. |
| `BracketText` | `components/ui/bracket-text.tsx` | `[Pha¹]`-style system tags. (Ship in Phase 1 if needed.) |
| `ScrollIndicator` | `components/ui/scroll-indicator.tsx` | Tiny pill inviting scroll. (Ship in Phase 1 if needed.) |
| `AnnouncementBar` | `components/ui/announcement-bar.tsx` | Top-of-page rotating slides. |
| `Marquee` | `components/ui/marquee.tsx` | Infinite-scroll logo strips. |
| `PinTrack` | `components/ui/pin-track.tsx` | Scroll-pinned section wrapper. (Ship in Phase 2 if needed.) |
| `ColorShiftSection` | `components/ui/color-shift-section.tsx` | IntersectionObserver-driven CSS-var swaps. (Ship in Phase 2 if needed.) |

Hooks:

| Hook | Path | When to use |
|---|---|---|
| `useScrollVelocity` | `lib/use-scroll-velocity.ts` | RAF inertial scroll/drag with CSS-var bridge. |
| `useColorShift` | `lib/use-color-shift.ts` | IntersectionObserver-based CSS-var swap. (Phase 2.) |

---

## 11. Snippet library (copy-paste ready)

### 11.1 IntersectionObserver-based fade-in on view

```tsx
import { useEffect, useRef, useState } from "react";

export function FadeInOnView({ children, threshold = 0.15 }: { children: React.ReactNode; threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [threshold]);
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-500 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      {children}
    </div>
  );
}
```

### 11.2 Motion variants for staggered children

```tsx
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } },
};

<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {items.map(it => <motion.div key={it.id} variants={itemVariants}>{it.label}</motion.div>)}
</motion.div>
```

### 11.3 GSAP master timeline composition pattern

```ts
const tl = gsap.timeline({ onComplete: () => onDone(), defaults: { ease: "power3.in", duration: 0.5 } });

// Track A — flash
tl.fromTo(".flash", { opacity: 0 }, { opacity: 1 }, 0);
// Track B — content collapse (parallel, starts at 0)
tl.to(".content", { scale: 0.92, opacity: 0, filter: "blur(12px)" }, 0);
// Track C — next page reveal (offset by 0.5s)
tl.fromTo(".next", { opacity: 0 }, { opacity: 1 }, 0.5);

return () => tl.kill();
```

### 11.4 Char flicker reveal full sequence

```tsx
// CSS (already shipped in index.css)
.flicker-on-mount > span > span {
  opacity: 0;
  animation: flicker-reveal 0.64s ease-out forwards;
}
@keyframes flicker-reveal {
  0% { opacity: 0; } 10% { opacity: 0.3; } 20% { opacity: 0; }
  35% { opacity: 0.6; } 60% { opacity: 0; } 80% { opacity: 0.85; } 100% { opacity: 1; }
}

// JSX
<h1 className="flicker-on-mount text-display-lg italic">
  <TextSplitter text="Direct your idea" baseDelay={0.3} jitter={1.0} seed={3} />
</h1>
```

### 11.5 useScrollVelocity → CSS variable bridge

```tsx
const sectionRef = useRef<HTMLElement>(null);
const { progressRef, velocityRef, registerElement } = useScrollVelocity();

useEffect(() => {
  if (!sectionRef.current) return;
  const cleanup = registerElement(window);
  let raf = 0;
  const tick = () => {
    sectionRef.current!.style.setProperty("--scroll-progress", String(progressRef.current));
    sectionRef.current!.style.setProperty("--scroll-velocity", String(velocityRef.current));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); cleanup(); };
}, []);

// CSS consumes:
.canvas-camera {
  transform: translateZ(calc(var(--scroll-progress, 0) * -100px));
}
```

### 11.6 The cursor-magnet primitive (extracted from MagneticButton)

```ts
function useMagnetic(maxPull = 6, radius = 80) {
  const ref = useRef<HTMLElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 380, damping: 30 });
  const sy = useSpring(y, { stiffness: 380, damping: 30 });

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > radius) { x.set(0); y.set(0); return; }
      const s = 1 - dist / radius;
      x.set((dx / radius) * maxPull * s);
      y.set((dy / radius) * maxPull * s);
    };
    window.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", () => { x.set(0); y.set(0); });
    return () => { window.removeEventListener("pointermove", onMove); };
  }, []);

  return { ref, x: sx, y: sy };
}
```

---

## 12. The cohesion checklist (per PR)

Before merging anything that moves:

- [ ] Duration is one of the five `DURATIONS` tokens.
- [ ] Easing is one of the five named `EASE` curves.
- [ ] If it's an affordance, it uses a `SPRING` not an ease.
- [ ] It runs at 60fps on M2 / mid-range Win. Verify with React DevTools profiler.
- [ ] It respects `prefers-reduced-motion` (collapses to instant or 200ms fade).
- [ ] It doesn't use Tailwind's default `transition-all` (forbidden — too imprecise).
- [ ] You can articulate, in one sentence, **which of the four reasons** in §2 it serves.
- [ ] Removing it would make the demo objectively worse, not just less busy.

If any box is unchecked, fix or cut.

---

## 13. Performance budget

- **Landing initial bundle ≤ 200 KB** transferred (gzipped).
- **Canvas chunk ≤ 1 MB** transferred (we're at 999KB; hold the line).
- **Frame rate** ≥ 55 fps on a 1080p MBA M2 stress test.
- **First contentful paint** ≤ 1.5s on a fast 3G connection (Chrome DevTools profile).
- **Cumulative layout shift** ≤ 0.05.
- **No** console warnings, **no** React StrictMode double-render warnings.

If we exceed any: drop bloom mipmapBlur first, vignette second, ambient particles third. Keep the page-crumple as the last thing to compromise.

---

## 14. The vibe in one sentence

> *"If a judge pauses on any screen for 30 seconds and just listens to the ambient hum, they should feel like they're in the cockpit of a Tesla designing a Christopher Nolan trailer."*

That's the bar. If a proposed motion change makes that sentence less true, push back.

---

## 15. The North Star

**Three moments win us the room: the page-crumple, the canvas reveal, the live URL building. Protect those above all.**

If we ship those three at 95% polish and everything else at 70%, we win UI/UX outright and have a real shot at Cloudinary + Flicker to Flow.

If we polish the body to 90% and the three moments to 80%, we lose.

Build accordingly.
