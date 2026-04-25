# SceneOS — UI Fundamentals (lesson review)

> Last updated: 2026-04-25.
> Distilled from the round-6 training: the 60-30-10 color rule, 5 UI don'ts, the card-rework, single-column forms, practical typography (Wichary + Tuts+), and a quick read on Unicorn Studio + the Stitch palette validation.
>
> **Read with [`MASTER_FRONTEND_DEV.md`](MASTER_FRONTEND_DEV.md) and [`MOTION_LANGUAGE.md`](MOTION_LANGUAGE.md).** This doc is the static-design counterpart to those motion-heavy docs.

---

## 1. The 60-30-10 color rule

The ratio: **60% neutral / base** · **30% primary / supporting** · **10% accent / call-to-action**.

It's a guideline, not a law. The pattern that works in dark interfaces flips: 60% becomes a deep neutral (warm near-black for SceneOS). The thing that *never* changes is the 10%: accent colors must stay scarce or they stop signalling.

### 1.1 SceneOS audit (we comply)

| Bucket | % usage | Tokens | Where |
|---|---|---|---|
| **60% — neutral base** | dominates the canvas, drawer, page bg | `bg-base` `#0a0908` (warm near-black) · `bg-elev-1` `#14110f` · `bg-elev-2` `#1f1a16` | Page background, drawer chrome, canvas void, footer |
| **30% — supporting** | typography, lines, inactive states, dividers | `fg-primary` `#f5efe7` · `fg-secondary` `#c5b9a8` · `fg-tertiary` `#6b5d50` | Headlines, body, mono captions, divider lines, ghost button borders |
| **10% — accent / CTA** | active state, primary CTA, "ready" cues | `brand-ember` `#f0a868` · `brand-ember-dim` `#a87447` | Magnetic button bg, ember-pulse glow, active pill ring, sliding underline |
| **5% — secondary accent** | only when ember would over-saturate | `brand-cool` `#5e7080` | Cool-grade companion in beat-mood color grades; rare in chrome |
| **<2% — state** | success/warn/error feedback | `state-success` `#6f9c7d` · `state-warning` `#d4a373` · `state-error` `#c4727b` | Sufficiency-met dot, error toast, warning badge |

**Why we comply:** the dark cinematic register puts most of the screen in neutral territory by definition. The ember accent is hand-rationed — it appears on the magnetic button when ready, on ember-pulse cues, on the active pill ring, and on the live `fl_splice` URL highlight. Each instance is intentional.

**Audit checklist (run before merging any new screen):**
- [ ] Is more than ~10% of the screen ember? If yes, demote some to ember-dim or remove.
- [ ] Do we have multiple competing accent colors? Stick to ember as primary; cool only when ember would clash with a beat mood.
- [ ] Is the `bg-base` / `bg-elev-*` proportion holding the 60%? If a card or panel is breaking that with a competing fill, reconsider.

### 1.2 The flip rule (when 60% is bright)

If a future surface uses a light register (e.g. a print-style "About SceneOS" page), the same 60-30-10 holds — just with a warm cream as the 60%, a cool grey as the 30%, and ember still as the 10%. We probably won't ship a light surface for the hackathon, but the rule scales.

---

## 2. Card design — the 5 fixes

The "card rework" lesson distilled five things that turn a card from yard-sale to mature:

### 2.1 Drop shadow: subtle, not heavy
Rule: keep box-shadow opacity ≤ 10%. Low x/y offset (~4px). Soft blur (~20px).

In SceneOS:
```css
/* Drawer + thumbnail-tray cards */
box-shadow: 0 4px 20px rgba(10, 9, 8, 0.4); /* opacity 0.4 because the page is darker */
```

For our dark register the shadow can be slightly stronger (we're casting onto bg-base, not white), but the principle holds: the shadow is a separator, not a billboard.

### 2.2 Border radius matches its container
If the card has `rounded-xl` (12px), the image inside should be `rounded-lg` (8px) — slightly tighter so it doesn't break the card's silhouette. The button inside should match the card's family (8–12px, never wildly different).

**SceneOS radius family:** 8px (sm), 12px (md), 16px (lg), 100% (pill). Mix freely *within* the family — never mix in a 24px round-corner button on a 4px card.

### 2.3 Hierarchy via the rule of two-thirds
For image-driven cards: image takes **2/3** of the card height, content takes **1/3**. This is more interesting than 50/50 and more readable than 80/20.

In SceneOS the stitch-tray thumbnails follow this. The drawer's preview panel does too (16:9 still + agent-bubble area below).

### 2.4 Typography hierarchy = size + color + weight + placement
Don't just bump the title font-size. Mix the levers:
- **Size** — 2× scale between heading and body (40px ↔ 20px).
- **Color** — heading at full primary, body at secondary (~70% opacity).
- **Weight** — heading at 600+, body at regular (400).
- **Placement** — group title + meta + body together, then add proper white space before the CTA.

### 2.5 Edge spacing = consistent and ample
Pick one value (e.g. `p-12` = 48px) and apply it on all four edges of the card. No card has 50px on the left and 30px on the bottom unless the design intentionally calls for it.

---

## 3. Forms — single-column unless contextually exempted

The rule: **stack form fields vertically by default.** Side-by-side fields (first name + last name, email + confirm email) introduce "where do I look next" friction.

Exception: fields that are **contextually inseparable** can sit side-by-side — e.g. country code + phone number. Two fields, one mental model.

### 3.1 SceneOS forms
We have one form: the landing's master prompt input. Single-line. Single field. Zero violations.

The agent questionnaire inside the drawer is also single-column by definition (chat bubbles).

If we ever add an email-capture form on a marketing surface, single-column it. Don't side-by-side first/last name.

---

## 4. Border-radius matching

Within a single screen, every interactive element should share a radius family (e.g. all 8–12px, or all pill-shaped). A round button next to a sharp-corner card looks like two designs glued together.

### 4.1 SceneOS radius matrix

| Component | Radius | Why |
|---|---|---|
| `Button` (sm) | 6px | Compact, sharp |
| `Button` (md/lg) | 8px | Family base |
| `MagneticButton` | 8px | Same family as Button |
| `Pill` | 9999px (pill) | The exception — pills are round by design |
| `<input>` underline-only | n/a | No radius — underline is a line |
| Drawer panel | 0px (full-edge) | Slides from screen edge; no radius |
| Stitch tray thumbnails | 6px | Tighter than the parent card |
| Stitch tray (the panel itself) | 12px | Lg radius |
| Cards in future marketing | 12–16px | Stays in family |

If you find yourself adding a 24px radius somewhere, ask: "does the rest of this surface support it?" If no, conform to the family.

---

## 5. Title case for CTAs (never UPPERCASE)

The rule: button labels read in **Title Case** or **Sentence case**. Avoid ALL CAPS for CTAs — uppercase is hard to read, screams urgency, and usually doesn't fit the cinematic register.

### 5.1 SceneOS audit

| Element | Case | Verdict |
|---|---|---|
| `<MagneticButton>Begin</MagneticButton>` | Title case (single word) | ✓ |
| `<Button>Generate scene</Button>` | Sentence case | ✓ |
| `<Button>Render final cinematic</Button>` | Sentence case | ✓ |
| `<Pill>Trailer</Pill>` (visible label) | Title case | ✓ |
| Mono-uppercase tracking (e.g. "STITCH TRAY · 0 / 5 READY") | UPPERCASE | ✓ allowed because: it's a *label/caption*, not a CTA — micro-typography rules differ |

We use uppercase only for tags, labels, captions, and meta — never for clickable CTAs.

---

## 6. Practical typography (Wichary + Tuts+)

Distilled from Marcin Wichary's *Typography is impossible* and the older Envato/Tuts+ practical-typography guide. The points that affect SceneOS most:

### 6.1 Type sticks out — give it room
Letters can render outside their box. Ascenders, descenders, italics, accents. Always pad ~⅓ of the font size around clipped containers.

**SceneOS implication:** the headline `<TextSplitter>` characters are inline-block — Italiana italic descends on `g`, `y`, `p`. If we add an `overflow: hidden` parent, we'd clip those. Don't.

### 6.2 Type doesn't measure clean across fonts
Two fonts at the same `font-size` won't have the same visual size. Italiana (display) at `clamp(3rem, 7vw, 6rem)` doesn't match Inter at the same value — Italiana sits taller.

**SceneOS implication:** when pairing display + body in a single block (e.g. headline + sub-line), tune sizes by *eye*, not by math. Our `text-display-lg` (Italiana) paired with `text-xs` (Inter mono caps tracking) was tuned visually, not via a strict 4× ratio.

### 6.3 Letter-spacing scales differently than font-size
Doubling font-size doesn't mean doubling letter-spacing — it means *halving* the value, often. Tighter spacing at large sizes.

**SceneOS implication:** display headlines use `letter-spacing: -0.04em` (tighter); body uses default (0); mono labels use `0.24em`–`0.32em` (much wider). Three distinct scales.

### 6.4 Never use synthesized bold or italic
If a font weight isn't loaded, the browser fakes it. The result is hideous (squished letterforms instead of redrawn ones).

**SceneOS implication:** `index.html` preloads only the weights we use (Italiana 400; Inter 400/500/600/700; JetBrains Mono 400/500). If we add a new weight class to a component, we must add it to the font-load list.

### 6.5 Line length: 45–75 characters is the sweet spot
Optimal reading line is ~65 characters. Above 75 is fatigue. Below 45 is choppy.

**SceneOS implication:**
- Landing headline: short by design (3 lines, ~20 chars each). Fine.
- Drawer body copy + agent bubbles: ~80 char max-width via `max-w-prose` would land us at ~65 chars in Inter. Apply where we have body text.
- Stitch tray live URL: mono, so character count matters less than the typewriter reveal pacing.

### 6.6 Line-height: 1.5× for body, tighter for display
Body copy: `line-height: 1.5` (1.5× the font-size).
Display: `line-height: 0.95–1.1` (tighter — looks more architectural).

**SceneOS implication:** already correct. `text-display-xl` is 0.95, `text-display-lg` is 1.0. Body and Inter defaults to 1.5 unless we override.

### 6.7 Words need to be told to break
A long URL or word will overflow its container by default. Use `word-break: break-all` or `<wbr>` or insert zero-width spaces.

**SceneOS implication:** the live `fl_splice` URL in the stitch tray is set with `break-all` so it wraps cleanly. Important — Cloudinary URLs get long fast.

---

## 7. Hierarchy strategies

The four levers, from softest to loudest:

1. **Placement** — top-of-section, left-aligned, prominent grid cell.
2. **Color** — full primary vs. muted secondary.
3. **Weight** — bold/semibold vs. regular.
4. **Size** — only after the others. A 5px size jump + bold + full color is louder than just a 30px size jump.

**SceneOS rule of thumb:** if you need to make something stand out, try color + weight before reaching for size. The big number (e.g. 132px) is reserved for a single hero word per surface.

---

## 8. Unicorn Studio — fallback tool (don't ship for hackathon)

Unicorn Studio is a visual editor that exports embeddable WebGL effects (light beams, mouse-tracked diffuse, particle 3D shapes) as ~few-KB JS bundles or iframes. It's the no-code path to huly.io-class hero effects.

**Why we don't use it for SceneOS hackathon:**
- We already have R3F + GSAP + Motion. Adding Unicorn Studio means another tool to learn, another bundle, another integration.
- Their free tier has a "Made with Unicorn Studio" badge.
- Authoring in Unicorn Studio + integrating into our React app = 1–3 hours we don't have.

**Why it's worth knowing for post-hackathon:**
- Light-beam-on-product hero (huly.io style) is a 30-min job in Unicorn Studio vs. half a day in shaders.
- Mouse-tracked diffuse on text (not unlike our cursor spotlight, but stronger) is one effect drop.
- Embed via `<iframe>` in any framework.

If we ship a marketing site post-hackathon, Unicorn Studio is the right tool for the hero. For now, R3F + our own primitives stay.

---

## 9. Stitch validation: image 17 confirms our register

Alex generated a Stitch result that, despite Gemini's typography being weak, **validated SceneOS's color register**: dark warm-black bg + ember/orange accents + cinematic particle sphere = exactly where we've been heading.

The relevant takeaways from image 17:
- **Ember-on-near-black** is a valid hierarchy. We're already doing this.
- **A glowing particle sphere** as ambient hero art is striking. We could ship this on the canvas (each beat node could be a tiny particle cluster) or on the final-delivery screen as a backdrop. Cost: a few hours of R3F. Value: cinematic depth that no competitor will have.
- **Stat cards in dark with ember number** (e.g. "22 Done" / "7 In progress"). If we ever ship a "session summary" screen ("you used X clips · saved $Y in production cost · ran Z generations") this is the visual.

Image 18 (peachy medical app), 19 (purple/blue task app), 20 (green/blue job app) **don't match our register** — too friendly, too pastel. We file them for future projects, not for SceneOS.

---

## 10. The audit checklist (per screen, before merging)

Cross-cutting from this doc:

- [ ] **60-30-10:** does the screen split bg/supporting/accent in roughly that ratio?
- [ ] **Cards:** if there are cards — drop shadow ≤ 10% opacity? radius matches family? content rule-of-thirds? hierarchy via 4 levers?
- [ ] **Forms:** single-column unless contextually exempt?
- [ ] **Border radius:** all interactive elements share a family?
- [ ] **CTA case:** title or sentence — never ALL CAPS?
- [ ] **Type:** all loaded weights actually rendered (no synthesized bold)? line lengths 45–75 chars where readable text matters?
- [ ] **Hierarchy:** at most one "loud" element per section (the headline or the CTA, not both)?

If everything is checked, ship. Otherwise, fix or cut.

---

## 11. Cross-references

- Motion-side rules: [`MOTION_LANGUAGE.md`](MOTION_LANGUAGE.md)
- Pattern library + component bestiary: [`MASTER_FRONTEND_DEV.md`](MASTER_FRONTEND_DEV.md)
- Design tokens (color, type, spacing): [`FRONTEND_PHILOSOPHY.md`](FRONTEND_PHILOSOPHY.md)
- Surface buildout order: [`FRONTEND_BUILDOUT.md`](FRONTEND_BUILDOUT.md)
- Ranked execution: [`FRONTEND_TODO.md`](FRONTEND_TODO.md)
