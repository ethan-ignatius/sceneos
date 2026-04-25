# SENIOR FRONTEND TRANSMISSION
## A training corpus for the next agent — every lesson learned across the SceneOS build, written so a peer-level frontend engineer can be brought up to speed end-to-end.

> **Read this first.** This is not a style guide. It is a transmission of working knowledge — opinionated, code-heavy, scarred. Each section earns its place from a real failure or a real polish wave on a real project (SceneOS, LA Hacks 2026, awwwards-tier bar). Where I say "I" or "we" I mean the working pair: Alex (frontend lead) and the agent who shipped this. Where I say "you" I mean the next agent who picks up the keyboard. Treat every claim as load-bearing — if a paragraph reads obvious to you, you are missing why it is here. Read all of Part 0 before you touch any tool.

---

## PART 0 — READ THIS FIRST (THE FIVE-MINUTE SYNOPSIS)

The job is not "build a UI." The job is to ship something a tired hackathon judge mistakes for a $50M Series B product in three minutes of demo. The aesthetic bar is godly.website and awwwards' top 1%. Anything that reads as ChatGPT-wrapper, Bootstrap, or "default-shadcn-skin" is a project-ending failure. Generic is the enemy.

The product is **SceneOS** — a cinematic AI video generator. The user types a single line ("a 90s VHS recovery memory of the day my dog ran away"), the app expands that into 5–7 beats arranged on a 3D star-map canvas, each beat is interrogated by a director-toned AI agent until the prompt is camera-tight, each beat generates a Veo / fal.ai clip, all clips stitch into a final cinematic via Cloudinary's `fl_splice` URL transformation. There are exactly **three demo-winning moments**: (1) the landing → canvas portal transition, (2) the 3D star-map at first reveal, (3) the persistent `fl_splice` URL composing itself live as beats approve. Everything else exists to keep these three moments perceivable.

The **pizza-ordering simplicity mantra**: a user lands and types one line and gets to "we are working on it" within four seconds. No multi-step wizards. No pricing tiers. No login wall. No tutorial. The director-AI carries all configuration burden as conversation, not form. Every UI affordance the user can skip, must be skippable.

The **stack** is React 19 + Vite 7 + TypeScript 5.7 + Tailwind v4 (`@theme` tokens) + Motion 12 + GSAP 3.12 (showpiece-only) + @react-three/fiber 9 + drei 10 + Zustand v5 + Lenis (App-root smooth-scroll) + cmdk (lazy-mounted command palette) + Web Speech (recognition + synthesis) + Web Audio (synthesized cues, no sample files). Backend is now FastAPI + LangGraph (replaced the original Hono Node app; that switch happened mid-project and you should treat the frontend as the source of truth for product behaviour).

Design tokens live in `tailwind.config` `@theme` and `src/lib/motion-tokens.ts`. Type tokens are seven steps (`text-overline 10` → `caption 11` → `meta 13` → `body-sm 14` → `body 16` → `body-lg 17` → `lede 20`) and a single tracking value `0.18em` that applies wherever uppercase appears. Display type is **Fraunces** with the soft + wonk axes pushed; body is **Manrope** variable; mono is **Geist Mono**. There is no Inter. There is no Italiana. There is no Instrument Serif. Those were trial fonts; they were rejected for being either overused, too fragile at small sizes, or too bookish. Fraunces + Manrope is the answer; do not relitigate.

Motion has exactly four legitimate reasons to exist on this app: (1) reveal — fade something in to indicate it has arrived, (2) acknowledge — register a click/tap with a brief scale-down + bounce so the user feels the press, (3) bridge — transport between two routes or two states without a jarring swap (the landing→canvas portal is the canonical example), (4) signal — communicate semantic state change (a beat going from `pending` to `generating` glows; a clip becoming approved gets an ember halo). Decoration motion — bouncing icons that mean nothing, scaling-on-hover that does not communicate state, ambient looping pulses on idle elements — is banned. This is the single most important rule in this document.

The four **routes** are `/` (landing), `/transition` (the cinematic between landing and canvas — bridge motion), `/canvas` (the beat-map + agent), `/final` (the letterbox final delivery with Cloudinary URL prominence). All routes share an `App.tsx` chrome stack: `<CinematicCursor />`, `<CommandMenuMount />` (lazy-loaded), `<StageIndicator />`, `<MockModeChip />`. Lenis is mounted at App root.

There are exactly two **stores**: `beat-graph-store` (manifest, activeBeatId, decomposeStatus) and `prefs-store` (mute, reducedMotion override). State is Zustand v5 with `persist` middleware on `beat-graph-store`. **Do not** persist `decomposeStatus` — it is transient UI; a reload mid-decompose must land on `idle`, not eternal `pending`. This is what `partialize` is for.

The five hard-won lessons that make or break this app, ranked: (a) Zustand v5 + React 19 StrictMode crashes with max-update-depth if a selector returns a fresh array each call — fix is `useShallow(selector)` from `zustand/react/shallow`. (b) `@react-three/postprocessing` 3.0.4's `<EffectComposer>` (Bloom + DoF + Vignette) reads `.alpha` on a render-target/material that is null during first commit on R3F 9; the canvas crashes immediately. Removed. Atmosphere shells + holographic active overlay + drei `<Sparkles>` carry the visual weight without it. (c) A hardcoded `OVERVIEW_POS = (0, 0.4, 5.5)` in CameraRig will silently override any responsive camera distance you compute outside it — pass `overviewZ` as a prop. (d) Optimistic UI must come with a `cancelledRef` (and a `mountedRef` for unmount) or the user will see ghost messages from polling that out-survives the drawer. (e) Reduced motion is not optional. Every Motion animation either honours `MotionConfig reducedMotion="user"` or is bypassed via a `usePrefersReducedMotion` matchMedia bridge for R3F frame loops.

Microcopy register is **director, not assistant**. The agent says "tell me about the lighting in this beat" not "what would you like for lighting?" The agent says "let's lock the closing shot" not "ready to confirm?" The user is filming a movie; the AI is the second-AD. Italics live on connectives only — *the*, *a*, *and* — never on nouns or verbs (italicizing nouns is a wedding-invite tell, kills the cinematic register instantly). Banlist for copy: "Generate", "Submit", "Continue", "Next", "Get started", "Let's go", "Powered by AI", "✨", "🚀", any other emoji, "experience", "journey", "magic", "seamless", "intuitive", "effortless". If a button says "Generate" the project has lost.

The "demo-day calculus": you have **three minutes**. Judge attention is half on the screen, half on their notes. Therefore every screen change must communicate within 800ms or it does not exist. The persistent `fl_splice` URL strip is on every canvas screen because it is one of the three winning moments and judges may not click into the stitch tray. The stage indicator (`Concept · Plan · Beats · Cinematic`) is on every route because judges need a "where am I in this product" anchor. The mock-mode chip is on every route because if the live AI fails the judge needs the demo to keep going.

The **process loop** is: lesson reflection → audit → build → commit. Before each phase, write a `LESSONS_FROM_PHASE_N.md` reviewing what worked and what failed. Then audit the current state vs the next phase's goals. Then build. Then commit with a tight, prose-style message. **Do not** include `Co-Authored-By: Claude` trailers on commits or PRs. The user signs them; the agent is invisible at the git layer. This is non-negotiable.

OK. That was the synopsis. Read on.

---

## PART 1 — PRODUCT CONTEXT

### 1.1 What SceneOS is, in one paragraph

SceneOS is a cinematic AI agent that turns a single director's prompt ("a 90s VHS memory of the day my dog ran away") into a finished short film. It does this by decomposing the prompt into 5–7 beats, interrogating each beat through a director-toned AI conversation until the per-beat prompt is camera-tight, generating a Veo / fal.ai clip per beat, and stitching the approved clips into a final cinematic via Cloudinary's `fl_splice` URL transformation. The user never sees a form longer than two fields. The user never sees a pricing tier. The user never logs in. They type one line, watch the canvas decompose, talk to the director, and walk away with a downloadable mp4.

### 1.2 The hackathon framing

This was built for **LA Hacks 2026**, tracks "Flicker to Flow" (cinematic AI) and "Cloudinary" (track-hero). The judging window is three minutes per team. The judges are tired. The judges have seen seven ChatGPT wrappers in a row before they get to you. The judges remember three things from your demo. Your job is to make those three things land.

The three winning moments are:

1. **Landing → canvas portal** — the user types a prompt and the camera dollies *into* the prompt as the canvas materializes. This is the "Tesla designing a Christopher Nolan trailer" moment. It must feel like a film opening, not a page transition.
2. **3D star-map first reveal** — five planetary nodes arranged along a z-recession curve, each glowing with a per-mood ember, connecting path threading them, ambient particles drifting, atmosphere shells breathing. The judge's audible reaction here is the prize.
3. **Persistent `fl_splice` URL** — as the user approves beats, the Cloudinary URL composes itself live in a strip at the bottom of the canvas. This is the Cloudinary track-hero moment. It must be visible without the user opening any drawer.

If your demo nails those three, the project wins. If your demo nails two and is competent everywhere else, the project places. If your demo is competent but lacks all three, the project does not place.

### 1.3 The "pizza-ordering simplicity" mantra

The user's quote on this: *"ordering a pizza requires four taps. ordering a movie should not require more."* The product satisfies this constraint. Specifically:

- Landing: one prompt input, one video-type chip row, one "begin" affordance. (Optionally: voice input, reference image drop. Both are progressive enhancements; the core flow does not require them.)
- Transition: zero user input. The cinematic plays.
- Canvas: the user is dropped onto the star-map. They click a beat. A drawer opens. They have a conversation. They approve. They move on. There is no "save", "draft", "settings", "preferences" in the active flow.
- Final: one play button, one download, one "make another." That is the entire screen.

Every feature you are tempted to add — a project library, a versioning system, a comment thread, a share-to-social menu — will dilute the simplicity and slow the demo. The only acceptable addition is one that strengthens one of the three winning moments. **Test:** does this feature increase the perceptibility of (1) the portal, (2) the canvas, (3) the URL? If yes, ship. If no, do not ship.

### 1.4 The user

The mental model of "the user" for the purposes of design is not a real person. It is an archetype the user (Alex) explicitly named: a film-school graduate at 2 AM who has an idea for a music video and wants to see it in their head right now. They are not a developer. They are not a SaaS power user. They are someone who reads Pitchfork, watches A24 trailers, and would close any tab that smells of "productivity software." Every design decision must pass the test: would the A24-trailer person continue past this screen, or close the tab?

This is why:
- The default font is Fraunces, not Inter. (Inter says "ChatGPT". Fraunces says "Criterion Collection.")
- The color palette is warm-near-black with ember accents. (Bright #FF3 cyber-blue says "fintech onboarding." Warm-near-black with ember says "film print.")
- The empty states are "approve a beat to begin", not "no items yet — click to add." (The first reads like a director's note. The second reads like Asana.)
- The motion language is bridge + reveal + acknowledge + signal. (Bouncing decorative motion says "marketing landing page." Cinematic state-change motion says "Final Cut.")

### 1.5 The CutOS heritage

This codebase started as a fork of CutOS, an internal cut-up / clip-editor tool. The migration is: keep the engine (clip metadata, manifest types, stitch URLs), strip the UI (CutOS was a node-LM-style flow editor; the new product is a star-map canvas + drawer), rebuild the agent (CutOS had a static prompt builder; SceneOS has a director-toned LangGraph conversation). When you encounter `cut`-prefixed types or routes you can rename them; when you encounter the manifest schema (`Beat`, `Scene`, `AgentTurn`, `VideoType`) you should keep it, because the backend speaks it. **Do not** rename `Beat` to `Shot` or `Scene` to `Take` mid-project — the backend will choke.

### 1.6 The competitive landscape

The user has been clear that the visual bar is set by:
- godly.website (the awwwards aggregator) — every site there is a reference for "premium, opinionated, cinematic"
- Higgsfield (the inspiration product — cinematic AI video, but their UX is more "professional studio" than "consumer one-shot")
- Pika, Runway, Kling — the cinematic AI competitors. They all have decent product but their UX is "AI control panel" not "director's table." Our differentiation is the conversation + the canvas + the URL.

When in doubt, look at FlowBoard, Are.na, and Linear's marketing site (not the app — the marketing site). Those three taught us: opinionated typography, structural restraint, hairline borders, single accent color, no gradients, no glass-blur on chrome. The app interior earns the visual weight.

### 1.7 What this product is *not*

It is not a video editor. It is not a node-based flow editor. It is not a "draw your storyboard" tool. It is a single-prompt → single-cinematic generator with a director conversation in the middle. If the user asks "can we add a timeline editor for the clips?" — the answer is no, because that is CutOS's job and Final Cut's job. The product's discipline comes from saying no to features.

---

## PART 2 — AESTHETIC PRINCIPLES

### 2.1 The single-sentence aesthetic brief

> "Tesla designing a Christopher Nolan trailer."

That is the brief. Read it three times before every commit. It means: industrial precision (Tesla — every spacing, every line-weight, every hairline is exact), cinematic grandeur (Nolan — IMAX-scale composition, warm-near-black palette, the audience is *in* the frame), and trailer-pacing (the product is a series of 30-second tableaus, each of which must work in isolation as a screenshot).

If a screen does not work as a screenshot it is not done.

### 2.2 "Cinematic, not SaaS"

The single most common failure mode for AI products in 2026 is to default to SaaS chrome — sidebar, header, breadcrumb, table, modal, button-with-icon-and-loading-spinner. SaaS chrome is fine for SaaS. It is death for a product whose pitch is "Christopher Nolan trailer."

The cinematic-not-SaaS principle: every chrome decision must have a film equivalent. Specifically:

- The header is a **letterbox bar**, not a navbar. (Letterbox = 21:9 cinema framing. Navbar = web app.)
- The drawer is a **side-mounted notebook**, not a modal. (Notebook = the director's notes on the side of the camera. Modal = a dialog blocking work.)
- The progress is a **hairline track**, not a percentage. (Track = film footage scrubber. Percentage = upload meter.)
- The button is a **hold-to-confirm chip** or an **inline directive verb**, not a "Generate" CTA. (Directive verb = the assistant director saying "rolling." CTA = a Stripe checkout.)
- The empty state is a **director's note**, not a placeholder. (Director's note = "approve a beat to begin." Placeholder = "no items yet.")

If you find yourself reaching for a SaaS pattern, stop and ask: what does this look like in a film? If you cannot answer, redesign.

### 2.3 The 60-30-10 rule (warm-near-black edition)

The visual budget is:
- **60% warm-near-black** (`bg-base #0a0908`, `bg-elev-1 #14110f`) — backgrounds, the frame
- **30% bone / fog** (`fg-primary #f5f1ea`, `fg-secondary #b9b1a3`, `fg-tertiary #6b6359`) — type, structural lines, hairlines
- **10% ember + cool fill** (`brand-ember #f0a868`, `brand-cool #5e7080`) — the single accent that earns attention; cool used sparingly as a counterweight

Anything that breaks this ratio breaks the cinematic register. Specifically:
- No gradients on chrome. (One exception: the atmosphere shell shaders, which are R3F not chrome.)
- No glassmorphism on chrome above z-10. (One exception: the persistent URL strip, which uses `backdrop-blur-xl` to sit over the canvas without occluding it. The strip is below all overlays at z-10.)
- No drop shadows except the one elev-2 shadow defined in the token table.
- Ember is the *only* accent. There is no "secondary brand." There is no "purple for premium". There is the ember and the cool-fill; that's it.

### 2.4 The godly.website / awwwards bar

The user's word: "if it doesn't look like it could land on godly, we haven't shipped." This is a real bar — godly's archive curates roughly 30 sites a month, and the median site there features:

- One serif display face used at scale, with axis variation (weight + opsz + slant)
- One sans body face (variable, semi-humanist), used quietly
- One mono used only for technical strings (timestamps, IDs, URLs)
- A single accent color, used sparingly
- Hairline structural lines (1px or under), often tinted to the accent
- Photography or 3D as the visual centerpiece (not illustration, not stock)
- Generous whitespace; type-led hierarchy; no card-shadow-on-card
- Microcopy that reads like a person, not a product team

We hit this by using Fraunces + Manrope + Geist Mono (covered in Part 4), the warm-near-black + ember palette, the 3D canvas as centerpiece, and director-toned microcopy. **Audit yourself by taking a screenshot every time you ship a screen and asking: would this land on godly?** If no, what specifically reads as cheap?

The five "cheap" tells the user has flagged in this codebase:
1. Default Tailwind shadows (`shadow-md`, `shadow-lg`) — they read as Bootstrap. Replace with custom box-shadow tokens.
2. Default Tailwind rounded corners (`rounded-md`) — they read as default. Either go to `rounded-full` (pills) or `rounded-[2px]` (precise). Skip the middle.
3. Default sans body type at default tracking — Manrope at 0 tracking is fine; Inter at 0 tracking is generic. Manrope is doing some heavy lifting here.
4. Icon + label both big — pick one or the other to lead. Usually the label leads; the icon is a hint.
5. Overuse of glass-blur — once or twice on the canvas is fine. On every chip and card it reads as "Apple Vision Pro tutorial."

### 2.5 Generic is the enemy

This is the user's loudest single rule. "Generic-looking" is a project-ending failure. The agent has been corrected on this multiple times in this build's history. The corrections have always been the same: I shipped something that worked but read as a default-shadcn-skin or default-AI-product, and the user said "this is far too generic looking."

The fix is always: lean harder on the typography (Fraunces axis variation, italics on connectives, ALL-CAPS captions at `0.18em` tracking), lean harder on the structural restraint (hairlines instead of cards, off-axis composition instead of centered), lean harder on the microcopy (director's voice, not product voice). The fix is *never* "add more visual flair." More flair makes things more generic, not less.

If you are tempted to "make it more interesting" by adding gradient mesh, glass-blur, animated background, neon outline, or lottie illustration: stop. The fix is to take things away, not add them.

### 2.6 "Restraint is a feature"

The user's exact phrase. The product's primary visual move is what it does *not* show. The canvas has five planets and five connecting paths and one persistent URL strip. The drawer has a header, a conversation, an input, a CTA. That's it. There is no sidebar. There is no breadcrumb. There is no toast pile. There is no floating action button.

When you encounter the question "should we surface this here?" the default answer is no. Surface it in the command palette (⌘K) instead. The command palette is the escape valve for everything that does not earn screen real estate.

### 2.7 The "would Nolan ship this?" test

Before any commit on a chrome change, ask: would a film director ship this? Specifically — would Nolan, Villeneuve, or Lynn Ramsay sign off on this screen? If no, identify what's wrong.

Real applications of this test from the build:
- "Powered by AI" footer on landing — Nolan would not. It says "we are an AI demo," not "this is a film tool." Removed.
- ✨ sparkle icon next to the agent name — Nolan would not. It's the universal "AI feature" tell. Replaced with Clapperboard icon.
- "Generate" CTA on the input — Nolan would not. Replaced with hold-to-cast directive ("hold to begin").
- Toast notification "Beat approved!" with green check — Nolan would not. Replaced with ember-flash on the beat node and a typewriter line in the URL strip.

The test is conservative. It will sometimes lead you to take out things that "work" by web standards. That is the point. The web standard is not the bar; the cinematic standard is.

### 2.8 "Awwwards is the floor, not the ceiling"

The user has been explicit: hitting awwwards is the floor. The ceiling is godly.website. The difference: awwwards rewards execution; godly rewards taste. Execution = the animations are smooth, the type is set, the responsive works. Taste = the choices are surprising, the restraint is severe, the references are not the obvious ones.

Examples of "taste over execution" in this build:
- Choosing Fraunces over Playfair (Playfair is the obvious "premium serif" — Fraunces' soft + wonk axes give the same elegance with personality)
- Choosing a star-map canvas over a node-flow editor (node-flow is the obvious "AI agent" UX — a star-map evokes orchestration without claiming to be a workflow tool)
- Choosing director-toned microcopy over assistant-toned (assistant is the obvious "AI" voice — director is what the product is *about*)
- Choosing a persistent URL strip over a "view URL" button (the button is execution; the persistent strip is taste — it makes the Cloudinary feature unmissable)

When you hit a fork between "the obvious good choice" and "the slightly weirder good choice," the slightly weirder one is usually correct. Awwwards-floor is the obvious good choice. Godly-ceiling is the slightly weirder one.

---

## PART 3 — COLOR SYSTEM

### 3.1 The token table

Defined in `tailwind.config` `@theme`:

```css
@theme {
  /* base */
  --color-bg-base: #0a0908;
  --color-bg-elev-1: #14110f;
  --color-bg-elev-2: #1c1815;

  /* foreground */
  --color-fg-primary: #f5f1ea;     /* bone — type, primary structural */
  --color-fg-secondary: #b9b1a3;   /* fog — secondary type, hover affordance */
  --color-fg-tertiary: #6b6359;    /* mist — captions, hairlines, disabled */

  /* brand */
  --color-brand-ember: #f0a868;    /* warm 36° — accent, CTA, active state */
  --color-brand-ember-deep: #c97f3f; /* hover ember, used on press states */
  --color-brand-cool: #5e7080;     /* cool slate — counterweight, secondary fill */

  /* state */
  --color-state-success: #8fb39a;  /* desaturated green — approved beats */
  --color-state-error: #c97a7a;    /* desaturated red — agent error */
  --color-state-warning: #d4a574;  /* desaturated amber — pending warnings */
}
```

Notes:
- The base is **warm**-near-black (`#0a0908`), not cool-near-black (`#0a0a0c`). Cool blacks read as "tech product." Warm blacks read as "film print." This is one of the highest-leverage decisions in the entire palette.
- The foreground primary is **bone** (`#f5f1ea`), not pure white. Pure white on warm-near-black creates a contrast spike that reads as cheap. Bone is gentler.
- The ember is **warm 36°** at `#f0a868`. The user has been protective of this exact value — do not retune to `#ffae6b` ("more saturated") or `#e89c5a` ("more brown"). The `#f0a868` value is the one that survived three audits.
- The cool fill at `#5e7080` is intentionally desaturated. It is a *counterweight* not a *secondary brand*. Saturated blue would compete with ember; desaturated slate complements it.
- State colors are **desaturated**. Saturated green-on-warm-black is jarring. The desaturated `#8fb39a` reads as "calm approved" not "GitHub merge."

### 3.2 Why warm-near-black

The user's reasoning: cinema reference frames are warm-tinted. Print reference frames are warm-tinted. Cool-tinted blacks are screen-tinted (LCD whites running cold). To evoke "this is cinema," start with the warmest plausible black. `#0a0908` is the warmest you can go before it reads as "very dark brown" instead of "near-black."

The concrete cinematic references the user named:
- The Coen Brothers' *No Country for Old Men* — warm browns under near-black, the ember comes from the lamps
- Roger Deakins' *Sicario* night photography — warm-near-black with cool-blue counterweight only when the night is interrupted by a vehicle
- Hoyte van Hoytema's *Interstellar* — warm-near-black in the Cooper home, cool fill only in the void shots

We are imitating the first reference. The cool fill exists for moments where we want to register "void / outside / cold" — the empty canvas before a beat is approved, the disabled state of a CTA before the prompt has length, the grayed-out generation panel when no provider is selected.

### 3.3 The ember is the only accent

There is no purple, no teal, no pink. The ember at `#f0a868` is the single accent across the entire app. Every active state, every progress fill, every focus ring, every "live" indicator — ember.

The temptation to add a second accent (typically purple, because shadcn does it) must be resisted. Here is why:
- Two accents means the user has to learn two semantic colors. Cognitive load.
- Two accents dilute the demo's visual signature. After three minutes the judges should remember "ember + warm black"; if you add purple they will remember nothing specific.
- Two accents rarely look intentional; they almost always read as "we couldn't decide."

If you need a second semantic axis (e.g., "approved" vs "ready"), use **opacity + intensity**, not hue. An "approved" beat node is ember at full saturation + a halo. A "ready-to-generate" beat node is ember at 60% saturation + no halo. A "pending" beat node is fog (`fg-secondary`) at 80% — not ember at all. Same hue language, three different states.

### 3.4 Ember palette per state

The ember has variants that map to UI state. These are not separate palette entries — they are derivations:

```ts
// utility constants in src/lib/colors.ts (conceptual, not literal)
export const EMBER = {
  base: '#f0a868',           // default ember
  deep: '#c97f3f',           // hover / pressed
  pale: '#f7c894',           // bright halo / glow tail
  glow: 'rgba(240, 168, 104, 0.45)', // halo at 45% — used in box-shadow, ring
  trail: 'rgba(240, 168, 104, 0.12)' // ambient afterglow — used after typewriter reveal
};
```

When a beat approves, the node mesh ramps from `base` → `pale` (bright spike) → `base` (settled), and the URL strip's new tail emits a `trail` fade. This is the "ember afterglow on new tail" the user spec'd in the persistent-url-strip.

Box-shadow on focus rings uses `glow`:
```css
focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base
/* In Motion-driven focus animations: box-shadow: 0 0 0 2px var(--color-brand-ember), 0 0 24px 4px rgba(240, 168, 104, 0.45); */
```

### 3.5 Mood-mapped palette extensions (R3F only)

On the canvas, each beat has a `mood` field (`tense`, `tender`, `triumphant`, `melancholic`, `mysterious`). The mood maps to a per-beat ember tint at the R3F shader layer (not the chrome layer):

```ts
const MOOD_EMBER: Record<Beat['mood'], string> = {
  tense:        '#e0764e', // deeper, more red-shifted ember
  tender:       '#f3c08c', // softer, more peach ember
  triumphant:   '#ffb56b', // saturated, golden ember
  melancholic:  '#d4926a', // muted, brown ember
  mysterious:   '#b885a1', // mauve — only mood that breaks ember; reads as "off-canon"
};
```

The mauve for mysterious is a deliberate exception. The other four moods stay within ember's hue range. Mysterious is the one mood where the ember gets *replaced* with mauve, because mysterious beats need to feel "outside the warm narrative." This is one of the few places where the "ember is the only accent" rule bends, and it bends only at the R3F shader layer — never on chrome.

### 3.6 Color and accessibility

This is a real concern and it is mostly handled by the token system, but with one caveat: `text-fg-tertiary` on `bg-base` does **not** pass WCAG AA at 4.5:1 for body type. It barely passes 3:1 for large type. You can use `fg-tertiary` for:
- Captions (`text-[11px]` or `text-[10px]`) — they are decorative metadata, not content
- Hairline borders (`border-fg-tertiary/25` typically) — non-text
- Icon strokes when the icon is decorative (paired with a label that meets contrast)

You **cannot** use `fg-tertiary` for body type. Period. The spec wants `fg-secondary` (`#b9b1a3`) for any text the user is supposed to read, including drawer body text. This is one of the audit checks that has caught a regression in this build before.

If a designer asks for "subtle gray text" for body, the answer is `fg-secondary`. If they ask for "even subtler" the answer is "no, it would fail accessibility." Do not concede.

### 3.7 The fail-states that have shipped wrong

The audit-and-fix history of this palette:

- I once shipped `bg-elev-1` at `#1a1614` — too high contrast against `bg-base`. The user said "the elevation reads as a card." Correct: `#14110f`, two ticks darker than I'd intuited.
- I once shipped state-success at `#3ea968` — saturated green. The user said "this looks like a GitHub PR merge." Correct: `#8fb39a`, desaturated.
- I once tinted hairlines with `fg-secondary/25` — reads too prominent, like a card border. Correct: `fg-tertiary/25` for structural hairlines, `fg-tertiary/15` for the most subtle dividers.
- I once tried a teal accent for "secondary brand" on the stitch tray — the user immediately said "no second accent, you know better." Removed.

The pattern across all of these: the failure mode is making things more visible / more saturated than the cinematic register allows. The fix is always to dial back, not to dial up.

### 3.8 Tinted glassmorphism

The persistent URL strip uses `bg-bg-elev-1/70` + `backdrop-blur-xl`. This is the only glass surface in the app above z-1. The reason it's there:
- The strip overlays the 3D canvas
- It needs to be readable without occluding the canvas
- The blur is what allows it to sit on the canvas without breaking the cinematic depth

Anywhere else (chips, cards, modals, drawers) glass would be a generic-AI-product tell. Use `bg-bg-elev-1` solid. The drawer is solid. The command menu is solid. The chip row is solid.

The blur intensity is `backdrop-blur-xl` (24px in Tailwind v4). `backdrop-blur-md` (12px) reads too transparent and the canvas leaks; `backdrop-blur-2xl` (40px) reads too foggy and the canvas disappears. 24px is the value that survived testing.

### 3.9 What's in `bg-elev-2` and when to use it

`bg-elev-2` (`#1c1815`) is the tertiary elevation. It exists for:
- The agent's reply bubble in the conversation (the user's bubble is transparent + ember outline)
- The active beat detail in the drawer header (the rest of the drawer is `bg-elev-1`)
- Hover state on a stitch tray segment row

Three uses. That's it. If you find yourself using `bg-elev-2` for a new pattern, ask whether it could be the same as `bg-elev-1`. Usually it can be. The elevation system has three tiers because there are exactly three semantic "depths" in this app — base, elevated chrome, and "this thing inside elevated chrome is interactive." More tiers would not earn their keep.

### 3.10 Future palette evolutions and the rule for them

If the product expands (new route, new feature, new sub-product) the palette stays the same. The exception: a Marketing route or homepage that exists outside the product flow may use a brighter ember palette — `#ffae6b` on a near-white background — to signal "this is the marketing site, the product is dark." Inside the product, palette is locked.

The rule: **changes to the palette tokens must be accompanied by an audit-screenshot of every route showing they still hit the cinematic bar.** Every. Route. The palette is too central to evolve without deliberate review.

---

## PART 4 — TYPE SYSTEM

### 4.1 The font choices and why

**Display: Fraunces.** Variable font with `wght`, `opsz`, `soft`, and `wonk` axes. We push `soft` and `wonk` modestly to break the "default Playfair-ish premium serif" pattern. Fraunces is younger than Playfair, less worn, more characterful. Used for: H1, H2, drawer title, route titles, anywhere the user is supposed to *feel* the type.

**Body: Manrope.** Variable, semi-humanist sans. We use 400/500 weights typically; 600 for emphasis. Manrope's letterforms have just enough character (the open `a`, the slightly-tall `t`-bar) to not read as Inter. Used for: body copy, caption text, button labels, drawer copy, microcopy.

**Mono: Geist Mono.** Variable, Vercel's mono. Used for: timestamps, IDs, the `fl_splice` URL itself, the `…/upload/` prefix in the URL strip. Mono's job is to signal "this is a technical string." Anywhere you would say "this is a string the user should be able to copy" — mono.

### 4.2 What we tried and rejected

The font journey on this project went: **Italiana → Instrument Serif → Fraunces** for display, **Inter → Geist → Manrope** for body. The rejection reasons:

- **Italiana** (display, rejected): too narrow at large sizes. The headline "an offering" rendered with all the letterforms cramping; it read as a wedding invitation, not a film title.
- **Instrument Serif** (display, rejected): too wonky. The italic-only-by-default treatment is striking but reads as "art-school zine," not "film studio." Also: rendering inconsistencies on Windows.
- **Inter** (body, rejected): overused. The user's exact words: "every AI product in 2026 uses Inter. We don't." This is correct — at this point Inter signals "ChatGPT clone" more than "neutral sans."
- **Geist** (body, rejected): too geometric. Geist is gorgeous, but it leans developer-tool, not editorial. Pair with Geist Mono and you have a Vercel-clone vibe.
- **Manrope** (body, kept): semi-humanist, has personality without screaming, scales well from 11px caption to 60px headline. The right answer for this product.

Do not relitigate these. They were tested in real screenshots on real screens with the user reviewing.

### 4.3 The seven-step type scale

The scale (defined in `tailwind.config` and used as `text-overline`, `text-caption`, etc.):

```
text-overline  → 10px, 0.18em tracking, uppercase, weight 500, body font
text-caption   → 11px, 0.18em tracking, uppercase, weight 500, body font
text-meta      → 13px, 0 tracking, sentence case, weight 400, body font
text-body-sm   → 14px, 0 tracking, sentence case, weight 400, body font
text-body      → 16px, 0 tracking, sentence case, weight 400, body font
text-body-lg   → 17px, 0 tracking, sentence case, weight 400, body font
text-lede      → 20px, 0 tracking, sentence case, weight 400, body font (display font for editorial register)
```

Plus display sizes (used directly, not via tokens, because they appear once per route):
```
display-xl  → clamp(3rem, 7vw, 6rem),  Fraunces, weight 350, opsz 144, leading 1.0
display-lg  → clamp(2.5rem, 5vw, 4rem), Fraunces, weight 400, opsz 96,  leading 1.05
display-md  → clamp(1.75rem, 3vw, 2.5rem), Fraunces, weight 400, opsz 60, leading 1.1
```

Notes:
- `display-xl` uses **clamp with a 2.5rem floor**. The mobile floor was originally 2rem and the "an offering" headline collapsed to two lines on narrow phones, breaking the visual. 2.5rem is the floor that keeps it on one line on a 320px viewport.
- `text-lede` uses the display font (Fraunces). It's a "first paragraph" register — drawer description, route subtitle, the kind of thing that reads aloud as "voiceover." Setting it in Fraunces with `italic` for emphasis hits the cinematic register hard.

### 4.4 The single tracking value

**Every uppercase string in the app uses `0.18em` tracking. Period.**

The history: I had freelanced five different tracking values in different places — `0.05em`, `0.08em`, `0.1em`, `0.12em`, `0.18em`. They all looked "correct" in isolation but the app as a whole read as inconsistent. The fix was a single tracking value applied to the `caption-track` and `overline-track` utility classes. Once collapsed, the whole UI looked sharper.

The classes:
```css
.caption-track { letter-spacing: 0.18em; text-transform: uppercase; }
.overline-track { letter-spacing: 0.18em; text-transform: uppercase; }
```

**Don't add a new tracking value.** If you need an uppercase string and `0.18em` looks "too loose," the answer is to reconsider whether it should be uppercase at all. Sentence case at 0 tracking is the alternative.

### 4.5 The mono-body anti-pattern

I shipped a version of the agent conversation where the agent's bubble used Geist Mono. The intuition: "this is AI-generated text, mono signals that." The user rejected it on first sight: *"this reads like a system log."*

The principle: mono is for **technical strings the user can copy** (URLs, IDs, timestamps). Mono is **not** for body text, even AI body text. AI body text in mono reads as system output, not as a director speaking. The agent uses Manrope.

The application: anywhere you find yourself reaching for `font-mono` on body, ask "is this a copyable technical string?" If yes, keep mono. If no, move it to Manrope.

The legitimate mono uses in this app:
- The `fl_splice` URL strip (`font-mono text-[11px] tabular-nums`)
- The `…/upload/` prefix (mono)
- The clip ID badges in the stitch tray (`font-mono text-[10px]`)
- Timestamps in the conversation (`font-mono text-[10px] tabular-nums`)
- Job IDs in dev / debug overlays (mono)

Everything else is Manrope.

### 4.6 Italics on connectives only

When you need emphasis in editorial copy (drawer description, route subtitle, agent voiceover line), the rule is:

- Italicize **connectives and articles only**: *the*, *a*, *and*, *of*, *in*, *to*, *for*, *with*
- Never italicize **nouns or verbs**

Right: *the* opening shot, where *the* light first lands
Wrong: the *opening* shot, where *light* first *lands*

Italicizing nouns/verbs reads as melodrama (or worse, as wedding-invite). Italicizing connectives reads as editorial pacing — a printed magazine pull-quote. The cinematic register is the second.

This is one of the patterns that took me three audits to internalize. The user corrected me when I italicized "memory" in a drawer description. The fix was to italicize "the" instead. Same emphasis weight, different register.

### 4.7 The eyebrow-rot anti-pattern

An "eyebrow" is the small uppercase label above a heading. *Director Brief.* The temptation is to add eyebrows to every section. The user calls this **eyebrow rot**: when every section has an uppercase tracking-out label, none of them carry weight, and the page reads as a corporate spec sheet.

The rule: an eyebrow is justified only when:
- The heading is the *primary* heading on the screen (not a sub-heading)
- The eyebrow communicates a *new* category, not redundant context

Wrong: every drawer header has an eyebrow saying "BEAT 03." (The beat number is already in the title; the eyebrow is duplicative.)
Right: the drawer header has the title only; the eyebrow appears once on the route, saying "DIRECTOR'S TABLE."

If you find yourself adding more than two eyebrows on a screen, take all but one out.

### 4.8 `text-wrap: balance` and `text-wrap: pretty`

These are CSS properties (Tailwind v4 has them as utilities: `text-balance`, `text-pretty`). They are essential for editorial type:

- `text-balance` — spreads a multi-line heading evenly across lines, avoiding orphans. **Use on:** every H1, H2, route title, drawer title.
- `text-pretty` — applies typesetting heuristics for body paragraphs (no orphans, balanced ragged-right). **Use on:** every body paragraph longer than one line.

Without these, headlines look as if they were typed into Notepad: the last line is a single word ("a / shot / where / the / light / first / lands"). With these, the headline lays out as a poet would.

The cost is near-zero — `text-balance` is fully supported in evergreen browsers since 2024. There is no excuse to ship a heading without it.

### 4.9 The headline orphan-wrap bug

A specific failure mode that surfaced during the headline animation work: the `<TextSplitter>` component wraps each character in an `inline-block` span for per-char animation. The browser then breaks the line at any character — including mid-word, since each `inline-block` is a separate breakable unit.

The bug surfaced as the headline `"an offering into the night"` rendering with `into` split as `int / o`. This is a wrap failure no editorial designer would tolerate.

The fix:
1. **Group characters by word.** Each word becomes a non-breaking `inline-block` container of per-char spans. The container has `white-space: nowrap` so the browser cannot break inside a word.
2. **Index the spans by `data-index`.** The CSS selectors moved from `> span > span` to `[data-index]` so the per-char animation still finds them inside the word containers.
3. **Set `text-wrap: balance` on the parent** as a final balancing pass.

This pattern (`TextSplitter` with word grouping) is reusable — any per-char animation must group by word or it will mid-word-break. If you're writing a new char-animated title, extend `TextSplitter`; do not roll your own.

### 4.10 The "smart quote" tax

The user's microcopy uses curly quotes (`"`, `"`, `'`, `'`) and en-dashes (`–`) and em-dashes (`—`). These are not optional. Straight quotes and hyphens-as-dashes are the single fastest tell that a piece of UI was written by an engineer rather than a writer.

There is no tooling enforcing this — it is a discipline. When you write a microcopy string in JSX:

```tsx
<p>Approve a beat to begin — the agent will know what comes next.</p>
```

Note: the dash is `—` (em-dash), not `--` or `—`. The agent line in the drawer:

```tsx
<p>Tell me about the lighting in this beat. Soft and golden? Hard and clinical? Or something we haven't seen?</p>
```

Note: the apostrophe in "haven't" is `'`, not `'`. (This is what curly-quote-aware text editors give you for free.)

If you copy text from a code editor that doesn't smart-quote, paste through a smart-quote pass. This is a 30-second discipline that meaningfully changes the perceived quality of the product.

### 4.11 Type scale in practice — the drawer description case

A real lesson: the drawer description was originally `text-body` (16px, Manrope). It read as "form helper text" — the kind of thing that says "please enter your email." The user's note: *this should read as voiceover, not helper text.*

The fix: lift it to `font-display italic text-[1.125rem] leading-[1.4]`. That's Fraunces italic at 18px with tighter leading. It reads as a director's note now — "this is the moment where the camera dollies in" — not as helper text.

The lesson: when a piece of copy has a *narrative* register, it deserves the display font even at body sizes. When it has a *functional* register, body font in body sizes. The drawer description is narrative; the input placeholder is functional.

### 4.12 Tabular numerals, always

Anywhere you display a number that might tick (timer, count, percentage, segment count), use `tabular-nums`. This makes each digit the same width, so the number doesn't jitter as it counts.

```tsx
<span className="font-mono text-[11px] tabular-nums">{`0:${seconds.toString().padStart(2, '0')}`}</span>
```

`tabular-nums` is one of those quiet polish details that costs nothing and ships premium. The first time the user saw a percentage tick from `12%` to `13%` and the digits jittered laterally because the number wasn't tabular, they said "fix that." It's now a project default.

### 4.13 The display font's `opsz` and `wght` axes

Fraunces has variable axes. We exploit them:

- **`opsz` (optical size)**: at large display sizes, push to ~96–144 (the high end). At small "lede" sizes, drop to ~24. This makes the font feel native at every size.
- **`wght`**: 350 for the headline (lighter than default 400 — gives air at large sizes), 400 for body editorial, 500 for emphasis.
- **`soft`**: push modestly — softens corners, breaks the "Playfair-default" feel.
- **`wonk`**: push *very modestly* (around 0.1 of the range). This adds the eccentric serif treatment that makes Fraunces feel like Fraunces. Push too much and it reads as comic.

```css
.display-xl {
  font-family: 'Fraunces';
  font-variation-settings: 'opsz' 144, 'wght' 350, 'soft' 50, 'wonk' 1;
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 1.0;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
```

The negative letter-spacing on display is intentional — at large sizes, default tracking reads loose. `-0.02em` tightens it without crashing the letterforms.

### 4.14 The line-height ladder

Line-heights are relational, not absolute:

- Display sizes: `leading-[1.0]` to `leading-[1.05]`
- Lede: `leading-[1.4]` (slightly tighter for editorial)
- Body: `leading-[1.55]` to `leading-[1.6]`
- Caption: `leading-[1.5]`
- Mono: `leading-[1.4]` (mono is naturally airy; doesn't need 1.6)

When you set body type, default to `leading-[1.55]`. The web default (`1.5`) reads slightly cramped at 16px on warm-near-black; `1.55` is the value that opens it up without making it feel "tutorial-y."

### 4.15 Reduced motion and animated type

When `usePrefersReducedMotion()` returns true, the `TextSplitter` animation must be bypassed. The text appears all at once. The implementation:

```tsx
export function TextSplitter({ text, ... }: Props) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <span>{text}</span>;
  // otherwise: word-grouped per-char animation
}
```

This is one of the places `prefers-reduced-motion` is non-negotiable. A user with vestibular sensitivity should not have to watch headlines type-on. The fallback is "text appears." That is an acceptable presentation.

### 4.16 The microcopy-as-typography case

Microcopy is type. The treatment is:

- **Eyebrow** (single per screen, see 4.7): `text-overline` or `text-caption`, `font-medium`, ember or fg-secondary.
- **Title** (route or drawer header): `font-display`, `display-md`/`display-lg`/`display-xl` per scale, `text-fg-primary`, `text-balance`.
- **Lede** (subtitle / voiceover line): `font-display italic text-[1.125rem]` or `text-lede`, `text-fg-secondary`, `text-pretty`.
- **Body** (paragraphs): `text-body` or `text-body-sm`, `text-fg-secondary`, `leading-[1.55]`, `text-pretty`.
- **Caption** (metadata): `text-caption` or `text-meta`, `text-fg-tertiary`, no balance.
- **Button label**: `text-body-sm font-medium`, `text-fg-primary` (active) or `text-fg-secondary` (idle).
- **Input label** (hidden but for screen readers): `sr-only`. The visible label is the placeholder + its own visual treatment.

If a piece of copy doesn't fit one of those categories, ask why. Usually the answer is the design needs a refactor.

---

## PART 5 — MOTION LANGUAGE

### 5.1 The four legitimate reasons motion exists on this app

1. **Reveal** — fade something in to indicate it has arrived. (A new agent turn, a beat node materializing, the URL tail typewriting.)
2. **Acknowledge** — register a click/tap with a brief scale-down + bounce. (Buttons, chips, beat nodes.)
3. **Bridge** — transport between two routes or two states without a jarring swap. (Landing→canvas portal, drawer slide-in, route transition.)
4. **Signal** — communicate semantic state change. (A beat going from `pending` to `generating` glows; a clip becoming approved emits an ember halo.)

If a motion does not satisfy one of these four, **delete it**. Decoration motion — bouncing icons that mean nothing, scaling-on-hover that does not communicate state, ambient looping pulses on idle elements — is banned. This is the single most important rule in the motion section.

### 5.2 The motion tokens

`src/lib/motion-tokens.ts`:

```ts
export const DURATIONS = {
  /** Micro: button press ack, focus ring, small chrome twitch. */
  micro: 0.12,
  /** Short: input focus, hover state, badge entry. */
  short: 0.24,
  /** Standard: drawer slide, modal fade, route swap. */
  standard: 0.36,
  /** Cinematic: bridge transitions, headline reveal, portal. */
  cinematic: 0.6,
  /** Epic: full route portal animation. Use sparingly. */
  epic: 1.2,
};

export const EASE = {
  /** Default — fast-out, slow-in. Use for entry. */
  out: [0.25, 1, 0.5, 1],
  /** Inverse — slow-out, fast-in. Use for exit. */
  in: [0.5, 0, 0.75, 0],
  /** Symmetric — same-curve in and out. Use for hover. */
  inOut: [0.65, 0, 0.35, 1],
  /** Cinematic — Brian Lovin's "expo" — long settle. Use for bridge. */
  expoOut: [0.16, 1, 0.3, 1],
};

export const SPRING = {
  /** Tight — snappy, no oscillation. */
  tight: { type: 'spring', stiffness: 380, damping: 32 },
  /** Bouncy — visible overshoot, used for ack on chips. */
  bouncy: { type: 'spring', stiffness: 280, damping: 18 },
  /** Soft — long settle, used for drawer entry. */
  soft: { type: 'spring', stiffness: 200, damping: 28 },
};

export const STAGGER = {
  /** Tight stagger — chars in a headline. */
  tight: 0.025,
  /** Standard — list items revealing. */
  standard: 0.06,
  /** Loose — beats on first canvas reveal. */
  loose: 0.12,
};
```

**Every Motion `transition` prop on the app uses these tokens. No magic numbers.** If you find yourself writing `duration: 0.4` or `ease: [0.4, 0, 0.6, 1]` in component code, stop and either use a token or add a new one to the file with a comment explaining why it earns its place.

The user has been explicit: the existence of magic durations / eases is the second-largest "this app feels generic" tell after generic typography. Locked tokens are the antidote.

### 5.3 Motion vs CSS keyframe rule

When to use Motion (the React library) vs CSS `@keyframes`:

- **Motion**: state-driven animations. The element animates because some piece of React state changed. Most animations on this app fall here — `AnimatePresence`, `whileHover`, `animate={{ ... }}`, layout animations.
- **CSS `@keyframes`**: stateless decoration. The element loops a subtle motion forever — the breathing of the atmosphere shell scale (in CSS-fallback mode), the typewriter caret blink, the ember pulse on the loading dot.
- **R3F `useFrame`**: anything driven by per-frame WebGL state. Camera lerp, mesh rotation, particle drift, shader uniform animation.

The mistake to avoid: using Motion to drive an infinite ambient loop (e.g., `animate={{ scale: [1, 1.05, 1] }}` with `repeat: Infinity`). This works but it's the wrong tool — CSS handles it more cheaply and the React reconciler doesn't care. Reserve Motion for state-driven moments where the cost of the React orchestration earns its keep.

### 5.4 The `transition-all` ban

`transition-all` is banned. It is the laziest possible CSS transition declaration; it animates every animatable property, including ones you didn't intend, and it makes performance debugging impossible.

The replacement: be explicit. If you want a hover transition on color and transform, write:

```html
class="transition-[color,transform] duration-200 ease-out"
```

Tailwind v4 supports custom transition properties cleanly. Use them.

The exception that proves the rule: there are roughly three places in the app where `transition-all duration-200` is acceptable — small chrome elements (a chip, a copy button, a focus ring) where the transition list is short and the explicit list would be `transition-[color,background-color,border-color,box-shadow]` and that's basically `all`. Even there, prefer the explicit list. Future-you will thank you when you find that the `transform` on hover is fighting a Motion `whileHover`.

### 5.5 `MotionConfig` at the route boundary

Mount `<MotionConfig reducedMotion="user">` at the App root. This makes Motion respect `prefers-reduced-motion: reduce` system-wide for any animation that uses Motion's animate / variants / AnimatePresence pipeline. Without it, you're reimplementing the matchMedia bridge per-component.

```tsx
// App.tsx
import { MotionConfig } from 'motion/react';

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Lenis>
        {/* routes, chrome */}
      </Lenis>
    </MotionConfig>
  );
}
```

`reducedMotion="user"` (the default-ish) defers to the OS preference. `reducedMotion="always"` forces reduced-motion regardless (useful for testing). `reducedMotion="never"` ignores the preference (the wrong choice, do not ship).

For animations that don't go through Motion (R3F useFrame, GSAP timelines, CSS keyframes), you need a separate bridge — see Part 7.

### 5.6 Stagger and delayChildren

Stagger is one of the highest-leverage motion patterns. A list of items revealing in sequence reads as "the page is composing itself," not "everything popped in at once." Implementation:

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER.standard,    // 0.06
      delayChildren: 0.2,                   // wait for parent to settle
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATIONS.short, ease: EASE.out } },
};

return (
  <motion.ul variants={containerVariants} initial="hidden" animate="visible">
    {items.map(item => (
      <motion.li key={item.id} variants={itemVariants}>{item.label}</motion.li>
    ))}
  </motion.ul>
);
```

`delayChildren: 0.2` is the underused half. Without it, the children start animating at the same instant the parent does, and the parent's animation is invisible (because it's happening "behind" the children). With a delay, the parent sets the stage; the children take the stage.

Use `STAGGER.tight` for character-level (TextSplitter), `STAGGER.standard` for list items, `STAGGER.loose` for the canvas's beat-reveal where each item is large and warrants a full beat of its own.

### 5.7 `AnimatePresence` and `key` remount

Routing transitions on this app use `<AnimatePresence mode="wait">` + a `key` on the route's wrapper:

```tsx
<AnimatePresence mode="wait">
  <motion.div key={location.pathname} initial="hidden" animate="visible" exit="exit" variants={routeVariants}>
    <Outlet />
  </motion.div>
</AnimatePresence>
```

`mode="wait"` means: don't start the new route's `enter` until the old route's `exit` finishes. This avoids the cross-fade-with-overlap that reads as "two routes wrestling." The cost is a brief pause between exit and enter. The pause is *correct* — it gives the user a beat to register the route changed.

`key={location.pathname}` is what tells AnimatePresence "this is a new instance, run the lifecycle." Without the key, the same `<motion.div>` is reused across routes and exit/enter never fire.

### 5.8 The `LayoutGroup` and `layoutId` patterns

Motion's `layout` and `layoutId` props are for "shared element transitions" — an element on route A morphs into an element on route B. The canonical example: a beat node on the canvas (`/canvas`) becomes a thumbnail in the stitch tray (`/canvas` with tray open) — same `layoutId="beat-{id}"`, Motion does the rest.

These are powerful and slightly fragile. Two rules:
1. The `layoutId` must be unique across the page. If two elements have the same `layoutId`, Motion picks one and morphs the other to it; the result is unpredictable.
2. The two elements must have the same conceptual "shape" — Motion will animate `width`, `height`, `border-radius`, but if the children differ wildly the morph reads as a glitch.

In practice, this app uses `layoutId` for the beat-node ↔ tray-thumbnail morph and the URL strip ↔ tray URL morph. Two cases. Don't add more without thinking carefully.

### 5.9 The bridge motion (landing → canvas)

The single most cinematic moment in the app is the bridge from `/` (landing) to `/canvas`. The implementation breakdown:

1. User submits prompt on landing.
2. Landing fires `api.decompose(...)` (fire-and-forget; we don't await it).
3. Landing route exits — type fades up and out, ambient orb scales down to a point.
4. Router navigates to `/transition`.
5. `/transition` plays a 1.2s GSAP timeline: the point expands into a starfield, camera dollies forward, the title "the canvas opens" types on at the apex, then everything fades to the canvas.
6. Router navigates to `/canvas`.
7. `/canvas` enters with the beats already laid out (the `beat-graph-store` has them from `initialize()`), and the camera is at overview. As the user lands, beat nodes reveal with `STAGGER.loose`.

The bridge is 1.2–1.6 seconds end-to-end. Any longer and the user feels the wait. Any shorter and the cinematic impact is lost. The 1.2s is the value that survived testing.

**Critical**: the bridge does not block on the API call. The decompose call is fire-and-forget. The user lands on the canvas with template-default beats; the API response, when it arrives (2–8 seconds typically), patches each beat's scenes[0] with the LLM-generated `refinedPrompt`. This is the `applyDecomposition(clips, continuityBible)` action in `beat-graph-store`.

If the API call fails (502), the user is already on the canvas with template defaults — the demo continues. The error is logged to console in dev. The user is not interrupted with a toast. This is by design. The demo must *never* be blocked on API.

### 5.10 The "reveal" pattern

Generic reveal:

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: DURATIONS.standard, ease: EASE.out }}
>
  {children}
</motion.div>
```

Notes:
- `y: 8` (not 16, not 24). Subtle. The element rises a hair as it fades in. Larger values read as "slide-up CTA," which is cheap.
- `duration: DURATIONS.standard` (0.36s). Long enough to register, short enough not to feel sluggish.
- `ease: EASE.out` ([0.25, 1, 0.5, 1]). Fast-out, slow-in — the element decelerates into place. This is the cinematic ease; everything snaps in then settles.

Avoid `y: 24` reveals. Avoid `scale: 0.9 → 1` reveals (they read as "pop", which is generic). Avoid `rotate: 5 → 0` reveals (they read as glitch-art).

### 5.11 The "acknowledge" pattern

A button press:

```tsx
<motion.button
  whileTap={{ scale: 0.96 }}
  transition={SPRING.tight}
>
  Begin
</motion.button>
```

Notes:
- `scale: 0.96` (not 0.9, not 0.95). The press is *barely* perceptible. Anything more reads as "iPad app for kids."
- `SPRING.tight` — the spring snaps back without overshoot. A bouncy spring on a button is wrong; bounce reads as "fun startup," and we are a film tool.

For chips that are toggleable (video-type chips on landing), the acknowledge gets a sister motion — when the chip becomes selected, it gets a brief ember flash + scale-up `1.0 → 1.04 → 1.0` over 240ms with `SPRING.bouncy`. The bouncy spring earns its place there because the toggle is a state change with semantic weight, and the bounce is the signal the chip locked in.

### 5.12 The "signal" pattern

A beat going from `pending` to `generating`:

```tsx
<motion.div
  animate={{
    boxShadow: status === 'generating'
      ? '0 0 0 2px var(--color-brand-ember), 0 0 24px 4px rgba(240, 168, 104, 0.45)'
      : '0 0 0 0px transparent, 0 0 0px 0px transparent'
  }}
  transition={{ duration: DURATIONS.cinematic, ease: EASE.expoOut }}
>
```

Notes:
- The duration is `cinematic` (0.6s), not `standard` (0.36s). State changes deserve a longer settle so the user has time to register the change.
- `EASE.expoOut` is the long-settle cubic-bezier. The glow ramps in slow, lingers, then settles. This reads as "ignition," not "click."

Signal motions can also use **secondary cues** — a subtle particle burst, a sound (Web Audio), a typewriter line in a status strip. Layering gives the state change weight; one cue alone often doesn't land.

### 5.13 The "bridge" pattern

Already covered in 5.9. The pattern in code:

```tsx
// /transition route
useEffect(() => {
  const tl = gsap.timeline({
    onComplete: () => navigate('/canvas')
  });
  tl.from('.starfield', { opacity: 0, scale: 0, duration: 0.4, ease: 'expo.out' });
  tl.to('.camera', { z: 0, duration: 0.8, ease: 'expo.inOut' }, 0.2);
  tl.from('.title', { opacity: 0, y: 16, duration: 0.5, ease: 'power2.out' }, 0.6);
  tl.to('.everything', { opacity: 0, duration: 0.3 }, 1.0);
  return () => { tl.kill(); };
}, []);
```

GSAP earns its place here because the timeline is a *fixed sequence* with multiple staggered tweens — Motion's variants are good at "this state to that state," but a precisely-timed multi-target sequence is GSAP's home turf. Don't reach for GSAP for component-level animations; do reach for it for showpiece sequences.

`tl.kill()` on unmount is mandatory. Without it, navigating away mid-bridge leaves the timeline running, which can fire the navigate twice or animate properties on unmounted nodes.

### 5.14 Why we didn't use Framer's `LazyMotion`

Motion's `LazyMotion` lets you tree-shake the animation features. We tested it and it shaved ~12KB gzipped. The cost was: the tree-shaking is feature-based ("domAnimation" vs "domMax"), and getting it wrong silently disables features. The savings didn't justify the operational risk. Full Motion is bundled.

If the bundle budget gets tight (currently ~203KB main gz, target 200KB), `LazyMotion` is a card to play. It's not the first card.

### 5.15 GSAP scope: showpiece-only

GSAP is for the bridge transition and the headline animation only. Everything else is Motion. The reasoning:
- GSAP's API is imperative (`tl.to`, `tl.from`); fits showpiece sequences with precise timing.
- Motion's API is declarative (`animate={{ x: 0 }}`); fits component lifecycle.
- Mixing them in the same component is the path to madness.

If you find yourself using GSAP for a component-level animation, reach for Motion instead. If you find yourself using Motion for a precisely-timed showpiece sequence with five+ staggered tweens, reach for GSAP.

### 5.16 The `useScrollVelocity` hook

There's a custom `useScrollVelocity` hook in `lib/use-scroll-velocity.ts`. It accumulates wheel/touch deltas, decays exponentially, and exposes a `velocityRef`. It's used by `<AmbientParticles>` to read scroll velocity each frame (no React re-render — `velocityRef.current` is mutated outside React).

The pattern is generic: any animation that needs to react to scroll without forcing component re-renders should use a `velocityRef` pattern. Set the value with a side-effect (event listener, RAF), read it inside `useFrame` (R3F) or another RAF-driven hook.

Anti-pattern: storing scroll velocity in component state (`useState`). Triggers a re-render every event tick. Catastrophic for performance.

### 5.17 Layout animation (`layout` prop)

Motion's `layout` prop animates the element when its position/size changes due to layout (re-render with different geometry). Common use: a chip row that adds/removes chips, where existing chips slide to their new positions.

```tsx
{chips.map(chip => (
  <motion.div key={chip.id} layout transition={{ ...SPRING.soft }}>
    {chip.label}
  </motion.div>
))}
```

`layout` is cheap when you have a few items, expensive when you have hundreds. On this app, the only place we use it is the chip row on landing (six chips). Don't reach for it on long lists.

### 5.18 The "no decoration motion" audit

Before each commit, do a "decoration motion" scan. Open the app, sit on each route for 10 seconds, and ask: is anything moving that doesn't need to be? Common offenders:

- A "AI active" pulse on a status dot when nothing is actually happening (the loop says "we're alive!" but it's noise).
- A subtle scale-on-hover on a non-interactive element (the eye registers it, the action doesn't satisfy the expectation).
- An infinite gradient sweep on a button background (looks fancy, says "marketing landing").

Delete them. The product is cinematically restrained. Decorative motion is the antithesis.

### 5.19 What an "earned" animation looks like

A real example from the build: when a beat transitions from `generating` to `preview`, the node mesh emits a brief ember flash, the URL strip's tail typewrites the new clip ID, and a soft Web Audio cue plays. Three layered cues, each individually subtle, together they communicate "the clip is ready." That's earned.

Another: when the user types in the agent input, the input glows ember at the focus ring, the placeholder eases out, and the cursor tabular-nums-counts the character count under the input as a hairline at 5%. That's earned (focus state is a real semantic signal).

Anti-example: when the user lands on the canvas, every beat node pulses on a 2-second cycle "to draw attention." That's decoration. It made the canvas feel like a video game. Removed.

### 5.20 The `usePrefersReducedMotion` matchMedia bridge

For animations outside Motion's pipeline (R3F useFrame, GSAP timelines, CSS keyframes you have JS control over), you need a manual bridge to `prefers-reduced-motion`:

```ts
// src/lib/use-prefers-reduced-motion.ts
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

Used in:
- `<TextSplitter>` — bypasses per-char animation, renders the text.
- `<AmbientParticles>` — sets velocity to 0, particles drift but don't react to scroll.
- `<NodeMesh>`'s breathing scale — sets the scale to a static value.
- The bridge GSAP timeline — collapses to a 0.2s opacity fade with no camera move.

Use it generously. Reduced motion is not a checkbox; it is a parallel design.

---

## PART 6 — LAYOUT PATTERNS

### 6.1 The 12-column off-axis grid

Default web grids are centered: container with max-width, content centered horizontally. This reads as "blog" or "marketing site." The cinematic register is **off-axis**: the content sits at column 2-of-12 or column 8-of-12, not column 4-through-9. The asymmetry is what makes the page feel composed, not "wrapped."

The application:

- Landing route: the headline sits at columns 2-7 (left-biased). The video-type chips sit at columns 2-7 (aligned with the headline). The "begin" CTA sits at column 8-10 (right-biased). The asymmetry creates a left-to-right reading rhythm.
- Drawer: the drawer is offset slightly from the right edge — `right-6` on desktop, not `right-0`. The 24px gutter is the off-axis cue.
- Final delivery: the video player sits at columns 3-10; the metadata column sits at 1-2 (label) and 11-12 (action). The video is slightly left-biased to leave the right column for the "make another" CTA.

Off-axis is a vibe-check. There's no formula. The vibe-check is: does the page feel composed (intentional whitespace asymmetry) or wrapped (everything centered)? If the latter, push something off-axis.

### 6.2 The anchor + counterweight rule

Every screen has one **anchor** (the dominant visual element) and one **counterweight** (the secondary element that balances the anchor). The anchor is usually large and biased to one side; the counterweight is small and biased to the opposite side.

Examples:
- Landing: anchor = headline (left); counterweight = ambient orb (right, offset down).
- Canvas: anchor = beat-map (centered); counterweight = persistent URL strip (bottom, full-width but visually thin).
- Drawer: anchor = drawer panel (right); counterweight = the canvas behind the dimmer (left, dimmed).
- Final: anchor = video player (centered); counterweight = "make another" CTA (top-right corner).

A screen with only an anchor reads as "centered hero." A screen with anchor + counterweight reads as "composed." Find the counterweight.

### 6.3 Bottom-sheet vs side-drawer

The drawer has two presentations based on viewport:

- **Side drawer**: desktop (≥768px). Slides in from the right edge. Width: `min(36rem, 90vw)`. Content scrolls within the drawer; the canvas stays interactive behind the dimmer.
- **Bottom sheet**: mobile (<768px). Slides up from the bottom. Height: `min(85vh, 70rem)`. The canvas is occluded; the user is "fully in the drawer." A drag handle at the top suggests dismissal.

The cutoff at 768px is the smallest viewport at which a 36rem-wide drawer (576px) fits with a 192px canvas slice — barely enough to be useful. Below that, the slice would be unusable, so the drawer takes over the screen.

Implementation: Radix `<Dialog>` for both, with conditional `className` based on a `useMediaQuery('(min-width: 768px)')`.

### 6.4 The stage indicator

A persistent strip at the top of every route that shows the current step in the four-stage flow:

`Concept · Plan · Beats · Cinematic`

- `Concept` — landing route. The user is conceiving the prompt.
- `Plan` — transition route. The plan is decomposing.
- `Beats` — canvas route. The user is working on beats.
- `Cinematic` — final route. The cinematic is delivered.

The current stage is bolded; the others are dim. The strip lives at the top center of the viewport, in `text-overline` register, with `0.18em` tracking. It is the user's "where am I in this product" anchor.

Why it's persistent: judges may scroll, switch tabs, come back. They need an instant cue. The stage indicator is that cue. (See Part 18 for more on premium chrome.)

### 6.5 Always-visible URL strip

The persistent `fl_splice` URL strip lives at the bottom of the canvas route, always visible, regardless of whether the stitch tray is open. As beats approve, the URL composes itself live — the new clip ID typewrites in, with an ember afterglow.

This is mandated by VIABILITY §5 V2: the Cloudinary track-hero feature must NOT be gated by the user opening the stitch tray. Judges see the URL composing itself in real time as beats approve, even if they never click anything.

The implementation:
- `<PersistentUrlStrip>` reads `selectApprovedClipPublicIds` from the store via `useShallow` (critical — see Part 12).
- `buildSpliceUrlSegments(approvedIds)` returns `{base, middle, tail}` where `tail` is the most recently added segment.
- When `approvedIds.length` grows, a `revealKey` increments, triggering the `<TextSplitter>` to type-on the tail with `STAGGER.tight`.
- A 1000ms timer resets `shouldType` so subsequent re-renders don't re-trigger the animation.

### 6.6 Letterbox bars

The header on every route is a 21:9-flavored letterbox bar — the height is `48px` on desktop, `40px` on mobile. The bar is `bg-bg-base` solid (not glass). It contains:
- Left: project mark (Fraunces "SceneOS" at 14px, or a small geometric mark).
- Center: stage indicator.
- Right: command palette trigger (⌘K), mute toggle, mock-mode chip.

The bar is *not* sticky on the canvas route (it would compete with the 3D scene). It is sticky everywhere else. The sticky behavior is a media query — `sticky top-0 md:sticky max-md:relative` or similar.

### 6.7 Margin and padding rhythm

We use a tight 4px-rooted spacing scale (Tailwind defaults: `1` = 4px, `2` = 8px, `4` = 16px, `6` = 24px, `8` = 32px, `12` = 48px, `16` = 64px, `24` = 96px). The cinematic register uses **larger** vertical rhythm than the web default — section spacing of 96–128px (`py-24` to `py-32`), not the SaaS-default 48–64px.

The rule: when a section feels cramped, double the vertical padding before tightening the type. Cinematic pages breathe.

The exception: the canvas. The canvas has no padding — it's full-bleed. Padding lives on the chrome (header, drawer, URL strip), not on the content.

### 6.8 Z-index ladder

The z-index ladder, locked:

```
z-0       — canvas content (R3F root)
z-10      — persistent URL strip
z-15      — film grain overlay
z-20      — stage indicator
z-30      — letterbox header
z-40      — drawer
z-50      — modal (rare; we prefer drawer)
z-60      — toast (sonner mount)
z-70      — command palette (cmdk)
z-80      — cinematic cursor
z-90      — reserved for emergency overlays
z-100+    — banned
```

The film grain at z-15 is intentional: it sits *below* the stage indicator and chrome, so chrome reads cleanly, but *above* the canvas, so it adds texture to the 3D content. I had it at z-9999 for one commit — the user noticed grain bleeding onto the drawer. Dropped to z-15.

### 6.9 The 100vh trap on iOS

Mobile Safari's `100vh` includes the URL bar, which collapses on scroll. So `min-h-screen` (which is `min-h: 100vh`) overshoots, and content is pushed below the fold initially.

The fix: `min-h-[100svh]` (small viewport height). `svh` is the viewport height *with* the browser chrome, so it's stable across the URL-bar collapse. Universally supported on iOS 15.4+.

Use `100svh` on:
- Landing route's wrapper
- Final route's wrapper
- Any route that's "page tall"

Use `100dvh` (dynamic viewport height) only when you want the layout to respond to URL-bar collapse (rare; usually `svh` is what you want).

### 6.10 The 100lvh fallback

For browsers without `svh` support (rare in 2026): fall back to `100vh`. CSS lets you stack:

```css
min-height: 100vh;
min-height: 100svh;
```

The second declaration is used if supported, ignored if not. Tailwind's `min-h-[100svh]` does NOT compile this fallback — you need to write the CSS by hand or use a `@supports` rule. We've punted on this; >99% of iOS users are on 15.4+, and Android Chrome had `svh` on day one.

### 6.11 The "chrome stack on mobile" pattern

On mobile (<768px), the chrome (letterbox header, stage indicator, mock chip, persistent URL strip) gets dense. The pattern is to stack:

- Letterbox header (top) — collapses to 40px, just project mark + ⌘K.
- Stage indicator — drops to 11px, sits below the header.
- Mock chip — moves into the header's right slot.
- Persistent URL strip — stays at the bottom, collapses to clip-ID-only display (drops the `…/upload/` prefix).

The mobile compaction is heavy. The desktop has more breathing room because real estate allows. Don't try to make mobile "look like desktop" — design for mobile separately.

### 6.12 Container queries for the drawer

The drawer's interior (conversation, generation panel, controls) has its own breakpoints based on the drawer's width, not the viewport. This is what container queries are for.

```tsx
<div className="@container">
  <div className="@md:grid-cols-2 grid grid-cols-1 gap-4">
    {/* layout adapts to drawer width, not viewport */}
  </div>
</div>
```

Tailwind v4 has container query support out of the box. Use it for any nested layout that adapts to container size, not viewport. The drawer is the canonical case; the stitch tray is another.

### 6.13 The "no horizontal scroll" rule

Horizontal scroll is allowed only in **explicitly horizontal lists**: the stitch tray's clip thumbnail row, the chip row on landing (if it overflows the row's width). Everywhere else, horizontal scroll is a bug.

The audit: at every breakpoint (320, 360, 414, 768, 1024, 1440, 1920), confirm the page does not horizontal-scroll. Common culprits:

- A `min-w-` on a container that exceeds the viewport at small sizes.
- A `whitespace-nowrap` on a string that's longer than the viewport — should be `truncate` instead.
- A `grid-cols-N` with too many cols and not enough min-width on cells — should use `auto-fit` or reduce cols at the breakpoint.

Fix mode for the chip row that *does* scroll horizontally: set `style={{ touchAction: "pan-y" }}` on the container. Without it, vertical page scroll on the row is blocked because the browser interprets the touch as a horizontal pan attempt. Real bug, real fix, shipped.

### 6.14 Safe areas (iOS notch / home indicator)

On iOS with a notch, the safe area insets matter. Use `env(safe-area-inset-*)`:

```css
padding-top: max(env(safe-area-inset-top), 12px);
padding-bottom: max(env(safe-area-inset-bottom), 16px);
```

Tailwind v4 has `pt-safe` / `pb-safe` utilities (custom; we defined them in `tailwind.config`). Apply to:
- Letterbox header (top safe-area)
- Persistent URL strip (bottom safe-area, so it doesn't collide with the home indicator)
- Drawer's bottom-sheet variant (bottom safe-area)

The cost is near-zero; the benefit is the chrome doesn't feel "cropped" on iPhone.

### 6.15 Touch targets: 44pt minimum

Apple's HIG mandates 44×44pt minimum touch targets. Material Design says 48dp. Either way, every interactive element on mobile must be at least 44px in its smallest dimension.

Common offenders:
- A 24px close-icon button — too small. Wrap in a 44×44 hit area: `<button className="grid h-11 w-11 place-items-center"><X size={16} /></button>`.
- A chip row with `py-1` — too thin. Bump to `py-2` (32px total height) plus internal padding to hit 44.
- A copy button at 28px — too small. The fix on the URL strip was `h-7 w-7` which is 28px — strictly speaking under-spec, but the surrounding strip is 36px tall and the click area extends; we accept it.

Audit at `360x780` — that's the canonical small mobile viewport. Tap every interactive element with a fingertip-sized cursor; if you struggle, the target's too small.

### 6.16 The "no fixed header on canvas" rule

The 3D canvas route does not have a sticky letterbox header. The header on `/canvas` is `relative` (or technically `absolute` at top, but it doesn't pin on scroll). The reasoning:

- The canvas is a 3D scene. A pinned UI bar over it reads as "two products" — the 3D thing and the chrome on top.
- The user scrolls within the drawer, not within the canvas. The canvas is fixed-viewport.
- The stage indicator and persistent URL strip are pinned, but they're thin enough not to compete.

If you want a header on the canvas route that pins, put it inside the drawer instead. The drawer's header pins naturally.

### 6.17 The "letterbox treatment" on final route

The final-delivery route uses an aggressive letterbox treatment: black bars top and bottom, video at 21:9 aspect, metadata sidebars at top-left (clip ID) and top-right ("make another" + download). This is the cinematic register at maximum — the user is *in* the cinema.

The bars are not gimmicky; they're functional. The Cloudinary stitched video is 16:9, but the visual frame is letterboxed to 21:9, and the bars are where the chrome lives. The video itself stays uncropped.

```tsx
<div className="relative aspect-[21/9] w-full bg-bg-base">
  <video className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full aspect-video" />
  <div className="absolute inset-0 pointer-events-none">{/* metadata chrome */}</div>
</div>
```

This is one place where a SaaS-flavored "video player with controls below" would be wrong. The cinema register demands letterbox.

### 6.18 The "drawer covers half the viewport" cap

The drawer's max width is `min(36rem, 90vw)`. The 36rem (576px) is the upper bound; the 90vw is the responsive cap. On a 1920px monitor, the drawer is 576px (30% of viewport). On a 1024px laptop, 576px (56%). On a 768px tablet (just above the bottom-sheet cutoff), 576px (75%) — uncomfortable but the fallback is bottom sheet at <768px.

Why 36rem and not 32 or 40: 36rem holds the conversation comfortably with a 60-character measure (the editorial sweet spot for body), plus the input + CTA below. 32rem cramped the conversation; 40rem felt like a mini-app. 36rem is the survivor.

### 6.19 The grid for the canvas route

The canvas route's layout is full-bleed with overlay chrome:

```tsx
<div className="relative h-[100svh] w-full overflow-hidden bg-bg-base">
  <BeatMap3D beats={beats} />                     {/* z-0, full-bleed */}
  <PersistentUrlStrip onOpenTray={...} />          {/* z-10, bottom */}
  <FilmGrain />                                    {/* z-15 */}
  <StageIndicator current="beats" />               {/* z-20, top center */}
  <Header />                                        {/* z-30, top */}
  <NodeDetailDrawer beat={activeBeat} />            {/* z-40, right edge */}
</div>
```

The structure is: one full-bleed canvas + multiple overlay layers, each at its z-tier. There is no flex/grid layout on the route itself; layout is "absolute positioning at the chrome layer."

### 6.20 The "two-up" preview pattern

When the user has a generated clip and the agent wants to confirm, the drawer shows a "two-up" preview: the current generated clip on the left, a pending re-roll preview on the right (if regenerating). Both are at the same aspect ratio (16:9), separated by a 1px hairline.

This pattern was inspired by film editing software (Final Cut's source/program two-up). It reads as "you're editing a film," not "you're choosing between two AI options." The cinematic register matters even at the layout level.

---

## PART 7 — REDUCED MOTION AS A PARALLEL DESIGN

### 7.1 The principle

`prefers-reduced-motion: reduce` is set by users with vestibular disorders, certain cognitive disabilities, or just personal preference. When set, the system is telling you: *animations are not benign for me*. The correct response is not "tone down animation"; it is "design a parallel, animation-light experience."

The treat-it-as-a-checkbox failure mode: developers wrap one `motion.div` with `useReducedMotion` and call it a day, while the rest of the app — R3F shaders, GSAP timelines, CSS keyframes, autoplay video — continues to assault the user. That is a worse outcome than no animation at all because the user thinks they've turned off motion and the app is gaslighting them.

The principle: **every animation has a `prefers-reduced-motion` branch**, even the ones you don't think of as animation (autoplay video, parallax, scroll-linked transforms, R3F idle drift, ambient particles, atmosphere shell breathing).

### 7.2 The two bridges

There are two reduced-motion bridges in this app:

1. **Motion library**: `<MotionConfig reducedMotion="user">` at App root. Honoured by every Motion `animate`, variants, AnimatePresence in the tree.
2. **Manual matchMedia hook**: `usePrefersReducedMotion()` (covered in Part 5.20). Used inside R3F components, GSAP timelines, CSS-keyframe-driven elements, and the autoplay video.

Anywhere you use `motion.X` from the Motion library, the first bridge handles it. Anywhere you use anything else, the second bridge is required.

### 7.3 R3F + reduced motion

R3F runs `useFrame` callbacks every frame. They drive camera lerp, mesh rotation, particle drift, shader uniform animation. If you don't gate them on reduced-motion, the canvas continues to animate on every frame even though the user asked for stillness.

The pattern:

```tsx
// inside a R3F component
const reduced = usePrefersReducedMotion();

useFrame((state) => {
  if (reduced) return;             // hard gate — no motion
  meshRef.current.rotation.y += 0.005;
  // shader uniforms, lerps, etc.
});
```

For animations that have a "static end-state" (e.g., camera lerps to a target), still run them — but skip the lerp and snap to the target:

```tsx
useFrame((state) => {
  if (reduced) {
    camera.position.copy(targetPosition);
    return;
  }
  camera.position.lerp(targetPosition, 0.06);
});
```

This is the pattern: reduced-motion = hard gate on idle motion, snap-to-target on goal-directed motion.

### 7.4 GSAP + reduced motion

The bridge timeline (landing → canvas via /transition) uses GSAP. If reduced-motion is set, the entire timeline collapses to a 0.2s opacity fade with no camera move, no starfield expansion, no headline typewriter:

```tsx
useEffect(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    const tl = gsap.timeline({ onComplete: () => navigate('/canvas') });
    tl.to('.everything', { opacity: 0, duration: 0.2 });
    return () => tl.kill();
  }
  // full bridge timeline...
}, []);
```

The collapsed version still navigates after 0.2s, so the user lands on the canvas — just without the cinematic flourish.

### 7.5 CSS keyframe + reduced motion

CSS animations need a `@media (prefers-reduced-motion: reduce)` block:

```css
.ambient-pulse {
  animation: pulse 2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ambient-pulse {
    animation: none;
  }
}
```

In Tailwind v4, this can be done with the `motion-safe:` and `motion-reduce:` variants:

```html
<div className="motion-safe:animate-pulse motion-reduce:opacity-100" />
```

Use `motion-reduce:` to define the reduced-motion fallback explicitly. Don't rely on `motion-safe:` alone — the user's experience without `motion-safe:` (which is "no motion class applied") might leave the element in an undefined state.

### 7.6 Autoplay video + reduced motion

The final-delivery route autoplays the cinematic preview thumbnail. Under reduced motion, autoplay is disabled — the video stays paused with a play button overlay.

```tsx
const reduced = usePrefersReducedMotion();

<video
  src={thumbnailUrl}
  autoPlay={!reduced}
  muted
  loop={!reduced}
  playsInline
  ref={videoRef}
/>
```

If you don't gate this, the user with reduced-motion still gets a looping autoplay video — exactly the kind of motion they asked to avoid.

### 7.7 The "reduced motion" demo flag

I built a query parameter override during development: `?rm=1` forces reduced-motion regardless of system preference. Useful for QA — you don't have to dig into OS settings to test the parallel design.

```ts
const reduced = useMemo(() => {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('rm') === '1') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}, []);
```

Hidden behind dev mode in production. But invaluable during builds.

### 7.8 The audit checklist

Before each release, run the reduced-motion audit:

1. Set OS to reduced-motion (or `?rm=1`).
2. Walk every route. Sit on each for 10 seconds.
3. Look for:
   - Anything moving on idle (particles, breathing, pulse).
   - Anything that animates on hover (it's tempting to leave hover scales — but they should be instant or removed).
   - Autoplay anything (video, audio, looping animation).
   - Scroll-linked transforms (parallax, sticky-grow, scroll-velocity reactions).
   - Long bridge transitions (route swaps, drawer slides — should be near-instant or simple fade).
4. For each thing that moves: is it gated? If not, gate it.

The audit takes ten minutes. It catches ~five regressions per major build. It is non-negotiable.

### 7.9 What "reduced motion" is *not*

Reduced motion is not an opt-out for animation. It is an opt-in to a parallel design. The parallel design should still feel premium. It should still hit the cinematic register. It should not feel "stripped down."

The way to achieve that: lean harder on the static elements. The typography, the color, the layout — these don't move and they carry the register. With motion off, the static elements have to do all the work; if they were doing decorative work in the motion-on version, they will fail the reduced-motion test.

This is a quality-of-life filter on the design itself: if the page is dependent on motion for its premium feel, the page is fragile. The cinematic register should hold even without motion. Test it; if it fails, the static design is the bug.

### 7.10 Reduced motion and the three winning moments

Of the three winning moments:

1. **Landing → canvas portal**: under reduced motion, this collapses to a 0.2s fade. The portal *is* the motion. The user experience is significantly diminished — but they asked for it.
2. **3D star-map first reveal**: under reduced motion, beats appear all at once, no ambient drift, no breathing. The composition still works (5 nodes laid out on a curve, ember palette, hairline path). The reveal lacks drama, but the picture is intact.
3. **Persistent URL strip**: under reduced motion, the new tail appears (no typewriter), no afterglow. The URL still composes itself; the user can copy it. Functionally equal.

The principle: reduced motion shouldn't break the demo. It should diminish the showpiece while keeping function. Test it.

---

## PART 8 — R3F / WEBGL DISCIPLINE

### 8.1 Why R3F earns its place

3D in a hackathon is risky — frame rate issues, mobile WebGL bugs, asset loading. The reason R3F earns its place here: it *is* one of the three winning moments. A 2D canvas (e.g., a Reactflow node graph) would not land the "Tesla / Nolan" register. The 3D star-map is the visual hook.

The discipline is: keep R3F surface area small. Don't reach for it for "fancy hover effects." Use it for the canvas route's centerpiece and nothing else.

### 8.2 The component structure

```
<BeatMap3D>
  <Canvas>
    <ResponsiveCamera />
    <ConnectingPath />
    <NodeMesh />[]
    <AmbientParticles />
    <CameraRig />
    {/* postprocessing — REMOVED, see 8.7 */}
  </Canvas>
</BeatMap3D>
```

Each component has a single concern:
- `<ResponsiveCamera>` — adjusts camera FOV and position based on viewport aspect.
- `<ConnectingPath>` — the dashed-flow line threading the beat positions.
- `<NodeMesh>` — a single beat: core sphere + atmosphere shells + holographic active overlay + Sparkles.
- `<AmbientParticles>` — drift particles affected by scroll velocity.
- `<CameraRig>` — orbit/dive logic, replaces `OrbitControls`.

This separation is deliberate. The components are independently testable. Each commits its R3F resources to the scene without coordinating with siblings.

### 8.3 ResponsiveCamera

The bug it fixes: portrait viewports (aspect < 1) collapse the horizontal frustum, slicing off outer beat nodes. The default 42° vertical FOV gives a horizontal FOV that depends on aspect:

`horizontalFov = 2 * atan(tan(vfov/2) * aspect)`

At aspect = 0.46 (a 360×780 portrait phone), the 42° vfov collapses horizontal to ~20° — outer beats disappear. The fix is to widen the vfov + push the camera back inversely proportional to aspect:

```tsx
function ResponsiveCamera({ baseFov, baseZ }: { baseFov: number; baseZ: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const fov = aspect < 1 ? Math.min(72, baseFov / aspect) : baseFov;
    const z = aspect < 1 ? baseZ + (1 - aspect) * 4 : baseZ;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.position.z = z;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height, baseFov, baseZ]);
  return null;
}
```

This ran into a second bug (covered in 8.4): `CameraRig` was overriding the camera position every frame. Fixed by passing `overviewZ` as a prop.

### 8.4 The CameraRig overviewZ prop

`<CameraRig>` originally hardcoded `OVERVIEW_POS = (0, 0.4, 5.5)`. When a beat was un-selected, the rig lerped the camera to this constant. This silently overrode `<ResponsiveCamera>`'s adjustment — every frame, the rig moved the camera back to z=5.5, regardless of viewport.

The bug surfaced as: portrait phones still cropped outer beats, despite `<ResponsiveCamera>`. The fix:

```tsx
function CameraRig({ overviewZ, ... }: { overviewZ: number; ... }) {
  const overviewPos = useMemo(() => new THREE.Vector3(0, 0.4, overviewZ), [overviewZ]);
  // ...
}
```

`<BeatMap3D>` computes `cameraZ = 4 + Math.max(beats.length, 5) * 0.6` and passes it to both `<ResponsiveCamera>` (as `baseZ`) and `<CameraRig>` (as `overviewZ`). They agree now.

The lesson: **R3F components that lerp the camera each frame can silently override imperative setup elsewhere**. Always pass dynamic values as props; never hardcode positions.

### 8.5 Camera distance scales with beat count

Five beats fit comfortably at z=5.5. Twelve beats need z≈10.5 to keep the outer ones in frustum. Linear scaling:

```tsx
const cameraZ = 4 + Math.max(beats.length, 5) * 0.6;
```

The `Math.max(beats.length, 5)` clamps the floor — fewer than 5 beats still uses the 5-beat camera distance, so a sparse scene doesn't feel oddly close.

This is one of those numbers that took two iterations to nail. Original was `baseZ * (beatCount / 5)` — multiplicative — which scaled too aggressively at high beat counts. Linear (`base + beatCount * factor`) gave a more visually consistent result.

### 8.6 ACES filmic tone mapping

The tone mapping mode set on the GL renderer is `THREE.ACESFilmicToneMapping`. This is the cinema-industry-standard tone curve — it preserves color nuance in the shadow regions (which warm-near-black has a lot of) and rolls off bright highlights gracefully.

```tsx
<Canvas
  onCreated={({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }}
>
```

Without ACES, the default tone mapping (`NoToneMapping`) over-saturates the ember at bright values, clamping it toward white and making the orbs look "blown out." ACES is what keeps the ember warm even at peak luminance.

This was discovered when the user noticed the connecting path's ember dashes were rendering as white-ish. The fix was ACES; the secondary fix (covered in 8.7) was lowering the bloom threshold.

### 8.7 EffectComposer removed (the production crash)

Originally, the canvas had a postprocessing stack: `<EffectComposer>` wrapping `<Bloom>` + `<DepthOfField>` + `<Vignette>`. Under React 19 + R3F 9 + `@react-three/postprocessing` 3.0.4 (which wraps `postprocessing` 6.39.1), the composer pipeline reads `.alpha` on a render-target/material that is **null during the first commit**, crashing the canvas.

The crash signature: 
```
TypeError: Cannot read properties of null (reading 'alpha')
  at EffectMaterial.something (postprocessing.js)
```

It happens immediately on canvas mount. Subsequent commits don't crash, but the first commit always does — which means the canvas never renders.

The fix: remove `<EffectComposer>` entirely. The atmosphere shells (with their custom shader-driven glow) + the holographic active overlay + drei `<Sparkles>` carry the visual weight without postprocessing. The cinematic register holds; the canvas is shipped.

```tsx
{/* EffectComposer (Bloom + Vignette + DepthOfField) removed for proof
    of concept. Under React 19 + R3F 9 + @react-three/postprocessing
    3.0.4 wrapping postprocessing 6.39.1, the composer pipeline reads
    `.alpha` on a render-target/material that's null during the first
    commit, crashing the canvas. The nodes themselves render fine
    without it — atmosphere shells, holographic overlay on active,
    and Sparkles already give the scene visual weight. Re-introduce
    postprocess after the pipeline (Veo + stitch + delivery) is
    verified end-to-end. */}
```

This comment is in `beat-map-3d.tsx` and should remain there until the bug is fixed upstream or the dependency versions update.

The lesson: **third-party R3F postprocessing libraries are fragile under React 19 / R3F 9**. If you add postprocessing back, isolate it behind an error boundary that disables it on first mount failure — don't let a postprocessing crash kill the canvas.

### 8.8 The CanvasErrorBoundary

The canvas is wrapped in a `<CanvasErrorBoundary>` class component:

```tsx
export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.error('Canvas crash:', error);
    // optional: report to telemetry
  }
  render() {
    if (this.state.hasError) {
      return <CanvasFallback />;  // 2D star-map SVG fallback
    }
    return this.props.children;
  }
}
```

If the canvas crashes (postprocessing, WebGL context loss, GLSL compile error), the user sees the 2D fallback — five hairline-stroked circles connected by a path, which still communicates "5 beats, click to interact." The drawer still works; the demo continues.

The CanvasErrorBoundary is in addition to the AppErrorBoundary at the root. The principle: **error boundaries are a tool for defending the demo**. The canvas, the agent, the audio — anything that might crash — gets its own boundary, so a single failure doesn't take down the route.

### 8.9 The atmosphere shell

Each beat node has an atmosphere shell — a slightly larger, semi-transparent sphere wrapping the core sphere, with a custom shader that creates a fresnel-like glow. The shell is what makes the beat read as "luminous" rather than "a sphere with emissive."

The shell is at scale 1.4× the core. Originally it was 1.6×; the user noted the shells were touching at the canvas's tighter beat positions. Dropped to 1.4×. At 1.4×, neighboring shells overlap subtly, which reads as "atmospheres mingling," which is desirable.

The shader:

```glsl
// fragment
varying vec3 vNormal;
varying vec3 vViewDir;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0);
  vec3 color = uColor * (fresnel * uIntensity + 0.05);
  gl_FragColor = vec4(color, fresnel * uOpacity);
}
```

The fresnel calculation gives the shell a "glow at the silhouette" look — bright at the edge, dim at the center. This is what real atmospheres look like in space — Earth from orbit has the bright limb against the dark center.

The opacity cap is 0.65 (was originally 0.95 — clamped to white under bloom; dropped). The falloff exponent is 2.0 (was 1.0 — too soft; 2.0 gives a tighter limb). Internal radius (where fresnel hits zero) is 3.8 (was 4.5 — too much glow leaking inward).

### 8.10 The holographic active overlay

When a beat is the activeBeatId, an additional shader sphere wraps the core: the holographic overlay. It's a procedural noise pattern animated over a fresnel-multiplied gradient — looks like holographic interference.

```glsl
// fragment, simplified
varying vec3 vNormal;
varying vec3 vPosition;
uniform float uTime;
uniform vec3 uColor;

void main() {
  float fresnel = pow(1.0 - abs(dot(vNormal, normalize(-vPosition))), 1.5);
  float noise = sin(vPosition.x * 12.0 + uTime * 1.5)
              * sin(vPosition.y * 10.0 + uTime * 0.8)
              * 0.5 + 0.5;
  float alpha = fresnel * 0.4 + noise * fresnel * 0.3;
  gl_FragColor = vec4(uColor, alpha);
}
```

The overlay activates on `activeBeatId === beat.beatId`. It's the visual signal "this beat has the camera." Without it, an active beat would just be "the beat the camera dollied to," which doesn't carry over when the user looks away.

### 8.11 Sparkles only on active

The drei `<Sparkles>` component is used on the active beat only. Not on idle beats. Not on the empty space. Only the active beat gets sparkles.

The reason: sparkles everywhere = "AI product fluff." Sparkles on the active = "this beat is alive." Same component, different message. The semantic gating is what makes the difference.

```tsx
{isActive && (
  <Sparkles
    count={20}
    scale={0.8}
    size={2}
    color={moodColor}
    speed={0.4}
    opacity={0.7}
  />
)}
```

The `count={20}` is intentionally small. 100+ sparkles overwhelm; 20 reads as "subtle dust mote." The `speed={0.4}` is gentle; faster reads as "fairy dust."

### 8.12 Stars + Environment

The drei `<Stars>` component populates the deep background with a starfield. Parameters:

```tsx
<Stars radius={80} depth={40} count={1500} factor={3} saturation={0} fade speed={0.3} />
```

- `radius={80}`, `depth={40}` — the cube of space the stars fill. Big enough that the stars feel "out there," not "right there."
- `count={1500}` — generous but not noisy. 5000+ creates a dense field that competes with the beats.
- `factor={3}` — size multiplier; 3 makes the stars perceivable against the warm-near-black.
- `saturation={0}` — pure white. Coloured stars compete with the ember.
- `fade` — fades stars at the rim. Avoids the "hard edge of the star sphere."
- `speed={0.3}` — gentle parallax-like drift. Reduced-motion gates this to 0.

`<Environment preset="night" background={false} />` provides HDR reflections for the PBR core spheres. The `background={false}` keeps the explicit `<color attach="background">` warm-near-black; the HDR is reflections only.

### 8.13 The ConnectingPath

A single `THREE.Line2` with a custom shader that draws dashed flow segments along the path. The shader uses a `uTime`-driven offset so the dashes flow from beat to beat, signaling "the narrative moves left-to-right."

```glsl
// fragment, simplified
varying float vDistance;
uniform float uTime;
uniform float uDashSize;
uniform float uGapSize;
uniform vec3 uColor;

void main() {
  float pattern = mod(vDistance + uTime * 0.5, uDashSize + uGapSize);
  if (pattern > uDashSize) discard;
  gl_FragColor = vec4(uColor, 0.6);
}
```

The path uses `toneMapped: false` — without it, the bloom (when present) clamps the dashes to white. With ACES tone mapping the bloom is gone, but `toneMapped: false` is still defensive in case bloom returns.

The path's color is `fg-tertiary` (`#6b6359`), not ember. Ember dashes would compete with the beats. The dashes are structural — they communicate sequence — not accent.

### 8.14 The Ambient particles

`<AmbientParticles>` is a `THREE.Points` with a few hundred small particles drifting through the scene. The drift speed is modulated by `velocityRef.current` from the `useScrollVelocity` hook — when the user scrolls, particles fly faster, giving the canvas "scroll has weight."

```tsx
useFrame((state, delta) => {
  if (reduced) return;
  const velocity = velocityRef.current;
  particles.forEach((p, i) => {
    p.position.y += (0.1 + velocity * 0.5) * delta;
    if (p.position.y > 5) p.position.y = -5;  // wrap
  });
  geometry.attributes.position.needsUpdate = true;
});
```

The velocity is decayed by the hook (exponential decay), so the effect lasts for ~600ms after the scroll stops, giving a "particles still settling" cinematic feel. Without the decay, the effect would cut off abruptly when the user stops scrolling, breaking the illusion.

### 8.15 PBR lighting setup

The lighting is:
```tsx
<ambientLight intensity={0.6} />
<pointLight position={[2.5, 3, 5]} intensity={2.4} color="#f0a868" />   // warm key
<pointLight position={[-3, -1, 2]} intensity={1.0} color="#5e7080" />   // cool fill
```

A higher `intensity` on the ambient than the web norm (0.4) because the emissive on the core spheres carries most of the visible signal — ambient is what gives form. The warm key + cool fill is a 3-point lighting basics nod (with the rim being implicit from the atmosphere shell + Stars).

The warm key matches the ember palette; the cool fill matches the brand-cool. This keeps the lighting *narratively coherent* with the chrome palette, not a separate scene-lighting decision.

### 8.16 Mood-driven geometry

Each beat's `mood` field maps to subtle geometry differences on the core sphere:
- `tense` — slightly cylindrical (squished z-axis) — reads as "tightened"
- `tender` — slightly oblate (squished y-axis) — reads as "settled"
- `triumphant` — perfectly spherical, larger radius — reads as "expansive"
- `melancholic` — slightly oblate, dimmer emissive — reads as "muted"
- `mysterious` — irregular, mauve emissive (not ember) — reads as "off-canon"

These are small variations (5–10% deformation) — the user shouldn't consciously register the geometry difference, but the moods read as visually distinct at a glance.

### 8.17 No `OrbitControls`

`OrbitControls` is the default-drei "make it interactive" answer. We replaced it with `<CameraRig>` because:
- OrbitControls lets the user spin the camera — the cinematic register doesn't allow that. We want a *directed* camera, not a *navigatable* one.
- OrbitControls' default damping reads as "tech demo," not "film camera."
- We need camera transitions on click (dolly to a beat, return to overview) that OrbitControls doesn't support without hacks.

`<CameraRig>` reads the activeBeatId and hoveredBeatId, lerps the camera to a target each frame, and exits gracefully on un-select. The targets are computed:
- `activeBeatId` set: dolly to that beat (offset slightly closer than the beat itself, with a slight upward angle).
- `hoveredBeatId` set, no active: subtle parallax toward the hovered beat (camera leans).
- Neither: overview position (`(0, 0.4, overviewZ)`).

The lerp factor is 0.06 per frame (60fps = ~0.97 settle in 1 second). Faster reads as "snap"; slower reads as "drag." Survived testing.

### 8.18 GLSL ember-burn shader

There's a custom GLSL shader for the "burn-in" moment when a beat first appears (during the canvas reveal). It's a noise-driven mask that starts opaque and burns away from random points outward, revealing the beat:

```glsl
uniform float uProgress;  // 0 → 1
uniform sampler2D uNoise;

void main() {
  float noise = texture2D(uNoise, vUv * 4.0).r;
  if (noise > uProgress) discard;
  // ...
}
```

The progress is animated 0 → 1 over 800ms with `EASE.expoOut`. The result: the beat appears as if "burned into the canvas" — irregular ember edges, then full presence. Reads as "alchemy," which is the right register for "the AI is thinking and the beats are forming."

This is one place where a custom shader earned its keep — a generic fade-in would not have matched the cinematic register.

### 8.19 dpr capping

`dpr={[1, 1.75]}` — the `Canvas` renders between 1× and 1.75× device pixel ratio. Above 1.75 (e.g., on a Retina iPhone Pro at 3×), performance suffers. 1.75 is the sweet spot — sharp on high-DPR devices, fast on low-DPR.

```tsx
<Canvas dpr={[1, 1.75]} ...>
```

If you need to push higher fidelity, `dpr={[1, 2]}` is the next stop. Anything above 2 is overkill on a star-map of 5 nodes.

### 8.20 `gl: { antialias: true, powerPreference: "high-performance" }`

Antialias on (default off can be jagged on the atmosphere shell silhouettes). `powerPreference: 'high-performance'` requests the discrete GPU on dual-GPU devices (matters on MacBook Pro with iGPU + dGPU).

These two settings are cheap to set and meaningfully improve fidelity. They're at the `<Canvas>` props.

### 8.21 The "no `Suspense` around `<Canvas>` content" pattern

An anti-pattern: wrapping inner R3F components in `<Suspense>` to lazy-load assets. This is fine for textures (drei's `<Environment>` does it internally), but problematic for the components themselves — Suspense + Strict Mode + R3F's frame loop = the kind of edge-case crash that took us hours to debug last time.

Don't lazy-load R3F components inside `<Canvas>`. Lazy-load `<Canvas>` itself (the entire R3F bundle gets deferred until the canvas route is reached), but keep the inner tree synchronous.

### 8.22 The "destroy on unmount" rule

R3F generally cleans up its own resources, but custom shaders, textures, and geometries you create yourself need explicit `dispose()` on unmount:

```tsx
useEffect(() => {
  const geometry = new THREE.BufferGeometry();
  // ...
  return () => {
    geometry.dispose();
  };
}, []);
```

For shaders created via `THREE.ShaderMaterial`, the material instance has a `.dispose()`. For textures, same. For pure components using drei or built-in geometries, R3F handles it.

The leak surfaces as: the canvas works fine for the first navigation cycle, but after navigating to /canvas → /final → /canvas, FPS drops to single digits because hundreds of orphan WebGL resources accumulate. This is a real bug we hit and fixed by auditing custom resource lifecycles.

### 8.23 "Don't use `useFrame` to drive React state"

`useFrame` fires every frame (~60fps). If you call `setState` from inside it, you re-render every frame. Disaster.

Use refs for per-frame mutation:

```tsx
const ref = useRef<THREE.Mesh>(null);
useFrame(() => {
  if (!ref.current) return;
  ref.current.rotation.y += 0.005;  // no React state involved
});
```

For values you *do* need in React state (e.g., the current camera position to display in a debug overlay), throttle the state update via a `useRef` + `useEffect` with an interval, or just don't display it. State that ticks is rarely worth the cost.

### 8.24 Strict Mode and double-mount

React 18+ Strict Mode double-mounts components in dev. R3F's `<Canvas>` with custom resources can react badly — meshes get added twice, then one is unmounted, leaving the second.

The fix: write effect cleanups that idempotently remove resources, even if they were "already cleaned up." For most R3F primitives (`<mesh>`, `<line>`), this is automatic. For imperative additions to `useThree().scene`, write cleanup that calls `.remove(...)` and `.dispose()` on the items.

### 8.25 The "no useless useEffect" rule for camera setup

Don't `useEffect(() => camera.position.set(...))` — that runs once and the position can be overridden by other components (like CameraRig). Set the camera position via the `<Canvas>` prop:

```tsx
<Canvas camera={{ position: [0, 0.4, cameraZ], fov: 42 }}>
```

This is the initial position; CameraRig takes over from the first frame. The useEffect approach causes "the camera flickers to the position then snaps back" because both the useEffect and the rig fire on first frame.

### 8.26 The "cinematicCameraOffset" technique

When a beat is selected, the camera dollies to a position offset slightly above and behind the beat (not centered on it). The offset:

```ts
const target = new THREE.Vector3()
  .copy(beatPosition)
  .add(new THREE.Vector3(0, 0.4, 0.4));   // slightly up + slightly back from camera
```

This offset replicates a film camera's "shoulder shot" framing — not a centered close-up. Reads as cinematic; centered close-up reads as profile-photo.

The lerp target is this `target`, not the `beatPosition` directly. The beat is then 80% of the frame, top-half of the composition, which is the rule of thirds for cinematic framing.

### 8.27 The "pulse on approve" cue

When a beat is approved, the node mesh emits a brief pulse — emissive intensity ramps from baseline (0.95) to peak (2.5) over 200ms, then settles back over 600ms. The total cue is 800ms.

```tsx
useFrame((state, delta) => {
  const targetEmissive = approvalPulse.current
    ? lerp(approvalPulse.current.peak, baseline, approvalPulse.current.t)
    : baseline;
  material.emissiveIntensity = lerp(material.emissiveIntensity, targetEmissive, 0.1);
});
```

Combined with the URL strip's typewriter and the optional Web Audio cue, the approve action gets layered feedback. Layered = cinematic. Single cue = generic.

### 8.28 "Don't add fog"

`<fog>` in R3F adds atmospheric depth haze. We don't use it. The atmosphere shells already give depth via the fresnel; adding scene-level fog washes everything to gray and competes with the warm-near-black background.

If you find yourself reaching for `<fog>` to "add depth," step back. The depth is already there from: (a) the camera's z-recession layout of beats, (b) the atmosphere shells, (c) the Stars at deep z, (d) the ConnectingPath threading depth. Fog is the wrong tool.

---

## PART 9 — SHADER CATALOGUE

### 9.1 FakeGlowMaterial

A glow material that doesn't require postprocessing. Implements a fresnel-driven additive blend — bright at the silhouette, transparent at the center, additively blended so it stacks with whatever's behind:

```glsl
// vertex
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}

// fragment
varying vec3 vNormal;
varying vec3 vViewPosition;
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), uPower);
  gl_FragColor = vec4(uColor * uIntensity, fresnel);
}
```

`blending: THREE.AdditiveBlending`, `transparent: true`, `depthWrite: false`. Used for: the atmosphere shells, the active overlay glow, the orbital rings around hovered beats.

`uPower` tunes the falloff steepness — 1.0 is gentle, 4.0 is tight rim. The atmosphere shells use 2.0; the active overlay uses 1.5.

### 9.2 HolographicMaterial

The active beat's overlay. Procedural noise + fresnel + time-driven phase shift:

```glsl
uniform float uTime;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 1.5);
  float lines = sin(vPosition.y * 50.0 + uTime * 3.0) * 0.5 + 0.5;
  lines = smoothstep(0.4, 0.6, lines);
  float alpha = fresnel * (0.3 + lines * 0.4);
  gl_FragColor = vec4(uColor, alpha);
}
```

`lines` creates the horizontal scan-line interference pattern. Frequency 50 (the multiplier on `vPosition.y`) and time speed 3.0 read as "data-readout" — fast enough to feel alive, slow enough to not strobe.

### 9.3 The connecting-path dashed-flow shader

Already in 8.13. Key parameters:
- `uDashSize`: 0.08 (dash length in path-space units)
- `uGapSize`: 0.04 (gap length, half the dash for "more dash than gap")
- `uTime * 0.5`: flow speed; slower than the holographic scan lines because the path is a structural element, not a status one.

The path is a single line geometry, sampled along — `vDistance` in the fragment is the path-space coordinate, computed in the vertex shader from a precomputed lookup texture. (drei's `<Line>` doesn't expose this, so we wrote a thin custom Line2.)

### 9.4 The ember-burn reveal shader

Already in 8.18. Key:
- `uProgress` is a uniform animated 0 → 1 over 800ms.
- `uNoise` is a 256×256 grayscale noise texture (precomputed at module load).
- Discard pattern: `if (noise > progress) discard` — the lower-noise pixels appear first, building a fractal burn-in.

To prevent the discard cliff (which can read as banded), we soft-mask the edges:

```glsl
float edge = smoothstep(uProgress - 0.05, uProgress + 0.05, 1.0 - noise);
if (edge < 0.01) discard;
gl_FragColor = vec4(color, edge);
```

The 0.05 smoothstep width gives a 5% soft transition — enough to feel organic, not enough to muddle the reveal.

### 9.5 The fresnel formula references

For the next agent:

- **Standard fresnel**: `pow(1 - dot(N, V), power)` — N is normal, V is view direction. Higher power = tighter rim glow.
- **Schlick approximation**: `F0 + (1 - F0) * pow(1 - dot(N, V), 5)` — physically-based, used in PBR. We use this on the core spheres for material-correct rim light.
- **Inverse fresnel** (for "X-ray" interior glow): `pow(abs(dot(N, V)), power)` — bright in center, dim at edge. Used for the atmospheres' core hint.

Memorize the standard fresnel; it's the workhorse.

### 9.6 Time-based modulation

The active overlay's `uTime` is incremented in `useFrame`:

```tsx
useFrame((state, delta) => {
  if (reduced) return;
  material.uniforms.uTime.value += delta;
});
```

`delta` (seconds since last frame) is the right increment, not a fixed value. With a fixed value, frame rate drops cause the animation to slow visibly; with `delta`, frame rate independence is automatic.

For animations that need a fixed period regardless of frame rate, use `state.clock.elapsedTime` instead (R3F's clock).

### 9.7 The "warm-tint" multiply pattern

For shaders where you want the output to feel warm-tinted regardless of input color, multiply the final color by the ember palette:

```glsl
vec3 warmTint = vec3(1.05, 0.98, 0.92);  // subtly warm
gl_FragColor.rgb *= warmTint;
```

This is a per-shader equivalent of color-grading. The atmosphere shells and the holographic overlay both use a subtle warm tint. It's the GLSL version of "warm-near-black."

### 9.8 The "quality knob" uniform

A `uQuality` uniform on the atmosphere shell shader lets us scale down at small viewports (mobile):

```glsl
uniform float uQuality;  // 0.5 on mobile, 1.0 on desktop

void main() {
  float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0 * uQuality);
  // less aggressive falloff on mobile = lower-fidelity but cheaper
}
```

Set in the component:
```tsx
const isMobile = useMediaQuery('(max-width: 767px)');
material.uniforms.uQuality.value = isMobile ? 0.5 : 1.0;
```

Cuts shader cost in half on mobile without dropping the visual completely.

### 9.9 "Don't compile shaders mid-frame"

Compiling a `THREE.ShaderMaterial` with new GLSL code is expensive (~10-100ms). If you do it during animation, you'll drop frames. Compile materials at component mount; mutate uniforms each frame.

```tsx
// good
const material = useMemo(() => new THREE.ShaderMaterial({ ... }), []);
useFrame(() => { material.uniforms.uTime.value += delta; });

// bad
useFrame((state) => {
  const material = new THREE.ShaderMaterial({ ... });  // recompiles every frame
});
```

Obvious to a senior engineer. Worth stating because a junior agent might be tempted to change `defines` or `uniforms` via re-instantiation.

### 9.10 The ember halo on focus

For chrome elements (not R3F), the focus ring uses CSS box-shadow:

```css
.focus-ember:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--color-brand-ember),
    0 0 24px 4px rgba(240, 168, 104, 0.45);
}
```

The double-shadow creates a "bright ring + soft halo" — the ring locks the focus, the halo gives it warmth. Combine with `transition-[box-shadow] duration-150` for a soft entry.

This is the chrome-equivalent of the R3F atmosphere shell. Same "fresnel-like glow" principle, two different rendering pipelines.

---

## PART 10 — WEB AUDIO CUES

### 10.1 The five-cue palette

The product has exactly five audio cues:

1. **Approve** — a soft ember-flavored chime, ~600ms, plays when a beat is approved.
2. **Generate** — a low rumble that ramps from silence to a sustained tone over ~1.2s, plays when a clip generation begins.
3. **Land** — a gentle tone landing into a sustained pad, ~800ms, plays on canvas entry from /transition.
4. **Confirm** — a single pluck note, ~200ms, plays on chip selection / button press (the audible "acknowledge").
5. **Failure** — a downward slide of two notes, ~500ms, plays on agent / API error.

Five cues, no more. More than five and the user can't internalize the language; the cues lose meaning. Five is enough that each sound is "a thing" the user learns over the course of the demo.

### 10.2 No sample files

All cues are **synthesized** from the Web Audio API — `OscillatorNode` + `GainNode` + `BiquadFilterNode`. There are no `.mp3` / `.wav` files in the bundle. This is deliberate:
- Bundle size: zero audio assets.
- Loading: instant — no prefetch needed.
- Customization: parameters are just numbers; the cue can be retuned without re-encoding.

The cost: the cues are simpler than what a Foley artist would produce. We accept that cost. The alternative (sample files) is wrong for a hackathon — too many ways for assets to fail to load, too much friction to retune.

### 10.3 The cue construction pattern

Each cue is a function that takes an `AudioContext` and plays. Example for "approve":

```ts
function playApprove(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);  // A5
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.3);  // E6

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, now);
  filter.Q.value = 1.2;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.6);
}
```

The shape: brief attack (40ms) → sustain → exponential decay. The frequency rises from 880 to 1320 (A5 → E6, roughly a perfect fifth) — a "rising note" reads as "yes, success."

### 10.4 LFO modulation for "alive" cues

The "generate" cue is more complex — it has an LFO modulating the oscillator frequency for a "rumbling" quality:

```ts
const lfo = ctx.createOscillator();
lfo.type = 'sine';
lfo.frequency.value = 4;  // 4Hz — sub-musical, just modulation

const lfoGain = ctx.createGain();
lfoGain.gain.value = 8;  // ±8Hz modulation depth

lfo.connect(lfoGain).connect(osc.frequency);  // modulating the carrier's frequency
lfo.start(now);
```

The result: the carrier wobbles slightly, like a sustained engine note. Reads as "machine working." Without the LFO, it's a flat tone — reads as "clinical."

LFO modulation is the key technique for "alive" cues. Use it for: generate (machine working), land (atmosphere settling), failure (descent with vibrato).

### 10.5 The mute toggle

Audio is opt-in via a chrome chip: mute icon at the right of the letterbox header. Click to toggle. State persisted to localStorage:

```ts
// prefs-store
audioMuted: boolean;
toggleAudioMute: () => void;
```

Default state: muted (true). The user must opt in. Reasoning:
- Auto-playing audio on a hackathon demo is a violation of trust — the judge might be in a public space, on a call, etc.
- The cues add to the demo *if* the judge has audio on, but they shouldn't be the difference between "judge-friendly" and "judge-hostile."

The cues respect mute:
```ts
function playApprove(ctx: AudioContext, muted: boolean) {
  if (muted) return;
  // ...
}
```

The chip itself is a hint — the icon is visible, the shortcut is `M`. A judge who notices the icon understands the product has audio they can opt into.

### 10.6 AudioContext on first user gesture

Browsers block `AudioContext` from playing audio without a user gesture. The app creates the context lazily on first interaction:

```ts
let _ctx: AudioContext | null = null;
function getContext(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// in event handlers
button.onclick = () => {
  const ctx = getContext();
  playApprove(ctx, prefs.audioMuted);
};
```

If you create the context on mount (before user gesture), it'll be `suspended` and the first cue won't play (silently fails). Lazy creation avoids this.

### 10.7 Cue layering with motion

Cues don't play alone — they layer with motion. The "approve" sequence:
- 0ms: user clicks "approve" in the drawer
- 0ms: button shows acknowledge motion (`scale: 0.96`)
- 50ms: the beat node mesh emits its emissive pulse
- 100ms: the URL strip's tail typewrites the new clip ID
- 100ms: the audio cue plays

Motion + visual + audio together = "approval landed." Any one alone reads as half-measure. Layering is what makes the moment cinematic.

### 10.8 The "land" cue and the bridge

When the user lands on the canvas from /transition, the "land" cue plays — an 800ms tone that settles into the canvas's ambient register. This is the audio version of the bridge transition: it carries the user from "I was in the prompt" to "I am on the canvas."

The cue starts at the apex of the bridge animation (~600ms in) and sustains through the canvas's first 200ms — overlapping the visual transition. Without the audio, the bridge feels visual-only; with it, the bridge feels embodied.

Reduced motion gates the cue (or shortens it dramatically). A user who turned off motion shouldn't hear a cue that's pacing motion they're not seeing.

### 10.9 The "failure" cue

Plays on:
- Agent network error
- Clip generation failure
- Stitch URL build error

The cue is intentionally not "harsh" — no buzz, no sour interval. It's a gentle two-note descent (perfect fourth, falling). Reads as "this didn't go well" without being punitive.

The failure cue is the hardest one to tune. You want the user to notice without feeling shamed. Two falling notes at low volume is the answer.

### 10.10 No background music

There is no background music in the product. The user has been explicit on this. Reasoning:
- Background music is prescriptive — it tells the user how to feel.
- The user is creating a film — *they* are the one who picks the score.
- Background music in a hackathon demo is amateur hour.

The cues are punctuation. They have meaning. Background music is wallpaper. We don't do wallpaper.

### 10.11 The audio audit

Before each release:
1. Walk every interactive element on every route. Click them all with audio on.
2. Are there elements that should have a cue and don't? (Common gap: chip selection on landing.)
3. Are there cues that play in inappropriate contexts? (Common bug: failure cue plays during routine 404 from a probe request.)
4. Does the layering feel right? (Visual + audio synced, or one leading the other appropriately.)
5. Is the volume range consistent? (No cue louder than the others by more than 3dB.)

Audio is one of those things that's easy to ignore in code review (you'd have to listen to test) and easy to break unintentionally. The audit is a 5-minute walk-through; do it.

### 10.12 A note on Web Audio CPU

`AudioContext` operations are cheap, but creating hundreds of `OscillatorNode` instances per second is not. The cues construct nodes per-call, but they're brief (~600ms) and the nodes get garbage-collected after `osc.stop()`. This works fine for the cue volume of this app (a few cues per minute).

If you ever build something with continuous synthesis (drone, ambient layer), use `AudioWorkletNode` or pre-build a small number of nodes and reuse them. Per-frame node construction is the path to audio glitching.

---

## PART 11 — VOICE AND MULTIMODAL

### 11.1 Voice on landing — the SpeechRecognition wrapper

The landing input has a microphone affordance — click to dictate the prompt. Implementation uses the Web Speech API:

```ts
// hooks/use-speech-recognition.ts
export function useSpeechRecognition({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      onTranscript(transcript);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [onTranscript]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setListening(true);
    recognitionRef.current.start();
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
  }, []);

  return { supported, listening, start, stop };
}
```

The hook exposes `start`, `stop`, `listening`, `supported`. The component uses `supported` to conditionally render the mic button — browsers without SpeechRecognition (Firefox, some mobile browsers) hide the button entirely. No "your browser doesn't support voice" toast.

### 11.2 The waveform visualization

When the user is dictating, a waveform animates next to the input. It's driven by an `AnalyserNode` reading the user's microphone:

```tsx
function VoiceWaveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!active) return;
    const setup = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      // start drawing loop
    };
    setup();
    return () => analyserRef.current?.disconnect();
  }, [active]);

  // ... draw bars
}
```

The bars are drawn from the analyser's frequency data, mirrored vertically. Reads as "we hear you." The cinematic register: warm-near-black background, ember bars, single-color (no rainbow) — minimal.

### 11.3 The "mic permission" UX

The first time the user clicks the mic button, the browser prompts for permission. The UX:

- The button changes to a "waiting for permission" state — pulsing ember outline, no waveform yet.
- If granted: waveform appears, recording starts.
- If denied: button shows "mic blocked" tooltip, with a small (icon) help link to the browser's permission settings.

Don't make the user re-click after granting. The permission grant should kick off the recording automatically. This requires holding the click event in a state and re-firing recording start when permission resolves.

### 11.4 Reference image drop

The landing input also accepts dropped images — drag a reference image into the input area, and a small thumbnail appears below the input. The reference image is sent to the agent as a vision input.

Implementation:

```tsx
const onDrop = useCallback((e: DragEvent) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;
  setReferences(prev => [...prev, ...files]);
}, []);

useEffect(() => {
  const el = dropZoneRef.current;
  if (!el) return;
  el.addEventListener('dragover', preventDefault);
  el.addEventListener('drop', onDrop);
  return () => {
    el.removeEventListener('dragover', preventDefault);
    el.removeEventListener('drop', onDrop);
  };
}, [onDrop]);
```

Each reference image gets a thumbnail with a "remove" affordance. The thumbnails are 56×56, rounded `rounded-md`, with a 1px hairline border in `fg-tertiary/25`.

The thumbnails are *below* the input, not inside it. Inside the input would compete with the placeholder; below makes them feel like "attachments to the prompt."

### 11.5 The `[refs:N]` marker

When the user submits a prompt with reference images, the prompt is augmented with a `[refs:N]` marker:

```
"a 90s VHS recovery memory of the day my dog ran away [refs:2]"
```

The `[refs:N]` is the frontend's way of telling the mock-agent backend "the user attached N references — acknowledge them in the agent response." The mock agent is set up to recognize the marker and reply with something like:

> "Noted the two references — let's lock the lighting and the framing in the first beat to match."

The convention is frontend → mock-agent. The real LangGraph backend handles references via the `references` field in the API payload directly; the marker is a fallback for the mock environment.

### 11.6 The "voice + vision" product moment

When the user dictates the prompt *and* drops a reference image, the experience reads as "I'm directing my AI assistant" — the mic + the image is the studio mode. Both are progressive enhancements (the user can type and skip references), but together they make the landing feel like more than a text input.

Demo-day note: if you're demoing voice or vision, *do* both in the demo. They take 15 seconds total and they upgrade the demo from "type a prompt" to "direct the agent." Use the time.

### 11.7 SpeechSynthesis (text-to-speech)

The agent's voice can speak its lines if the user enables "voiceover" in preferences. Implementation uses `window.speechSynthesis`:

```ts
function speak(text: string, voice: SpeechSynthesisVoice) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.rate = 0.95;  // slightly slower than default — reads as deliberate
  utterance.pitch = 0.9;  // slightly lower — reads as authoritative
  window.speechSynthesis.speak(utterance);
}
```

Voice selection: prefer "Daniel" (UK English male) on macOS, "Microsoft David" on Windows. These read as "director-like." Default voices vary; pick the most "deliberate" available.

The voiceover is opt-in — the prefs-store has a `voiceoverEnabled` flag. Default false. Even when on, it's gated by the audio mute (mute = no voiceover).

### 11.8 Voice API quirks across browsers

Web Speech API support is uneven:

- **Chrome / Edge**: Full support. SpeechRecognition works, SpeechSynthesis works, voices are available.
- **Safari**: Partial. SpeechRecognition exists but is gated to Safari 14.1+ and quality varies. SpeechSynthesis works but voice selection is limited.
- **Firefox**: SpeechSynthesis works. SpeechRecognition is *not* supported (as of 2026).
- **Mobile Chrome (Android)**: Both work. SpeechRecognition requires HTTPS.
- **Mobile Safari (iOS)**: SpeechSynthesis works. SpeechRecognition requires permission grant per session.

The `supported` flag in the hook covers SpeechRecognition. For SpeechSynthesis, check `'speechSynthesis' in window` and conditionally render the voiceover toggle.

### 11.9 The "vision" moment in the conversation

Mid-conversation in the drawer, the agent may ask for a reference: "do you have a frame in mind for this shot?" The user can drop a reference image into the conversation input. The image becomes a chat message (small thumbnail + "reference" label).

This is the same drop pattern as the landing. The implementation uses a shared `<DropZone>` component. The agent's response after a reference drop should explicitly acknowledge the reference: "noted — the frame you sent reads as gauzy and warm; I'll lean the lighting that way."

### 11.10 The lesson: multimodal is showpiece, not core

Voice and vision are progressive enhancements. The core flow (type prompt → click begin → land on canvas → talk to agent → approve) does not require either. Treat them as showpieces:

- They earn their keep in the demo (15-second flourishes).
- They should be hidden behind affordances that don't dominate the chrome.
- They should fail gracefully if unsupported (no error toast — the affordance just disappears).

Don't make voice required for accessibility — that would inverse the principle. The text input is the canonical interface; voice is the bonus.

---

## PART 12 — STATE AND ZUSTAND

### 12.1 The two stores

The app has exactly two stores:

1. **`useBeatGraphStore`** — the manifest, the active beat, the decompose status. Persisted to localStorage (with `partialize` to exclude transient state).
2. **`usePrefsStore`** — audio mute, reduced-motion override, voiceover enabled. Persisted entirely.

That's it. No store-per-feature, no module-isolated stores. Two stores; each has a clear domain.

### 12.2 Why Zustand and not Redux/Jotai

- **Redux**: too much ceremony for a hackathon. Slices, reducers, middleware — overhead with no commensurate benefit on a five-component app.
- **Jotai**: atomic state is great for fine-grained reactivity, but the manifest is genuinely a single object — the atomicity would be artificial.
- **Zustand**: the right level — single store object, action-style updates, selectors for fine-grained reads. Plus `persist` middleware out of the box.

Zustand v5's API is mature; v4 was already production-grade. The migration to v5 had one breaking change worth knowing — covered in 12.4.

### 12.3 The store shape

```ts
interface BeatGraphState {
  manifest: Manifest | null;
  activeBeatId: string | null;
  decomposeStatus: DecomposeStatus;

  // mutations
  initialize: (params: { masterPrompt: string; videoType: VideoType }) => void;
  setDecomposeStatus: (status: DecomposeStatus) => void;
  setActiveBeat: (beatId: string | null) => void;
  updateBeat: (beatId: string, patch: Partial<Beat>) => void;
  updateScene: (beatId: string, sceneId: string, patch: Partial<Scene>) => void;
  appendAgentTurn: (beatId: string, sceneId: string, turn: AgentTurn) => void;
  approveScene: (beatId: string, sceneId: string) => void;
  applyDecomposition: (clips: DecomposedClip[], continuityBible?: string) => void;
  regenerateScene: (beatId: string, sceneId: string) => void;
  setFinalCinematic: (params: { finalUrl: string; thumbnailUrl: string; durationSeconds: number }) => void;
  reset: () => void;
}
```

State + actions colocated. No separate "actions" slice — Zustand's idiom is to put them on the store object.

### 12.4 `useShallow` on fresh-array selectors

This is the single most important Zustand v5 lesson. The selector `selectApprovedClipPublicIds` constructs a fresh array on every call:

```ts
export function selectApprovedClipPublicIds(state: BeatGraphState): string[] {
  const m = state.manifest;
  if (!m) return [];
  return m.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved && s.clipPublicId)
    .map((s) => s.clipPublicId!);
}
```

Without shallow equality, Zustand v5 considers each call a state change (since the array reference is new) and re-renders the component on every store update. Under React 19 + StrictMode, this cascades into a max-update-depth crash. The component re-renders, the array is new again, the component re-renders, etc.

The fix is `useShallow`:

```tsx
import { useShallow } from 'zustand/react/shallow';
import { useBeatGraphStore, selectApprovedClipPublicIds } from '@/stores/beat-graph-store';

const approvedIds = useBeatGraphStore(useShallow(selectApprovedClipPublicIds));
```

`useShallow` does an array-element-level comparison. New array with same elements = no re-render. The crash is gone.

**The rule**: any selector that constructs a fresh array or object must use `useShallow`. Selectors that return primitives or stable references don't need it.

Examples in this app that use `useShallow`:
- `selectApprovedClipPublicIds` (fresh array)
- A hypothetical `selectActiveBeatScenes` (would return a fresh array slice)
- `selectGenerationStatus` (returns `{status, count}` — fresh object)

Examples that don't:
- `(s) => s.activeBeatId` (returns a primitive)
- `(s) => s.manifest` (returns the same reference unless it actually changes)
- `(s) => s.setActiveBeat` (returns the same function reference — Zustand's actions are stable)

### 12.5 The `partialize` pattern

`decomposeStatus` is transient UI state. If a user reloads the page mid-decompose, the status would be `pending` from before — but the API call is gone, so it's eternally pending. The fix:

```ts
persist(
  (set, get) => ({ ... }),
  {
    name: 'sceneos:beat-graph',
    partialize: (state) => ({
      manifest: state.manifest,
      activeBeatId: state.activeBeatId,
      // decomposeStatus excluded
    }) as unknown as BeatGraphState,
  },
)
```

`partialize` returns the subset of state to persist. Excluded fields revert to their initial value on hydration — `decomposeStatus: 'idle'`, in our case. So a reload mid-decompose lands on `idle`, not `pending`. The user can re-submit the prompt or re-trigger the decomposition.

The `as unknown as BeatGraphState` cast is needed because TypeScript thinks `partialize` should return the full state. The cast is safe because Zustand merges the returned subset back into the initial state.

### 12.6 The state machine on `beat.status`

Each beat has a `status` field with these values:

```ts
type BeatStatus =
  | 'pending'              // initial — questionnaire not started
  | 'questioning'          // user is in conversation with agent
  | 'ready-to-generate'    // questionnaire done, generate not triggered
  | 'generating'           // clip generation in flight
  | 'preview'              // clip generated, awaiting approval
  | 'approved';            // user approved the clip
```

Transitions:
- `pending → questioning` (user opens drawer, agent kicks off conversation)
- `questioning → ready-to-generate` (agent says "I have what I need")
- `ready-to-generate → generating` (user clicks generate)
- `generating → preview` (clip generation succeeds)
- `preview → approved` (user approves)
- `preview → ready-to-generate` (user regenerates)

The status drives:
- Beat node mesh appearance (color, glow)
- Drawer header content
- CTA in the drawer (varies by status)
- Stage indicator semantics

The state machine is **explicit**. There's no derived "is this beat done" boolean — `status === 'approved'` is the question. Derived state in this codebase is consistently expressed as selectors, not stored.

### 12.7 The `regenerateScene` action

When the user wants to redo a clip, they don't lose the conversation:

```ts
regenerateScene: (beatId, sceneId) => {
  const m = get().manifest;
  if (!m) return;
  set({
    manifest: {
      ...m,
      beats: m.beats.map((b) => {
        if (b.beatId !== beatId) return b;
        return {
          ...b,
          status: 'ready-to-generate',
          scenes: b.scenes.map((s) =>
            s.sceneId === sceneId
              ? { ...s, jobId: undefined, clipPublicId: undefined, clipUrl: undefined, approved: false }
              : s,
          ),
        };
      }),
    },
  });
},
```

Conversation is preserved. The user shouldn't lose the questionnaire just because they want a different take. Only the clip-related fields are reset.

This is a "design decision encoded in state shape" — the conversation is at the scene level, but the regen-resettable fields are also at the scene level, separate. Conversation outlives clips. The shape supports the UX.

### 12.8 The `applyDecomposition` action

When `/api/decompose` returns, the response is patched onto the scenes:

```ts
applyDecomposition: (clips, _continuityBible) => {
  const m = get().manifest;
  if (!m) return;
  const byBeatId = new Map(clips.map((c) => [c.beatId, c]));
  set({
    manifest: {
      ...m,
      beats: m.beats.map((b) => {
        const clip = byBeatId.get(b.beatId);
        if (!clip || b.scenes.length === 0) return b;
        return {
          ...b,
          scenes: b.scenes.map((s, idx) =>
            idx === 0 ? { ...s, refinedPrompt: clip.refinedPrompt } : s,
          ),
        };
      }),
    },
  });
},
```

Notes:
- It's **best-effort** — beats not covered in the response keep template defaults. The decomposition is enhancement, not source-of-truth.
- It only patches `scenes[0]` — scenes[1+] are reserved for variants the user might add.
- Beats stay in `pending` — the per-beat questionnaire still runs. The decomposition just gives the questionnaire a smarter starting prompt.

The fire-and-forget on landing means this action may be called *after* the user has already started a conversation on a beat. Is that a problem? In practice no — the questionnaire's first agent turn is generated from the (now-decomposed) refinedPrompt the next time the user opens that beat. The patching is non-destructive.

### 12.9 The `reset` action

```ts
reset: () => set({ manifest: null, activeBeatId: null, decomposeStatus: 'idle' }),
```

Used by the "Make Another" button on the final delivery route. Sends the user back to landing with a fresh manifest.

**Critical**: it must reset `decomposeStatus` too. Without it, a user who navigates final → landing → submit-new-prompt would see the URL strip with an old approved-id list (because the beat-graph reset clears the manifest, but a fresh fire-and-forget decompose triggers... etc.). In practice the `manifest: null` fork in selectors handles this, but the explicit reset is defense-in-depth.

The Make Another button also resets the prefs store's session-specific fields (audio mute is preserved; reduced-motion override is preserved; voiceover enabled is preserved).

### 12.10 The "selectors are fast" assumption

Selectors run on every store change. They should be:
- Cheap to compute (no JSON.parse, no fetch, no synchronous expensive math).
- Pure (no side effects, no Math.random, no Date.now).
- Memoizable via shallow equality.

If a selector is expensive, memoize it — `useMemo` in the component, or a custom memoized selector. But: most selectors should just be filter + map + flatMap on the manifest, which is cheap.

Don't put derived state in the store ("computed approvedCount: number"). Compute it in a selector. Storing derived state means you have to keep it in sync with the source-of-truth fields, and that's where bugs live.

### 12.11 Action design — patches, not setters

Don't write `setBeatStatus(beatId, status)`. Write `updateBeat(beatId, patch)` and call `updateBeat(beatId, { status: 'approved' })`. The patch-style:

- One action shape across all updates ("update X with patch Y").
- No coupling between action name and field.
- The patch can grow to include multiple fields without API change.

The exceptions are *semantic* actions like `approveScene` or `regenerateScene` — these encode multi-field updates with a name that reflects intent. The patch-style is the default; semantic actions are for cases where the patch is known and meaningful.

### 12.12 The `appendAgentTurn` pattern

Conversations are arrays — adding a turn is `[...conversation, newTurn]`:

```ts
appendAgentTurn: (beatId, sceneId, turn) => {
  // ...nested map gymnastics to create a new manifest with the new turn
}
```

This is verbose but correct. The verbosity of immer-less Zustand updates is the price of zero-dependency state. We accepted that price. If the verbosity ever becomes overwhelming, immer is one `import` away (`zustand/middleware` `immer` middleware).

### 12.13 The "no `useEffect` in store actions" rule

Store actions are sync. They mutate state. They don't fetch, don't subscribe, don't `useEffect`. If you find yourself writing `useEffect`-like behavior in a store action — you want a side effect after a state change — pull the side effect into the component or a hook.

Example: when a beat is approved, an audio cue plays. The cue is *not* in the `approveScene` action. It's in a `useEffect` in the drawer component that watches for the status to flip:

```tsx
useEffect(() => {
  if (beat.status === 'approved' && prevStatus.current !== 'approved') {
    playApprove(audioCtx, prefs.audioMuted);
  }
  prevStatus.current = beat.status;
}, [beat.status]);
```

The store stays pure. Side effects live in components.

### 12.14 The `useBeatGraphStore.persist.clearStorage()` escape valve

Sometimes the persisted state is corrupt (bad migration, malformed manifest) and the user needs a clean slate. The persist middleware exposes:

```ts
useBeatGraphStore.persist.clearStorage();
```

This wipes the localStorage entry. The next mount restores initial state.

We don't ship a UI affordance for this — but in dev, it's accessible from the browser console. Worth knowing.

### 12.15 The "stable references" principle

Selectors should return stable references when the underlying state hasn't changed. This is what enables React's rendering optimizations.

Zustand returns the same reference if the selector returns the same primitive or object reference. So `(s) => s.manifest` is stable across calls until `manifest` changes.

But `(s) => s.manifest?.beats?.find(b => b.beatId === id)` returns a new reference if `manifest` is replaced (even if the matching beat hasn't conceptually changed). For these, either:
- Memoize at the call site with `useMemo` keyed on the relevant slice.
- Use `useShallow` if the selector returns an object/array.
- Store the value separately if access is hot (e.g., the manifest is replaced rarely; the active beat lookup happens often).

The rule: think about reference stability when designing selectors. Mostly Zustand handles it; sometimes you need to help.

---

## PART 13 — ASYNC AND API DISCIPLINE

### 13.1 The optimistic update pattern

When the user sends a message in the agent conversation, the message appears immediately in the UI as the user's bubble. The API call to the agent fires in the background. When the response comes, the agent's bubble appears.

The wrong way: send the request, await the response, then update both bubbles. The user waits 2-5 seconds for *their own message* to appear. Catastrophic UX.

The right way (optimistic):

```tsx
async function sendMessage(text: string) {
  // 1. Update UI immediately
  appendAgentTurn(beatId, sceneId, { role: 'user', content: text, ts: nowISO() });
  setInput('');

  // 2. Fire request
  try {
    const response = await api.agent({ beatId, sceneId, message: text });
    appendAgentTurn(beatId, sceneId, { role: 'agent', content: response.text, ts: nowISO() });
  } catch (err) {
    // 3. Recovery — covered below
  }
}
```

The user sees their message in <16ms (next frame). The agent's reply takes 2-5s, during which a "typing" indicator shows. UI feels responsive even when the network is slow.

### 13.2 The cancelledRef pattern

If the user closes the drawer mid-request, the request is still in flight. When it returns, the response would be appended to a beat the user has navigated away from — a ghost message they may see if they re-open the beat later.

The fix: a `cancelledRef` per request lifecycle:

```tsx
function NodeDetailDrawer({ beat }: Props) {
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;  // mark cancelled on unmount
    };
  }, []);

  async function sendMessage(text: string) {
    appendAgentTurn(...);  // optimistic
    try {
      const response = await api.agent(...);
      if (cancelledRef.current) return;  // bail
      appendAgentTurn(beatId, sceneId, { role: 'agent', ... });
    } catch (err) {
      if (cancelledRef.current) return;
      // error recovery
    }
  }
}
```

The cancel flag isn't really "cancelling" the request (the API call still runs to completion server-side); it's cancelling the side effect of applying the response. For agent calls, that's enough. For mutations that change state server-side, we'd need an `AbortController` (covered in 13.4).

### 13.3 The mountedRef pattern

`cancelledRef` covers unmount, but a component can also be in a state where it's mounted but the response arrives after the user has switched contexts (e.g., switched beats). The `mountedRef` is a simpler version of `cancelledRef`:

```tsx
useEffect(() => {
  let mounted = true;
  asyncOp().then((result) => {
    if (!mounted) return;
    setSomeState(result);
  });
  return () => { mounted = false; };
}, [dep]);
```

For most cases, this is sufficient and more readable than the ref-based pattern. Use refs when you need cross-effect lifecycle (e.g., a class-like component) — closures + a `mounted` local handle most cases.

### 13.4 AbortController for proper cancellation

For requests that mutate state or are expensive, use `AbortController`:

```tsx
async function generateClip(beatId: string, sceneId: string) {
  const controller = new AbortController();
  abortRefs.current.set(`${beatId}:${sceneId}`, controller);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ beatId, sceneId }),
      signal: controller.signal,
    });
    // ...
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    throw err;
  }
}

function cancelGeneration(beatId: string, sceneId: string) {
  abortRefs.current.get(`${beatId}:${sceneId}`)?.abort();
}
```

`AbortController` cancels at the network level — the request is aborted, the server stops processing if it's set up to listen, the response promise rejects with `AbortError`. We catch and ignore that — the cancel was intentional.

For SceneOS, the only use case for AbortController is the clip generation (which is long-running and the user might want to "stop"). The agent calls are short enough that the cancelledRef pattern suffices.

### 13.5 Polling with timeout

Clip generation is asynchronous on the backend — the API returns a `jobId`, and the frontend polls for status. The polling logic:

```tsx
async function pollJob(jobId: string, timeoutMs: number = 90_000): Promise<JobResult> {
  const start = Date.now();
  let intervalMs = 1000;

  while (Date.now() - start < timeoutMs) {
    if (cancelledRef.current) throw new Error('cancelled');
    const status = await api.jobStatus(jobId);
    if (status.state === 'completed') return status.result;
    if (status.state === 'failed') throw new Error(status.error);
    await sleep(intervalMs);
    intervalMs = Math.min(intervalMs * 1.5, 5000);  // backoff up to 5s
  }
  throw new Error('timeout');
}
```

Notes:
- **Backoff**: starts at 1s, multiplies by 1.5 each tick, caps at 5s. First few polls are quick; later polls are gentler. Avoids hammering the server when generation takes longer than expected.
- **Timeout**: 90 seconds. Higgsfield + Veo can take ~30-60s for a single clip; 90s is a generous ceiling. After that, treat as failed.
- **Cancellation**: the cancelledRef check inside the loop. The cleanup-on-unmount fires the ref; the next poll iteration bails out.
- **Single source of error**: `pollJob` throws on failure, timeout, or cancel. The caller wraps in try/catch.

### 13.6 The polling-after-drawer-close bug

This was a real bug. The drawer's `useEffect` fired the polling on mount, but didn't clean up on unmount. If the user opened the drawer, started generation, and closed the drawer, the polling continued — eventually firing `appendAgentTurn` on a beat the user wasn't looking at, which then surprised them when they came back to it.

The fix: cleanup that sets `cancelledRef.current = true`:

```tsx
useEffect(() => {
  return () => {
    cancelledRef.current = true;
  };
}, []);
```

This is cheap insurance. Apply to every component that fires async operations.

### 13.7 The retry pattern

When an agent call fails, the user shouldn't lose their message. The pattern:

```tsx
const [pendingRetry, setPendingRetry] = useState<string | null>(null);

async function sendMessage(text: string, isRetry = false) {
  if (!isRetry) {
    appendAgentTurn(beatId, sceneId, { role: 'user', content: text, ts: nowISO() });
    setInput('');
  }
  try {
    const response = await api.agent({ ... });
    appendAgentTurn(beatId, sceneId, { role: 'agent', content: response.text, ts: nowISO() });
    setPendingRetry(null);
  } catch (err) {
    setPendingRetry(text);
  }
}
```

When `pendingRetry` is set, the UI shows an inline "Retry" button next to the user's last message. Click → `sendMessage(pendingRetry, true)`. On success, the retry state clears.

This way, the user's message stays visible (their input wasn't lost), and the retry is a single click. No "your message failed, please try again" toast — the UI itself communicates the state.

### 13.8 The "fire and forget" decompose

The `/api/decompose` call on landing is fire-and-forget. The user submits, the call fires, the user is bridged to the canvas immediately. When the call returns (2-8s later), `applyDecomposition(clips)` patches the manifest.

```tsx
async function handleSubmit() {
  const beats = buildInitialBeats(videoType);
  initialize({ masterPrompt, videoType });   // beats with template defaults
  navigate('/transition');                    // bridge starts now

  setDecomposeStatus('pending');
  try {
    const response = await api.decompose({ masterPrompt, videoType });
    if (cancelledRef.current) return;
    applyDecomposition(response.clips, response.continuityBible);
    setDecomposeStatus('success');
  } catch (err) {
    if (cancelledRef.current) return;
    setDecomposeStatus('error');
    console.error('Decompose failed:', err);  // not surfaced to user
  }
}
```

Critical: the navigation happens *before* the await. The user is moving forward; the API enriches in the background. If the API fails, the user is on the canvas with template defaults — the demo continues.

The `decomposeStatus` is for the optional "Decomposing scenes…" indicator on the canvas. Transient — see Part 12 on `partialize`.

### 13.9 The stitch URL is computed, not requested

The `fl_splice` URL is built client-side from the approved clip public IDs:

```ts
export function buildSpliceUrl(publicIds: string[]): string | null {
  if (publicIds.length < 2) return null;  // need at least 2 to splice
  const segments = publicIds.slice(1).map(id => `fl_splice,l_video:${id}/fl_layer_apply`).join('/');
  const base = publicIds[0];
  return `https://res.cloudinary.com/{cloud}/video/upload/${segments}/${base}.mp4`;
}
```

No API call. The URL is deterministic from the public IDs. This is the Cloudinary track-hero magic — the "video editor" is just a URL transformation. The frontend builds it, displays it, lets the user copy it; Cloudinary serves it on demand.

The `buildSpliceUrlSegments` variant returns `{base, middle, tail}` for the URL strip — `tail` is the most recently added segment, animated separately. This split is for the typewriter effect on new approvals.

### 13.10 The mock vs live mode

The app has a mock mode (no backend, all responses are stubbed) and a live mode (real LangGraph backend). The mock chip in the chrome shows which mode is active.

```ts
// src/lib/api.ts
const MOCK = import.meta.env.VITE_MOCK_MODE === 'true';

export const api = {
  decompose: MOCK ? mockDecompose : liveDecompose,
  agent: MOCK ? mockAgent : liveAgent,
  generate: MOCK ? mockGenerate : liveGenerate,
  // ...
};
```

The mock implementations:
- `mockDecompose` returns 5 hardcoded clips after a 2s delay.
- `mockAgent` returns canned director-toned responses based on simple keyword matching, with a `[refs:N]` marker handler.
- `mockGenerate` returns a Cloudinary public ID from a pre-uploaded "demo clip" library after a 30s simulated job.

This lets the demo run without backend connectivity. If the live backend goes down mid-demo, set `VITE_MOCK_MODE=true` and reload — demo continues. The mock chip turns ember to indicate it's active.

### 13.11 The error-toast discipline

Toasts (sonner) are used sparingly. The criteria:

- **Use a toast** for: a successful side effect the user might miss (e.g., "URL copied"). A failure they should know about but can't act on (e.g., "audio cue blocked by browser").
- **Don't use a toast** for: an error inline with the user's action (use inline UI instead). Decoration ("welcome back!"). Repeated noise (debounce or remove).

The reason: toasts pile up. Three toasts on screen at once = chaos. Two-line toasts that disappear before the user reads them = noise. Toast as a tool of last resort.

In SceneOS, the legitimate toasts:
- "URL copied." (success on copy)
- "Cinematic downloaded." (success on save)
- (none for errors — errors are inline)

Three toasts max across the entire app's lifetime per user session.

### 13.12 The "logged to console, not surfaced" pattern

Many errors are logged to the console but not shown to the user. The decompose 502 is one example. Reasoning:

- The app continues to function (template defaults are fine).
- The user can't act on the error.
- Surfacing the error would interrupt their flow.

If an error is unactionable, log it. If it's actionable (the user can retry, switch input, etc.), surface it inline. Toasts are for actionable errors that don't have a natural inline location — but in this app, almost every error has a natural inline location.

### 13.13 The TanStack Query / SWR question

We don't use TanStack Query or SWR. Reasoning:

- The state is in Zustand. TanStack Query would create a parallel store for server state, with sync issues between the two.
- The caching benefits are minimal — the app's API calls are mostly one-off (decompose, agent message, generate).
- The bundle cost (~10KB for TanStack Query) doesn't earn its keep at this scale.

For a larger app with more endpoints, more caching needs, more parallel requests — TanStack Query is the right answer. For this app, the manual `try/catch + Zustand action + cancelledRef` pattern is simpler and sufficient.

If you find yourself reimplementing TanStack Query primitives (request deduplication, cache invalidation, mutation bookkeeping), reach for it. We didn't reach that point.

### 13.14 The "no useless try/catch" rule

Don't wrap every async call in try/catch "just to be safe." The catch should do something — recover, retry, log, surface. An empty catch block is worse than no catch — the error is silently swallowed.

If you genuinely don't know what to do on error, let it propagate. The error boundary at the route level catches it and shows the fallback. That's better than swallowing.

### 13.15 The "request once" guard

For requests that should only fire once per mount (e.g., the initial decompose), guard with a ref:

```tsx
const fired = useRef(false);
useEffect(() => {
  if (fired.current) return;
  fired.current = true;
  fireOnceOp();
}, []);
```

Why a ref instead of relying on the empty-deps `useEffect`: under React 18+ Strict Mode, the effect fires twice. The ref guard ensures the second invocation doesn't double-fire.

Alternative: write the effect to be idempotent (the second call has no effect). For data fetches, idempotent isn't always possible — guard with the ref.

### 13.16 The `nowISO()` and `uuid()` utilities

Tiny helpers in `src/lib/utils.ts`:

```ts
export const nowISO = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
```

Used everywhere a timestamp or ID is needed. `crypto.randomUUID()` is supported in all evergreen browsers (and Node 19+); the polyfill cost would be unnecessary. ISO timestamps are universally parseable, sortable, locale-agnostic.

### 13.17 The "URL is the source of truth" principle

For routing-driven state (active route, modal open, query params), the URL is canonical. Don't sync URL state into Zustand; read from `useLocation`/`useSearchParams` directly.

Examples:
- Active route → `useLocation().pathname`
- "Drawer open" → not in URL (it's a modal-style transient state — kept in component state)
- "Active beat" → in Zustand (`activeBeatId`), because the user can navigate away and come back to the same beat

The rule of thumb: if the user expects "back button" or "share this URL" semantics, it's URL-state. If it's transient interaction state (hover, drag, ephemeral input), it's component state. If it's persistent app state (manifest, prefs), it's Zustand.

### 13.18 The "no premature parallelization" rule

Don't `Promise.all` unrelated requests "for performance." It almost never matters at this scale, and it makes error handling worse (one failure aborts all).

Sequential await chains are fine for app-scale work:

```tsx
const decomposeResult = await api.decompose(...);
await new Promise(resolve => setTimeout(resolve, 100));  // brief beat
const agentInit = await api.agent({ ... });
```

If you have genuinely independent requests and the latency cost is real, then `Promise.all`. Otherwise, sequential is more readable and equally fast in practice.

### 13.19 The "cleanup is harder than the request" principle

Writing the request is easy: `fetch + await + setState`. Writing the cleanup correctly — cancellation, unmount, race conditions — is the hard part. Budget more time for cleanup than for the request.

Common cleanup gotchas:
- The component unmounts; the request resolves; setState on unmounted component (warning).
- The component re-renders with new props; the old request resolves first, overwriting the new state.
- Multiple components fire the same request; need debounce/dedupe.
- The user navigates away; the polling continues forever.

The patterns from this section (cancelledRef, mountedRef, AbortController, polling with timeout, cleanup on unmount) cover ~95% of cleanup needs. Memorize them.

### 13.20 Environment variables for endpoints

API base URL is in `import.meta.env.VITE_API_BASE`. Default fallback for dev: `http://localhost:8000` (FastAPI). Production: the deployed backend URL.

Don't hardcode endpoints. Don't hardcode fallbacks in component code. The single source-of-truth is the env var, and the only fallback is in `api.ts`.

```ts
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
```

This survives a backend swap (Hono → FastAPI, in this project's history) without any code changes.

---

## PART 14 — ROUTING AND TRANSITIONS

### 14.1 The four routes

```
/           → LandingRoute
/transition → TransitionRoute (the bridge)
/canvas     → CanvasRoute
/final      → FinalDeliveryRoute
```

Four routes. No login, no settings, no project library, no help. Each route has a single purpose.

### 14.2 React Router setup

```tsx
// App.tsx
<MotionConfig reducedMotion="user">
  <BrowserRouter>
    <Lenis>
      <AppErrorBoundary>
        <Header />
        <StageIndicator />
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/transition" element={<TransitionRoute />} />
          <Route path="/canvas" element={
            <CanvasErrorBoundary>
              <CanvasRoute />
            </CanvasErrorBoundary>
          } />
          <Route path="/final" element={<FinalDeliveryRoute />} />
        </Routes>
        <CinematicCursor />
        <CommandMenuMount />
        <MockModeChip />
        <FilmGrain />
      </AppErrorBoundary>
    </Lenis>
  </BrowserRouter>
</MotionConfig>
```

Notes:
- The chrome (`Header`, `StageIndicator`, `CinematicCursor`, `CommandMenuMount`, `MockModeChip`, `FilmGrain`) is *outside* `<Routes>`. It survives navigation. The user never sees the chrome flicker on route change.
- `CanvasErrorBoundary` wraps only the canvas route. The other routes don't need it.
- `AppErrorBoundary` wraps everything. Last line of defense.
- `<Lenis>` is at the App root, providing smooth-scroll across the entire app.

### 14.3 Navigation guards

The user can navigate freely between routes via URL, but the canvas needs a manifest. If the user navigates to `/canvas` with no manifest in store (e.g., direct link, hard refresh on a fresh browser), they're redirected to `/`:

```tsx
// CanvasRoute
const manifest = useBeatGraphStore((s) => s.manifest);
useEffect(() => {
  if (!manifest) navigate('/', { replace: true });
}, [manifest]);
if (!manifest) return null;
```

`replace: true` prevents the back button from returning to `/canvas` (which would just redirect again).

The same pattern guards `/final` — if no `finalCloudinaryUrl`, redirect to `/canvas`.

### 14.4 The transition route

`/transition` is intentionally short-lived. It's the bridge animation; the user doesn't dwell there. Implementation:

```tsx
function TransitionRoute() {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const duration = reduced ? 200 : 1200;
    const timer = setTimeout(() => navigate('/canvas'), duration);
    return () => clearTimeout(timer);
  }, [navigate, reduced]);

  return <BridgeAnimation />;
}
```

The route serves the animation, then auto-navigates. The user can't get stuck on it.

If the user hits the back button during the bridge (rare), the bridge timer is cleared, and they return to wherever they came from. The bridge is non-blocking.

### 14.5 The `Make Another` reset

On the final route, the "Make Another" button resets state and navigates back to landing:

```tsx
function MakeAnotherButton() {
  const reset = useBeatGraphStore((s) => s.reset);
  const navigate = useNavigate();
  return (
    <button onClick={() => {
      reset();
      navigate('/', { replace: true });
    }}>
      Make Another
    </button>
  );
}
```

Both stores are reset:
- `beat-graph-store.reset()` clears manifest, activeBeatId, decomposeStatus.
- `prefs-store` is **not** reset — the user's mute, voiceover, reduced-motion preferences carry across projects.

The `replace: true` on navigate prevents the back button from going to `/final` (which would now show the empty state — confusing).

### 14.6 Route-level loading states

Routes don't have explicit "loading" states. The canvas route is rendered with whatever's in the store; if the manifest is null, it redirects (covered above). There's no spinner.

Reasoning: the bridge transition is the loading state. It hides the data fetch behind a cinematic moment. Once the user is on `/canvas`, there's nothing to "load" — the data is in store, and the UI renders synchronously.

If you find yourself needing a route-level spinner, ask whether you can defer the data fetch to a fire-and-forget pattern (like decompose) and let the UI render with template defaults.

### 14.7 Lenis smooth-scroll

Lenis is mounted at the App root via a thin wrapper:

```tsx
function Lenis({ children }: { children: ReactNode }) {
  useEffect(() => {
    const lenis = new LenisLib();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);
  return <>{children}</>;
}
```

Lenis provides "smooth scroll on wheel" — scrolling decelerates over a few hundred ms instead of stopping immediately. Reads as "premium" the way iOS Safari's momentum scroll reads as premium.

Caveats:
- Disable Lenis on the canvas route (use `data-lenis-prevent` attribute on the canvas wrapper). Canvas scroll is captured by `useScrollVelocity`, not Lenis.
- Disable Lenis under reduced motion (skip the RAF loop). The deceleration is a motion effect.
- The Lenis ScrollSnap plugin is not used — we don't snap to sections.

### 14.8 The "no scroll restoration" choice

By default, browsers restore scroll position on back navigation. We explicitly disable this for `/transition` and `/canvas` — these routes are full-screen with no logical "scroll position." React Router's `<ScrollRestoration />` is *not* mounted; default browser scroll behavior applies.

For `/`, scroll restoration is a non-issue — the route is a single viewport, so there's no scroll to restore.

For `/final`, scroll might matter if we add multiple sections (e.g., a comparison gallery). Today: single viewport. Tomorrow: revisit if needed.

### 14.9 The route + drawer interaction

The drawer is a *modal*, not a route. Opening the drawer doesn't navigate. Closing it doesn't pop history. Reasoning:

- The drawer is per-beat, not per-page. Users may rapidly toggle drawers across beats; routing each would pollute history.
- The drawer is dismissible via Esc, click-outside, or close button — natural modal semantics.
- Persisting the open drawer in URL would mean back-button returns to a closed drawer state, which is jarring.

If you want "shareable URL with drawer open" semantics, that's a different product. We don't.

### 14.10 The path-based key on `<motion.div>`

Already covered in Part 5.7 — `key={location.pathname}` on the `<motion.div>` wrapper inside `<AnimatePresence mode="wait">`. This is what triggers exit/enter on route change.

The route variants (defined globally):

```ts
export const routeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATIONS.cinematic, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DURATIONS.short, ease: EASE.in } },
};
```

Cinematic enter (0.6s), short exit (0.24s). The exit is faster than the enter — this is correct, because the user is moving toward the new content; the old content shouldn't linger.

### 14.11 The NoMatch route

Wildcard `*` route catches unknown paths and redirects to `/`:

```tsx
<Route path="*" element={<Navigate to="/" replace />} />
```

We don't show a "404 not found" page. Reasoning: this app has no shareable URLs (no `/projects/123`, no `/beat/xyz`). The only valid paths are the four. Unknown paths are user error or stale links; redirect home, no fanfare.

If we add shareable URLs (`/projects/{id}`), the NoMatch should become an actual 404 page with cinematic register. Today: just redirect.

### 14.12 The "hash routing" question

Hash routing (`/#/canvas`) was considered for hosting on a static CDN that doesn't support history-api routing. We didn't ship it because:
- The deploy target supports history routing.
- Hash routes don't smell premium.

If the deploy target changes, switch to `<HashRouter>`. The motion patterns and chrome work identically.

### 14.13 The `useBeforeUnload` pattern

When the user has a manifest in flight (in `/canvas`, with at least one beat in `generating` state), warn before reload:

```tsx
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';  // browser shows generic warning
  };
  if (hasInflightWork) window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [hasInflightWork]);
```

The browser's native confirmation dialog appears. Custom messages are no longer supported (browser security).

Use sparingly — too aggressive `beforeunload` warnings train users to ignore them. Only warn when in-flight work would be lost.

### 14.14 Deep linking and SSR

This app is a pure SPA (Vite + React). No SSR. The first paint is a blank page that hydrates into the route. For a hackathon demo, that's fine — the bridge transition hides the hydration cost.

If you ever need SSR (for SEO, for marketing pages outside the product), the four routes split cleanly: `/` is the marketing landing (SSR-able), `/canvas` and `/final` are app routes (client-only). React Router 6.4+ supports this split via remix-style data loading.

We didn't reach that point.

---

## PART 15 — ACCESSIBILITY

### 15.1 The principle

Accessibility is not a checklist; it is an audit. The audit asks: can a user without sight, without hearing, without precise pointer control, without able-bodied access to the keyboard — can they use this product?

The answer for this product is partial. Voice-on, vision-on, motion-on flows lean visual + auditory. The text-only fallback (text input + agent text response + clip preview with controls) covers the core flow.

The accessibility wins:
- Every interactive element has a focus-visible ring (ember).
- Every interactive element has a 44pt+ touch target.
- Every form input has a label (sr-only or visible).
- The canvas has a 2D fallback (CanvasErrorBoundary).
- Reduced motion is honoured.

The accessibility losses (disclosed, not papered over):
- The 3D canvas is non-accessible. Screen readers can't read meshes. We provide a "list view" toggle in the command palette as alternate access.
- Voice input requires a microphone (no fallback for keyboard-only voice).
- The film grain overlay can be disabled via the prefs store, but it's not exposed in chrome.

### 15.2 Focus-visible discipline

Every interactive element uses `focus-visible:` (not `focus:`):

```html
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-brand-ember
focus-visible:ring-offset-2
focus-visible:ring-offset-bg-base
```

`focus-visible` is the right primitive — it shows on keyboard focus, hides on mouse click. `focus` shows on every focus, leading to "the button has a ring around it after I clicked it" UX.

The ring is ember (not blue browser-default), 2px solid + 2px offset. The double-shadow halo (covered in Part 9.10) is reserved for the most prominent buttons (the landing CTA).

### 15.3 Keyboard navigation

Every flow on the app should be keyboard-only-completable:

- Tab through interactive elements in a logical order.
- Enter / Space activates buttons.
- Esc closes the drawer / modal / command palette.
- ⌘K opens the command palette.
- M toggles mute.
- ? shows keyboard shortcut overlay (we ship a basic overlay; not exhaustive).

The canvas is a partial exception — keyboard users can tab to the canvas focus, then arrow keys cycle through beats. Click-equivalent is Enter. This is a custom keyboard handler in `<BeatMap3D>`.

### 15.4 ARIA: less is more

Default to native HTML semantics. `<button>` is a button; you don't need `role="button"`. `<a>` is a link. `<input>` has implicit form semantics.

ARIA earns its place when:
- The element is a non-semantic container that *acts* like an interactive element (custom dropdown, modal). Use `role="dialog"` + `aria-modal="true"` + `aria-labelledby="..."`.
- A state needs to be communicated to assistive tech (e.g., a toggle button — `aria-pressed="true"`).
- Live regions for dynamic content (`role="status"` for the persistent URL strip, so screen readers hear the URL update).

Over-ARIAing is worse than no ARIA. A button with `role="button"` AND `aria-label="button"` AND `tabindex="0"` is broken in three ways. Trust HTML.

### 15.5 The drawer's a11y

The drawer is a `<Dialog>` from Radix UI. Radix handles:
- `role="dialog"` + `aria-modal="true"`
- Focus trap (focus stays inside the dialog while open).
- Focus restoration on close (focus returns to the element that opened the dialog).
- Esc-to-close.

Don't reimplement modal a11y. Use Radix or React Aria. The amount of edge-case handling required (focus restoration after async opens, multiple modals, etc.) is too much to write from scratch.

### 15.6 Color contrast

All body text passes WCAG AA at 4.5:1:
- `fg-primary` on `bg-base` → 14.6:1
- `fg-primary` on `bg-elev-1` → 13.1:1
- `fg-secondary` on `bg-base` → 7.8:1
- `fg-secondary` on `bg-elev-1` → 7.0:1

Caption text uses `fg-tertiary` on `bg-base` → 3.9:1, which fails AA for body but passes AA Large (3:1 minimum). Captions are ≥10px and considered metadata, not body — defensible.

The ember on warm-near-black:
- `brand-ember` on `bg-base` → 7.4:1 (passes AA for body)

So ember is a valid text color, not just an accent. We use it sparingly for text — primarily for live state labels ("LIVE", "RECORDING") in caption register.

### 15.7 Screen reader testing

A real audit pass uses VoiceOver (macOS) or NVDA (Windows). The walkthrough:

1. Navigate to `/`.
2. Listen to what VoiceOver reads for the heading and input.
3. Tab through interactive elements; listen.
4. Submit; listen to the bridge announcement.
5. Land on `/canvas`; navigate beats with arrow keys; listen.
6. Open drawer; listen to the conversation.

The audit catches: ambiguous labels ("button" without text), missing alt text on images, live regions that don't announce. Each is a one-line fix.

### 15.8 The "prefers-reduced-data" hint

A newer media query: `(prefers-reduced-data: reduce)` indicates the user is on a metered connection. When set, the app should:
- Not autoplay video.
- Use lower-quality thumbnails.
- Defer non-critical asset loading.

We respect this for the final-delivery video (no autoplay) but don't yet have lower-quality thumbnails. A future improvement.

### 15.9 The "no auto-focus on mount" rule (mostly)

Auto-focusing the input on landing is *correct* — the user came to type. Auto-focusing in the drawer is correct — the user came to converse. Auto-focusing in a dialog that opened from a button click is correct — the user expects to interact with the dialog.

Auto-focusing arbitrary elements on route mount is wrong — it's confusing, it steals the user's keyboard navigation context, it can break the back button.

Apply auto-focus when there's a clear "the user came here to act on this element." Otherwise let the user tab.

### 15.10 The command palette a11y

The cmdk command palette has:
- `role="dialog"` + focus trap (cmdk handles this).
- Each command item is a `<div role="option">` with `aria-selected` reflecting the current highlight.
- The input has `aria-label="Search commands"`.
- Esc closes.

Cmdk's accessibility is solid out of the box. Don't reimplement.

### 15.11 The "landmark roles" structure

Each route has explicit landmarks for screen reader navigation:

```html
<header role="banner"> ... </header>
<main role="main"> ... </main>
<aside role="complementary"> ... </aside>  <!-- the drawer when open -->
<footer role="contentinfo"> ... </footer>  <!-- minimal -->
```

VoiceOver users can jump between landmarks with the rotor. Without them, the user has to tab through everything.

The persistent URL strip is *not* a landmark. It's a `<div role="status" aria-live="polite">` so updates are announced without disrupting navigation.

### 15.12 The "high contrast mode" support

Windows has a "high contrast" theme that overrides web colors with system colors. Two issues:
- Custom CSS variables don't always honour high contrast (system colors override).
- Background images and gradients are removed in high contrast (system fills the area).

We tested briefly. The app reads as: warm-near-black is replaced by black, ember by SystemHighlight, fg by SystemText. Functional, not pretty. Acceptable.

If we wanted to ship a polished high contrast experience, we'd add `forced-colors:` Tailwind variants. We didn't.

### 15.13 The "skip to content" link

The first focusable element on every route is a `Skip to content` link, hidden until focused:

```html
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 ...">
  Skip to content
</a>
```

Standard pattern. Required for keyboard accessibility on routes with chrome (header, nav). The `<main id="main">` is the target.

### 15.14 The "labels for icon-only buttons" rule

Icon-only buttons need `aria-label` (or visually-hidden text):

```tsx
<button aria-label="Copy URL">
  <Copy size={11} />
</button>
```

Without `aria-label`, the screen reader reads "button" or worse, the SVG's filename. With it, "Copy URL button."

Audit: every `<button>` in this codebase that contains only an icon, no text, has `aria-label`. The audit caught a regression in `PersistentUrlStrip` — the copy button needed it.

### 15.15 Accessibility is also UX

Many a11y wins are also UX wins:
- Focus rings help keyboard users *and* the user who clicks-then-tab-wanders ("where did my focus go?").
- Live regions help screen readers *and* visual users who notice the announcement.
- Reduced motion helps vestibular users *and* users on slow devices (animations cost frames).
- Touch targets help motor-impaired users *and* every mobile user.

Don't think of a11y as a separate concern. Treat it as part of the UX bar.

---

## PART 16 — RESPONSIVE DESIGN

### 16.1 Breakpoints

We use Tailwind's defaults:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

Plus `max-md` (`<768px`) and `max-sm` (`<640px`) for mobile-specific overrides.

The two breakpoints that matter most:
- **`md` (768px)**: drawer becomes side-drawer on desktop, bottom-sheet below.
- **`lg` (1024px)**: full chrome density on desktop; mobile chrome stacks below.

### 16.2 The mobile chrome stack

Below `md`, the chrome stacks vertically:
- Letterbox header (top, 40px, project mark + ⌘K)
- Stage indicator (just below header, 11px caption-track)
- (canvas content)
- Persistent URL strip (bottom, compact — clip-id-only, no `…/upload/` prefix)
- Mock chip merged into header's right slot

Above `md`:
- Letterbox header (top, 48px)
- Stage indicator (top center)
- Mock chip (top right)
- Persistent URL strip (bottom, full URL)

The mobile compaction is significant. Don't try to fit desktop chrome on mobile — design for mobile separately.

### 16.3 The display floor

The `display-xl` headline uses `clamp(2.5rem, 7vw, 6rem)`. The `2.5rem` floor is the smallest the headline can shrink to. Without it (or with a smaller floor), the headline collapses to two lines on a 320px viewport, breaking the visual.

The floor was originally `2rem` (32px). The "an offering" headline wrapped to two lines. Bumped to 2.5rem (40px). One line on 320px. Win.

Apply the same logic to other display sizes. There's a minimum size below which the type looks broken; clamp to that.

### 16.4 The `min-h-[100svh]` rule (revisited)

Already covered in Part 6.9. Use `min-h-[100svh]`, not `min-h-screen`, for mobile-tall layouts. iOS Safari's URL bar collapse breaks `100vh`.

### 16.5 The `useMediaQuery` hook

```ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

Used for:
- Drawer side vs bottom-sheet (`useMediaQuery('(min-width: 768px)')`)
- Reduced motion (already covered)
- High DPR for canvas optimizations
- Reduced data

Returns `false` on SSR (no window). For an SPA, that's fine.

### 16.6 The "design at 360 + 1280" rule

When designing a screen, always test at:
- **360 × 780** — small mobile portrait. The hardest case; if it works here, it works elsewhere.
- **1280 × 800** — standard laptop. The "design baseline" most designers work in.

If you only design at 1280, you'll ship mobile bugs. If you only design at 360, your desktop will feel cramped. Both are required.

Bonus tests:
- **390 × 844** — modern iPhone. Worth checking notch handling.
- **1920 × 1080** — desktop monitor. Worth checking that the page isn't stranded in the center with vast empty side margins.

### 16.7 The "no horizontal scroll" audit

At every breakpoint, verify the page does not horizontal-scroll. Already covered in Part 6.13. Re-emphasis: this is one of the most common responsive bugs and it's a tier-1 quality regression.

Use Chrome DevTools' device toolbar; tap each breakpoint; scan visually.

### 16.8 The mobile chip row

The video-type chips on landing form a row. On desktop, they're a single row. On mobile, they wrap to two rows (or scroll horizontally if there are too many).

Implementation: `flex flex-wrap` on the row; `gap-2` for spacing. Each chip has its own min-width to prevent ugly wrap mid-word.

If the chips would overflow even with wrap (very narrow viewport), scroll horizontally:

```html
<div className="flex gap-2 overflow-x-auto md:flex-wrap" style={{ touchAction: 'pan-y' }}>
```

The `touchAction: 'pan-y'` is essential — without it, the horizontal scroll captures vertical scroll attempts on touch devices, blocking page navigation.

### 16.9 The drawer width on mobile

The bottom-sheet drawer uses `min(85vh, 70rem)` for height and `100vw` for width. The 85vh leaves a 15% strip of the canvas visible above the sheet — gives the user a "I'm in a sheet, not a new screen" hint. Pure 100vh would feel like a route change.

The drag-handle at the top of the sheet (a 4×40px pill in `fg-tertiary/40`) is the dismissal affordance. Drag down → close. This is the standard mobile sheet pattern; we honour it.

### 16.10 Touch vs hover

Hover effects don't apply on touch devices. Tailwind has `hover:` (mouse-specific in modern browsers — `(hover: hover)`). For touch-only devices, hover styles don't trigger.

Implication: don't put critical information behind hover. Tooltips that only show on hover are inaccessible to touch users. Use focus-visible (which fires on keyboard *and* in some cases on tap) or always-visible.

If you genuinely need a hover-only effect (cosmetic ring on a beat node), it's fine — but don't gate functionality behind hover.

### 16.11 The "thumb zone" on mobile

The bottom third of a phone screen is the thumb zone — what the user can reach without re-gripping. Critical actions belong there:
- The persistent URL strip's tap-to-open-tray (bottom).
- The drawer's primary CTA (bottom of drawer).
- The "approve" button when a clip is in preview (bottom of drawer panel).

Tertiary actions can live in the top zone (close button, settings — accessed less often).

The middle third is for content. Don't put critical actions there; the user has to "stretch."

### 16.12 The orientation question

The app is portrait-first. Landscape is supported but not optimized. The 3D canvas works in landscape (extra horizontal real estate is welcome), but the drawer + canvas split is awkward (the drawer eats half the screen).

For the demo: portrait. For users in landscape: it works. We don't aggressively break or warn.

### 16.13 The `vw` and `vh` unit gotchas

`vw` and `vh` include scrollbars. On Windows where scrollbars take horizontal space, `100vw` overshoots viewport width. Use `100%` for full-width within a parent, or `100dvw` if it must be viewport-relative.

`vh` has the iOS Safari URL-bar issue. Use `dvh` / `svh` / `lvh` per intent (covered in Part 6.9).

### 16.14 The `aspect-ratio` for video frames

The final-delivery video uses `aspect-[16/9]` for the video itself, inside an `aspect-[21/9]` frame for the letterbox bars. Both use modern `aspect-ratio` CSS — universally supported.

For images, same treatment. Always set `aspect-ratio` to prevent layout shift on image load. Don't rely on the image's intrinsic dimensions to lay out the page.

### 16.15 The font scaling at small sizes

Manrope at 14px is the body floor on this app. Smaller (12px, 13px) reads as fine print. The cinematic register doesn't have fine print — every text element should read as primary content.

Caption text at 11px is the exception. Caption is metadata; it's allowed to be small. But it's uppercase and tracked at 0.18em, which keeps it legible at 11px.

If you're tempted to shrink body to 13px to fit more — don't. Reduce content, keep the body at 14px floor.

### 16.16 Image responsive — the `picture` and `srcset` patterns

For raster images (rare in this app — mostly icons and 3D), use `<picture>` for art direction (different crops per breakpoint) and `srcset` for resolution variants:

```html
<picture>
  <source srcset="hero-1280.jpg" media="(min-width: 768px)" />
  <source srcset="hero-640.jpg" media="(min-width: 360px)" />
  <img src="hero-360.jpg" alt="Hero" />
</picture>
```

Cloudinary's URL transformations make this trivial — `f_auto,q_auto,w_360` for 360 viewport, `w_640` for 640, etc. We use this for the reference-image thumbnails in the conversation.

### 16.17 The "test on a real phone" rule

Browser device-toolbar emulation is not real phone testing. Differences:
- Touch timing (scroll inertia, double-tap zoom).
- Network speed (dev environment is local + fast).
- Battery / thermal throttling (the device toolbar doesn't throttle).
- Keyboard behavior (iOS keyboard pushes content; emulator doesn't).
- Audio routing (emulator passes through host audio; phone has its own).

Test on a real phone for any release. The device toolbar is a sketch; the phone is the truth.

---

## PART 17 — BUNDLE BUDGET

### 17.1 The 200KB target

Main bundle gzipped: target 200KB. Current: ~203KB. Slightly over. Acceptable.

The 200KB number is the user's threshold for "feels fast on 3G." Above it, first paint is laggy on slow networks. Below it, the app feels instant.

### 17.2 What's in the main bundle

Main bundle = critical path for first paint. Includes:
- React 19 + ReactDOM (~50KB gz)
- React Router (~10KB gz)
- Zustand (~3KB gz)
- Motion 12 (~30KB gz with full feature set)
- Lenis (~5KB gz)
- App code: routes, chrome, store, lib (~80KB gz)
- Tailwind v4 generated CSS (~25KB gz)

Total: ~200KB gz, give or take.

### 17.3 What's lazy-loaded

Not in the main bundle:
- R3F + drei + Three.js (~250KB gz). Loaded on `/canvas` route via `React.lazy()`.
- Cmdk (~15KB gz). Loaded on first ⌘K via `<CommandMenuMount>`.
- GSAP (~25KB gz). Loaded on `/transition` route.
- Radix Dialog (~15KB gz). Loaded with the drawer (which is part of `/canvas`).

The lazy-loading saves roughly 305KB gz from the initial paint. The app loads in two phases: fast first-paint, then "the canvas is rich" loads in the background.

### 17.4 The `React.lazy` + `<Suspense>` pattern

```tsx
const CanvasRoute = React.lazy(() => import('./routes/canvas-route'));

<Route path="/canvas" element={
  <Suspense fallback={<CanvasLoadingFallback />}>
    <CanvasRoute />
  </Suspense>
} />
```

The fallback is lightweight — a single 1px hairline progress bar at the top, no skeleton screens. The actual canvas appears within ~500ms on most devices.

The bridge transition hides the load. The user is on `/transition` for 1.2s, during which the canvas chunk loads. By the time they navigate to `/canvas`, it's ready.

### 17.5 Tree-shaking gotchas

Some libraries don't tree-shake well. Common offenders:
- **Lodash**: import individual methods (`import debounce from 'lodash/debounce'`) or use lodash-es. Don't `import _ from 'lodash'` (drags in everything).
- **Date-fns**: tree-shakes per function. We use it sparingly (just for `format` in the timestamps).
- **Lucide icons**: tree-shakes per icon. We import individual icons (`import { Copy, X } from 'lucide-react'`), never the whole package.

Run `vite build --report` periodically to check what's in the bundle. Surprises happen.

### 17.6 Dynamic imports for big features

Beyond `React.lazy`, dynamic imports work for any chunky feature:

```ts
async function generateStitch() {
  const { buildSpliceUrl } = await import('@/lib/cloudinary');
  return buildSpliceUrl(approvedIds);
}
```

`@/lib/cloudinary` is small enough to bundle, but the pattern is useful for genuinely heavy imports — e.g., loading a heavy export library only when the user clicks "download mp4."

### 17.7 The "no `node_modules` in the main bundle" check

Use `vite-bundle-analyzer` (or the built-in report) to verify the main bundle doesn't accidentally include a heavy dep. Common surprise: a chrome library accidentally pulls in `Three.js` because of an indirect import path.

Audit before each release. Fix the indirect imports. Bundle size matters.

### 17.8 The Tailwind purge

Tailwind v4's JIT engine generates CSS only for classes used. The output CSS is small (~25KB gz for our usage). There's no separate purge step — content scanning happens automatically.

The gotcha: classes constructed at runtime aren't scanned. `<div className={\`text-${size}\`}>` won't generate the relevant `text-xs`, `text-md` classes. Either:
- Use full classnames in the source (`size === 'sm' ? 'text-sm' : 'text-md'`)
- Add safelist patterns to `tailwind.config`

This bit us once. The fix was to switch from runtime-constructed classes to switch-style (full classnames in code).

### 17.9 Font subsetting

Fraunces and Manrope are variable fonts loaded from Google Fonts (or self-hosted). Each variable font is ~50-150KB. We don't subset (yet) because:
- The app is mostly English; subsetting to Latin saves ~20KB but loses fallback for em-dashes / curly quotes.
- The variable axes mean a single font file covers all weights / styles.

If bundle pressure increases, subsetting is a card. Today: not played.

### 17.10 The `font-display: swap` choice

Fonts use `font-display: swap` (the default for Google Fonts). Text appears in fallback first; switches to the loaded font when ready. Tradeoff:

- Pro: text appears immediately (no FOIT — Flash Of Invisible Text).
- Con: layout shift when the font swaps in (FOUT — Flash Of Unstyled Text).

For our display headline (Fraunces at 96px), the FOUT is jarring. We mitigate by preloading the most-used Fraunces axis variant in the HTML:

```html
<link rel="preload" href="/fonts/fraunces-9pt-display.woff2" as="font" type="font/woff2" crossorigin />
```

This drops FOUT to a frame on most networks.

### 17.11 Image compression

The reference-image thumbnails are processed through Cloudinary's `f_auto,q_auto` transformations — auto-format (WebP / AVIF based on browser) and auto-quality. Significant size reduction with no perceptible quality loss.

For local images (icons, the logo if any), use SVG. SVGs are tiny (typically <2KB), scale, and are recolorable via `currentColor`.

### 17.12 The "build in production mode for benchmarking" rule

Vite's dev server is fast but not representative. Bundle size, first paint, and runtime perf should all be measured in the production build:

```bash
pnpm build && pnpm preview
```

Check Lighthouse, check Network panel, check Coverage. Dev mode hides ~30% of the perf cost; the prod build is what users see.

### 17.13 The "Service Worker" question

We don't ship a service worker. Reasoning:
- The app is a hackathon demo; the offline use case is niche.
- Service worker registration adds complexity and potential for stale-content bugs.
- Deploys are infrequent enough that cache invalidation isn't a problem.

For a production app with regular users, a service worker (via Workbox) would be standard. Cache the bundle, prefetch routes, offline mode. We didn't.

### 17.14 The CDN question

Production deploys go to Cloudflare Pages (or equivalent). The CDN handles:
- Static asset compression (Brotli > gzip on supporting browsers).
- HTTP/2 / HTTP/3.
- Edge caching with sensible defaults.

We don't roll our own caching headers. The defaults are correct for an SPA — long-cache hashed assets, no-cache the HTML.

### 17.15 The "first-paint matters more than total" rule

Optimize for first contentful paint (FCP), not for total bundle size. A 200KB main bundle with 800KB lazy-loaded is faster than a 500KB single bundle.

Lazy-load aggressively; ship the critical path small. The user sees the landing in <1s; the canvas loads while they're typing. By the time they submit, the canvas is ready.

### 17.16 The "do you need a bundler config tweak" question

Vite's defaults are good. We rarely tune `rollupOptions.output`. The tweaks we have:
- Manual chunks for vendor splitting (React + ReactDOM in one chunk; the rest in app chunks).
- `chunkSizeWarningLimit` raised slightly to silence noise.

Don't fight the bundler. Vite knows what it's doing.

---

## PART 18 — PREMIUM CHROME

### 18.1 What "premium chrome" means

Chrome is the persistent UI surrounding content — header, footer, sidebars, status indicators. "Premium chrome" is chrome that:
- Is *thin* (doesn't compete with content).
- Is *consistent* (same on every route).
- Is *purposeful* (every element earns its place).
- Has *micro-interactions* that read as crafted (not stock).

Examples in this app: the cinematic cursor, the stage indicator, the persistent URL strip, the mock chip, the command palette, the film grain overlay, the edge-underlines on links.

### 18.2 The cinematic cursor

A custom cursor that lerps slightly behind the actual mouse position, giving a "weight" to the pointer. Implementation:

```tsx
function CinematicCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handler);

    let raf = 0;
    function tick() {
      current.current.x += (target.current.x - current.current.x) * 0.18;
      current.current.y += (target.current.y - current.current.y) * 0.18;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${current.current.x}px, ${current.current.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', handler);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={cursorRef} className="pointer-events-none fixed left-0 top-0 z-80 ..." />;
}
```

The lerp factor 0.18 gives a subtle lag. Higher (0.3+) is too snappy; lower (0.05) feels rubbery.

The native cursor is hidden (`cursor: none` on the body) only on devices with `(hover: hover)` — not on touch devices where there's no cursor.

The cursor changes shape on hover:
- Default: 8px circle, ember outline.
- Over interactive elements: 24px circle, ember fill.
- Over text inputs: 2x16 vertical bar (text caret).

These shape changes are pure-CSS via classes added/removed based on what's underneath. No JavaScript decision-making per frame; the CSS handles it via `:hover` selectors on the cursor's host elements.

### 18.3 The stage indicator

Already covered in Part 6.4. The pattern:

```tsx
const STAGES = ['Concept', 'Plan', 'Beats', 'Cinematic'] as const;

function StageIndicator({ current }: { current: typeof STAGES[number] }) {
  return (
    <div className="caption-track text-[10px] flex gap-3">
      {STAGES.map(stage => (
        <span key={stage} className={stage === current ? 'text-fg-primary' : 'text-fg-tertiary'}>
          {stage}
        </span>
      ))}
    </div>
  );
}
```

Notes:
- The separator dots between stages are rendered as `gap-3` whitespace + a CSS `::before` pseudo-element on each non-first stage:
  ```css
  .stage-indicator > span + span::before { content: '·'; margin-right: 0.75rem; opacity: 0.4; }
  ```
- The current stage is `fg-primary`; others are `fg-tertiary`. No background highlight, no underline — the type weight does the work.

### 18.4 The mock-mode chip

A small chip in the top-right corner that appears when `VITE_MOCK_MODE === true`:

```tsx
function MockModeChip() {
  if (!import.meta.env.VITE_MOCK_MODE) return null;
  return (
    <div className="fixed top-2 right-2 z-30 caption-track text-[9px] text-brand-ember opacity-60 hover:opacity-100">
      ● MOCK
    </div>
  );
}
```

The opacity at 60% keeps it from competing with actual chrome. Hover-to-100 invites "click for more" (which it doesn't have, but the affordance reads as "live status").

In production builds with mock mode off, the chip doesn't render. The `if (!...) return null` guards.

### 18.5 The command palette (⌘K)

Cmdk is the library. Lazy-loaded via `<CommandMenuMount>`:

```tsx
function CommandMenuMount() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!Component) {
          import('./command-menu').then(mod => setComponent(() => mod.CommandMenu));
        }
        // emit open event
        window.dispatchEvent(new CustomEvent('cmdk:open'));
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [Component]);

  return Component ? <Component /> : null;
}
```

The first ⌘K loads the cmdk chunk and opens the menu. Subsequent presses just open the menu (chunk is cached).

The menu has commands:
- Switch to mock mode / live mode
- Toggle audio mute (M)
- Open beat 1, 2, 3, ...
- Reset project
- Show keyboard shortcuts
- Switch to list view (the canvas alternate)

The menu's a11y is solid (cmdk handles it). The menu's styling is drained of color — gray-on-gray-on-near-black, ember only on hover. Premium chrome restraint.

### 18.6 The persistent URL strip

Already heavily covered in Part 6.5. Extra notes:

- The strip uses `useShallow` on `selectApprovedClipPublicIds` (Part 12.4).
- The typewriter animation uses `<TextSplitter>` with sequential per-char delay.
- The afterglow on new tail is a CSS class applied for 1000ms.
- The copy button in the strip has `aria-label="Copy Cloudinary URL"`.

The strip is one of the three winning moments. Treat it as showpiece, not ambient chrome.

### 18.7 The film grain overlay

A 1024×1024 pre-rendered grain texture, layered as a `position: fixed` div with `mix-blend-mode: overlay`:

```css
.film-grain {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  background-image: url(/grain.png);
  background-size: 256px 256px;
  mix-blend-mode: overlay;
  opacity: 0.06;
}
```

The grain reads as analog film texture. Without it, the warm-near-black surfaces feel too clean, too digital. With it, the surfaces have texture.

Important: opacity 0.06 (6%). Higher and the grain becomes intrusive; lower and it's invisible. 6% is the value that survived testing — the user can perceive it without it announcing itself.

The grain uses a static PNG, not animated noise. Animated noise is more cinematic but eats CPU.

The grain's z-index is 15 — above the canvas, below the chrome. Already covered the bug where it was at z-9999 and bled onto modals.

### 18.8 The edge-underline pattern

Hyperlinks in body text use an "edge underline" pattern — a 1px line at the very bottom of the text, ember-tinted:

```css
.link-edge {
  text-decoration: none;
  border-bottom: 1px solid var(--color-brand-ember);
  padding-bottom: 1px;
  transition: border-color 200ms ease-out;
}
.link-edge:hover {
  border-bottom-color: var(--color-brand-ember-deep);
}
```

The default `text-decoration: underline` reads as web-default. The custom border-bottom is thinner, ember, sits closer to the text. Reads as editorial print, not web link.

### 18.9 The "no toast pile" rule (revisited)

Toasts are sonner. Exactly two on screen max at any time. The toast register:
- `bg-bg-elev-1` solid, no glass.
- 1px ember border on success (subtle).
- 1px desaturated-red border on error.
- `text-body-sm` body.
- 4-second auto-dismiss.

The sonner config:

```tsx
<Toaster
  position="bottom-center"
  toastOptions={{
    style: { /* warm-near-black, ember tint */ },
    duration: 4000,
  }}
  visibleToasts={2}
/>
```

`visibleToasts={2}` is the cap. More are queued.

### 18.10 The "1px hairline" everywhere

Hairlines (1px lines) are the structural language of the app. They appear:
- Between conversation turns (`border-b border-fg-tertiary/15`)
- Between drawer sections
- Around tooltip-style cards in the command menu
- As the focus ring perimeter

Hairline tinting:
- `fg-tertiary/15` for the most subtle
- `fg-tertiary/25` for standard structural
- `brand-ember/30` for emphasis

Avoid `border-fg-tertiary` solid (no opacity) — too prominent. The opacity tinting keeps hairlines structural without becoming primary visual elements.

### 18.11 The progress hairline (not a percentage)

Progress is communicated via 1px hairline tracks, not numerical percentages.

The director's questionnaire progress:

```tsx
<div className="h-px w-full bg-fg-tertiary/15">
  <div
    className="h-full bg-brand-ember transition-[width] duration-700 ease-out"
    style={{ width: `${(answeredCount / totalCount) * 100}%` }}
  />
</div>
<p className="caption-track text-[10px] text-fg-tertiary mt-1">
  Director's questionnaire · {answeredCount} / {totalCount}
</p>
```

The track is 1px tall. It says "progress" without saying "12%". The numerical reference is in the caption below — "X / N" — which reads as "Question 3 of 5" not "60% complete."

The earlier version had a "More questions recommended" pill with a percentage. The user noted it read as empty input. The hairline + "X / N" caption reads as director-tracking. Same information, different register.

### 18.12 The drawer's title and description

Drawer header pattern:

```tsx
<header className="space-y-1">
  <p className="caption-track text-[10px] text-brand-ember">BEAT 03</p>
  <h2 className="font-display text-[2.25rem] leading-[1.0] tracking-[-0.02em] text-fg-primary text-balance">
    The morning the dog came home
  </h2>
  <p className="font-display italic text-[1.125rem] leading-[1.4] text-fg-secondary text-pretty">
    A *low-light* dawn shot — the moment a familiar shape appears in a doorway.
  </p>
</header>
```

Notes:
- Eyebrow at 10px, ember (the only place the eyebrow gets ember — beat-numbering is critical context).
- Title at 36px Fraunces, balanced.
- Description at 18px Fraunces italic, with a single connective italicized (`*low-light*` → `<em>low-light</em>` in the rendered version, with the italics applied via Markdown rendering).

This pattern appears on the canvas drawer; the route titles use a similar structure.

### 18.13 The "no breadcrumb" rule

We don't ship breadcrumbs. The stage indicator is the breadcrumb-equivalent. Breadcrumbs are SaaS chrome; stage indicators are cinematic.

If you're tempted to add a breadcrumb, ask whether the stage indicator already covers it. Usually yes.

### 18.14 The keyboard-shortcut overlay

Pressing `?` shows a modal with keyboard shortcuts. Minimal — just the shortcuts that matter:

- ⌘K — Command palette
- M — Toggle mute
- Esc — Close drawer / modal
- ? — This help
- Arrow keys (on canvas) — Navigate beats
- Enter (on canvas focus) — Open beat

The overlay is a Radix Dialog with the same chrome treatment as the drawer (warm-near-black, hairlines, Fraunces title). Press Esc or `?` again to close.

### 18.15 The "command palette is the escape valve" rule

Anything that doesn't earn dedicated chrome — settings, debug toggles, advanced actions — goes in the command palette. The chrome stays clean; power users have access.

This is the rule from Part 2.6 ("restraint is a feature"). It's worth restating because the temptation to add a "settings gear" icon to the chrome is real. Don't. ⌘K is the escape valve.

---

## PART 19 — MICROCOPY

### 19.1 The director's voice

Every word the user reads in this app, except the user's own typed input, is written in the **director's voice**. Not the assistant's voice. Not the product team's voice. The director.

The mental model: an experienced second-AD on a film set, talking to a first-time director. They are warm, decisive, direct. They presume competence. They never patronize. They use film language ("the close-up," "the master," "the wide") naturally. They have opinions and offer them as questions.

Examples:

| Wrong (assistant-toned) | Right (director-toned) |
|---|---|
| "What would you like for lighting?" | "Tell me about the lighting in this beat." |
| "Are you ready to confirm?" | "Let's lock the closing shot." |
| "Generate" | "Cast it" / "Roll" / hold-to-cast |
| "Submit" | "Send to the floor" (or just inline) |
| "Project" | "Cut" / "Reel" |
| "Click here to learn more." | "More on the framing language." |
| "Welcome back!" | "Picking up from beat 03." |

The voice is *consistent*. If one place reads as assistant, the rest of the app's voice gets undermined. Audit microcopy as a single coherent text — read every UI string out loud in sequence; do they sound like one person?

### 19.2 The banlist

Words and phrases banned from this product's microcopy:

- "Generate" — assistant default, the most generic AI verb. Use "cast", "render", "roll".
- "Submit" — form-language; doesn't fit. Use the action verb directly ("send", "lock").
- "Continue" — generic CTA. Use what the user is doing next ("to the canvas", "let's lock it").
- "Next" — same problem as "Continue".
- "Get started" — marketing-speak. Use a directive ("Begin," or no CTA at all).
- "Let's go" — same.
- "Powered by AI" — banned. Cinematic products don't advertise their tooling.
- "Welcome to..." — patronizing.
- "We are processing your request." — call-center language. Use "Thinking..." or a hairline progress.
- "Magic", "magical", "magically" — AI-hype tell.
- "Seamless" — tech-press cliché.
- "Intuitive" — claiming intuitiveness is a confession of non-intuitiveness.
- "Effortless" — same.
- "Experience" (as noun) — Disney-speak.
- "Journey" — startup-speak.
- "Sparkle" / ✨ — AI-product universal tell.
- 🚀 / any emoji — banned. (The user is explicit on this.)
- "Cool!" / "Awesome!" / "Great!" — feedback bubbles that mean nothing.
- "Click here" — accessibility violation; use descriptive link text.
- "Please" (in instructions) — over-polite, reads as customer-service.
- "Sorry, something went wrong." — generic error. Be specific or be silent.

If you find one of these in the codebase, replace it. Audit before each release.

### 19.3 The italics-on-connectives rule (again)

Already covered in Part 4.6. Re-emphasized because microcopy is where the rule applies most often.

When the agent says something like "the camera dollies *into* the frame," italicize the connective. When the user reads it, the rhythm is right. When you italicize "*camera*" instead, it reads as overwrought.

The only exception: emphasizing a specific *word* that the user supplied (e.g., "you said *gauzy* — should the closing shot lean that direction?"). User words can be italicized as a callback.

### 19.4 The "use Markdown for italics" pattern

Microcopy strings are stored with Markdown italics, rendered via a small Markdown renderer:

```ts
const description = "A *low-light* dawn shot — the moment a familiar shape appears.";
// rendered: A <em>low-light</em> dawn shot — the moment a familiar shape appears.
```

This keeps the source readable and the italics inspect-able. Do *not* embed `<em>` tags in source strings — they'll get escaped or rendered as text in some cases.

### 19.5 The em-dash and en-dash discipline

Already covered in Part 4.10. Re-emphasized:
- `—` (em-dash) for parenthetical interruptions — like this.
- `–` (en-dash) for ranges (3–5 beats).
- Hyphen `-` for hyphenated words (low-light, fast-cut).

Never `--` for em-dash. Never `-` for en-dash. The character matters.

### 19.6 The placeholder copy

Input placeholders have their own register — they're fade-able hints, not body content:

| Wrong | Right |
|---|---|
| "Enter your prompt" | "What's the cinematic memory?" |
| "Type a message..." | "tell me what's in frame..." |
| "Search" | "search beats, scenes, terms" |

The placeholder should suggest *what* and *why* in five words or less. Specific is better than generic. "Type a prompt" tells the user nothing they don't know; "What's the cinematic memory?" tells them what we want.

### 19.7 The empty state copy

Empty states are where the director's voice has the most room:

- Canvas with no beats yet: "approve a beat to begin" (covered)
- Stitch tray with no approved clips: "the splice composes itself when you lock a beat"
- Conversation with no turns: "the agent will start the brief when you open this beat"

Each empty state reads as a director's note. Not an absence; a suggestion.

### 19.8 The progress copy

When the agent is "thinking" (waiting for response), don't show "Loading...":

| Wrong | Right |
|---|---|
| "Loading..." | (no text — just a hairline progress) |
| "Generating..." | "rolling..." |
| "Please wait" | "..." with a typewriter cursor |

The cinematic register doesn't acknowledge waits the way SaaS does. Either show progress visually (hairline, typewriter cursor) or trust the user to perceive the pause as intentional pacing.

### 19.9 The error copy

Errors are specific, brief, never blame the user:

| Wrong | Right |
|---|---|
| "An error occurred. Please try again." | "the take didn't land — retry?" |
| "Network error" | "couldn't reach the floor — check your connection?" |
| "Invalid input" | "this beat needs a few more details before we cast it" |

The pattern: name what happened (in director's voice), suggest the next move.

### 19.10 The button label rules

Buttons:
- Use a verb, not a noun. "Approve" not "Approval".
- Use the imperative form. "Cast it" not "Casting".
- Keep to 1-3 words. "Approve" beats "Approve this beat".
- Match the cinematic register. "Roll" beats "Generate".

The hold-to-cast button's label is "hold to cast" — instructional plus directive. The label changes based on state:
- Idle: "hold to cast"
- Holding: "casting..."
- Released early: "hold to cast" (with a soft pulse)
- Held long enough: "rolling" (mid-action) → "cast" (post-action)

Each state has its own label. Reads as the director acknowledging the action.

### 19.11 The toast copy

Toasts are short, single-line, period-terminated:

- "URL copied."
- "Cinematic downloaded."

Not exclamation-pointed. Not multi-line. Period-terminated reads as confident; exclamation-pointed reads as eager.

### 19.12 The conversation register

The agent's conversation is the densest microcopy in the app. The register:
- Sentences are short (rarely >20 words).
- Questions are specific ("how heavy is the snow on the road?", not "what's the weather?").
- Statements end in periods, not exclamations or ellipses.
- The agent calls back to the user's earlier words ("you mentioned *gauzy* — let's hold that for the closing shot").
- The agent uses film language naturally ("the master shot," "a quarter-back framing," "a foley wash").

When in doubt, write the line, then ask: would Wes Anderson's first-AD say this? If yes, keep. If no, rewrite.

### 19.13 The "no instructional helper text" rule

Don't write helper text that says "this field needs..." or "we recommend...". The agent's job is to ask for what's needed; the chrome's job is to display affordances. There is no "learn more" or "tip" text.

If you're tempted to add helper text, the design has a problem — the affordance isn't clear, and you're patching with text. Fix the affordance.

### 19.14 The case discipline

- **Title case**: only on the route titles and drawer titles ("The Morning the Dog Came Home"). Note: in title case, articles and short prepositions are lowercase.
- **Sentence case**: everything else — body, captions, button labels, microcopy. The director's voice uses sentence case because it reads as natural speech.
- **ALL CAPS**: only for caption/overline tracking-out (`text-overline`, `text-caption` with `0.18em`). Used for stage indicator stages, eyebrow labels, status indicators ("LIVE", "RECORDING").

There is no MIXED CaSe, no Title Case On Buttons, no allcaps-no-tracking. The discipline is strict.

### 19.15 The "say once" rule

Don't repeat information across the chrome. If the stage indicator says "Beats" (we're on the canvas route), don't *also* have a header "On the Canvas" — pick one.

Repetition reads as lack of editorial confidence. Say once, say well.

### 19.16 The microcopy audit

Before each release:
1. List every visible string in the app (route titles, drawer titles, button labels, captions, empty states, error messages, success toasts, agent voiceover lines).
2. Read them all out loud in sequence.
3. Do they sound like one director?
4. Are any banlist words present?
5. Is the case consistent?
6. Are em-dashes em-dashes?

This audit is 30 minutes. It catches ~10 microcopy regressions per major build. Required.

### 19.17 The microcopy versioning

Microcopy changes ship like code changes. Each phase's lessons capture the microcopy decisions made (e.g., "decided 'cast' over 'render' for the generate verb because cast reads as casting an actor, render reads as 3D software"). The decisions are durable; rewrites in future phases need to know them.

Keep a `MICROCOPY.md` (or section in design docs) with the decisions. We have one in this repo.

### 19.18 The "prefer fewer words" rule

If a label can be one word, make it one. If a sentence can be a phrase, phrase it. If a paragraph can be a sentence, sentence it.

Cinematic register is *spare*. SaaS register is *thorough*. Spare wins.

The exception: agent voiceover lines, where the agent is genuinely conversing. Even there, the agent is brief — 2-3 sentences max per turn. If the agent needs to say more, break it into multiple turns; let the user catch up between.

### 19.19 The microcopy in flow vs in chrome

Distinguish:
- **In-flow copy**: the agent's lines, the user's prompt, the route titles. This is content the user is *engaging with*.
- **Chrome copy**: button labels, captions, status indicators, empty states. This is content the user *uses*.

In-flow copy can be richer, more cinematic, more personal. Chrome copy is structural, brief, consistent.

The two share the director's voice but differ in length and decoration. A button label has no italics, no em-dashes, no metaphor. An agent line has all three.

### 19.20 The "test microcopy in screenshot" rule

Microcopy must work in a screenshot — context-free, zero animation, just the words. If a string only "works" because of how it slides in or because the user just saw the previous string, it's fragile.

Walk every screen as a static image. Read the words. Do they hold up?

---

## PART 20 — DEMO-DAY CALCULUS

### 20.1 The three-minute window

A hackathon demo is three minutes per team. The judge has half-attention on the screen and half on their notes. The three minutes are:

- 0:00–0:30 — Hook. The first 30 seconds set the tone. If you don't grab them here, the rest is lost.
- 0:30–2:00 — Show. The actual product demo. Three winning moments need to land in this 90 seconds.
- 2:00–2:45 — Stack. What you built, why, the technical depth. The judge is mostly looking at notes during this; the project pitch wraps in.
- 2:45–3:00 — Close. Final cinematic, big finish, "thanks."

The three winning moments must all happen between 0:30 and 2:00. That's 90 seconds for: portal, canvas, URL.

### 20.2 The 800ms rule

Every screen change must communicate within 800ms. Reasoning:
- Judge attention has windows of ~1-2s before drift.
- A change that takes 2s to register is half-perceived; the judge already moved on.
- 800ms is "instant" plus a beat — long enough to feel deliberate, short enough to not lose attention.

This rule applies to:
- The bridge transition (1.2s — slightly over, justified by its showpiece nature)
- Drawer entry (~360ms — well under)
- URL strip update (~600ms — okay)
- Beat node state change (~600ms — okay)
- Modal open (~240ms — well under)

If a change takes longer than 800ms, ask: is it earning the wait? The bridge transition is the only long animation that earns its keep.

### 20.3 The "every screen is a screenshot" rule

If the screen doesn't work as a still image, it's not done. Reasoning:
- Demos are paused for explanation. The judge looks at a still.
- Press coverage uses screenshots.
- Awwwards judges screenshots first, video second.

The test: pause the app at any moment. Is the frame composed? Does the typography read? Is the chrome restraint? If yes, ship. If no, polish.

### 20.4 The "first 4 seconds" rule for landing

The user lands on `/`. Within 4 seconds, they must:
1. Understand what the product does.
2. Be able to act (type a prompt).
3. Be willing to act (the product looks legit).

The headline carries (1) — "an offering, into the night" + a subtitle that names the product.
The input carries (2) — large, focused on mount, placeholder suggestive.
The aesthetic carries (3) — Fraunces + warm-near-black + ember = "this is a real product."

If any of these three fail in the first 4 seconds, the user (or judge) leaves.

### 20.5 The mock-mode safety net

If the live backend fails mid-demo, reload with `VITE_MOCK_MODE=true`. The mock chip lights up; the demo continues; the judge doesn't see the failure.

The mock chip's existence is the signal "we know about both modes." It also signals "this is a serious project — we have testability." That signal alone has value with judges.

### 20.6 The "kill switch" for animations

In dev, a `?nomotion=1` query param disables all motion (full reduced-motion). Useful for:
- Capturing static screenshots
- Testing reduced-motion paths
- Demoing on a slow projector that drops frames

In production, this query param is left in. It's a safety net. If a judge's monitor stutters during the demo, the presenter can quickly add `?nomotion=1` and the app runs static.

### 20.7 The "stage indicator is the demo backbone"

The stage indicator ("Concept · Plan · Beats · Cinematic") is what tells the judge "this is the user's progression." Even if the judge zones out during the demo, when they look back, they can see where the demo is in the flow.

The stage indicator is a chrome-level demo aid. It's the equivalent of a slide deck's progress bar. Its existence makes the demo *legible* to a half-attentive audience.

### 20.8 The "everything is a single click" rule

The entire demo flow should be operable from a single click each step:
- Land → click input → type → submit (single Enter) → bridge → canvas
- Canvas → click beat → drawer opens → conversation auto-starts → enter messages → click approve
- All beats approved → click stitch (or it auto-suggests) → final
- Final → click play → click download

No "first click X, then click Y, then click Z to do the thing." Every meaningful action is one click. This makes the demo flowable; the presenter's hands are mostly off the keyboard.

### 20.9 The "narrate the visual moments" rule

When demoing, the presenter narrates:
- "And as I type, you can see the canvas decompose..." (timed to the bridge)
- "Each beat has a director conversation..." (timed to drawer open)
- "And the URL composes itself live..." (timed to first approval)

The narration sells the moments. Without narration, the moments still land visually, but the judge may not connect them to features. With narration, the moments are explicit.

The presenter rehearses with the app. The narration is timed to the visual moments. Slack of 1-2 seconds either side. Practice 5-10 times before the demo.

### 20.10 The "have a backup" principle

Every part of the demo has a backup:
- Live backend → mock mode (covered).
- Live agent → canned conversation (covered in mock mode).
- Live clip generation → pre-uploaded clips returned by mock generate.
- Live Cloudinary stitch → it's a URL; works as long as Cloudinary is up.
- Internet down → app loads from local Vite preview; no network needed (with mock mode).

Worst case: laptop fails. Have a video recording of the demo as a final backup.

We tested all backups before submission. Worth doing.

### 20.11 The "lead with the moment" rule

Don't open the demo with "Here's our landing page." Open with the moment. "Here's a single-prompt to a finished cinematic." Then show the bridge. Then the canvas. The frontmatter is irrelevant until the moments have landed.

The user (Alex) was clear on this: open strong. The first 5 seconds of demo should be one of the three winning moments, not a logo or a "before I start..." prologue.

### 20.12 The "reveal one thing per beat" rule

Each demo beat (10-15 seconds) reveals exactly one new thing:
- Beat 1: the prompt → bridge → canvas. New thing: 3D star-map.
- Beat 2: click a beat → drawer opens. New thing: director conversation.
- Beat 3: approve a beat → URL strip updates. New thing: live Cloudinary URL.
- Beat 4: approve all → final delivery. New thing: cinematic playback.
- Beat 5: download → "make another." New thing: end-to-end loop.

Five beats × 30 seconds (with breath) = 150 seconds = 2:30. Leaves 30 seconds for hook + close.

### 20.13 The "don't show the questionnaire" rule

The director's questionnaire (the agent conversation) is part of the product, but it's a 30-second exchange — too long for a live demo. In demos:
- Open one beat to *show* the conversation (5 seconds).
- Skip ahead with a "I'll fast-forward through this" beat.
- Resume at "approve this beat" with the conversation already complete.

The full conversation is for users, not judges. Demo the *that*; gloss the *how*.

### 20.14 The "presentation laptop" hygiene

The presenter's laptop should:
- Have only the demo app and the slide deck open.
- Have notifications muted (Do Not Disturb).
- Have battery at >80% or be plugged in.
- Have brightness up.
- Have audio routing checked.
- Have the URL bar bookmarked to the demo build.

Spent 30 minutes setting up; saves 5 minutes of fumbling at demo time. Required.

### 20.15 The "rehearse with the demo agent" technique

The agent in mock mode has canned responses. Memorize the timing:
- Type prompt → 2s decompose → bridge starts.
- Open beat → 0.4s drawer → 1.2s agent first turn types in.
- Send message → 1.5s agent typing indicator → response.

Time the narration to these. Rehearse until you can do it without watching the screen.

### 20.16 The "what if the judge asks ___" preparation

Common judge questions:
- "How does the AI work?" → "We use LangGraph for the agent state machine, Veo for clip generation, Cloudinary for the URL transformation. The conversation uses..."
- "What's your bundle size?" → "200KB main, lazy-loaded the rest."
- "How did you handle X edge case?" → (have specific examples)
- "What would you do with more time?" → "Polish the multimodal voice + vision drop, add a project library, ship the postprocessing pipeline."

Have answers prepared. Don't fumble. The judges have asked these questions a hundred times; succinct answers register as "competent team."

### 20.17 The Cloudinary track-hero specific calculus

The Cloudinary track judges value:
- Use of Cloudinary's *unique* features (URL transformations, fl_splice, video delivery).
- *Visible* use, not just backend.
- A track-hero moment — something that shows off Cloudinary as the differentiator.

The persistent URL strip is our track-hero moment. It must be center-stage in the Cloudinary-track demo. Spend extra seconds on it. Show the URL composing. Click "copy." Open the URL in a new tab and play the stitched mp4 live.

### 20.18 The post-demo follow-up

After the demo:
- Have a Devpost / GitHub link ready to share.
- Have screenshots ready (judges may want them for write-ups).
- Have a 1-paragraph pitch ready ("SceneOS is a cinematic AI agent that turns one director's prompt into a finished short film via a director conversation, real-time clip generation with Veo, and Cloudinary's fl_splice URL transformation.").

Print business cards if you do that sort of thing. Otherwise, a QR code to the project.

### 20.19 The judge's mental model

The judge has just seen 7 ChatGPT wrappers in a row. They are tired. They are looking for one of:
- Real differentiation (a product that couldn't have existed without genuine effort).
- Polished execution (a product that feels real, not hackathon).
- Memorable hook (a moment they'll repeat to their friends).

We aim for all three. Differentiation: the conversation + canvas + URL. Polish: the cinematic register. Hook: the bridge transition.

When in doubt, what does the judge remember three days later? That's the bar.

### 20.20 The demo is a film

The demo itself — the way the presenter walks through the app — is a film. It has a beat structure (hook, show, stack, close). It has pacing (faster at the moments, slower at the explanations). It has a soundtrack (the synthesized cues).

Treat the demo as a creative artifact. Spend as much time on the demo flow as on the product. They are the same thing.

---

## PART 21 — PROCESS

### 21.1 The lesson reflection cadence

Before each phase of work, write a `LESSONS_FROM_PHASE_N.md` reviewing what worked and what failed. Specifically:
- Wins: what's now solid, where the design held up, where the code earned its keep.
- Losses: what shipped and got reverted, what shipped and got polished out, what we learned not to do.
- Open questions: what's still uncertain, what to revisit, what's deferred.

The format:

```markdown
# Lessons from Phase 7

## Wins
- The off-axis grid on landing held up. The headline at columns 2-7 reads composed.
- The new Fraunces + Manrope pair works at every size. No regrets.

## Losses
- Tried a saturated state-success green. User: "looks like GitHub merge." Desaturated.
- ...

## Open
- The drawer's bottom-sheet variant on iOS — keyboard interaction needs a real device test.
```

These reviews compound. Future phases reference past lessons. The review file is the team's shared memory.

### 21.2 The audit-fix-build-commit cadence

Within a phase, the loop is:

1. **Audit**: read the spec, read the existing code, walk the app, list what's missing or wrong.
2. **Fix**: address the immediate inconsistencies. Don't add new features yet.
3. **Build**: implement the new functionality. One feature at a time; commit after each.
4. **Commit**: prose-style message, no Co-Authored-By trailer (covered next).

The audit pass is non-negotiable. Without it, you build on top of bugs and they compound. Audit first.

### 21.3 The "no Co-Authored-By trailer" rule

Commits and PRs **must not** include `Co-Authored-By: Claude` trailers. The user signs them; the agent is invisible at the git layer.

This is one of the loudest rules. The user has been explicit. The reason: external readers (judges, recruiters, future maintainers) should see the user's commits, not "Claude was here." The agent is a tool, not an author.

When committing, end the message with the substance — no trailers, no signatures. Just the commit message.

### 21.4 The commit message register

Commit messages match the cinematic register. Prose-style, sentence-case, period-terminated. Specific.

Examples:

| Wrong | Right |
|---|---|
| "fix bug" | "Restore beat node visibility on portrait viewports — ResponsiveCamera widens FOV when aspect <1." |
| "update styles" | "Lift drawer description to Fraunces italic 18px so it reads as voiceover, not helper text." |
| "wip" | (don't commit WIP unless absolutely necessary; if so, name what's WIP) |
| "Add useShallow" | "Wrap selectApprovedClipPublicIds in useShallow — Zustand v5 + React 19 StrictMode crashes on fresh-array selectors." |

The commit message is the project's running narration. Make it readable.

### 21.5 The "keep PRs scoped" rule

A PR should have a single thesis: "this PR does X." If the PR also fixes Y unrelatedly, split.

Reasoning:
- Reviewing a multi-thesis PR is harder.
- Reverting a multi-thesis PR is destructive.
- The PR's title can't be specific.

For a hackathon, scope discipline relaxes (the project is moving fast, we land bigger PRs). But the spirit applies — try to keep changes coherent.

### 21.6 The "test the build" rule

Before committing:
1. `pnpm build` — does it succeed?
2. `pnpm preview` — load the prod build; does it work?
3. Walk the app; check the touched routes.

Type checking + the test suite verify *code correctness*, not *feature correctness*. The build + preview catch runtime regressions that types miss.

For UI changes, this is non-negotiable. "I think it works" is not enough. Open the browser. Use the feature.

### 21.7 The "screenshot before / after" pattern

For visual changes, capture before/after screenshots in the PR description. Reasoning:
- The reviewer (or future you) can verify the change is what was intended.
- The visual record is durable; screenshots survive git history.
- The act of taking the screenshot forces you to look at the result, not just the diff.

We don't formalize this for every change, but for any chrome / typography / motion change, the screenshot is in the PR body.

### 21.8 The "agent is collaborator, not author" principle

The agent's job is to write the code; the user's job is to provide direction and review. The agent does not commit unilaterally. The agent does not push to remote without explicit ask. The agent does not open PRs without explicit ask.

When the agent finishes a task, the agent reports back. The user reviews. The user commits. (Or: the user delegates the commit to the agent, but the user is the author.)

This boundary preserves the user's signature on the work. It also keeps the user in the loop on every meaningful change — which is correct for a hackathon project where direction shifts daily.

### 21.9 The "explain the why" rule

When the agent makes a non-obvious choice, explain why in the response. Not in the code (we don't comment what the code does — see Part 21.13), but in the chat reply.

Example:
> Switched the bridge timeline to GSAP. Motion's variants are great for component-level transitions, but a precisely-timed multi-target sequence is GSAP's home turf. The bridge has 5 staggered tweens (starfield, camera, title, headline, fadeout) at specific times, which is a GSAP timeline natively. Motion would require nested AnimatePresence + custom delays, which would be more code and more fragile.

The user can correct the choice if they disagree. Without the why, the user can't tell the agent's reasoning from a coin-flip.

### 21.10 The "check the scope" rule

When a task is "fix the responsive on landing," the scope is: the landing route's responsive behavior. It is not: also fix the canvas's responsive, also reorganize the chrome, also refactor the motion tokens.

Scope creep is the #1 cause of project drag. Stick to the task. If you spot a related issue, *flag it* (in the chat, in a TODO file, in a future task) but don't fix it.

The exception: if the related issue is blocking the task (you can't fix landing's responsive without first fixing the chrome), then it's in scope. But name it explicitly.

### 21.11 The "don't write features ahead of the spec" rule

If the spec says "add voice input on landing," don't also add voice input in the conversation. The conversation might want voice input later, or might not — it's a separate decision.

Speculative features are usually wrong. The future-you who needs the feature has more context than the present-you who's guessing. Build for now.

### 21.12 The "delete more than you add" instinct

When polishing, the polish is often deletion: remove a label, remove a color variant, remove an animation.

The audit question: "what would happen if we removed this?" If the answer is "nothing meaningful," remove it. The cinematic register is built by deletion, not addition.

### 21.13 The "no useless comments" rule

Default to writing zero comments. A comment earns its place when:
- The *why* is non-obvious (a constraint, a workaround, an invariant).
- A reader without context would be misled by the code.
- It's a TODO / FIXME with a specific actionable.

Don't comment what the code does. The names do that. Don't reference the current task or the PR or the issue — those rot.

The comments that survive in this codebase are:
- "useShallow: selectApprovedClipPublicIds constructs a fresh array on every call. Without shallow equality, zustand v5 considers each call a state change..." — explains a non-obvious workaround.
- "EffectComposer (Bloom + Vignette + DepthOfField) removed for proof of concept. Under React 19 + R3F 9..." — explains why the absent code is absent.
- "Camera distance scales with beat count (#161): default 5.5 fits 5 beats; 7 needs ~6.7..." — explains a magic number.

Each comment has a specific failure or constraint as its justification. Without that, the comment goes.

### 21.14 The "commit early, commit small" rule (with caveats)

Small commits are easier to review, revert, and understand. But hackathon projects often have phases where multiple files change together for a single feature; splitting that artificially makes the history harder to follow.

The rule: a commit should represent a coherent change. "Add voice input on landing" might touch hooks, components, store, types, styles — all in one commit, because they're part of one feature. "Add voice input AND fix the canvas FOV" should be two commits.

Coherence over count.

### 21.15 The "branch per feature" pattern

For non-trivial features, branch off main:
```
git checkout -b voice-on-landing
# work
git push -u origin voice-on-landing
# PR
```

This lets the user review before merge. It also keeps `main` clean — only landed work is on main.

For tiny fixes (typo, single-line change), commit to main directly. The PR overhead isn't earning its keep.

The judgment: if the feature could be reverted as a unit, branch. If not, main.

### 21.16 The "always test the prod build before committing big changes" rule

Already covered in 21.6 but worth re-emphasizing. Dev mode hides ~30% of perf cost and some bugs (Vite's HMR can mask state issues; production's tree-shaking can break dynamic imports).

Before any commit that touches:
- Bundle structure (lazy imports, dynamic imports, dependency changes)
- Routing
- State (especially persisted state)
- Build config

…run `pnpm build && pnpm preview` and walk the app. Required.

### 21.17 The "no `console.log` left in production" rule

Console logs in production are noise. They confuse browser console searches. They expose internal state.

Before each release, search the codebase for `console.log`, `console.warn`, `console.error`. Remove or replace with a proper logger (we don't have one — so just remove).

The exception: deliberate `console.error` for unactionable failures (covered in Part 13.12). These are useful for debugging and don't affect the user. Keep them; remove the rest.

### 21.18 The "demo handoff" document

Before submission, write a `DEMO_HANDOFF.md` with:
- The demo flow (what the presenter does, in order).
- The kill-switch instructions (`?rm=1`, `?nomotion=1`).
- The mock-mode toggle.
- The fallback procedures.
- The submission links.

This is for the presenter (often the user themselves) to rehearse with. Without this, the demo flows from memory; with it, the flow is durable.

### 21.19 The "after the demo, write up the lessons" cadence

After demo day, before the project moves on (or shelves), write the postmortem:
- What we shipped.
- What we'd do differently.
- What the judges asked.
- What the audience reaction was.

The postmortem closes the project's loop. Future projects benefit from the lessons. Even a hackathon project deserves a postmortem.

### 21.20 The "trust your instincts, but verify" rule

You'll have intuitions about what to do next. Trust them — they come from accumulated taste. But verify before commit:
- Does the change pass typing?
- Does it pass build?
- Does it look right in the browser?
- Does it feel right under your fingers?

Intuition + verification = senior. Intuition without verification = junior. Verification without intuition = robot. Be senior.

---

## PART 22 — ANTI-PATTERNS BANLIST

A list of patterns banned from this codebase. Each ban has a reason; the reason is the load-bearing part. Future-you may face a context where the ban looks wrong; the reason will tell you whether to break it.

### 22.1 ✨ Sparkles icon next to AI features

**Why banned**: it's the universal "this is an AI feature" tell. Reads as ChatGPT-clone. Replace with `Clapperboard` (when the feature is film-related) or remove entirely.

### 22.2 `transition-all`

**Why banned**: animates every property, makes performance debugging impossible, fights with Motion. Use explicit transition lists.

### 22.3 Magic durations and eases

**Why banned**: the existence of `duration: 0.4` or `ease: [0.4, 0, 0.6, 1]` in component code creates an inconsistent motion language. Use tokens from `motion-tokens.ts`.

### 22.4 Mono font for body text

**Why banned**: reads as system log, not as conversation. Use Manrope for body, Geist Mono only for technical strings.

### 22.5 Emoji in microcopy

**Why banned**: ✨🚀💡 read as marketing landing page. The director's voice doesn't emoji.

### 22.6 Hardcoded camera positions in R3F

**Why banned**: silently override responsive setups. Pass via props.

### 22.7 Static atmosphere shells

**Why banned**: an atmosphere that doesn't breathe reads as a sphere. The breathing scale (subtle, ~3% over 4s) is what makes it read as alive.

### 22.8 Unbounded `useEffect` re-renders

**Why banned**: cause max-update-depth crashes, eat performance. Always have stable deps; watch for fresh-object-on-each-render gotchas.

### 22.9 Auto-playing audio without opt-in

**Why banned**: judge in a public space hears AI cue. Catastrophic. Audio is muted by default; user opts in.

### 22.10 Default Tailwind shadows

**Why banned**: `shadow-md`, `shadow-lg` read as Bootstrap. Use custom shadow tokens.

### 22.11 Default Tailwind rounded corners

**Why banned**: `rounded-md` reads as default. Pick `rounded-full` (pills) or `rounded-[2px]` (precise).

### 22.12 Toast on every action

**Why banned**: pile up, train users to ignore. Inline UI for actionable feedback; toast for legitimate one-shots.

### 22.13 Console.log in production

**Why banned**: noise. Browser console should be clean except for deliberate console.error.

### 22.14 Co-Authored-By trailers on commits

**Why banned**: project authorship is the user's. Agent is invisible at the git layer.

### 22.15 SaaS chrome (sidebar, navbar, breadcrumb)

**Why banned**: cinematic register doesn't allow it. Use letterbox bar, stage indicator, command palette instead.

### 22.16 "Click here" link text

**Why banned**: accessibility violation. Use descriptive link text.

### 22.17 Toast pile (>2 simultaneous)

**Why banned**: overwhelms. `visibleToasts={2}` is the cap.

### 22.18 `console.error` for unactionable in user-facing code

**Why banned (with exception)**: spam. Exception: documented "logged but not surfaced" patterns (Part 13.12).

### 22.19 Mock-mode-only features in live mode

**Why banned**: divergence. If the feature works in mock, it must work in live (or be hidden in live).

### 22.20 Storing derived state

**Why banned**: bugs in sync between source and derived. Use selectors.

### 22.21 `useEffect` in store actions

**Why banned**: actions are sync. Side effects live in components.

### 22.22 Multiple Zustand stores per feature

**Why banned**: cross-store coordination is hard. Two stores total. Add a third only if there's no overlap.

### 22.23 Inline styles for tokenized values

**Why banned**: defeats the token system. Use `tailwind.config` tokens (`bg-bg-base`, `text-fg-primary`, etc.).

### 22.24 Custom CSS for what Tailwind has

**Why banned**: divergence between custom and tailwind. Use Tailwind utilities.

### 22.25 Custom Tailwind for what CSS has

**Why banned**: indirection. If a one-off utility is genuinely one-off, inline `style={{}}` (rare) or write a CSS class for it.

### 22.26 Italicizing nouns and verbs

**Why banned**: wedding-invite register. Italics on connectives only.

### 22.27 ALL CAPS without tracking

**Why banned**: reads as shout. Always pair with `0.18em` tracking.

### 22.28 Mixed dash characters

**Why banned**: `--` for em-dash, `-` for en-dash → typography violation. Use `—`, `–`, `-` correctly.

### 22.29 Straight quotes in microcopy

**Why banned**: amateur tell. Use curly quotes.

### 22.30 Animation on idle elements

**Why banned**: decoration motion. The four reasons (reveal, acknowledge, bridge, signal) gate motion. Idle decoration fails them.

### 22.31 Hover-only critical info

**Why banned**: inaccessible to touch. Don't gate functionality behind hover.

### 22.32 Unbounded selector arrays without `useShallow`

**Why banned**: React 19 + Zustand v5 max-update-depth crash. Wrap in `useShallow`.

### 22.33 Persisting transient UI state

**Why banned**: stale state on reload (e.g., eternal `pending`). Use `partialize`.

### 22.34 First-class postprocessing on R3F first commit

**Why banned**: `@react-three/postprocessing` 3.0.4 crashes on first commit under React 19 + R3F 9. If reintroduced, isolate behind error boundary that disables on first failure.

### 22.35 Auto-focus on arbitrary mount

**Why banned**: steals user keyboard context. Apply only when "the user came here to act on this."

### 22.36 Background music

**Why banned**: prescriptive, amateur. Cues are punctuation; not wallpaper.

### 22.37 Multiple accent colors

**Why banned**: dilutes the demo signature. Ember is the only accent.

### 22.38 Glassmorphism on chrome above z-1

**Why banned**: generic-AI tell. Solid surfaces. The persistent URL strip is the one exception (covers 3D canvas).

### 22.39 Inter as the body font

**Why banned**: ChatGPT-clone tell. Manrope is the answer.

### 22.40 Italiana / Instrument Serif as display

**Why banned**: rejected after testing. Italiana cramps at large sizes; Instrument Serif reads as art-school zine. Fraunces is the answer.

### 22.41 Tracking values other than 0.18em on uppercase

**Why banned**: inconsistency. Single tracking value for the entire app.

### 22.42 "Generate" / "Submit" as button labels

**Why banned**: cinematic register doesn't allow them. Use directive verbs.

### 22.43 Default browser cursor on chrome devices

**Why banned**: the cinematic cursor exists for a reason. (Touch devices retain default — there's no cursor anyway.)

### 22.44 "Welcome back" / "Welcome to" copy

**Why banned**: patronizing. Director's voice doesn't welcome.

### 22.45 Claiming intuitive / effortless / seamless

**Why banned**: claims undermine themselves. Show, don't tell.

### 22.46 More than two eyebrows per screen

**Why banned**: eyebrow rot. One per screen, max two.

### 22.47 Static text-balance fallback

**Why banned**: ships orphans. Use `text-balance` (universally supported in 2026).

### 22.48 Numerical percentage for progress

**Why banned**: reads as upload meter. Use hairline track + "X / N" caption.

### 22.49 Decoration shaders on idle elements

**Why banned**: same as decoration motion — fails the four-reasons gate.

### 22.50 Shipping without reduced-motion audit

**Why banned**: vestibular harm. Required check before each release.

---

## PART 23 — FAILURE MODES

A list of bugs we've actually shipped and fixed. Each is a story with a moral. Read these before you ship; you'll recognize them in your code.

### 23.1 Blank canvas from CameraRig hardcoded z

**Symptom**: portrait viewports cropped outer beats, despite ResponsiveCamera adjusting FOV. The camera kept snapping back to z=5.5 every frame.

**Root cause**: CameraRig's `OVERVIEW_POS = (0, 0.4, 5.5)` was hardcoded. It overrode ResponsiveCamera's z computation each frame.

**Fix**: pass `overviewZ` as a prop to CameraRig. ResponsiveCamera and CameraRig both read the same computed `cameraZ`.

**Moral**: R3F's frame loop can silently override imperative setup elsewhere. If two things mutate the camera, they need to coordinate (or one wins).

### 23.2 Blank canvas from EffectComposer null-on-first-commit

**Symptom**: navigating to /canvas crashed immediately. Stack trace pointed to postprocessing's EffectMaterial reading `.alpha` on null.

**Root cause**: `@react-three/postprocessing` 3.0.4 wrapping postprocessing 6.39.1 has a first-commit timing bug under React 19 + R3F 9. The composer pipeline initializes before its render targets are ready.

**Fix**: removed `<EffectComposer>` entirely. Atmosphere shells + holographic active overlay + Sparkles carry the visual weight without postprocessing.

**Moral**: Third-party R3F libraries can be fragile across major React versions. If postprocessing returns later, isolate behind an error boundary that disables on first crash.

### 23.3 White streak from atmosphere clamp + bloom additive

**Symptom**: connecting path's ember dashes rendering as white streaks.

**Root cause**: bloom's additive blending plus atmosphere shader's high opacity (0.95) plus default tone mapping clamped luminance to white at the path.

**Fix (combined)**:
- ACES filmic tone mapping.
- Atmosphere opacity capped at 0.65, internal radius 4.5→3.8, falloff 0.1→0.5.
- Connecting path material `toneMapped: false` (defensive).
- Bloom threshold 0.18→0.32.

**Moral**: bright = "more visible" is wrong. Cinematic lighting is about modulation, not maximization. Cap your highlights.

### 23.4 Disappearing planets from DoF too aggressive

**Symptom**: the canvas reads "blur-bath" — beats are mostly out of focus. User said "the canvas is blank lol."

**Root cause**: DepthOfField bokehScale 1.2 idle + bloom threshold 0.6 + emissive baseline 0.55 + ACES tone mapping made beats nearly invisible at idle.

**Fix**:
- bokehScale 1.2→0.4 idle.
- threshold 0.6→0.32.
- emissive baseline 0.55→0.95.

**Moral**: idle visibility matters more than dive-time bokeh. Tune for the static view first, then verify the active state still reads.

### 23.5 Headline orphan-wrap mid-word

**Symptom**: "an offering into the night" rendering as "an / offering / int / o / the / night" (mid-word break in "into").

**Root cause**: TextSplitter wrapped each char in inline-block; browser broke at any character.

**Fix**: word grouping. Each word becomes a non-breaking inline-block container of per-char spans. CSS selectors moved from `> span > span` to `[data-index]`.

**Moral**: per-char animation needs word grouping. Single-char inline-block is a wrap-bug factory.

### 23.6 Polling continues after drawer close

**Symptom**: user closes drawer mid-generation; later, opens drawer; sees an unexpected agent turn (the response from a job they'd "abandoned").

**Root cause**: `cancelRef` was set to false at start but never true on unmount. The poll loop kept running.

**Fix**: `useEffect(() => () => { cancelRef.current = true; }, [])`.

**Moral**: cleanup is harder than the request. Every async op needs an unmount handler.

### 23.7 Optimistic user turn left orphaned on agent failure

**Symptom**: user sends message; API fails; user's bubble is in the conversation but no response, no error. User stares at it.

**Root cause**: no retry recovery. The optimistic turn was applied; the failure had no UI.

**Fix**: capture the failing message in `pendingRetryMessage` state; show inline Retry button next to user's last message. Click → re-fire `callAgent(pendingRetryMessage)`.

**Moral**: optimistic UI must come with recovery. The user's message is on screen; you need to honor that with feedback.

### 23.8 TextSplitter flicker on parent re-render

**Symptom**: the agent's typing-on text re-animates whenever the parent re-renders, causing characters to glitch back to invisible mid-typewrite.

**Root cause**: TextSplitter computes per-char delays at render. Parent re-render → fresh delays → animation restarts.

**Fix**: `React.memo(AgentBubble)` with explicit comparator. The bubble re-renders only when the bubble's content actually changes.

**Moral**: animations that depend on per-render state are fragile. Memoize the component so animations don't restart spuriously.

### 23.9 Film grain bleeds onto modals (z-9999)

**Symptom**: when the drawer opens, the film grain texture renders on top of the drawer content, making it hard to read.

**Root cause**: film grain at z-9999 (chosen as "always on top of the canvas"). But the drawer's z is 40; grain wins at 9999.

**Fix**: drop grain to z-15 (above canvas, below all chrome above 20).

**Moral**: z-index 9999 is rarely the right answer. Plan the z-ladder explicitly.

### 23.10 Bundle 215KB over 200KB target

**Symptom**: main bundle gz creeping up. Hit 215.84KB after a feature wave.

**Root cause**: Cmdk and Radix Dialog bundled into main, even though only one route uses each.

**Fix**: lazy-load Cmdk via `<CommandMenuMount>` (mount on first ⌘K). Radix Dialog rolled into the canvas chunk (which is already lazy).

**Moral**: bundle creep is a slow leak. Audit periodically; lazy-load proactively.

### 23.11 iOS keyboard pushes landing input off-screen

**Symptom**: on iPhone, focusing the landing input opens the keyboard; the input scrolls above the visible viewport.

**Root cause**: `min-h-screen` (== `100vh`) didn't account for the keyboard taking viewport.

**Fix**: `min-h-[100svh]`. The svh unit is stable across keyboard open/close.

**Moral**: iOS Safari has its own viewport semantics. Use svh / dvh / lvh per intent.

### 23.12 Generic-AI Sparkles icon

**Symptom**: the agent name had a ✨ icon next to it. User: "this looks like a ChatGPT product."

**Root cause**: I reached for the obvious icon for AI features.

**Fix**: swapped to `Clapperboard` icon. Reads as "film tool," not "AI tool."

**Moral**: the obvious AI-product visuals are the cheapest tells. Pick the slightly weirder, more domain-specific icon.

### 23.13 "More questions recommended" pill reads as empty input

**Symptom**: a pill that said "More questions recommended" with a percentage. User: "this reads as empty input field."

**Root cause**: pill chrome competes with the input chrome adjacent to it.

**Fix**: replaced with 1px hairline progress bar + caption-track "Director's questionnaire · X / N" text below.

**Moral**: progress communicators that look like inputs confuse users. Differentiate visual treatment.

### 23.14 Drawer description in body 14px reads as form helper

**Symptom**: the drawer description (a narrative line about the beat) read as "this field accepts..."

**Root cause**: the description was set in body 14px, the same register as form labels and helpers.

**Fix**: lifted to `font-display italic text-[1.125rem] leading-[1.4]`. Now reads as voiceover.

**Moral**: register matters. Same words, different type, completely different read.

### 23.15 React 19 StrictMode + Zustand v5 max-update-depth crash

**Symptom**: app crashes with "Maximum update depth exceeded" on /canvas mount.

**Root cause**: `selectApprovedClipPublicIds` returns a fresh array each call; Zustand v5's strict equality treats this as a state change; component re-renders; new array; re-renders; etc.

**Fix**: `useShallow(selectApprovedClipPublicIds)`. Element-level equality.

**Moral**: Zustand v5 + React 19 + StrictMode is a strict environment. Selectors that return fresh references need `useShallow`.

### 23.16 ResponsiveCamera overridden by CameraRig hardcoded position

Already covered (23.1). Listed again because it's a particularly insidious failure mode — the bug only surfaces on portrait viewports, which dev-mode developers rarely test.

### 23.17 Touch-action missing on horizontal-scroll thumbnail row

**Symptom**: on mobile, vertical scroll gets blocked when finger is over the stitch tray's thumbnail row.

**Root cause**: the row is `overflow-x-auto`. Browser default touch-action is `auto`, which captures horizontal pan attempts on a horizontally-scrollable element. Vertical pan is blocked.

**Fix**: `style={{ touchAction: 'pan-y' }}` on the container. Tells the browser "I only want horizontal scroll on direct horizontal pan; vertical pan should pass through to page scroll."

**Moral**: nested scrollable elements on mobile need touch-action discipline.

### 23.18 The mocked navigation bug (drawer opens for wrong beat)

**Symptom**: in mock mode, clicking beat 2 opens drawer for beat 1 (intermittent).

**Root cause**: a stale closure in the click handler referenced an old `activeBeatId`. The handler was memoized with `useCallback` but its deps were stale.

**Fix**: refactored to use a ref or to not memoize. (We don't need memoization for click handlers on a small list.)

**Moral**: `useCallback` with stale deps is the most common React perf-related correctness bug. When in doubt, don't memoize.

### 23.19 The "drawer slides on first open + last close" bug

**Symptom**: first time the drawer opens, it slides in correctly. Subsequent opens, it appears instantly. Last close, it slides out. Subsequent... doesn't matter, it's closed.

**Root cause**: AnimatePresence wasn't wrapping the drawer element; the conditional rendering replaced it without exit animation.

**Fix**: wrapped in `<AnimatePresence>`. The drawer's `<motion.div>` has `initial`, `animate`, `exit` variants.

**Moral**: AnimatePresence is for conditional rendering, not "always rendered." If you have `{open && <X />}`, wrap in `<AnimatePresence>`.

### 23.20 The "agent voiceover speaks while user is typing" bug

**Symptom**: the agent's voiceover (TTS) starts mid-user-input, distracting them.

**Root cause**: the voiceover was triggered on agent turn arrival, regardless of user state.

**Fix**: gate voiceover on the user not actively typing in the input. Track input focus + typing; pause voiceover for ~500ms after the user stops.

**Moral**: TTS is invasive. Gate it on user attention.

### 23.21 The "auto-scroll on conversation update" bug

**Symptom**: when an agent turn arrives, the conversation auto-scrolls to bottom, even if the user has scrolled up to read an earlier turn.

**Root cause**: naive auto-scroll to bottom on every conversation update.

**Fix**: only auto-scroll if the user is already near the bottom (within ~64px). Otherwise, show a "new message" indicator that the user can click.

**Moral**: auto-scroll is hostile if the user is reading. Detect intent before scrolling.

### 23.22 The "stale clipPublicId on regenerate" bug

**Symptom**: user regenerates a clip; the URL strip still shows the old clip ID for a frame before updating.

**Root cause**: `regenerateScene` cleared the clip ID, but the URL strip's `useShallow` selector cached the old IDs for one render.

**Fix**: this was actually expected behavior — the regenerate flow should clear the URL strip's segment temporarily. The real bug was the user's expectation. But we adjusted the regen UX so the URL strip animates the segment-removal explicitly: an "ember-fade-out" on the disappearing segment.

**Moral**: when state legitimately needs to "flash empty" between two states, make the flash deliberate (animated, intentional) rather than an artifact.

### 23.23 The "two clicks on Approve" bug

**Symptom**: clicking Approve once does nothing; second click works.

**Root cause**: a stale state in the optimistic flow. The first click triggered a state change that re-rendered the button; the click event handler fired before the new render mounted, on a stale prop.

**Fix**: refactored to use a ref-based handler that reads current state at call time (not at render time).

**Moral**: react state in event handlers is captured at render. For "use latest state at click time," refs are sometimes the answer.

### 23.24 The "decompose status persisted as `pending`" bug

**Symptom**: user reloads page mid-decompose. App boots with `decomposeStatus: 'pending'`. The "Decomposing scenes..." indicator shows forever.

**Root cause**: `decomposeStatus` was persisted via Zustand persist middleware. On reload, the persisted "pending" rehydrated, but no API call was in flight to ever resolve it.

**Fix**: `partialize` excludes `decomposeStatus`. On reload, it defaults to `idle`.

**Moral**: persisted state should be limited to "things the user expects to come back to." Transient UI state shouldn't persist.

### 23.25 The "useShallow imported from wrong path" bug

**Symptom**: `useShallow` undefined.

**Root cause**: I imported from `'zustand/shallow'` (wrong; this is the comparator, not the hook) instead of `'zustand/react/shallow'` (the hook).

**Fix**: corrected import.

**Moral**: Zustand has multiple shallow utilities at different paths. Read the docs; the React hook is at `zustand/react/shallow`.

### 23.26 The "bridge plays on direct /canvas link" bug

**Symptom**: user shares the /canvas URL with a friend. Friend opens; bridge plays before the canvas appears, even though they didn't come from /.

**Root cause**: the bridge was implemented as a route the user navigates *through*. Direct navigation to /canvas didn't trigger the bridge.

But: the friend also doesn't have a manifest. The CanvasRoute redirects to / (covered in 14.3). So the friend lands on /, types a prompt, goes through the bridge.

The reported bug was actually about: user opens /transition directly (not /canvas). The transition tries to navigate to /canvas but the canvas redirects to /. Loop.

**Fix**: /transition guards on having a manifest. If no manifest, redirect to / immediately. Don't even play the bridge animation.

**Moral**: think about all entry paths to a route, including direct URLs. Each entry needs to land somewhere useful.

### 23.27 The "agent times out without UI" bug

**Symptom**: agent call hangs for 60s, then silently fails. No UI feedback during the wait. User thinks the app is broken.

**Root cause**: the API call had no timeout; the typing indicator showed for 60s.

**Fix**: 30s timeout on agent calls. After 20s, show a "still thinking..." update. After 30s, error and offer retry.

**Moral**: timeouts are mandatory. UX during waits is mandatory. Long waits without feedback are death.

### 23.28 The "sound plays in background tab" bug

**Symptom**: user switches tabs; cue plays anyway when a beat approves.

**Root cause**: the audio cue fires from a useEffect; the useEffect doesn't know the tab is hidden.

**Fix**: gate cues on `document.visibilityState === 'visible'`. If hidden, don't play.

**Moral**: tab visibility matters for any time-sensitive UI feedback.

### 23.29 The "ResizeObserver fires repeatedly causing re-render loop"

**Symptom**: a component using ResizeObserver in development shows "ResizeObserver loop limit exceeded" warning, sometimes crashing.

**Root cause**: the observer fired during a render that triggered a layout change that fired the observer.

**Fix**: debounce the observer callback. Use `requestAnimationFrame` to defer state updates outside the observer's tick.

**Moral**: ResizeObserver + state update is a loop waiting to happen. Defer.

### 23.30 The "z-index war between Lenis and chrome"

**Symptom**: Lenis's smooth scroll caused chrome (the cinematic cursor) to lag behind.

**Root cause**: the cinematic cursor's positioning was relative to the document, but Lenis offsets the document's effective scroll position. Cursor snapped to scrolled coords; visual mismatch.

**Fix**: positioned cursor as `position: fixed` (not absolute) — viewport-relative, immune to Lenis.

**Moral**: smooth scroll libraries decouple visual scroll from browser scroll. Fixed positioning is the safest for chrome.

---

## PART 24 — CLOSING TRANSMISSION

You are now equipped. The product is SceneOS. The aesthetic is "Tesla designing a Christopher Nolan trailer." The mantra is "pizza-ordering simplicity." The bar is godly.website.

The three winning moments are the portal, the canvas, and the URL. Everything else exists to keep them perceivable.

The five hard-won lessons:
1. `useShallow` on fresh-array selectors. Zustand v5 + React 19 + StrictMode crashes otherwise.
2. EffectComposer crashes on first commit. Removed; atmosphere + holographic + Sparkles carry the visual.
3. Pass `overviewZ` to CameraRig. Hardcoded camera positions silently override responsive setups.
4. `cancelledRef` + `mountedRef` on every async op. The user closes the drawer; the response shouldn't haunt them.
5. Reduced motion is a parallel design, not an opt-out checkbox. Bridge it manually for non-Motion animations.

The discipline:
- Fraunces + Manrope + Geist Mono. Don't relitigate.
- Single tracking value `0.18em` on uppercase.
- Italics on connectives only.
- Smart quotes, em-dashes, en-dashes.
- Warm-near-black, ember as the only accent.
- Hairlines, not cards.
- Off-axis composition.
- Director's voice in microcopy.
- The four reasons for motion: reveal, acknowledge, bridge, signal.
- Every screen works as a screenshot.
- Every change passes the "would Nolan ship this?" test.
- Restraint is a feature.
- Generic is the enemy.
- No Co-Authored-By trailer.

The process:
- Lesson reflection before each phase.
- Audit, fix, build, commit.
- Test the prod build before committing big changes.
- Trust your instincts; verify in the browser.
- Delete more than you add.
- Commit messages are the project's running narration. Make them readable.

The voice in your head when you ship:
- "Would the A24-trailer person continue past this screen?"
- "Does this feature increase the perceptibility of the portal, the canvas, or the URL?"
- "Would Nolan ship this?"
- "Would this land on godly?"

If the answers are yes, you've done the work. If they're no, it's not done.

The product is shippable when:
- The build is clean.
- The reduced-motion path works.
- The mock mode works.
- The four routes navigate cleanly.
- The three winning moments land.
- The microcopy reads as one director's voice across the whole app.
- Every screen is a screenshot.

Take this transmission. Compound on it. Add your own lessons. Keep the discipline. Build like the cinematic register depends on every line — because it does. The judges will see what you ship; they will not see your effort. Make the ship show the effort.

This product wins when the audience says "wait, how did they make that?" and means the bridge transition. Make them say it.

End of transmission.

---

*Document compiled from working notes on the SceneOS build, LA Hacks 2026. Frontend lead: Alex. Stack: React 19 + Vite 7 + TypeScript 5.7 + Tailwind v4 + Motion 12 + GSAP 3.12 + R3F 9 + drei 10 + Zustand v5 + Lenis + cmdk + Web Speech + Web Audio. Bar: godly.website. Mantra: pizza-ordering simplicity. Anti-pattern: generic.*

---

## APPENDIX A — RECIPES

These are concrete, copy-pasteable patterns for the most common tasks. Each recipe is what we would actually write in this codebase. Treat them as starting points; tune as needed.

### A.1 A new chrome chip

Used for: stage indicators, mode switches, status badges.

```tsx
import { motion } from 'motion/react';
import { DURATIONS, EASE } from '@/lib/motion-tokens';

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  ariaPressed?: boolean;
}

export function Chip({ label, active = false, onClick, ariaPressed }: ChipProps) {
  return (
    <motion.button
      onClick={onClick}
      aria-pressed={ariaPressed}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: DURATIONS.micro, ease: EASE.out }}
      className={[
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3',
        'caption-track text-[10px]',
        'border transition-[color,background-color,border-color] duration-200',
        active
          ? 'border-brand-ember/40 bg-brand-ember/10 text-fg-primary'
          : 'border-fg-tertiary/25 text-fg-secondary hover:border-fg-tertiary/45 hover:text-fg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
      ].join(' ')}
    >
      {label}
    </motion.button>
  );
}
```

Notes:
- `h-7` (28px) — caption chip register. For a more prominent chip, use `h-9` (36px).
- `caption-track` class applies the 0.18em tracking + uppercase.
- `whileTap` is acknowledge motion. `whileHover` is *not* used; hover is communicated via the color transition.
- Active state uses ember border + ember-tinted background + bone fg. Inactive uses fg-tertiary structural + fg-secondary text.

### A.2 A new modal

Drawer pattern, using Radix. The modal is the simpler version of the drawer — centered, dismissible, single-purpose.

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { DURATIONS, EASE } from '@/lib/motion-tokens';

interface CinematicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function CinematicModal({ open, onOpenChange, title, description, children }: CinematicModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATIONS.standard, ease: EASE.out }}
            className="fixed inset-0 z-40 bg-bg-base/80 backdrop-blur-sm"
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: DURATIONS.standard, ease: EASE.out }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(40rem,90vw)] rounded-[2px] border border-fg-tertiary/25 bg-bg-elev-1 p-8"
          >
            <header className="space-y-1">
              <Dialog.Title className="font-display text-[2rem] leading-[1.0] tracking-[-0.02em] text-fg-primary text-balance">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="font-display italic text-[1.125rem] leading-[1.4] text-fg-secondary text-pretty">
                  {description}
                </Dialog.Description>
              )}
            </header>
            <div className="mt-6">{children}</div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-fg-tertiary hover:text-fg-primary"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Notes:
- `border-radius: 2px` — precise, not the SaaS-default rounded.
- `backdrop-blur-sm` on overlay — subtle, doesn't compete with the modal content. The modal itself is solid.
- Close button is in the corner, 36×36 hit area. The `<X>` icon is 14px (small in the hit area, but the hit area is the touch target).
- Title + description follow the Part 18.12 pattern.

### A.3 A new R3F mesh

For adding a new node-like 3D object to the canvas:

```tsx
import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';

interface FloatingMarkerProps {
  position: [number, number, number];
  color: string;
}

export function FloatingMarker({ position, color }: FloatingMarkerProps) {
  const ref = useRef<THREE.Mesh>(null);
  const reduced = usePrefersReducedMotion();
  const startY = useMemo(() => position[1], [position]);

  useFrame((state) => {
    if (!ref.current || reduced) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = startY + Math.sin(t * 1.2) * 0.04;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.08, 24, 24]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.6}
        roughness={0.3}
        metalness={0.0}
      />
    </mesh>
  );
}
```

Notes:
- Reduced-motion gate at the top of `useFrame`.
- Small floating delta (`0.04`) — barely perceptible drift, not a bouncy float.
- `meshStandardMaterial` uses the warm ember palette via `color` + `emissive`.
- Geometry segment count (24, 24) is enough for a small sphere; bump to 32-64 for larger.

### A.4 A new agent action

For adding a new conversational pattern:

```ts
// in src/lib/agent-prompts.ts
export const AGENT_PROMPTS = {
  // existing prompts...
  ASK_LIGHTING: (beat: Beat) =>
    `Tell me about the lighting in beat "${beat.title}". Soft and golden? Hard and clinical? Or something we haven't seen?`,

  CONFIRM_MOOD: (beat: Beat, mood: string) =>
    `So the mood in this beat lands as *${mood}* — let me know if I should re-frame it.`,

  // new pattern: ASK_PACING
  ASK_PACING: (beat: Beat) =>
    `What's the cut on this beat — long and breathing, or quick and clipped?`,
};
```

The pattern: agent prompts live in a single file as functions taking beat + relevant context. They return strings in the director's voice. The conversation engine pulls from this map based on the beat's missing fields.

### A.5 A new caption row

For adding a small metadata row (e.g., `BEAT 03 · MELANCHOLIC · 4.2s`):

```tsx
interface MetadataRowProps {
  items: Array<{ label: string; emphasis?: boolean }>;
}

export function MetadataRow({ items }: MetadataRowProps) {
  return (
    <div className="caption-track flex items-center gap-2 text-[10px]">
      {items.map((item, i) => (
        <span
          key={i}
          className={item.emphasis ? 'text-brand-ember' : 'text-fg-tertiary'}
        >
          {item.label}
          {i < items.length - 1 && <span className="ml-2 opacity-40">·</span>}
        </span>
      ))}
    </div>
  );
}
```

Usage:

```tsx
<MetadataRow items={[
  { label: 'BEAT 03', emphasis: true },
  { label: 'MELANCHOLIC' },
  { label: '4.2s' },
]} />
```

The emphasis flag puts ember on one item — typically the primary identifier. Other items stay fg-tertiary.

### A.6 An API call with cancellation

```ts
// in your component
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export function useGenerateClip(beatId: string, sceneId: string) {
  const [state, setState] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function start() {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setState('generating');
    try {
      const result = await api.generate({ beatId, sceneId, signal: controllerRef.current.signal });
      setState('success');
      return result;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState('error');
      throw err;
    }
  }

  function cancel() {
    controllerRef.current?.abort();
    setState('idle');
  }

  return { state, start, cancel };
}
```

Notes:
- AbortController per call, replaced on each new start.
- Cleanup aborts on unmount.
- AbortError is silent (intentional cancel, not a real error).

### A.7 A new persistent UI strip

For adding a chrome strip that lives across the canvas:

```tsx
import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useBeatGraphStore } from '@/stores/beat-graph-store';

export function GenerationProgressStrip() {
  const inflightCount = useBeatGraphStore(
    useShallow((s) => s.manifest?.beats.filter(b => b.status === 'generating').length ?? 0)
  );
  const totalCount = useBeatGraphStore((s) => s.manifest?.beats.length ?? 0);

  if (inflightCount === 0 || totalCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1] }}
      className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center"
    >
      <div className="rounded-full border border-brand-ember/30 bg-bg-elev-1/70 px-3 py-1.5 backdrop-blur-xl">
        <span className="caption-track text-[10px] text-fg-secondary">
          rolling · {inflightCount} of {totalCount}
        </span>
      </div>
    </motion.div>
  );
}
```

Notes:
- `useShallow` even on a count, because the predicate is a fresh object: actually no, the count is a number, useShallow not strictly needed — but it does no harm. The selectors I'd actually wrap in `useShallow` are array-returning ones. Keeping in this example for safety.
- `pointer-events: none` on the wrapper, `pointer-events: auto` on the inner if it has interactions (this one doesn't).
- Conditional render — strip only appears when there's something to show.

### A.8 A new keyboard shortcut

```tsx
import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean },
  handler: () => void,
) {
  useEffect(() => {
    function listener(e: KeyboardEvent) {
      const wantsMeta = modifiers.meta ?? false;
      const wantsCtrl = modifiers.ctrl ?? false;
      const wantsShift = modifiers.shift ?? false;
      const wantsAlt = modifiers.alt ?? false;

      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        e.metaKey === wantsMeta &&
        e.ctrlKey === wantsCtrl &&
        e.shiftKey === wantsShift &&
        e.altKey === wantsAlt
      ) {
        e.preventDefault();
        handler();
      }
    }
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [key, modifiers.meta, modifiers.ctrl, modifiers.shift, modifiers.alt, handler]);
}
```

Usage:

```tsx
useKeyboardShortcut('m', {}, () => prefs.toggleAudioMute());
useKeyboardShortcut('k', { meta: true }, () => openCommandMenu());
useKeyboardShortcut('?', { shift: true }, () => openShortcutsOverlay());
```

Notes:
- Strict modifier matching — `Cmd+K` (`meta: true`) doesn't fire on `Ctrl+K` and vice versa.
- `e.preventDefault()` prevents browser defaults (e.g., Cmd+K opens the location bar in some browsers).
- For cross-platform (`Cmd` on Mac, `Ctrl` on Windows), use a helper that normalizes both as a `mod` modifier:

```ts
const isMac = navigator.platform.toLowerCase().includes('mac');
useKeyboardShortcut('k', { meta: isMac, ctrl: !isMac }, openCommandMenu);
```

### A.9 A loading state without spinners

```tsx
function LoadingHairline() {
  return (
    <div className="h-px w-full overflow-hidden bg-fg-tertiary/15">
      <div className="h-full w-1/3 animate-loading-shimmer bg-brand-ember" />
    </div>
  );
}

// in tailwind.config:
extend: {
  keyframes: {
    'loading-shimmer': {
      '0%': { transform: 'translateX(-100%)' },
      '100%': { transform: 'translateX(400%)' },
    },
  },
  animation: {
    'loading-shimmer': 'loading-shimmer 1.5s linear infinite',
  },
},
```

The shimmer travels across the track. Reads as "active progress" without a percentage. Simpler than a spinner; cinematic register.

For reduced motion, the shimmer is off; the track stays present (just static at 1/3 width or full).

### A.10 An empty state

```tsx
interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-[1.5rem] leading-[1.2] text-fg-secondary text-balance">
        {title}
      </p>
      {hint && (
        <p className="mt-2 font-display italic text-[1.125rem] leading-[1.4] text-fg-tertiary text-pretty max-w-md">
          {hint}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex h-10 items-center rounded-full border border-fg-tertiary/35 px-5 caption-track text-[10px] text-fg-secondary hover:border-brand-ember hover:text-fg-primary"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

Usage:

```tsx
<EmptyState
  title="approve a beat to begin"
  hint="*the* splice composes itself when *the* first lock lands"
/>
```

Notes:
- Display font even at body sizes — narrative register.
- Italics on the connectives in the hint.
- Optional action button with the cinematic chip register.

### A.11 An accessible icon button

```tsx
interface IconButtonProps {
  icon: React.ReactNode;
  label: string;  // accessible label, also tooltip
  onClick: () => void;
}

export function IconButton({ icon, label, onClick }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-fg-tertiary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
    >
      {icon}
    </button>
  );
}
```

Usage:

```tsx
<IconButton
  icon={<Copy size={11} strokeWidth={1.5} />}
  label="Copy URL"
  onClick={handleCopy}
/>
```

Notes:
- `aria-label` for screen readers.
- `title` for hover tooltip (browser-native, not a custom tooltip).
- 36×36 hit area; icon is 11px (small relative to area, but the area is the target).

### A.12 A debounced input

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

Usage:

```tsx
const [query, setQuery] = useState('');
const debouncedQuery = useDebouncedValue(query, 300);

useEffect(() => {
  if (!debouncedQuery) return;
  fetchSearchResults(debouncedQuery);
}, [debouncedQuery]);
```

Standard debounce pattern. Use for search inputs, autosave, anything that fires on every keystroke and doesn't need to.

### A.13 A toast with semantic styling

```tsx
import { toast } from 'sonner';

// success
toast.success('URL copied.', {
  description: undefined,  // single line; don't pad with description
  duration: 3000,
});

// error — only when actionable
toast.error('couldn\'t reach the floor', {
  description: 'check your connection?',
  duration: 5000,
  action: {
    label: 'Retry',
    onClick: () => retryOp(),
  },
});

// neutral (rare)
toast('rolling beat 03', {
  description: undefined,
  duration: 2000,
});
```

Notes:
- Success duration ~3s; user reads it and moves on.
- Error duration ~5s; longer because the user might need to act.
- Action button on errors that are retryable.
- Description is for context the title can't carry; usually omit.

### A.14 A custom motion variant

```ts
import type { Variants } from 'motion/react';
import { DURATIONS, EASE, STAGGER } from '@/lib/motion-tokens';

export const reveal: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATIONS.standard, ease: EASE.out },
  },
};

export const revealStaggered: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER.standard,
      delayChildren: 0.2,
    },
  },
};

export const revealStaggeredItem: Variants = reveal;  // same as reveal
```

Usage:

```tsx
<motion.ul variants={revealStaggered} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.li key={item.id} variants={revealStaggeredItem}>
      {item.label}
    </motion.li>
  ))}
</motion.ul>
```

Reusable variants. Defined once in a `lib/motion-variants.ts`; reused across the app. Don't redefine `{opacity: 0, y: 8}` per component.

### A.15 A reusable Lenis-aware section

For sections that should scroll smoothly (everything except the canvas):

```tsx
interface SmoothSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function SmoothSection({ children, className }: SmoothSectionProps) {
  return <section className={className}>{children}</section>;
}
```

…actually, Lenis intercepts scroll on the entire page by default. Sections don't need to opt in.

To opt *out* of Lenis (e.g., the canvas):

```tsx
<div data-lenis-prevent className="canvas-wrapper">...</div>
```

Lenis honours this attribute and skips scrolling on that subtree. The user's scroll on the canvas falls through to the page (which we handle separately via `useScrollVelocity`).

---

## APPENDIX B — DEEPER DIVES

### B.1 Why warm-near-black, mathematically

Warm-near-black is `#0a0908` in hex, RGB(10, 9, 8). The R > G > B ordering (warm), with R only marginally higher (still nearly neutral), gives the warmth without the brown tilt. Compare:

- `#000000` — pure black. Reads cold on most monitors due to white-balance defaults.
- `#0a0a0c` — cool-near-black. Reads as "tech."
- `#0a0908` — warm-near-black. Reads as "film print."
- `#100c08` — warm dark brown. Now perceptibly brown, not black.
- `#1a1108` — full warm brown. Cinematic but no longer black.

The `#0a0908` is the lowest R-channel point at which the warm tilt is perceptible without the color reading as brown. It's the "warmest plausible black."

Reference: cinematographer Roger Deakins' interviews discuss the warmth of cinema black in print — "if it's perfectly neutral, you've left the cinema." The same principle applies digitally.

### B.2 The ember palette derivation

Ember `#f0a868` is RGB(240, 168, 104). HSL: 30°, 80%, 67% — warm orange, saturated, bright.

The variants:
- Ember-deep `#c97f3f`: 27°, 53%, 51% — same hue, less saturated, darker. Used on hover/press.
- Ember-pale `#f7c894`: 31°, 87%, 78% — same hue, slightly desaturated, lighter. Used for halo brights.

The HSL family is consistent. We don't use `hsl(30, ...)` and `hsl(45, ...)` — same family means same accent perception.

### B.3 Why 0.18em tracking

The number isn't arbitrary. Tracking values too tight (0.05em) read as "barely tracked" — visually similar to no tracking. Values too loose (0.3em+) read as "spaced out for emphasis" — losing the editorial register.

0.18em is in the editorial sweet spot. Magazine titling (Vogue, Wired) uses 0.15-0.2em on uppercase. The 0.18em is the value that survived testing across ALL the uppercase contexts in this app — captions, eyebrows, stage indicator, status badges.

It's also large enough to be visually distinct from "default tracking" — the user perceives the tracking, not just "the type is uppercase." That perception is what the 0.18em is for.

### B.4 The four-reason-for-motion derivation

Why exactly four? Why not "any motion that adds polish is fine"?

The four are derived from cognitive science of motion perception:
1. **Reveal** = signaling new information arrived in the visual field.
2. **Acknowledge** = closing the loop between user input and system response.
3. **Bridge** = preserving spatial/temporal continuity across context shifts.
4. **Signal** = communicating a state change at a glance.

These are the only four motion-categories that *carry meaning*. Anything outside them is decoration. Decoration is fine in some contexts (a video game UI; a marketing landing). It is wrong for a cinematic AI tool because:
- The cinematic register is *spare*; decoration adds noise.
- The product is utility-focused; decoration distracts from the work.
- The judge has 3 minutes; every animation should pull weight.

The four-reason rule is a forcing function: ask "which reason does this animation serve?" If the answer is "none," cut it.

### B.5 The 200KB bundle target derivation

Where does 200KB come from? It's the threshold where:
- On a 4G connection (~10Mbps), the bundle downloads in ~150ms.
- On a 3G connection (~1Mbps), the bundle downloads in ~1.6s.
- The first paint can land within the user's "did the page load?" window (~2s on slow networks).

Above 200KB:
- 250KB on 3G ≈ 2s download. The user has already scrolled or tapped, expecting feedback.
- 500KB on 3G ≈ 4s. The page reads as "broken/slow" before it loads.

So 200KB is the tier-1 quality threshold. Below it, the app feels instant on most networks. Above it, the experience degrades on a meaningful slice of users.

(Real measurement: our bundle is ~203KB; on a typical broadband connection, first paint is ~300ms. We're not actually bottlenecked by bundle size; the target is still useful as a discipline.)

### B.6 The 800ms perception threshold

Where does 800ms come from? Cognitive psychology of action-feedback:
- 100ms = "instant" — the user perceives the action and response as one event.
- 1000ms = "responsive" — the user perceives a delay but it doesn't break flow.
- 10000ms = "slow" — the user assumes something is broken.

800ms sits in the "responsive" band, with margin for the user to perceive intentional pacing rather than lag. A 600ms transition reads as crafted; a 1200ms transition reads as "is something broken?"

The exception: bridge animations (1.2-1.6s). These are explicit cinematic moments where the wait is the point. The user understands "this is a portal, not a state change" and accepts the pacing.

### B.7 Fraunces variable axis tuning

Fraunces axes (default → SceneOS):
- `wght` 400 → 350 (display) / 400 (body) / 500 (emphasis)
- `opsz` (auto → explicit per size)
  - 6pt → 24
  - 14pt → 36
  - 36pt → 96
  - 96pt → 144
- `soft` 0 → 50 (modest soft push, 50/100 of the range)
- `wonk` 0 → 1 (very modest wonk, ~1% of the range)

These are aggregate "design system" values. Override per use:
- Drawer description italic at 18px: `font-variation-settings: 'opsz' 24, 'wght' 400, 'slnt' -10, 'soft' 50, 'wonk' 0;` — italic via slnt axis (Fraunces is variable-italic).

Note `slnt` (slant) is the "italic axis" — Fraunces doesn't have a separate italic font, just a variable slant. `slnt: -10` is full italic; `slnt: -5` is half-italic for hybrid effects.

### B.8 The Manrope axis tuning

Manrope is variable on `wght` only (200-800). Defaults:
- 400 for body
- 500 for medium emphasis
- 600 for strong emphasis
- 700 only for caption-track at small sizes (the bold helps at 10-11px)

We rarely use 200/300 (too light against warm-near-black at body sizes) or 800 (reads heavy, doesn't fit the editorial register).

Manrope has no italic. For body italic, we either:
- Use Fraunces italic at body sizes (when it's narrative)
- Use Manrope upright + italic via CSS `font-style: italic` (faux italic, generally OK on Manrope because the geometry is forgiving)

Avoid the latter for editorial copy (drawer description, route subtitle); use the former.

### B.9 Geist Mono usage discipline (revisited)

Geist Mono variable axis is `wght` 100-900. We use:
- 400 for the URL strip body, IDs.
- 500 for emphasis on a single ID (rare).
- The `tabular-nums` font feature is on by default in Geist Mono, so digits align.

Geist Mono ligatures: turned **off** for technical strings (URLs, IDs). Ligatures (like `==>` becoming a single arrow) are confusing in URL contexts. Turn off via `font-variant-ligatures: none`.

```css
.font-mono {
  font-family: 'Geist Mono', monospace;
  font-variant-ligatures: none;
  font-variant-numeric: tabular-nums;
}
```

### B.10 The Lenis configuration

Lenis defaults are fine, but we tuned a few:

```ts
const lenis = new Lenis({
  duration: 1.2,         // seconds for scroll to settle
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  direction: 'vertical',
  gestureDirection: 'vertical',
  smooth: true,
  mouseMultiplier: 1,
  smoothTouch: false,    // disable on touch — native scroll is better
  touchMultiplier: 2,
  infinite: false,
});
```

Notes:
- `smoothTouch: false` — Lenis on touch devices fights with native scroll inertia. Native is better; Lenis only on desktop scroll.
- The easing is "exponential out," giving the iconic "long settle" Lenis is known for.
- `duration: 1.2` is the default; we kept it.

### B.11 The Three.js memory model

R3F manages most resource lifecycles, but for custom resources you create:
- Geometries: `geometry.dispose()` on unmount.
- Materials: `material.dispose()`.
- Textures: `texture.dispose()`.
- RenderTargets: `target.dispose()` (postprocessing pipelines).

Each `dispose` releases GPU memory. Without it, leaks accumulate.

Detect leaks:
- Chrome DevTools → Memory profiler.
- `gl.info` (THREE renderer info) tracks current resource counts.

```tsx
// debug
useFrame(({ gl }) => {
  console.log(gl.info.memory, gl.info.render);
});
```

Watch for `geometries`, `textures`, and `programs` growing on each route navigation. If they are, you have a leak.

### B.12 The DPI scaling for 3D

`dpr={[1, 1.75]}` caps device pixel ratio. Reasoning:
- Mobile phones often have DPR 2.5-3.5. Rendering at 3.5× is 12× the pixels of 1×; punitive on GPU.
- 1.75 is sharp enough on Retina displays without the 12× cost.
- Below 1.75, edges look slightly soft on high-DPR; above 1.75, perf cost outweighs.

For specific scenes (e.g., a hero shader), bump DPR higher. For the canvas at large, 1.75 is the right cap.

### B.13 The R3F `Suspense` for assets

Drei components like `<Environment>`, `<Stars>`, `<useGLTF>` use Suspense for asset loading. Wrap the canvas content:

```tsx
<Canvas>
  <Suspense fallback={null}>
    <Environment preset="night" />
    {/* other suspense-using components */}
  </Suspense>
</Canvas>
```

`fallback={null}` means: while loading, render nothing. The canvas appears progressively. No loading spinner inside the canvas; the chrome (e.g., a "loading scene..." caption) is outside.

If a Suspense-using component fails (asset 404), the React error boundary catches it. The CanvasErrorBoundary at the route level is the safety net.

### B.14 The "no shared scene" rule

Each `<Canvas>` is its own scene. Don't try to share materials/geometries/textures across canvases (would require the same WebGL context, which is per-canvas).

For the SceneOS app, this isn't an issue (one canvas per route, only on /canvas). But if you ever add a second 3D viewport, plan for separate scenes.

### B.15 The "useThree returns a snapshot" gotcha

`const { camera } = useThree();` returns the camera at render time. If you store it in a ref and the camera changes (e.g., a different camera mounts), your ref is stale.

Fix: use `useThree(state => state.camera)` (selector). The hook re-runs when the camera changes:

```tsx
const camera = useThree(state => state.camera);
// camera is always the current scene camera
```

For frame-loop access (where you want the latest), use `state.camera` directly inside `useFrame`:

```tsx
useFrame((state) => {
  state.camera.position.y += 0.01;
});
```

### B.16 The "raycast on mesh" pattern

Click handling on meshes uses R3F's pointer events:

```tsx
<mesh onClick={(event) => {
  event.stopPropagation();  // prevent canvas onPointerMissed
  setActiveBeat(beat.beatId);
}}>
```

Notes:
- `event.stopPropagation()` is critical. Without it, the canvas's `onPointerMissed` fires too, deselecting the beat you just selected.
- The events have `event.intersections` (all meshes the ray hit) and `event.object` (the topmost). Useful for advanced cases.

### B.17 The "instanced mesh" performance pattern

For large numbers of similar meshes (1000+ particles, 100+ identical nodes), use `<instancedMesh>`. Single draw call regardless of count.

We don't use it on this app (5-12 beats, no instancing needed), but worth knowing for scale.

### B.18 The shader uniform update pattern

Setting uniforms each frame:

```tsx
const materialRef = useRef<THREE.ShaderMaterial>(null);
useFrame((state) => {
  if (!materialRef.current) return;
  materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
});
```

NOT:
```tsx
useFrame(() => {
  // bad: forcing a re-render of the React component
  setUTime(prev => prev + 0.01);
});
```

Refs for per-frame mutation. State for things React renders.

### B.19 The "shader recompile" trap

Changing a `defines` object on a ShaderMaterial recompiles the shader (~10-100ms). Don't do this in `useFrame`.

If you need to switch between shader variants, predefine multiple materials and swap which is on the mesh. The cost is one-time at compile.

### B.20 The Vite dev mode HMR for shaders

Vite + glsl loader supports HMR. Edit a shader file; the canvas updates without full reload. Great for iteration.

Make sure the loader is configured in `vite.config.ts`:

```ts
import glsl from 'vite-plugin-glsl';
export default defineConfig({
  plugins: [react(), glsl()],
});
```

### B.21 The cmdk command structure

```tsx
<Command>
  <Command.Input placeholder="Search commands..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>

    <Command.Group heading="Navigation">
      <Command.Item onSelect={() => navigate('/')}>Go to Landing</Command.Item>
      <Command.Item onSelect={() => navigate('/canvas')}>Go to Canvas</Command.Item>
    </Command.Group>

    <Command.Group heading="Audio">
      <Command.Item onSelect={() => prefs.toggleAudioMute()}>
        {muted ? 'Unmute' : 'Mute'}
      </Command.Item>
    </Command.Group>

    <Command.Group heading="Beats">
      {beats.map((beat, i) => (
        <Command.Item key={beat.beatId} onSelect={() => setActiveBeat(beat.beatId)}>
          Beat {i + 1}: {beat.title}
        </Command.Item>
      ))}
    </Command.Group>
  </Command.List>
</Command>
```

The structure: groups for organization, items for actions. cmdk handles fuzzy search across all items. Keyboard navigation is built-in.

### B.22 The `Toaster` configuration

Sonner (`<Toaster />`) at the App root:

```tsx
<Toaster
  position="bottom-center"
  visibleToasts={2}
  toastOptions={{
    style: {
      background: 'var(--color-bg-elev-1)',
      border: '1px solid color-mix(in srgb, var(--color-fg-tertiary) 25%, transparent)',
      color: 'var(--color-fg-primary)',
      borderRadius: '2px',
      fontFamily: 'var(--font-body)',
    },
    duration: 4000,
  }}
  expand={false}
  richColors={false}
/>
```

Notes:
- `richColors={false}` — disable sonner's default colored success/error backgrounds. We tint via the success/error classes ourselves.
- `expand={false}` — toasts are stacked, not expanded into a list. Two-toast cap means stacking is fine.
- `borderRadius: 2px` — match the modal/chip register.

### B.23 The text-shadow trick for low-contrast type

When you must place text on a busy background (e.g., text over the 3D canvas), a subtle text-shadow improves legibility:

```css
.text-on-canvas {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
```

Use sparingly. Generally, don't put text directly on the canvas — put it in a chrome strip with backdrop-blur. The text-shadow trick is a fallback.

### B.24 The CSS variable approach for dynamic values

For values that need to be JS-set but CSS-styled:

```tsx
<div style={{ '--progress': `${percentage}%` } as React.CSSProperties}>
```

```css
.progress-bar::after {
  content: '';
  position: absolute;
  width: var(--progress);
  /* ...
   */
}
```

Cleaner than embedding the percentage in inline `style.width`. The CSS handles the styling; JS just supplies the value.

### B.25 The "Don't trust matchMedia in SSR" pattern

`window.matchMedia` doesn't exist server-side. Guard:

```tsx
const matches = useMemo(() => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}, [query]);
```

For SPA-only deployment, this is moot, but the discipline is worth maintaining for portability.

### B.26 The Web Speech polyfill question

There's no Web Speech polyfill for Firefox. The feature is browser-gated.

We don't try to polyfill. We hide the feature when unsupported (covered in Part 11.1). The fallback is text input; the user doesn't lose function, just convenience.

### B.27 The audio context creation timing

Don't create `AudioContext` at module load. Browsers may auto-suspend it (Chrome's autoplay policy). Create lazily on first user gesture:

```ts
let _ctx: AudioContext | null = null;
function getContext() {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}
```

The `webkitAudioContext` fallback is for Safari < 14 (rare, but cheap to handle).

### B.28 The "media session" API for playback

The final-delivery video can integrate with browser media session for keyboard shortcuts (Play/Pause, Next/Previous):

```ts
navigator.mediaSession.metadata = new MediaMetadata({
  title: 'SceneOS Cinematic',
  artist: 'a single director\'s prompt',
});
navigator.mediaSession.setActionHandler('play', () => video.play());
navigator.mediaSession.setActionHandler('pause', () => video.pause());
```

Optional but premium — the user can pause from their keyboard's media keys.

### B.29 The Service Worker hygiene (when applicable)

If you ever add a service worker:
- Cache the bundle aggressively (long max-age + content-hashed filenames).
- Cache HTML lightly (no max-age + must-revalidate).
- Implement a cache-versioning scheme so old SWs unregister cleanly.
- Use Workbox; don't roll your own.

We didn't ship one. Worth knowing.

### B.30 The Vite proxy for dev API

In `vite.config.ts`:

```ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
```

In dev, the frontend at `localhost:5173` proxies `/api/*` to the FastAPI backend at `localhost:8000`. No CORS, no env vars at dev time. Production deploys configure the API base URL via `VITE_API_BASE`.

### B.31 The `@vitejs/plugin-react` Fast Refresh

React Fast Refresh (HMR) is on by default. It preserves component state across edits. Edit a component, see the change, state intact. Faster iteration than full reload.

The gotcha: edits to non-component exports break Fast Refresh and trigger full reload. Keep components in component files; utilities in utility files.

### B.32 The Tailwind v4 `@theme` migration

Tailwind v4's `@theme` directive replaces v3's `theme.extend` config. Define tokens once in CSS:

```css
@theme {
  --color-bg-base: #0a0908;
  --color-fg-primary: #f5f1ea;
  --font-display: 'Fraunces', serif;
  --spacing-1: 0.25rem;
  /* ... */
}
```

Tailwind generates utility classes from these (`bg-bg-base`, `text-fg-primary`, `font-display`, `space-y-1`).

The benefits: tokens are in CSS, the source of truth for both Tailwind and direct CSS use. No JS config to keep in sync.

### B.33 The Tailwind v4 `@variant` for custom variants

```css
@variant scrolled (.is-scrolled &);
```

Now `scrolled:bg-bg-elev-1` applies when the parent has `.is-scrolled` class. We use this for sticky-header treatments.

### B.34 The "no PostCSS plugin chain"

Tailwind v4 has its own PostCSS plugin and doesn't need autoprefixer (which now ships with Tailwind). Keep the PostCSS config minimal:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### B.35 The "named exports only" rule

Use named exports, not default:

```ts
// good
export function ChipRow() { ... }

// bad
export default function ChipRow() { ... }
```

Reasons:
- Named exports survive renames better.
- IDEs auto-import named exports more reliably.
- `export default` + arrow function loses the function name for debugging.

The exception: routes (default export is React Router idiom for dynamic imports) — but we mostly use named exports there too.

### B.36 The `tsconfig.json` strict settings

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": false  // off — too aggressive for libraries
  }
}
```

`noUncheckedIndexedAccess` is the killer feature: `arr[0]` is `T | undefined` instead of `T`. Catches a class of "what if the array is empty" bugs.

`exactOptionalPropertyTypes` is off because some libraries (Radix, Motion) have signatures that require explicit `undefined` distinction, which is annoying. Pick your battles.

### B.37 The "no `any`" discipline

`any` should appear only:
- In third-party type augmentations where the library's types are insufficient.
- In `as any` casts where TypeScript genuinely can't follow your reasoning.

Otherwise: `unknown` (forces type-narrowing) or proper types.

In SceneOS, we have ~3 `as any` casts in the entire codebase (one for SpeechRecognition window globals, one for Motion's variants where the inferred type is too narrow, one for partialize in Zustand). Each is documented inline.

### B.38 The "discriminated unions" pattern for variants

For props that have multiple shapes:

```ts
type ButtonProps =
  | { variant: 'primary'; label: string; onClick: () => void; loading?: boolean }
  | { variant: 'icon'; icon: React.ReactNode; ariaLabel: string; onClick: () => void };
```

TypeScript narrows on `variant`. The component renders different markup per variant, with type-safe access to variant-specific props.

This is more robust than optional props (`label?: string; icon?: React.ReactNode`) because TypeScript can't tell which combination is valid without the union.

### B.39 The "branded types" for IDs

```ts
type BeatId = string & { readonly __brand: 'BeatId' };
type SceneId = string & { readonly __brand: 'SceneId' };

function asBeatId(id: string): BeatId { return id as BeatId; }
```

Functions taking `BeatId` won't accept a raw `string`. Catches the "passed sceneId where beatId was expected" bug.

We don't use this aggressively in SceneOS (the codebase is small), but for larger apps with many ID types, it's worth it.

### B.40 The "type-only imports" discipline

```ts
import type { Beat, Scene, AgentTurn } from '@/types/manifest';
```

Type imports are erased at compile time. Faster builds, smaller bundles (TypeScript can drop the import). Use for imports that are exclusively types.

For mixed imports, prefix the type ones:

```ts
import { type Beat, buildInitialBeats } from '@/lib/beats';
```

---

## APPENDIX C — VOICE AND TONE DEEPER STUDIES

### C.1 The opening line of the agent

The agent's first line in any beat conversation should land the register immediately. Three patterns:

**Direct directive**: "Tell me about the lighting in this beat."
- Best when the beat has clear missing information.

**Reflective question**: "What's the mood you're chasing in this opening?"
- Best for beats that need tonal context before specifics.

**Concrete observation**: "We have a wide establishing shot here — let's lock the framing."
- Best for beats where the agent has a strong inference from the master prompt.

The wrong opening: "Hi! How can I help you with this beat today?" — assistant register, doesn't fit.

### C.2 The agent's questioning rhythm

The agent asks 3-5 questions per beat, paced:
- Q1: Mood / atmosphere.
- Q2: Specific visual element (lighting, framing, motion).
- Q3: Specific sensory detail (sound, texture, color).
- Q4 (sometimes): Reference / inspiration.
- Q5 (sometimes): Confirmation of synthesis.

Each question is one sentence. Each user answer triggers the next. The conversation should feel like a director's mini-interview, not a form.

### C.3 The agent's affirmation language

After the user answers, the agent affirms briefly before moving on. Patterns:

- "Got it."
- "Nice — that locks the lighting."
- "Yeah, that fits."
- "Hmm, let me hold that — *that* might shape the whole beat."

Brief. Not overly enthusiastic. Specific when there's a callback.

The wrong affirmation: "Awesome! Thanks for sharing that!" — too eager, breaks the cinematic register.

### C.4 The agent's rejection / pushback

Sometimes the user gives an answer the agent should question (for clarity, for cinematic strength). The agent's pushback is gentle:

- "That works — but let me push: do you mean *literal* gauzy, or just the feeling?"
- "Hmm, two readings here. Are we leaning *closer* to the figure, or holding the wide?"
- "I want to make sure we land this — what's the texture *under* the warmth?"

Pushback is collaborative, not adversarial. The agent serves the director; the director serves the film.

### C.5 The user's voice in the conversation

The user's bubbles in the conversation are *their words*, formatted as-is. We don't auto-correct, auto-format, or smart-quote the user's text.

Reasoning: the user's voice is theirs. Tampering would feel wrong, and would confuse them when their typed-quote becomes a curly-quote.

The agent's voice is *ours* (smart-quoted, em-dashed, italicized on connectives). The user's is *theirs*.

### C.6 The voice consistency audit

Read every agent line on every beat in sequence. Does it sound like one person? Or are some lines warm-direct and others corporate-helpful?

The audit catches drift from the canonical voice. Drift happens when:
- Multiple people write copy without coordination.
- Copy is rewritten ad-hoc without re-reading neighbours.
- A new feature ships with copy written in isolation.

Catch and fix in audit pass before release.

### C.7 The translation question

If we ever localize, the voice translates poorly literally. "Roll" / "cast" / "lock" are cinematic English-specific. Localized versions need a film-language equivalent in target language, not a literal translation.

A French version might use "tourner" / "casser" / "verrouiller" — but the equivalent register is what matters, not the words.

We didn't ship localization. Worth flagging.

### C.8 The microcopy for empty states (deeper)

Empty states fall into categories:
- **First-time empty**: "approve a beat to begin" — the user hasn't done anything yet.
- **Cleared empty**: "the splice is empty after reset — start a new project to begin" — the user reset.
- **Filtered empty**: "no beats matching that search — try fewer words" — the user's filter excluded everything.

Each gets distinct copy. First-time invites; cleared explains; filtered suggests.

### C.9 The error message taxonomy

Errors:
- **User-error**: "this beat needs a few more details before we cast it" — user can fix.
- **System-error (transient)**: "couldn't reach the floor — retry?" — retry usually works.
- **System-error (persistent)**: "the agent is having trouble — try refreshing" — escalation.
- **Catastrophic**: "something went sideways — reload the page" — full reset.

Each tier gets distinct copy and distinct UI affordance (inline retry vs page-level retry vs reload).

### C.10 The "feedback after action" copy

When the user does something successful, the feedback is:
- Visual: ember pulse, hairline progress, URL update.
- Audio (optional): cue.
- Copy (sometimes): toast or inline.

The copy is brief. "URL copied." Not "Successfully copied URL to clipboard! 📋"

Brief = confident. Verbose = compensating.

---

## APPENDIX D — WHEN THINGS GO WRONG ON DEMO DAY

### D.1 The laptop won't connect to the projector

Test with the projector before demo. Have a backup HDMI / USB-C / DisplayPort adapter. Have the demo-build URL bookmarked on a phone for emergency.

### D.2 The internet drops

Switch to mock mode (`VITE_MOCK_MODE=true` in URL or env). Demo continues with canned responses.

### D.3 The 3D canvas doesn't render

The CanvasErrorBoundary catches and shows the 2D fallback. Demo continues with the SVG star-map.

### D.4 The audio cues don't fire

Audio is opt-in; if browser blocks AudioContext, cues are silent. Doesn't break demo. Acknowledge it explicitly: "the audio is muted by default in our demo, but it's available."

### D.5 The bridge transition stutters

The presenter can disable motion via `?nomotion=1`. Bridge collapses to a 0.2s fade. Less cinematic but functional.

### D.6 The judge interrupts mid-demo

Pause, answer, resume from where you stopped. Don't restart. Have stage indicator point to where you are.

### D.7 The judge asks for a feature that doesn't exist

"Yeah, that's on the roadmap — for the hackathon scope, we focused on [X]." Don't pretend the feature exists; don't apologize for not having it. The roadmap framing positions the absence as deliberate.

### D.8 You forget your line

Look at the screen. The screen has the answer. Read what's there: "and as you see, the URL composes itself..." Then continue.

### D.9 The presenter freezes on stage

Have a second person who can take over. Pre-coordinate the handoff line: "So [name]'s gonna walk you through the canvas." Smooth handoffs read as "team", not "panic."

### D.10 The submission deadline approaches and the build is broken

Revert to last known good. Submit that. A working demo that's slightly behind is infinitely better than a broken demo that's "almost there."

---

## APPENDIX E — A FINAL NOTE ON TASTE

This document has been opinionated throughout. Taste is what separates the awwwards-floor from the godly-ceiling. Taste is not learned from reading a single document; it's cultivated through:

- **Looking at premium work daily**: godly.website, awwwards, Kottke, Are.na, IT'S NICE THAT, Linear's marketing, Vercel's marketing, Stripe's docs, the Criterion Collection's catalog, A24's site, Apple's marketing.
- **Reading editorial design**: print magazines (NYT Mag, Wired's print archive, Esquire's design history) — the editorial sensibility precedes web by 100 years.
- **Watching films**: not for pleasure (well, also for pleasure), but for the visual language. How does a Roger Deakins frame land? What's the color grading on a Bradford Young shoot? How does Wes Anderson's symmetry differ from Yorgos Lanthimos's symmetry?
- **Rejecting the "first idea"**: the first answer is usually the convention. The second answer is usually the slightly weirder, more interesting one. Push past the first idea consistently.
- **Accumulating principles**: this document is one such accumulation. Build your own. Audit your own work against it.

You will encounter situations this document doesn't cover. When you do, the meta-principles still apply:

- Cinematic, not SaaS.
- Restraint is a feature.
- The cinematic register is built by deletion.
- Generic is the enemy.
- Would Nolan ship this?
- Would this land on godly?

Trust your taste. Verify in the browser. Ship.

End of transmission. Truly this time.


