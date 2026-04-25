# STITCH_TRAY — Phase 6 Lesson Reflection

> **Phase 6 surface:** the Stitch Tray. **The third winning moment.** Read this **before** touching `components/stitch/stitch-tray.tsx`.

The first two winning moments — page-crumple ✅ and canvas reveal ✅ — earn the room's attention. **The Cloudinary moment closes the deal.** As beats approve, the URL types itself out segment by segment in the tray. By the time all five beats are green, the URL says everything: `l_video:hook,fl_splice/l_video:rising,fl_splice/…/establishing.mp4`. The judges see post-production happen in real time, in plain text, no server queue.

This is the screen capture that ships in the demo video. The URL isn't decoration; it's the punchline.

---

## 1. The Cloudinary URL anatomy (the actual content)

Our `buildSpliceUrl` returns a URL of the form:

```
https://res.cloudinary.com/{cloud}/video/upload/
  [color-grade]/                                ← optional, applied to whole cut
  [audio-overlay]/                              ← optional
  [watermark]/                                  ← optional
  l_video:{id2}:fl_splice/                      ← second clip
  l_video:{id3}:fl_splice/                      ← third clip
  …
  l_video:{idN}:fl_splice/                      ← Nth clip
  {id1}.mp4                                     ← FIRST clip is the base
```

**What this means for the typewriter:** when a new beat approves, exactly one new `l_video:<id>,fl_splice/` segment is appended *between* the previous tail and the base id. The base id (`id1`) doesn't change once set; the prefix transforms don't change unless mood/audio config does.

So the diff between "URL with N approvals" and "URL with N+1 approvals" is **always one inserted `l_video:…,fl_splice/` segment**, in a known position in the URL string.

**Why this is convenient:** we don't have to do real string-diffing. We just identify the new tail and animate it in.

---

## 2. The reactive store-driven diff

The store exposes `selectApprovedClipPublicIds`. Each render, `buildSpliceUrl(approvedIds)` produces the current URL.

**The diff strategy:**

```ts
const approvedIds = useBeatGraphStore(selectApprovedClipPublicIds);
const prevIdsRef = useRef<string[]>([]);
const newSegmentIndex = useMemo(() => {
  // If a new approval just landed, find the segment index that changed.
  const prev = prevIdsRef.current;
  if (approvedIds.length > prev.length) return approvedIds.length - 1;
  return null;
}, [approvedIds]);

useEffect(() => {
  prevIdsRef.current = approvedIds;
}, [approvedIds]);
```

Then we render the URL as three pieces:

```
[head: prefix transforms][middle: all-but-newest l_video segments][tail: newest l_video segment, animated][base: id1.mp4]
```

The "tail" piece runs through `<TextSplitter delayStrategy="sequential" perCharStep={0.03}>` (~30ms/char per spec). It also gets a temporary ember class that fades out after 300ms — so the new segment glows briefly, then settles into the rest of the URL.

**Edge case:** when the FIRST beat approves, the URL flips from `null` to a base URL with no overlays. There's nothing to "type" — it's a fresh URL. We can either: (a) animate the entire URL in, or (b) flip in instantly and only typewrite from the second approval onward. **(b) is cleaner** — the first approval just causes the URL block to fade in.

**Edge case:** regenerate of an already-approved beat. The store flips its `approved=false`, `approvedIds.length` decreases. The URL shrinks. We don't typewrite the shrink — just transition the missing chunk out via opacity. (Less common path; minor visual.)

---

## 3. Building the segments cleanly

We don't want to roll our own URL diff parser. Instead, expose a helper:

```ts
// in cloudinary-transforms.ts (or stitch-tray helper)
function buildSpliceUrlSegments(orderedIds: string[]): {
  head: string;     // "https://.../upload/"
  middle: string;   // "l_video:a,fl_splice/l_video:b,fl_splice/" (could be "")
  tail: string;     // "l_video:c,fl_splice/" (the newly appended one)
  base: string;     // "id1.mp4"
} | null
```

That gives the typewriter exactly what it needs without re-implementing `buildSpliceUrl`'s logic. The whole URL is `head + middle + tail + base`; only `tail` runs through `<TextSplitter>`.

---

## 4. The thumbnail row — mood tints, ember glow, dim states

Per spec §6.2:
- Each thumbnail = `<img src={buildThumbnailUrl(publicId, { mood })}>`.
- Mood tint at the bottom edge of each thumb.
- Approved thumbs glow ember-dim; unapproved are dimmed 50%.

`buildThumbnailUrl` is already in `lib/cloudinary-transforms.ts`. It returns `https://.../upload/so_auto/{grade}/{id}.jpg` — `so_auto` picks the most representative frame. The grade is the same per-mood transform applied to the video.

**Mood tint:** a bottom-aligned colored gradient overlay. The mood color is derived from `colorGradeFor(mood)` — but that's a Cloudinary transform string, not a hex. We need a tiny `moodAccentColor(mood)` helper that maps each `BeatMood` to a brand-aligned color (e.g., `wide-establish` → cool blue, `intimate-hook` → warm peach, `kinetic-rising` → ember). Five entries.

**Approved:** add an `ember-pulse` ring or a static `glow-ember` shadow. *Static* is the better call here — too many pulsing things on screen during the approve sequence is noisy. Static glow says "approved"; pulse says "needs your attention."

**Unapproved:** `opacity: 0.5`, no glow. The "before" state.

---

## 5. Horizontal pointer-drag with inertial decay

Per spec §6.3, the thumbnail row supports horizontal drag with inertia. We don't reuse `useScrollVelocity` — that's wheel/touch-driven and writes to a 0..1 progress ref for canvas/scroll surfaces. Pointer drag reads/writes `el.scrollLeft` directly, a different operation. Each gets its own primitive.

The hook lives at `lib/use-pointer-drag.ts` and takes the container ref directly. All listener wiring + RAF inertia + cleanup is encapsulated:

```tsx
const thumbsRef = useRef<HTMLDivElement>(null);
usePointerDrag(thumbsRef);
```

The hook's `useEffect([ref, decay, minVelocity])` registers `pointerdown` / `pointermove` / `pointerup` / `pointercancel` once per mount. On release, it runs an exponential-decay RAF loop (default decay 0.92, min velocity 0.2 px/frame). Boundary clamps kill inertia rather than bounce.

**Why ref-in, not register-out:** an earlier draft returned `{ register }` from the hook, which the consumer called inside its own `useEffect`. The returned object was unstable across renders → effect re-fired every render → listeners thrashed. Taking the ref directly puts all wiring inside the hook's own stable effect. One-liner consumer, no footguns.

**Pointer button gate:** only `e.button === 0` (left mouse / primary touch) starts a drag. Trackpad two-finger horizontal scroll fires *wheel* events, not pointerdown — so we don't intercept it.

**Touch-action:** the consumer must set `style={{ touchAction: "pan-y" }}` on the container so vertical page scrolls starting from inside the row are preserved on touch devices. Without that, the `setPointerCapture` would hijack vertical drags and block native scroll.

**Cursor:** `cursor: grab`; `cursor: grabbing` while dragging via `data-dragging="true"` attribute the hook sets, paired with Tailwind's `data-[dragging=true]:cursor-grabbing` selector.

**A11y:** native scroll still works (mousewheel, trackpad, focus + arrow keys). The container also gets `tabIndex={0}` so keyboard users can focus and arrow-scroll. Drag is an enhancement, never the only path.

---

## 6. Render CTA — `ember-pulse` on `allReady`

Already half-shipped — the existing tray has a Render button disabled when not ready. Spec says: when all beats approve, the button gains `ember-pulse`.

```tsx
<Button
  className={cn("…", allReady && "ember-pulse")}
  disabled={!allReady}
>
  Render final cinematic
</Button>
```

Same pattern as Phase 4's Generate CTA. The `.ember-pulse` keyframe is already in `index.css`. Reduced-motion already disables it.

---

## 7. Tray entrance choreography

The tray is opened from a button in `canvas-route.tsx`. The existing `motion.aside` animates `x: "100%" → 0`. We can layer in:

- The thumbnail row staggers in (60ms between thumbs) when the tray opens.
- The URL block fades in after the thumbs are settled (~250ms delay).

But **not too much**. The tray is opened by user intent, not the system; it shouldn't feel like a separate cinematic. The current 36rem-wide drawer + spring is tasteful. Resist over-animating.

---

## 8. Handling the *first* approval (URL just appeared)

When the first beat approves, the URL block transitions from `null` ("Approve clips to see the URL build.") to a real URL.

We don't typewrite the entire first URL — that would feel like a re-intro for every subsequent approval too. Instead:
- First approval: opacity 0 → 1 fade on the whole URL block (DURATIONS.smooth).
- Second+ approvals: typewriter on the new segment only.

Achieve this by gating the typewriter on `approvedIds.length > 1 && newSegmentIndex !== null`.

---

## 9. Decision matrix

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 6.1 Live URL typewriter | ✅ yes | low | non-animated URL update |
| 6.1 New-segment ember afterglow | ✅ yes | low | drop the glow |
| 6.2 Mood-tinted thumbnails | ✅ yes | medium | color-only thumbs (no Cloudinary thumb URLs) |
| 6.2 Ember glow on approved | ✅ yes | low | border color change |
| 6.2 50% dim on unapproved | ✅ yes | low | full opacity |
| 6.3 Render CTA pulse | ✅ yes | low | (already shipped, just add class) |
| 6.3 Horizontal drag with inertia | ✅ yes | medium | native overflow-x-auto only |

**Time budget:** ~2 hours. Drag is the only meaningful complexity.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| URL diff misidentifies the changed segment after a regenerate-and-re-approve | track approvedIds length only; don't try to do per-id diffing |
| Cloudinary `so_auto` thumbnails 404 on the mock cloud | mock backend uses `demo` cloud; `dog`/`elephants` always resolve. Test in mock first. |
| Thumbnail row drag jitters on touchpad two-finger scroll | guard the pointerdown to button=0 (left mouse) only — don't intercept trackpad two-finger horizontal scroll |
| `scrollLeft` clamping at scroll boundaries during inertia kicks user back hard | clamp velocity to 0 when at boundary (`scrollLeft === 0` or `scrollLeft + clientWidth === scrollWidth`) |
| Mood tint conflicts with the underlying thumbnail's already-graded look | keep tint at low opacity (≤ 0.4); it's a *hint*, not a re-grade |
| Re-typing the same segment if React re-mounts the splitter | keep the splitter keyed by the segment text — if the text doesn't change, no new mount, no re-reveal |

---

## 11. Implementation map

1. `lib/cloudinary-transforms.ts` — add `buildSpliceUrlSegments(orderedIds)` returning `{ head, middle, tail, base }` for the typewriter.
2. `lib/cloudinary-transforms.ts` — add `moodAccentColor(mood)` returning a hex per `BeatMood`. (Or co-locate in stitch-tray.)
3. `components/stitch/stitch-tray.tsx` — full rewrite with the live-URL pattern, thumbnail row, drag, pulse. Keyed segment splitter. Track `prevApprovedIds.length`.
4. `index.css` — add `.url-segment-glow` short-lived class + keyframe (1s ember → fg-tertiary fade). Reduced-motion override.
5. Verify `tsc --noEmit` + `vite build`. Mark Phase 6 complete in `FRONTEND_TODO.md`. Update `README.md`.

---

## 12. Cross-references

- `BACKEND_ARCHITECTURE.md` — Cloudinary URL building rules (server-side authoritative).
- `lib/cloudinary-transforms.ts` — `buildSpliceUrl`, `buildThumbnailUrl`, `colorGradeFor`.
- `MOTION_LANGUAGE.md` §6.5 — stitch-tray motion specifics.
- `MASTER_FRONTEND_DEV.md` — Marquee/horizontal-scroll patterns from NextSense (different aesthetic, similar mechanics).
- `AGENT_FLOW.md` — same `<TextSplitter>` sequential mode, here applied to URL chars instead of conversation chars.

---

## 13. The prize

When this phase ships, the demo viewer sees:

1. They approve the first beat. The Stitch Tray's URL block fades in showing `https://.../upload/[grade]/abc123.mp4`.
2. They approve the second. A new `l_video:def456,fl_splice/` segment **types itself** between the prefix and the base, with a brief ember glow as it lands.
3. Five approvals later, the URL is a paragraph long. *They built post-production by typing into a chat.*
4. The Render button starts pulsing. They click it, the cinematic plays.

This is the third — and the most quietly devastating — of the three winning moments. The other two are visual fireworks; this one is **text doing something visual**, which judges remember because it's *unusual*. It says "this team understands Cloudinary."

Ship clean.
