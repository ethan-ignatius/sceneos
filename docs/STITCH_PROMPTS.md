# SceneOS — Google Stitch Prompts

> For Alex's Stitch session. Last updated: 2026-04-25.
> [Google Stitch](https://stitch.withgoogle.com) is Google Labs' AI UI design tool. It generates production-ready Tailwind components from natural-language prompts and infinite-canvas iteration.

This document has one prompt per screen, written so you can paste-and-iterate. Order is the order to design in. The first prompt establishes the design system; later prompts ride that system.

---

## 0. Design system seed (paste this FIRST)

> Generate a `DESIGN.md` for a tool called **SceneOS**.
>
> Vibe: cinematic, editorial, film-poster moody. Reference points: godly.website, awwwards.com, the LTX Studio landing page, Linear's marketing site, Apple's Vision Pro page. Avoid: SaaS pastels, Tailwind UI defaults, anything that looks like a generic AI tool.
>
> Color palette:
> - Background: warm near-black `#0a0908`, secondary `#14110f`, tertiary `#1f1a16`
> - Foreground: warm off-white `#f5efe7`, secondary `#c5b9a8`, tertiary `#6b5d50`
> - Brand accent: ember orange `#f0a868` (used sparingly — only for active states and CTAs)
> - Cool counter: `#5e7080`
> - Glow: `#ffb47080`
>
> Typography:
> - Display: editorial serif (PP Editorial New / Italiana). Italics on connectives, not nouns. clamp() responsive sizing.
> - Body: Inter
> - Mono: JetBrains Mono — only for prompts and generated text
>
> Motion: 60fps target, springs for affordances, eases for transitions. Page transitions are choreographed and slow (~700ms). Default Tailwind transitions are forbidden.
>
> Components: shadcn-derived, Radix primitives under the hood, Lucide icons (stroke-width 1.5).
>
> Output: a `DESIGN.md` I can import as the design system for all subsequent screens.

After Stitch generates this, **lock it as the design system** before generating any screens.

---

## 1. Landing screen

> Design the landing screen for **SceneOS**.
>
> The screen has exactly two visual elements: an **editorial-serif headline** and a **single text input**. Nothing else above the fold.
>
> Headline: large, italic display serif. Copy: *"Direct your idea into a cinematic."* Sub-line in regular weight, small caps tracking, fg-secondary: "Creativity in. Cinematography handled."
>
> Input: full-width, centered horizontally, ~640px wide on desktop. Single line, no border, just an underline that animates in on focus. Placeholder: "Describe your idea — a trailer, a short, a feature." Mono font for the placeholder. The whole input element should feel like a film clapboard slate, not a form field.
>
> Below the input, a row of three pill buttons: "Trailer · Short · Feature". One is selected (Trailer by default). Selected pill has ember accent. Pills use 1.5px borders, ghost variant.
>
> Bottom-left: tiny SceneOS logotype. Bottom-right: tiny mute toggle and "?".
>
> Background: deep warm-black with extremely subtle film-grain texture (animated, very slow noise shift). No images. No video. The void is the whole point.
>
> Motion: on focus of the input, the underline draws from left to right (~280ms, ease-outQuart). On submit, the entire screen does a "page-crumple" exit — the page paper-curls toward bottom-right and burns into the next screen. (For Stitch's purposes, just generate the static screen; the crumple is choreographed in code via GSAP.)

---

## 2. Crumple-bridge transition (concept-only)

> Design a transition state between the landing and the canvas.
>
> Concept: the landing screen *crumples like film burning at the corner*. The bottom-right corner ignites with an ember-orange glow, the screen curls inward, and underneath it reveals the canvas — a void with floating glowing nodes.
>
> Generate a single keyframe screenshot at 60% through the transition: the landing is partially curled, ember glow visible, the canvas is bleeding through.
>
> No interactive elements; this is a non-interactive bridge.

---

## 3. Canvas screen (the headline)

> Design the canvas screen for **SceneOS**. This is the core experience.
>
> Full viewport. Dark background. Floating in 3D space: a string of glowing **nodes** — soft spherical orbs in cool grey, each with a faint ember glow when hovered. Nodes are connected by faint dotted arcs (camera-paths, not data edges).
>
> Number of nodes depends on selected video type — design for the **5-node trailer** layout: nodes labeled "Establishing", "Hook", "Rising", "Climax Tease", "Sting." Labels float above each node in display-serif italic, small.
>
> Camera: slight perspective, slight forward tilt. The first node is closer; subsequent nodes recede in z. The user "flies" along the chain by clicking.
>
> Top-left chrome: a small floating panel with the master prompt (truncated to one line, mono font, fg-tertiary). Click to expand.
>
> Top-right chrome: a "Stitch Tray" preview pill — collapsed, shows "0 / 5 ready." Click to open the tray.
>
> Bottom-center chrome: a soft progress arc, 5 segments, one filled per approved beat.
>
> No menus, no header, no footer. The canvas is the screen.
>
> Active state (when a node is being explored): the active node lifts slightly toward camera, ember-glows brightly, and the node-detail drawer slides in from the right covering ~36% of the viewport.
>
> Generate two variants:
> 1. Default state — no node active, all nodes idle-breathing.
> 2. Active state — node 2 ("Hook") is active, drawer is open, agent bubbles visible.

---

## 4. Node-detail drawer

> Design the **node-detail drawer**, which slides in from the right when a node is selected on the canvas screen.
>
> Width: 36% of viewport on desktop, full-width on mobile. Background: bg-elev-1 (`#14110f`) with a 1px ember-dim left edge.
>
> Top of drawer:
> - Beat name in large display-serif italic ("Hook").
> - Below it: a small mono caption — "Beat 2 of 5 · Trailer · Intimate, kinetic, hooked."
> - Top-right close button (Lucide X).
>
> Middle: the **agent bubble stream**. Bubbles alternate left (agent, ember tint) and right (user, cool tint). 12px border radius, max-width 80% of drawer. Letter-by-letter reveal animation when generated. Last user bubble has a multi-line input field below it with a small "send" button (ember).
>
> Bottom: a **status pill** — "Sufficient information" / "1 more question recommended" / etc. Subtle ember glow when sufficient.
>
> Right under the status pill, a single CTA: **"Generate scene"** (ember primary). Disabled and dim if not yet sufficient.
>
> Generate two variants:
> 1. Mid-questionnaire — 3 bubbles visible, status pill says "2 more questions recommended."
> 2. Sufficient state — all bubbles fade slightly, "Generate scene" is fully active.

---

## 5. Generation in progress

> Design the **generation-in-progress** state inside the node-detail drawer.
>
> Replace the bubble stream with a **single hero panel** showing:
> - A 16:9 placeholder where the storyboard image is materializing. Use a noisy gradient that feels like a frame "developing" — start with low-saturation static, slowly resolving toward a colored frame.
> - A subtle live caption strip below it: "Generating… 0:32 / ~2:00."
> - A second smaller progress arc to the right of the timer.
>
> Background of the drawer: pulsing glassmorphic backdrop blur (FlowBoard's `animate-blur-pulse` style — a `backdrop-filter: blur` that gently oscillates 0–8px over 2s, infinite).
>
> Below the panel: three steppers in mono — "1. Storyboard generated", "2. Clip rendering", "3. Uploading to Cloudinary." Active step has ember dot.

---

## 6. Scene + clip preview (post-generation)

> Design the **post-generation preview** state inside the node-detail drawer.
>
> Top: the generated still (16:9, full drawer width).
>
> Middle: a small playable clip preview (5s) with a custom progress scrubber, ember accent. Custom controls — no native browser player.
>
> Below the clip: a 3-line readout in mono — the *refined prompt* the agent emitted. fg-tertiary, scrollable if long. A small "Edit prompt" link in ember-dim opens an inline edit field.
>
> Two CTAs side by side at the bottom:
> - **"Approve & next beat"** — ember primary, full-width
> - **"Regenerate"** — ghost variant, narrower
>
> When approved: the drawer slides out, the canvas's active node morphs from cool grey to ember-glow, and the bottom progress arc fills one more segment.

---

## 7. Stitch tray

> Design the **Stitch Tray** that opens from the top-right of the canvas.
>
> Slides down from the top-right corner. Width: 480px on desktop. Background: bg-elev-2 with a soft drop shadow.
>
> Top of tray: a horizontal scroll-row of approved clip thumbnails, 16:9 each, ~120px wide. Mood-tinted bottom edge (e.g., establishing = cool, climax = warm). Each thumb has a tiny mono label ("01 · Establishing").
>
> Middle: the **live-built Cloudinary URL** in mono, fg-tertiary, with a syntax highlight on `fl_splice` (ember). The URL appears letter-by-letter as clips are approved. Copy button to its right.
>
> Below the URL: a row of metadata — total duration, resolution, "Powered by Cloudinary" caption with a tiny logo.
>
> Bottom: two CTAs:
> - **"Render final cinematic"** — ember primary, full-width, disabled until all beats approved
> - **"Open in CutOS to fine-edit"** — ghost variant, smaller
>
> Generate two variants:
> 1. Mid-state — 3 of 5 thumbnails filled, URL has 3 of 5 fl_splice segments, render CTA disabled
> 2. Complete state — all 5 filled, full URL, render CTA active and pulsing softly

---

## 8. Final delivery screen

> Design the **final delivery** screen — what the user sees after clicking "Render final cinematic."
>
> Full viewport. Centered: a 1920×1080 video player at ~70% width with custom ember-themed scrubber and play button.
>
> Above the player, in display-serif italic: *"Your cinematic."* (no exclamation, no enthusiasm — it's understated).
>
> Below the player: three actions in a horizontal row:
> - **"Download MP4"** — primary
> - **"Copy share link"** — ghost
> - **"Open in CutOS to fine-edit"** — ghost
>
> Bottom-right corner: a small "Make another" button that clears state and returns to landing.
>
> Subtle film-grain overlay on the entire screen, slightly stronger than the landing.

---

## 9. Handoff to CutOS deep-link state

> Design a brief **handoff modal** that appears after the user clicks "Open in CutOS to fine-edit."
>
> Centered modal, ~480px wide, glassmorphic backdrop blur over the previous screen. Inside:
> - Display-serif italic: *"Handing your cinematic to CutOS."*
> - One-line caption: "Pinning every beat, every clip, every prompt to a CutOS timeline."
> - A 3-step animated checklist appearing one item at a time:
>   - "Manifest sealed."
>   - "Project created in CutOS."
>   - "Opening editor…"
> - When all three are done, a final "Go to editor →" button opens CutOS in a new tab.
>
> No close button. The handoff is a brief celebratory beat, not a configurable step.

---

## 10. Iteration tips for Stitch

- After each generation, scroll the result and ask Stitch to **"reduce visual density by 30%"** — Stitch tends to over-add cards/badges/icons; SceneOS wants emptier compositions.
- If Stitch generates SaaS-pastel colors, paste a **swatch reference image** of a Christopher Nolan still or a film-poster Pinterest grab and ask "use this color mood instead."
- Use Stitch's **"connect screens"** feature once you have ≥3 screens to map the click-paths between Landing → Canvas → Detail Drawer → Stitch Tray → Final.
- Export to **Tailwind CSS** when satisfied. Drop the components straight into `frontend/src/components/` and adapt to our motion presets and design tokens.
- Save the resulting `DESIGN.md` to `docs/DESIGN.md` for future Stitch sessions to import.
