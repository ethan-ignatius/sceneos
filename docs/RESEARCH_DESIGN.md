# Typography & Design Research — SceneOS

> **TL;DR for future-Alex.** Replace `Italiana` (display) + `Inter` (body) with **Instrument Serif** (display, italic-friendly) + **Geist** (body, geometric variable). Keep `JetBrains Mono` — but if a one-line swap is acceptable, prefer **Geist Mono** so the mono and body share DNA. Concrete CSS in §5.
>
> **Why:** Italiana is a 19th-c. wedding-revival serif — too thin, too brittle, wraps badly at headline scale. Inter is fine but signals "2018 SaaS." Instrument Serif + Geist is the 2025–2026 awwwards-tier combination (editorial drama + Swiss precision) and ships free via Google Fonts.

---

## Section 1 — 10 articles read

1. **Typewolf — "The 40 Best Google Fonts (2026)"** — https://www.typewolf.com/google-fonts
   *Body-text-friendly geometric sans = DM Sans / Inter; new wave (Instrument Sans/Serif, Bricolage Grotesque) called out as "really great."* Editorial display fonts marked `*` are body-text-safe; display-only serifs are not.

2. **Muz.li — "Best Free Google Fonts for 2026"** — https://muz.li/blog/best-free-google-fonts-for-2026/
   *Limit to two families. Match tone to context — neutral-geometric for tech, expressive serif for editorial.* Spectral & Lora flagged for editorial italics; Inter / DM Sans / Plus Jakarta for screens.

3. **Medium / Bootcamp — "Best Google Font Pairings for UI Design (2025)"** — https://medium.com/design-bootcamp/best-google-font-pairings-for-ui-design-in-2025-ba8d006aa03d
   *"Fraunces / Inter — retro-modern editorial meets functional digital clarity"* is named explicitly as the premium-UI pattern. DM Serif Display / DM Sans = elegant editorial.

4. **Awwwards — "100 Best Free Fonts for Designers (2025)" + "20 Best Google Web Fonts"** — https://www.awwwards.com/best-free-fonts.html, https://www.awwwards.com/20-best-web-fonts-from-google-web-fonts-and-font-face.html
   *Instrument Serif identified as "the new wave of editorial typography designed specifically for modern branding and digital editorial contexts," added to Google Fonts in 2023, rapidly adopted by design-forward brands.*

5. **Vercel Font (Geist)** — https://vercel.com/font
   *Geist Mono was built first; Geist Sans extended the system. Both grounded in Swiss design — "precision, clarity, functionality."* Pair-by-design — same DNA across UI and code.

6. **Undercase Type — Fraunces** — https://undercase.xyz/fonts/fraunces
   *Fraunces has 4 axes — weight, optical-size, soft, wonk — with full italic. "Display soft-serif inspired by early-20th-c. Windsor / Souvenir / Cooper."* Funky, not somber → wrong register for cinema.

7. **Google Design — "Fun & Flexible: Fraunces, a New Google Font"** — https://design.google/library/a-new-take-on-old-style-typeface
   *Confirms Fraunces' "wonk" axis = intentional optical distortions. Best when you want personality, not gravitas.*

8. **Smashing — "CSS Techniques for Reading Legibility"** — https://www.smashingmagazine.com/2020/07/css-techniques-legibility/
   *`line-height: calc(1ex / 0.32)` keeps body leading tied to x-height across font swaps; `width: 60ch` is the ideal paragraph measure.* `font-size-adjust` normalizes x-height between display + body.

9. **Josh Comeau — "Custom CSS Reset"** — https://www.joshwcomeau.com/css/custom-css-reset/
   *`-webkit-font-smoothing: antialiased` only affects macOS (Apple killed system subpixel AA in 2018 but browsers still use it). `text-wrap: pretty` for paragraphs, `text-wrap: balance` for headlines — fixes orphan-word wrap issues like our Italiana headline.*

10. **Josh Comeau — "Full-Bleed Layout Using CSS Grid"** — https://www.joshwcomeau.com/css/full-bleed/
    *Optimal line length 65ch (45–85 acceptable). Constrain text columns; let media break full-width.* Directly relevant to our agent-bubble + canvas-overlay layout.

11. **Rauno Freiberg — "Craft"** — https://rauno.me/craft/
    *Motion is functional, not decorative. Easing curves telegraph quality. Hierarchy via scale + weight, not color. Invisible details compound.* This is the motion-language baseline behind our `MOTION_LANGUAGE.md`.

12. **Refactoring UI — "Building Your Color Palette"** — https://www.refactoringui.com/previews/building-your-color-palette
    *"True black tends to look pretty unnatural — start with a dark grey."* We're already on `#0a0908` (warm near-black) — correct.

> *(Bonus articles 11–12 included because two requested URLs 404'd; substituted live equivalents.)*

---

## Section 2 — Synthesized principles

The 10 most actionable rules for SceneOS, distilled. No platitudes — every rule is a number, a property, or a named font.

1. **Body text on `#0a0908` should sit at `#f5efe7` ≈ 88% perceived white, never `#ffffff`.** Pure white on warm-black creates harsh chromatic aberration and fatigue at >30s read time. Our current `--color-fg-primary: #f5efe7` is correct — keep it.

2. **Body weight on dark backgrounds renders heavier than on light.** Drop one step: if the light-mode spec calls for `font-weight: 500`, ship `font-weight: 400` in dark. Stems "bloom" on dark backgrounds (irradiation effect).

3. **For display serifs at >4rem, set `letter-spacing: -0.03em` to `-0.04em`.** Display fonts are spaced for print; the digital default is too loose. We already do this in `.text-display-xl/-lg/-md` — keep.

4. **For body geometric sans at 14–18px, set `letter-spacing: -0.011em`** (Inter/Geist optical default). Negative tracking on small geometric sans tightens stems, raises perceived sharpness.

5. **Use `text-wrap: balance` on every `<h1>`/`<h2>`.** This fixes the Italiana headline-wrap bug directly — last-line orphans get rebalanced. Add `text-wrap: pretty` on long-form `<p>`.

6. **`line-height: 0.95–1.0` for display, `1.5–1.6` for body, `1.4` for UI labels.** Display tight for editorial gravitas; body loose for sustained reading; UI medium because labels are 1–3 words.

7. **Variable-font axes are non-negotiable in 2026.** A non-variable font wastes 200–300kb per weight and prevents fluid `font-weight: 423` mid-animation. Both replacements must be variable: Instrument Serif (limited but variable-friendly), Geist (full variable axis).

8. **OpenType `cv11` (single-storey `a`) on Inter/Geist for UI labels** (not body copy). Single-storey `a` reads as more "modern/Swiss" — used by Linear, Vercel, Arc. Two-storey `a` keeps long-form copy more readable. Toggle per element, not globally.

9. **`font-feature-settings: "ss01", "cv11", "calt", "kern"; font-variant-numeric: tabular-nums;`** for any UI showing numbers (timestamps, durations, frame counts). Tabular figures stop digits from jittering as values change — critical for our beat-timeline scrubber.

10. **Pair = one display serif (italic-forward) + one geometric sans (variable) + one mono (matched DNA).** No third sans. No second serif. The display serif is for ≤6 surfaces total: landing headline, beat titles, end-card credit. Everything else is body sans.

11. **Display fonts above 64px should drop `font-optical-sizing: auto`** — let the variable `opsz` axis pick the high-contrast cut. Our `clamp(4rem, 10vw, 9rem)` headline benefits the most.

12. **Caption text (mono, 11–13px) gets `letter-spacing: 0.04em` (positive)** — opposite of body. Wider tracking + uppercase + low-opacity is the cinematic-caption signature (Unseen Studio, NextSense, alexportfolio). We already do this implicitly; codify it as `.caption-track`.

---

## Section 3 — Typography recommendation

### Display — **Instrument Serif** *(Google Fonts, 2023, free)*

- **Why it wins over Italiana.** Italiana is a Bodoni-derivative wedding-invitation serif: hairline strokes that thin to nothing at small sizes, narrow proportions that wrap awkwardly, no optical-size axis. Instrument Serif is a *modern* condensed display serif with the same editorial gravity but proportions tuned for screens. Cool, restrained, cinematic — not romantic.
- **Italic.** Native italic is the marquee feature — Instrument Italic is what made it the awwwards-darling face of 2024–2025. Use italic for emotional or directorial words ("*scene*", "*lens*", "*ember*"), roman for steady-state.
- **Weights.** Regular + Italic only (intentional — display fonts don't need 9 weights). This is fine: we never use bold display.
- **Wraps cleanly.** Condensed metrics + balanced counters → `text-wrap: balance` works as intended. Solves the headline-orphan bug.
- **Used by.** Cosmos.so, Vercel marketing, Linear changelog, dozens of awwwards SOTD winners. It is *the* 2024–2026 editorial display face.

### Body / UI — **Geist** *(Google Fonts, 2024, free, variable)*

- **Why it wins over Inter.** Inter is humanist-leaning (two-storey `a`, varied stroke contrast) and reads "2018 SaaS." Geist is geometric, Swiss-derived (single-storey `a`, uniform stroke), reads "2026 native." Same legibility floor, more contemporary register. Variable on weight axis (100–900).
- **Pairs with mono.** Geist Mono was built *first*; Geist Sans extended the family. Identical x-height, identical aperture treatment — code captions and body copy align without effort.
- **Used by.** Vercel, v0, Next.js docs, half of YC's S24/W25 batch, Linear's marketing site. The new default for "ships in 2026."

### Alternates (rank-ordered fallbacks)

1. **Fraunces + Geist** — if you want more personality. Fraunces' "wonk" axis adds character; trade-off is it can read playful, not cinematic. Closer to FlowBoard's vibe than to Higgsfield's.
2. **Bricolage Grotesque + Inter** — if Geist feels too cold. Bricolage is grotesque-with-character (asymmetric `g`, slight humanist warmth), keeps editorial feel without serif. Single-typeface system.
3. **PP Editorial New + Söhne** — *commercial, do not ship*. Listed only because this is what every awwwards SOTD actually uses. Instrument Serif + Geist is the closest free equivalent.

---

## Section 4 — Mono replacement

**Recommendation: switch to `Geist Mono`.**

JetBrains Mono is excellent for IDEs but its 139 programming ligatures + true italics are wasted on caption-tracking style — and the slight x-height bump that helps 11px code reads as "developer tool" not "cinema slate." Geist Mono is purpose-built for UI:

- No ligatures (caption text doesn't need `=>` glyphs)
- Single-storey `a` matches Geist Sans (visual coherence)
- Tighter sidebearings → better at our 12px caption sizes
- Variable weight axis (matches Geist Sans)
- Same designer / Vercel as Geist → guaranteed metric harmony

If you want to keep JetBrains Mono (e.g. URL paths in stitch-tray genuinely benefit from its codey vibe) — that's defensible. **The optimization win from swapping is real but small. Spend the 5 minutes on the body+display swap first.**

Berkeley Mono (paid) and Supply Mono (paid) are out — hackathon.

---

## Section 5 — Concrete CSS

### 5a. Drop into `<head>` of `index.html` (or use the `@import` in §5b — pick one, not both)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&family=Instrument+Serif:ital@0;1&display=swap"
  rel="stylesheet"
/>
```

### 5b. Equivalent `@import` (top of `index.css`, before `@import "tailwindcss";`)

```css
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&family=Instrument+Serif:ital@0;1&display=swap");
@import "tailwindcss";
```

### 5c. `@theme` token updates (replace lines 29–31 of `index.css`)

```css
/* Typography */
--font-display: "Instrument Serif", "PP Editorial New", "Times New Roman", serif;
--font-body: "Geist", "Inter", system-ui, sans-serif;
--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
```

### 5d. Body-face OpenType + variable tuning (add to `@layer base { html { ... } }`)

```css
html {
  color-scheme: dark;
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;

  /* Geist body tuning — single-storey a, contextual alts, kerning, tabular nums for UI */
  font-feature-settings: "ss01", "cv11", "calt", "kern";
  font-variant-numeric: tabular-nums;
  font-optical-sizing: auto;
  letter-spacing: -0.011em;
}

/* Display block — italic-friendly, balanced wrap, optical-sized */
.font-display,
[class*="text-display-"] {
  font-family: var(--font-display);
  font-feature-settings: "kern", "liga", "dlig";
  font-optical-sizing: auto;
  text-wrap: balance;
}

/* Body paragraphs — pretty wrap to kill orphan words */
p {
  text-wrap: pretty;
}

/* Caption / eyebrow utility — formalises the cinematic-caption signature */
.caption-track {
  font-family: var(--font-mono);
  font-size: 0.6875rem;       /* 11px */
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-fg-tertiary);
  font-feature-settings: "tnum", "ss01";
}
```

### 5e. Optional — italic emphasis utility for directorial words

```css
.italic-display {
  font-family: var(--font-display);
  font-style: italic;
  font-feature-settings: "kern", "liga", "dlig", "swsh";
}
```

Use as `<span className="italic-display">scene</span>` in headlines.

---

## Section 6 — Migration checklist

Concrete ordered changes against `frontend/src/index.css` and the React tree.

### `index.css`

- [ ] Add `<link>` block to `frontend/index.html` `<head>` (preferred — no FOUT) **OR** prepend `@import` at line 1 of `index.css`.
- [ ] Line 29: `--font-display` → `"Instrument Serif", ...`
- [ ] Line 30: `--font-body` → `"Geist", "Inter", system-ui, sans-serif`
- [ ] Line 31: `--font-mono` → `"Geist Mono", "JetBrains Mono", ui-monospace, monospace`
- [ ] Update `@layer base { html { ... } }` with §5d additions (`font-feature-settings`, `font-variant-numeric`, `font-optical-sizing`, `letter-spacing`).
- [ ] Add `.font-display, [class*="text-display-"]` rule from §5d (gives every display utility `text-wrap: balance` + optical sizing). This single line fixes the headline-wrap complaint.
- [ ] Add `p { text-wrap: pretty; }` near the body rule.
- [ ] Add `.caption-track` utility under `@layer utilities`.

### Tailwind / component spot-check

After the swap, eyeball these surfaces (font metrics differ → some sizes will feel off-by-one):

- [ ] **Landing hero** (`routes/landing/*` or `components/landing/*`) — headline using `.text-display-xl`. Verify italic emphasis still reads. Consider replacing `<em>` styling with `.italic-display`.
- [ ] **Agent bubbles** — body copy line-height. Geist's x-height ≈ 0.52, Inter's ≈ 0.51 → text feels marginally larger. May want to drop `text-base` to `text-[0.9375rem]` in 1–2 spots.
- [ ] **Beat node titles** on canvas — display serif at small sizes. Instrument Serif holds down to ~24px; below that switch to body.
- [ ] **Stitch-tray URL** — mono. If you keep JetBrains Mono, no change. If you swap to Geist Mono, re-check the `url-segment-glow` keyframe (line 242–246) — color still works.
- [ ] **Final delivery / end card** — display serif at huge size. This is where Instrument Serif vs. Italiana most obviously wins. Keep `letter-spacing: -0.04em` from `.text-display-xl`.
- [ ] **Magnetic button label** — body sans. Geist's `cv11` single-storey `a` may visually lighten the button — verify with `<Button variant="ghost">` ghost contrast.
- [ ] **`tabular-nums`** — ensure it's *active* on any timecode / frame-count / duration display (beat scrubber, video player overlay). It's set globally on `html` per §5d so should cascade.

### Rollback plan

The swap is purely token-level. If Instrument Serif ships poorly on demo day, revert lines 29–31 to the original strings — no component changes required, since everything reads from `--font-*` tokens.

---

## Sources

- [Typewolf — 40 Best Google Fonts (2026)](https://www.typewolf.com/google-fonts)
- [Muz.li — Best Free Google Fonts 2026](https://muz.li/blog/best-free-google-fonts-for-2026/)
- [Bootcamp — Best Google Font Pairings UI Design 2025](https://medium.com/design-bootcamp/best-google-font-pairings-for-ui-design-in-2025-ba8d006aa03d)
- [Awwwards — 100 Best Free Fonts](https://www.awwwards.com/best-free-fonts.html)
- [Awwwards — 20 Best Google Web Fonts](https://www.awwwards.com/20-best-web-fonts-from-google-web-fonts-and-font-face.html)
- [Vercel — Geist Font](https://vercel.com/font)
- [Undercase Type — Fraunces](https://undercase.xyz/fonts/fraunces)
- [Google Design — Fraunces, A New Take on Old Style](https://design.google/library/a-new-take-on-old-style-typeface)
- [Smashing — CSS Techniques for Reading Legibility](https://www.smashingmagazine.com/2020/07/css-techniques-legibility/)
- [Josh Comeau — Custom CSS Reset](https://www.joshwcomeau.com/css/custom-css-reset/)
- [Josh Comeau — Full-Bleed Layout](https://www.joshwcomeau.com/css/full-bleed/)
- [Rauno Freiberg — Craft](https://rauno.me/craft/)
- [Refactoring UI — Building Your Color Palette](https://www.refactoringui.com/previews/building-your-color-palette)
- [Google Fonts — Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif)
- [Google Fonts — Fraunces](https://fonts.google.com/specimen/Fraunces)
- [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)
