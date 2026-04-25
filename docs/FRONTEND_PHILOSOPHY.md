# SceneOS — Frontend Philosophy

> Owned by Alex. Last updated: 2026-04-25.

This is the design / engineering bible for the `frontend/` workspace. Reference it when proposing new components, choosing a library, picking colors, or animating anything.

---

## 1. Tenets

1. **The canvas is the product.** The 3D beat-map is the headline interaction. Everything else exists to feed it (Landing) or support it (Detail Drawer, Stitch Tray). Treat it accordingly — most polish budget goes here.

2. **Cinematography over chrome.** Every visual decision should evoke "this tool was built by people who watch a lot of films." Cool mid-greys, warm specular highlights, subtle film-grain texture, anamorphic lens flares (but only at scripted moments). Avoid SaaS pastels.

3. **Pizza-ordering simplicity.** No more than 7 user-perceived steps from "I have an idea" to "here's my cinematic." Hidden complexity is a feature, not a bug.

4. **Motion as language.** Every transition should feel choreographed. Springs > eases for affordances; eases > springs for transitions. Never abrupt, never bouncy-for-the-sake-of-bouncy.

5. **Award-winning, never generic.** Reference bar: godly.website, awwwards.com, dribbble.com, 21st.dev, Awwwards SOTD entries. If a section looks like a Tailwind UI starter, redesign it.

6. **Performance is polish.** A janky 3D canvas at 30 fps tells judges we shipped a prototype. 60 fps with thoughtful LODs tells them we shipped a product.

---

## 2. Color system

Hand-tuned. Define once in `src/index.css` as CSS custom properties (Tailwind v4 `@theme` block).

```css
@theme {
  /* Base — deep, warm, cinematic */
  --color-bg-base:        #0a0908;     /* near-black, slightly warm */
  --color-bg-elev-1:      #14110f;
  --color-bg-elev-2:      #1f1a16;

  /* Foreground */
  --color-fg-primary:     #f5efe7;     /* warm off-white, like tungsten film */
  --color-fg-secondary:   #c5b9a8;
  --color-fg-tertiary:    #6b5d50;

  /* Brand — single warm accent, used sparingly */
  --color-brand-ember:    #f0a868;     /* film-light ember, our hero color */
  --color-brand-ember-dim:#a87447;
  --color-brand-cool:     #5e7080;     /* cool-grade companion, for contrast moments */

  /* States */
  --color-state-success:  #6f9c7d;
  --color-state-warning:  #d4a373;
  --color-state-error:    #c4727b;

  /* Glows (for nodes, hover states, generation activity) */
  --color-glow-ember:     #ffb47080;
  --color-glow-cool:      #7090a080;
}
```

**Usage rules:**
- **Default canvas is dark.** Light mode is not in scope.
- **Brand ember is rare.** It's the "active node" and "ready to render" color. Overusing it kills the impact.
- **Never pure white.** The warm off-white reads as filmic; pure white reads as a Notion app.

---

## 3. Typography

Three families. No more.

| Use | Family | Why |
|---|---|---|
| Display (landing headline, beat names, finals) | **PP Editorial New** (paid) or **Italiana** (Google free) | Editorial serif. Film poster mood. |
| UI body & chrome | **Inter** | Boring, legible, free, no surprises |
| Prompts, generated text, code | **JetBrains Mono** | Mono signals "creative input goes here" |

```css
@theme {
  --font-display: "PP Editorial New", "Italiana", serif;
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;
}
```

**Type scale** — derived from Tailwind v4 defaults but with a `display-xl`/`display-lg`/`display-md` extension for landing typography:

```css
.text-display-xl  { font-size: clamp(4rem, 10vw, 9rem);  line-height: 0.95; letter-spacing: -0.04em; }
.text-display-lg  { font-size: clamp(3rem, 7vw, 6rem);   line-height: 1.0;  letter-spacing: -0.03em; }
.text-display-md  { font-size: clamp(2rem, 4.5vw, 3.5rem); line-height: 1.1; letter-spacing: -0.02em; }
```

**Display always uses italic for emotional moments.** SceneOS — *the* — cinematic OS. Italics on connectives, never on nouns.

---

## 4. Spacing & layout

- 8-point grid. Tailwind defaults are fine.
- Canvas is **always full-viewport** (`h-screen w-screen overflow-hidden`).
- Drawers + overlays use `safe-area-inset-*` for laptops with notches.
- No max-width constraints on the canvas. Constraints only on text-heavy panels (typically `max-w-prose` for body content).

---

## 5. Motion language

A small, opinionated set. Imported from `lib/motion-presets.ts`.

```ts
// All durations in ms. Tested for 60fps headroom.
export const DURATIONS = {
  instant:    120,    // micro-feedback (button press)
  quick:      220,    // hover, focus, small reveals
  smooth:     360,    // panel slides, tab swaps
  cinematic:  720,    // node expand/contract, drawer
  showpiece: 1600,    // page-crumple transition
};

export const EASE = {
  outQuart:    [0.25, 1, 0.5, 1],
  inOutQuart:  [0.76, 0, 0.24, 1],
  filmIn:      [0.16, 1, 0.3, 1],     // overshoot-free in
  filmOut:     [0.7, 0, 0.84, 0],     // weighted exit
};

export const SPRING = {
  cloud:       { type: "spring", stiffness: 110, damping: 24, mass: 1.2 }, // node expand
  bubble:      { type: "spring", stiffness: 380, damping: 30 },            // chat bubble pop
  drawer:      { type: "spring", stiffness: 220, damping: 32 },
};
```

**Rules:**
- Affordances (hover, focus, small UI changes) → spring `bubble` or ease `outQuart` at `quick`.
- Layout transitions (drawer, panel) → spring `drawer` or ease `inOutQuart` at `smooth`.
- Node + canvas interactions → spring `cloud` at `cinematic`.
- Page transitions → ease `inOutQuart` at `cinematic`.
- The page-crumple is an exception, choreographed manually with GSAP timelines.

**Never use Tailwind's default transition utilities** (`transition-all`, `duration-300`). They're untyped and inconsistent across browsers. Use Motion's `<motion.div>` with our presets.

---

## 6. Component patterns

### `<Node>` — the canvas atom
- Renders as an R3F mesh with three states: `idle`, `breathing` (subtle scale 0.98 ↔ 1.02), `active` (ember glow).
- Hover: emit a soft halo (post-processing bloom contribution).
- Click: morph from sphere → torus → drawer-attachment-point. The "cloud expand."

### `<NodeDetailDrawer>` — the per-node interface
- Slides in from the right when a node is `active`.
- Inside: `<AgentBubbleStream>`, then `<ScenePreview>`, then `<ClipPreview>`.
- Drawer-out closes the node and returns camera to the map.

### `<AgentBubble>`
- Two variants: `agent` (warm ember tint), `user` (cool tint).
- Letterbox-typed reveal — characters appear at ~50ms each, capped at 1.6s total.
- Bubble pops in via spring `bubble`.

### `<StitchTray>`
- Horizontal row of approved clips, scrubbable.
- Live-built `fl_splice` URL displayed underneath in mono. Updates in real time as clips approve.
- Big ember CTA: "Render final cinematic."

### `<Button>` — the only one
- Sizes: `sm | md | lg`.
- Variants: `primary` (ember bg, fg-base text), `ghost` (border only), `link`.
- Pressed state: scale 0.97, instant duration.
- No `secondary` variant. If you need three button types in a screen, redesign.

---

## 7. Iconography

- **Lucide icons only.** No custom SVGs unless absolutely necessary.
- Stroke width 1.5 always (Lucide default 2 reads as too chunky in a cinematic UI).
- Size matches font-size of adjacent text. Never floating.

---

## 8. Audio cues

A tasteful set, off by default but on for the demo.

| Event | Sound | Source |
|---|---|---|
| Node hover | Faint air-whoosh, -32 dB | Custom Foley |
| Node click | Soft analog pop | Custom Foley |
| Bubble appear | Glass-tap (very short) | Free SFX |
| Generation succeed | Chime, single note, ember-warm | Free SFX |
| Final render | Cinematic riser, ~2s | Free SFX |

**Mute toggle in the corner.** Never autoplay sound on landing.

---

## 9. Accessibility

Hackathon scope, not full WCAG, but:
- Keyboard-traversable agent questionnaire (Tab cycles bubbles, Enter submits).
- Focus ring visible on all interactive elements (use ember-dim outline, not browser default).
- All text passes 4.5:1 contrast against its background.
- `prefers-reduced-motion` disables the page-crumple and node breathing — graceful degradation to fades.

---

## 10. Performance budgets

- Landing initial bundle: ≤200 KB transferred (gzipped).
- Canvas chunk (lazy-loaded): ≤800 KB transferred. R3F + drei + postprocessing is the bulk.
- Font subset to Latin extended; preload only the weights we use (regular + italic for display, regular + medium for body).
- 60 fps target on M1 / M2 / mid-range Windows laptop. If the canvas drops, lower postprocessing first, then reduce node count.

---

## 11. File organization

```
frontend/src/
├── main.tsx
├── App.tsx                          # router + providers
├── index.css                        # Tailwind import + design tokens
├── routes/                          # one file per top-level route
│   ├── landing-route.tsx
│   ├── crumple-bridge-route.tsx
│   └── canvas-route.tsx
├── components/                      # feature folders, kebab-case files
│   ├── canvas/
│   ├── node/
│   ├── agent/
│   ├── stitch/
│   └── ui/                          # shared primitives (button, drawer, ...)
├── stores/                          # Zustand
│   ├── prompt-store.ts
│   ├── beat-graph-store.ts
│   └── render-store.ts
├── lib/
│   ├── api/                         # HTTP clients
│   ├── motion-presets.ts
│   ├── beat-templates.ts            # mirrors backend
│   ├── cloudinary.ts                # SDK config
│   └── utils.ts                     # cn(), etc.
└── types/                           # mirrors backend/src/types
    ├── manifest.ts
    └── api.ts
```

**Naming:**
- React components: kebab-case files, PascalCase exports. (`agent-bubble-stream.tsx` exports `AgentBubbleStream`.)
- Stores: `<thing>-store.ts`, exports `use<Thing>Store`.
- No barrel files (`index.ts`) inside feature folders. Import directly. Easier to grep and lint.

---

## 12. The vibe in one sentence

> *"If the user pauses on any screen for 30 seconds and just listens to the ambient hum, they should feel like they're in the cockpit of a Tesla designing a Christopher Nolan trailer."*

If a proposed change makes that sentence less true, push back.
