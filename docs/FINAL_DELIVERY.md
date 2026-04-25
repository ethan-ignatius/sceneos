# FINAL_DELIVERY — Phase 7 Lesson Reflection

> **Phase 7 surface:** the Final Delivery route. The exhale after the three winning moments — page-crumple ✅, canvas reveal ✅, live URL build ✅. Read this **before** touching `routes/final-delivery-route.tsx`.

If Phases 0–6 are the build-up, Phase 7 is the bow at the end. The user has approved every beat and clicked Render in the Stitch Tray. We POST to `/api/stitch/url`, get back the final Cloudinary URL, fade to cinema-black, and reveal: a 70vw video player playing the finished cinematic, three clean action buttons, a tasteful film-grain overlay, and a quiet "Make another" return-to-landing in the corner.

This is the screen the user shares. The screen the screenshot for the Devpost goes on. **It must look like a delivered product, not a hackathon UI.**

---

## 1. The trigger flow (StitchTray → Final Delivery)

The Render CTA in StitchTray currently has no `onClick`. Phase 7 wires it:

```ts
const handleRender = async () => {
  if (!manifest) return;
  setRendering(true);
  try {
    const res = await api.stitchUrl({ manifest });
    setFinalCinematic({
      finalUrl: res.finalUrl,
      thumbnailUrl: res.thumbnailUrl,
      durationSeconds: res.durationSeconds,
    });
    navigate("/final");
  } catch (err) {
    setRenderError(err instanceof ApiError ? err.message : "Render failed");
    setRendering(false);
  }
};
```

`api.stitchUrl` is already in `lib/api.ts`. The mock backend's `routes/stitch.ts` returns a real `fl_splice` URL built from approved `clipPublicId`s + a derived `.jpg` thumbnail. This works in mock mode against the `demo` Cloudinary cloud — no live Higgsfield key needed.

**New store action `setFinalCinematic`:** mirrors the existing `regenerateScene` pattern. Patches `manifest.finalCloudinaryUrl`, `thumbnailUrl`, `durationSeconds` on the existing manifest. The Manifest type already has these fields (see `types/manifest.ts`).

**Why navigate even when the URL is the same as the live preview?** Because the *route* is the cinematic frame. The Stitch Tray was a working surface; `/final` is the delivered product. Different mood, different choreography, different intent.

---

## 2. The fade-to-cinema (250ms black wipe)

Spec: 250ms black wipe between Stitch Tray and the cinematic.

Two ways to do route transitions in this codebase:

| Approach | When |
|---|---|
| GSAP timeline on a route-level component (Phase 2 page-crumple) | Showpiece transitions; full choreography |
| Motion `AnimatePresence` on the route element with shared key | Cleaner for simple cross-fades |

For a 250ms black wipe, neither shines. The simplest pattern is a **black overlay div** that's fixed position, full-viewport, fades in for 125ms before navigation, then the new route mounts and the overlay fades out for 125ms. Total ~250ms.

But Motion handles this elegantly without the manual orchestration:

```tsx
// In FinalDeliveryRoute, the entrance is:
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.25, ease: EASE.outQuart }}
>
  …content
</motion.div>
```

Combined with a **black background on the route container itself** + a brief `useEffect`-mounted body class that holds the page black for the first 125ms after navigate. The result reads as a wipe.

Even simpler — and what we'll ship: render the route over a `bg-bg-base` (deep black-warm). Have the *content* fade in over 250ms with a slight y-translate. The user's brain reads the transition as "the lights came up on a new room." No black-overlay div needed.

---

## 3. The headline ("Your cinematic.")

```tsx
<motion.h1
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn, delay: 0.15 }}
  className="text-display-lg italic text-fg-primary"
>
  Your cinematic.
</motion.h1>
```

`text-display-lg` is the tier we used on landing — same display family for symmetry. Italic Saol-style serif. The slide-up + fade-in is `EASE.filmIn` (`[0.16, 1, 0.3, 1]`) over `DURATIONS.cinematic` (0.72s). Subtle delay (0.15s) so the headline lands *after* the void resolves.

**Trailing punctuation matters.** "Your cinematic." with a period reads as a *statement of fact*. "Your cinematic" without the period reads like a label. We're delivering, not labelling.

---

## 4. The 70vw video player

We reuse `<VideoPlayer>` from Phase 5. Inline width via Tailwind:

```tsx
<div className="w-[70vw] max-w-[1200px]">
  <VideoPlayer
    src={manifest.finalCloudinaryUrl!}
    suggestedDurationSeconds={manifest.durationSeconds}
    autoPlay
    muted={false}
  />
</div>
```

**Two notable changes from the in-drawer player:**
- `muted={false}` — the in-drawer preview was muted (autoplay-policy survival). Here, the user got to this route via an explicit click, so the user-gesture is in scope; sound can play. (Browsers may still block — fall back gracefully via the existing Play overlay.)
- `max-w-[1200px]` — at very wide viewports, 70vw becomes uncomfortable. Cap so the player doesn't dominate.

The shadow + ring from VideoPlayer's existing styling already make it read as a "frame." No further adornment needed.

---

## 5. Three actions: Download / Share / CutOS

Spec: Download MP4, Copy share link, Open in CutOS.

**Download MP4** — `<a download href={finalUrl}>`. The HTML `download` attribute hints to the browser to save instead of navigate. Cloudinary serves the MP4 with appropriate `Content-Disposition` headers in most cases. Belt-and-braces: append `?fl_attachment=true` to the Cloudinary URL or use the `fl_attachment` transform (already-graded URL with this transform tells Cloudinary to send `Content-Disposition: attachment`).

```tsx
<a href={`${finalUrl.replace("/upload/", "/upload/fl_attachment/")}`} download>Download MP4</a>
```

**Copy share link** — `navigator.clipboard.writeText(finalUrl)` + a toast. Same pattern as the Stitch Tray's URL copy.

**Open in CutOS** — POST to `/api/cutos/import` with the manifest; the mock returns `{ projectId, editUrl }`. We `window.open(editUrl, "_blank", "noopener")`. The CutOS handoff has been the second-tier moat the whole time — if CutOS is alive, this opens an editor with the project pre-loaded.

```tsx
const openInCutOS = async () => {
  const res = await api.cutosImport({ manifest });
  window.open(res.editUrl, "_blank", "noopener,noreferrer");
};
```

**Visual treatment:** three buttons in a row. Download is primary ember. Share is ghost. CutOS is also ghost with `btn--edge-underline` hover. The primary should be Download because that's the most universal action; the user's video file is the artifact they care about.

---

## 6. Film grain overlay

The `.film-grain` class already exists in `index.css` (used on the landing). It's a fixed full-viewport overlay with `mix-blend-mode: overlay` and a stepped grain animation. Just add the class to the route's `<main>`:

```tsx
<main className="film-grain relative min-h-screen bg-bg-base">…</main>
```

The grain reads as cinema. It's the same overlay used on landing — visual rhyme between the bookends of the experience.

---

## 7. "Make another" return-to-landing

Bottom-right corner. Resets the manifest store + navigates to `/`.

```tsx
const handleMakeAnother = () => {
  reset();  // useBeatGraphStore action — sets manifest: null, activeBeatId: null
  setMasterPrompt("");  // usePromptStore action
  navigate("/");
};
```

**Why reset the store?** The user is starting over. Persisted state (zustand persist middleware on `beat-graph-store`) carries the *previous* manifest into the new session. If we don't reset, the landing's video-type pill defaults from the persisted prompt-store, the user submits a new prompt, and they're handed a manifest where the *new* prompt is paired with the *old* beats.

**Critical:** the reset *must* run before navigate. The landing route's prompt store starts populated from the previous session.

**Style:** a small ghost button with the `btn--edge-underline` hover. Mono caps. `arrow-link` style would also fit (existing primitive). Subtle — the user shouldn't accidentally click it.

---

## 8. Subtle parallax (7.2 — stretch)

Spec: as the user scrolls past the player, the player translates 0 → -20px Y.

**Approach:** the route layout has the player at the top of the viewport (after a small headline gap), then below-the-fold has metadata (master prompt + per-beat list) so there's something *to* scroll past. The player's transform is driven by `useScrollVelocity` registered on `window`.

```tsx
const { progressRef, registerElement } = useScrollVelocity({ clamp: [0, 1] });
const playerRef = useRef<HTMLDivElement>(null);

useEffect(() => registerElement(window), [registerElement]);

useEffect(() => {
  let raf = 0;
  const tick = () => {
    if (playerRef.current) {
      const offset = progressRef.current * -20;
      playerRef.current.style.transform = `translateY(${offset}px)`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, []);
```

**Why a manual RAF instead of CSS `transform: translateY(calc(var(--scroll-progress) * -20px))`?** Because `progressRef` is a *ref* updated each frame inside the hook's RAF loop. Reading it in a useEffect → CSS variable each frame is also fine, but the direct DOM mutation skips one indirection. Either pattern works at this scale.

**Reduced-motion:** if the user has the media query, skip the transform entirely. The `useScrollVelocity` hook already drains on inactivity, so progress stays 0 anyway — but to be explicit, gate the parallax effect on a `useReducedMotion()` check.

**Boundaries:** the spec says "as the user scrolls past the player." Once the player is well below the viewport, more scroll shouldn't push it further off-screen via the transform — that would conflict with the natural scroll. Clamp the progress to `[0, 1]`, where 1 is reached when the player's bottom edge passes the viewport top.

---

## 9. Decision matrix

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 7.1 `/final` route + fade-to-cinema | ✅ yes | low | direct navigate, no fade |
| 7.1 "Your cinematic." headline | ✅ yes | low | plain h1 |
| 7.1 70vw player + autoplay (unmuted) | ✅ yes | low | muted with Play overlay |
| 7.1 Download MP4 / Copy / CutOS | ✅ yes | medium | Download only |
| 7.1 Film grain overlay | ✅ yes | low | bg only |
| 7.1 "Make another" + reset | ✅ yes | low | refresh the page |
| 7.1 Wire Render CTA in StitchTray | ✅ yes | low | (no path to /final) |
| 7.1 setFinalCinematic store action | ✅ yes | low | (URL not persisted) |
| 7.2 Subtle parallax | ✅ yes | medium | static placement |

**Time budget:** ~2 hours. Wiring + below-fold metadata + parallax is the bulk.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| `api.stitchUrl` returns 400 (no approved clips with publicIds) | check `approvedIds.length > 0` before navigating; surface inline error |
| Final URL fails to load in player (Cloudinary cold cache, slow CDN) | the existing player's Play overlay handles autoplay-block; for genuine 404, show a fallback "Couldn't load — Retry" |
| `download` attribute is honoured inconsistently across browsers + Cloudinary | use `fl_attachment` transform as belt-and-braces; force the download regardless of browser policy |
| `window.open` blocked by popup blocker | only fires inside user gesture (button click) so should be allowed; if blocked, fall back to copying the editUrl |
| Reset → navigate → landing pre-fills with old prompt | reset BOTH stores (beat-graph + prompt) before navigate |
| Parallax + native scroll fight | clamp progress, RAF-batch transforms, no `position: fixed` on the player |
| User scrolls before player has metadata loaded | parallax still works (transform-only); player just shows blank frame until ready |
| Browser back-button to `/canvas` from `/final` | unsupported — manifest already has finalCloudinaryUrl set, but the canvas route doesn't handle this state. Acceptable: leave back-button as-is; Make Another is the explicit "go back" path |

---

## 11. Implementation map

1. `stores/beat-graph-store.ts` — add `setFinalCinematic({ finalUrl, thumbnailUrl, durationSeconds })` action that patches the manifest.
2. `components/stitch/stitch-tray.tsx` — wire the Render CTA `onClick` to call `api.stitchUrl` + `setFinalCinematic` + `navigate("/final")`. Add inline error + loading state.
3. `routes/final-delivery-route.tsx` — new. Headline, 70vw VideoPlayer, three action buttons, parallax effect, "Make another."
4. `App.tsx` — register the `/final` route; redirect to `/` if `manifest.finalCloudinaryUrl` is missing.
5. `stores/prompt-store.ts` — verify a `reset` is exported (or add one) so "Make another" can clear it. (Likely already there.)
6. Verify `tsc --noEmit` + `vite build`. Confirm bundle increase is reasonable.

---

## 12. Cross-references

- `BACKEND_ARCHITECTURE.md` — `/api/stitch/url` and `/api/cutos/import` contracts.
- `STITCH_TRAY.md` §13 — describes the "Render button" prize moment that this phase delivers.
- `VIDEO_PLAYER.md` — reused; same component, different surface, sound on.
- `MOTION_LANGUAGE.md` §6.6 — final-delivery motion: 0.25s fade-to-cinema; 0.72s `filmIn` headline; subtle parallax.
- `FRONTEND_PHILOSOPHY.md` §6 — "the resolution after the three winning moments" framing.

---

## 13. The prize

When this phase ships, the demo viewer sees:

1. They click Render. The Stitch Tray's CTA is briefly disabled with a spinner.
2. The screen fades to bg-base. A beat later, "Your cinematic." slides up in italic display.
3. A 70vw player at the centre of the screen plays the stitched-and-graded cinematic — autoplay, sound on, real Cloudinary URL.
4. Three buttons sit beneath it: ember Download MP4, ghost Copy share link, ghost Open in CutOS.
5. Below the fold (subtle): the master prompt that started it all + a five-row beat manifest in mono. As they scroll, the player drifts up gently — parallax says "the work is documented, but the artifact is the cinematic."
6. Bottom-right: "Make another." Two words. They click it; the void returns; they start fresh.

This is the *delivery*. The product. The cinematic the user came to make. Every prior phase exists to make this final screen feel earned.

Ship clean.
