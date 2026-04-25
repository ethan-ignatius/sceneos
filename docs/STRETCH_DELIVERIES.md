# STRETCH_DELIVERIES — Phase 9 Lesson Reflection

> **Phase 9 surface:** the stretch list. We are at LA Hacks 2026 *right now*. Read this **before** picking up any item — the calculus is different from earlier phases.

Phases 0–8 shipped every red and orange item in the TODO. The demo path is end-to-end. **Phase 9 exists only because we have time left**. The judgment call is about what to do with that time, not whether to clear a backlog.

This is a hackathon-mode reflection. The principle: **time is the constraint, not effort.** Anything that would absorb a 2h block during the live event needs a clear demo-day return on that investment.

---

## 1. Re-evaluating each item against hackathon reality

The TODO listed four 🟢 items for Phase 9. With LA Hacks already running, the calculus shifts:

| item | original spec | hackathon-mode call |
|---|---|---|
| 9.1 GLSL paper-curl shader | Snapshot landing DOM via `html-to-image` → `THREE.Texture` → fragment shader curl | **Skip — superseded by Phase 2 burn shader.** The burn already delivers the "page is being consumed" emotional beat. Adding paper-curl on top would be more shader for a *different* metaphor (curl vs. burn) — confusing, not additive. The Plan A floor was Plan B; we exceeded it. |
| 9.2 CutOS handoff modal | Modal explaining the CutOS handoff before opening the new tab | **Ship.** Currently `window.open` fires immediately with no context. Judges who click it land in CutOS confused. A modal reads as polish, costs ~30min, demos cleanly. |
| 9.3 Below-fold "About / How it works" | Scrollable explainer below landing | **Skip per TODO spec.** The Help button is the better surface for this; see 9.B below. |
| 9.4 Below-fold testimonials / partner logos | Marketing-style social proof | **Skip per TODO spec.** Nobody at LA Hacks ships testimonials. |

**What replaces the skipped 9.1 + 9.3 + 9.4:** one judge-facing polish item that's actually high-leverage for demo day:

| item | rationale |
|---|---|
| 9.B "How it works" walkthrough modal (Help button) | Currently the Help icon does nothing. Judges with zero context drop into a flow that asks them about *35mm vs 50mm lens choices*. A 3-step modal — "Direct → Refine → Cut" — gives them the mental model in 30 seconds. Cost: ~45min. ROI on demo day: very high. |

So Phase 9 ships **two items**: 9.A (CutOS modal) + 9.B (How-it-works). Total ~75min, both polish, both judge-facing.

---

## 2. The CutOS handoff modal (9.A)

Currently `routes/final-delivery-route.tsx`:

```tsx
const handleCutOS = useCallback(async () => {
  setOpeningCutOS(true);
  const res = await api.cutosImport({ manifest });
  window.open(res.editUrl, "_blank", "noopener,noreferrer");
});
```

The user clicks "Open in CutOS" → button shows a spinner → the new tab opens. **There's no explanation of what just happened.** Judges might not know CutOS is a separate product that picks up our manifest as a project.

**The modal:**

```
  ┌─────────────────────────────────────────┐
  │  Importing to CutOS                  ✕  │
  ├─────────────────────────────────────────┤
  │                                         │
  │  Your beat manifest is being uploaded   │
  │  to CutOS as an editable project. You   │
  │  can continue refining it there.        │
  │                                         │
  │  Project: My-cinematic-{shortId}        │
  │  Beats: 5  ·  Duration: 60s             │
  │                                         │
  │  [Spinner] Importing…                   │
  │                                         │
  │  → After:                               │
  │                                         │
  │  ✓ Imported. Click below to open.       │
  │                                         │
  │  [ Open in CutOS ]   [ Stay here ]      │
  └─────────────────────────────────────────┘
```

**State machine:**
1. Mount: spinner + "Importing…" label.
2. `api.cutosImport` resolves → swap to "Imported" + two buttons (Open in new tab / dismiss).
3. User clicks Open → `window.open(editUrl)` then dismiss.
4. User clicks Stay here → dismiss only; user can re-open later.

**Why a modal, not a toast:** toast is fire-and-forget. The CutOS handoff is a deliberate choice; the user should explicitly confirm the new-tab open. Browser popup blockers also prefer click-time `window.open` to async-then-open, so the explicit "Open in CutOS" button inside the modal is a *required* user-gesture.

**Implementation:** Radix Dialog (already installed via `@radix-ui/react-dialog`). Animated entrance via Motion variants on the dialog content. Cancellable via the X button or backdrop click.

---

## 3. The "How it works" walkthrough (9.B)

The Help button in landing footer currently has `aria-label="Help"` and `title="Help"` but **no onClick**. Wiring it to a modal is a 30-line job, and the demo-day payoff is real: when the judge clicks Help, they get a 3-step explainer that takes 30 seconds to absorb.

**Three steps:**

1. **"Direct"** — *You describe your idea once.* Image: the landing input. One-liner: "We don't ask for storyboards or shot lists. Just a sentence about what you want."
2. **"Refine"** — *A directorial agent asks 2 questions per beat.* Image: a chat bubble. One-liner: "Lens choice, blocking, color palette — the agent speaks the language of cinema, not 'what mood'."
3. **"Cut"** — *Cloudinary stitches your final cinematic.* Image: the live URL building in mono. One-liner: "Five clips become one, color-graded and timed, in a URL the judges can copy."

Each step has a lucide icon, a heading, a paragraph. No GIFs (don't bloat the bundle). Static frames are enough.

**Trigger:** the Help button in landing footer. Modal renders on click; dismissed via X or backdrop. State is local to the LandingRoute (no store needed).

**Auto-show on first visit:** *resist this.* The flicker reveal is part of the showpiece — popping a modal would crash the entrance. Only show on explicit Help click.

---

## 4. What we explicitly DON'T do in Phase 9

For the record, since hackathon-mode means *every choice is documented* so the team can defend it:

- **No paper-curl shader.** The burn shader covers the "page is being consumed" beat; adding curl would be a different metaphor. Reviewer note in `SHADERS_AUDIO.md` already explains this trade.
- **No below-fold marketing content.** The product is the demo, not the landing page.
- **No new audio cues.** Phase 8 closed at 5 cues — adding more dilutes the palette.
- **No animation timing tweaks.** Cohesion sweep (Phase 8) already passed all rubrics.
- **No new routes.** Seven routes is plenty (well, four — landing, transition, canvas, final).
- **No A/B test infrastructure.** Hackathons aren't A/B tests.
- **No analytics.** We're not collecting telemetry from judges.

---

## 5. Decision matrix

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 9.A CutOS handoff modal | ✅ yes | low | (current `window.open` direct call) |
| 9.B Help → How-it-works modal | ✅ yes | low | (Help button stays inert; doc-only explanation) |
| 9.1 paper-curl shader | ❌ skip — superseded | n/a | n/a |
| 9.3 below-fold About | ❌ skip per spec | n/a | n/a |
| 9.4 below-fold testimonials | ❌ skip per spec | n/a | n/a |

**Time budget:** ~75 minutes. Both items are Radix Dialog + Motion variants + content; no new architecture.

---

## 6. Risks & mitigations (LA-Hacks-mode)

| risk | mitigation |
|---|---|
| New deps (Radix Dialog) bloat the bundle | already installed (`@radix-ui/react-dialog`); no new dep |
| Modal blocks the demo flow if it auto-shows | both modals are user-triggered; never auto |
| Help modal content is wrong vocabulary for judges | uses the same three verbs as the masterprompt + tagline ("Direct → Refine → Cut") — same mental model surface as landing |
| CutOS modal blocks the Open-in-CutOS user gesture for popup-blocker | the explicit "Open in CutOS" button inside the modal is THE user gesture; popup-blocker friendly |
| Modal styling doesn't match codebase aesthetic | reuses existing primitives: `Button`, `bg-bg-elev-1`, `font-mono caption`, `rounded-xl` for the dialog surface |
| Modal a11y broken (focus trap, esc-to-close) | Radix Dialog ships these; we just style |
| Adding the Help-modal regresses the landing 3.0s entrance budget | modal is keyed off click, not mount — zero impact on entrance |

---

## 7. Implementation map

1. `components/ui/dialog.tsx` — small Radix Dialog wrapper with our visual style (already common to ship in component libraries; lives in the design system).
2. `components/node/cutos-handoff-modal.tsx` — new. Two-state machine (importing / imported). Triggers `api.cutosImport` on mount; opens `editUrl` on confirm.
3. `routes/final-delivery-route.tsx` — replace the inline `handleCutOS` with the modal trigger; pass `manifest` as prop.
4. `components/landing/how-it-works-modal.tsx` — new. Three-step static content. No state machine.
5. `routes/landing-route.tsx` — wire the Help button onClick to open the modal.
6. Verify typecheck + build. Mark Phase 9 complete in `FRONTEND_TODO.md`. Update README to add this doc.

---

## 8. Cross-references

- `SHADERS_AUDIO.md` §9 — Plan A vs Plan B framing for the burn shader (relevant to skipping 9.1).
- `FINAL_DELIVERY.md` — current `handleCutOS` implementation that this phase replaces.
- `MASTER_FRONTEND_DEV.md` — primitive bestiary (Button, Pill, etc. used in modals).
- `MOCK_BACKEND.md` — `api.cutosImport` contract.
- `FRONTEND_PHILOSOPHY.md` §6 — "the cinematic three verbs: Direct, Refine, Cut" — same vocabulary as the How-it-works modal.

---

## 9. The prize

When Phase 9 ships:

1. The Help icon on landing **does something useful** — judges with zero context get the mental model in 30 seconds.
2. "Open in CutOS" is no longer an unexplained tab-open — it reads as a deliberate handoff with context.
3. The TODO closes out — every priority is either ✅ shipped or ❌ explicitly-deferred-with-rationale.

That's the difference between "we ran out of time" and "we made the call." Document the call. Ship clean.
