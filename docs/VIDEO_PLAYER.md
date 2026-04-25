# VIDEO_PLAYER — Phase 5 Lesson Reflection

> **Phase 5 surface:** the in-drawer clip preview after generation succeeds, plus the Approve / Regenerate split CTA. Read this **before** touching `components/ui/video-player.tsx` or `node-detail-drawer.tsx`.

Phase 4 ended with the user clicking Generate and watching the three-stepper march. Phase 5 is what they see when generation succeeds: a custom-skinned video player playing back the mood-graded clip, with a clean Approve / Regenerate decision right below it. Then they Approve, the beat goes ember-saturated on the canvas, and the stitch tray (Phase 6) gets its next URL segment.

This is one of the surfaces where awwwards-tier studios spend disproportionate care. A `<video controls>` reads "demo." A custom player reads "delivered product." The Unseen Studio reference (`unseen.co`) shows a representative pattern: cursor itself becomes the play/pause indicator with a progress ring around it when over a video. We're not copying that wholesale — Phase 5 keeps a fixed-position scrubber, Unseen-style cursor video state can return in a polish pass — but the principle (zero browser chrome, intentional iconography, ember-tinted progress) is the same.

---

## 1. The HTMLVideoElement API (just enough)

A `<video>` element exposes everything a custom player needs. The four points that matter:

| API | what it does | when |
|---|---|---|
| `video.play()` / `video.pause()` | toggle playback. Returns a Promise on play (autoplay block) | on click |
| `video.currentTime` (read/write) | seconds into the clip; writing seeks | on scrubber drag/click |
| `video.duration` | length in seconds; NaN until metadata loads | use `loadedmetadata` event |
| `timeupdate` event | fires ~4×/sec during play; cheap | drives the progress UI |

**Custom player skeleton:**

```tsx
const ref = useRef<HTMLVideoElement>(null);
const [playing, setPlaying] = useState(false);
const [progress, setProgress] = useState(0); // 0..1

useEffect(() => {
  const v = ref.current; if (!v) return;
  const onTimeUpdate = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
  const onPlay = () => setPlaying(true);
  const onPause = () => setPlaying(false);
  v.addEventListener("timeupdate", onTimeUpdate);
  v.addEventListener("play", onPlay);
  v.addEventListener("pause", onPause);
  return () => {
    v.removeEventListener("timeupdate", onTimeUpdate);
    v.removeEventListener("play", onPlay);
    v.removeEventListener("pause", onPause);
  };
}, []);
```

**Three subtle gotchas:**

1. **Autoplay is policy-blocked without a user gesture.** The form submit on landing was the gesture; the bridge route's audio rode that. Inside the drawer, the user has *already* clicked Generate — that gesture is in scope. Autoplay should still work. If it doesn't, we fall back to showing the big Play overlay until first click.
2. **`video.duration` is `NaN` before `loadedmetadata` fires.** Always guard `currentTime / duration` with a check.
3. **Removing event listeners is non-negotiable.** A leaked `timeupdate` listener will fire 4 times/sec on a stale closure, repeatedly setting state on an unmounted component — this generates `Can't perform a React state update on an unmounted component` warnings and a memory leak.

---

## 2. The custom progress bar (click to seek)

Visually: a thin track at the bottom of the video, ember-tinted fill that grows with `progress`, and click-to-seek anywhere along it. No drag for v1 — simpler, fewer edge cases, judges won't notice.

```tsx
const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
  const v = ref.current; if (!v || !v.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  v.currentTime = Math.max(0, Math.min(v.duration, ratio * v.duration));
};
```

Two visual choices that matter:

- **Track height: 2px idle, 4px on hover.** Motion-presets has `DURATIONS.quick` (0.22s) — feels like the bar wakes up under the cursor.
- **Fill bleed:** the fill should bleed slightly past the cursor when scrubbing — gives the user a tactile "I'm grabbing the timeline" feeling. For click-only v1: skip this; just animate width to match progress.

---

## 3. The big Play overlay (entry + after pause)

When the video is paused (idle or just paused mid-play), a centered, large Play icon should be visible. Click it → play. While playing, the overlay fades out so the clip isn't obscured.

Pattern (Motion AnimatePresence):

```tsx
<AnimatePresence>
  {!playing ? (
    <motion.button
      key="play-overlay"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
      onClick={() => ref.current?.play()}
      className="absolute inset-0 grid place-items-center"
      aria-label="Play"
    >
      <Play size={96} className="text-brand-ember drop-shadow-[0_0_24px_rgba(240,168,104,0.6)]" />
    </motion.button>
  ) : null}
</AnimatePresence>
```

The icon size (96px) is intentional — much larger than typical play-button size, because at this surface it's a **first-impression** element, not a chrome control.

---

## 4. Mood-graded URL playback

The Cloudinary URL builder already exists (`lib/cloudinary-transforms.ts`):

```ts
buildClipUrl(publicId, { mood: beat.archetype.mood }) // → '.../video/upload/e_brightness:-15.../publicid.mp4'
```

**What we pass to `<video src={…}>`:** `buildClipUrl(scene.clipPublicId, { mood: beat.archetype.mood })`. The grade is applied by Cloudinary at the CDN edge — no client-side processing. The same `clipPublicId` can render six different moods just by tweaking the transform; no re-render, no extra request beyond the one we make per beat.

**Fallback:** if `clipPublicId` is missing (mock backend issue, or the user's session loaded a stale manifest), fall back to `scene.clipUrl` directly — the mock includes both for resilience.

**Auto-pause on drawer close:** in the player's effect cleanup, call `ref.current?.pause()`. This handles two cases at once: drawer closes (component unmounts) and the user switches to a different beat (key remount triggers cleanup).

---

## 5. The Approve / Regenerate split CTA

Spec: Approve full-width primary ember; Regenerate ¼-width ghost on the right. Both spring on press.

```tsx
<div className="flex gap-2">
  <Button variant="primary" size="lg" className="flex-1" onClick={onApprove}>
    Approve scene
  </Button>
  <Button variant="ghost" size="lg" className="basis-1/4" onClick={onRegenerate}>
    Regenerate
  </Button>
</div>
```

**Press feedback:** the existing `Button` already has `active:scale-[0.97]`. That covers the spring on press without adding Motion.

**Approve flow:**
1. Mark the scene approved via `approveScene(beatId, sceneId)` (already in store).
2. The store's reducer sets the beat status to `approved` if every scene is approved.
3. Close the drawer (`setActiveBeat(null)`) so the user can see the canvas glow.
4. The node mesh's existing approved state (Phase 3) takes over: ember-saturated, scale 1.12, no breath.

**Regenerate flow:**
1. Reset scene fields: `clipPublicId`, `clipUrl`, `jobId`, `refinedPrompt` (keep conversation; the user shouldn't lose the questionnaire).
2. Flip beat status back to `ready-to-generate` so the existing Generate flow re-fires from where it left off.
3. The drawer body swaps from `<VideoPlayer>` back to `<AgentBubbleStream>` (with the existing conversation visible above) → the existing footer's Generate CTA pulses.

---

## 6. The Unseen Studio influence — what we take, what we don't

The reference site's video pattern (cursor becomes play/pause indicator with a progress ring around it when over video) is **delicious** but expensive in v1:

| Pattern | Take? | Reason |
|---|---|---|
| Big-Play icon overlay (96px+) | ✅ yes | Same goal: zero browser chrome |
| Custom progress bar with ember fill | ✅ yes | Spec |
| Click-to-seek | ✅ yes | Tablestakes for a custom player |
| Cursor-as-progress-ring | 🟠 polish pass | Needs an extension to `CursorSpotlight` to know it's over a video; defer |
| `data-cursor="hide"` to disable spotlight inside player | ✅ yes | Trivial; spotlight should not glow over the clip frame |
| `btn__inner` underline-from-edges hover | ✅ yes for ghost button | Subtle, awwwards-coded; works with our existing `Button` shell via a className opt-in |
| `data-audio-enter="audio.hover"` | 🟠 polish | Phase 0 audio is on landing only; defer to Phase 8 polish |

The "underline-from-edges" hover (where two short underlines slide in from left and right edges to meet in the middle on hover) is a small detail that adds a lot. We add it as an opt-in class `btn--edge-underline` in `index.css`, then use it on the Regenerate ghost button.

---

## 7. Auto-pause + drawer-key-change interaction

There's a subtle interaction: `<NodeDetailDrawer key={activeBeatId}>` means switching beats remounts the drawer. The video player inside also remounts. This is correct: the previous beat's video pauses (effect cleanup), the new beat's video mounts fresh.

If the same beat is selected (active, then deselected, then re-selected): it remounts. The video starts from `currentTime = 0`. If we wanted to remember playback position, we'd persist `currentTime` to the scene state. Out of scope for v1; the typical demo path is generate → preview → approve → next beat, no back-and-forth.

---

## 8. Reduced-motion + a11y

- The big Play overlay's enter/exit animation should fall back to instant under `prefers-reduced-motion`. Motion respects the media query when we use the `useReducedMotion()` hook *or* we just guard the variants. Simplest: omit the `initial` / `exit` when reduced-motion matches.
- `<video>` natively supports keyboard. Spacebar should toggle play/pause when focused. Verify default browser behaviour holds (don't use `controls={false}` — use *only* CSS to hide native chrome).
- Actually: we **do** need `controls={false}` to hide the native chrome, but spacebar toggle is a control behaviour that disappears with it. Re-implement explicitly: `onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); togglePlay(); } }}`.
- The Play overlay button needs `aria-label="Play"` / `aria-label="Pause"`. The progress slider can use `role="slider"` + `aria-valuenow={progress}` for screen-reader scrubbing.

---

## 9. Decision matrix

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 5.1 Custom video player shell | ✅ yes | low | native `<video controls>` |
| 5.1 Big Play overlay | ✅ yes | low | static play icon |
| 5.1 Ember progress + click-to-seek | ✅ yes | low | static thin line |
| 5.1 Mono time display | ✅ yes | low | drop, keep just bar |
| 5.1 Auto-pause on close | ✅ yes | low | leave it playing |
| 5.1 Mood-graded URL | ✅ yes | low | ungraded `clipUrl` |
| 5.2 Approve/Regenerate split | ✅ yes | low | single Approve button |
| 5.2 `btn--edge-underline` hover | ✅ yes | very low | plain hover |
| Cursor-as-video-indicator | ❌ defer | medium | (skip) |

**Time budget:** ~1.5 hours total. None of this is high-risk; the player is the bulk.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| Autoplay blocked → video stays on first frame | the user's Generate click is the gesture; if autoplay still fails, the Play overlay handles it |
| Cloudinary URL returns 404 | the mock backend uses Cloudinary's `demo` cloud (always resolves); if a `clipPublicId` is missing, fall back to `scene.clipUrl` |
| `video.duration` is NaN at first paint → division by zero | guard `progress = duration ? currentTime / duration : 0` |
| Spacebar in input bubbles up and toggles video | scope key handler to the player container only; don't put it on `window` |
| Listener leak after unmount | every `addEventListener` paired with `removeEventListener` in cleanup |
| Drawer remount loses video position | acceptable; document |
| Regenerate keeps the old clip showing for ~1s | flip status BEFORE clearing `clipUrl` so the swap to `<GenerationPanel>` happens cleanly |

---

## 11. Implementation map

1. `index.css` — add `.btn--edge-underline` keyframe + selectors. Reduced-motion override.
2. `components/ui/video-player.tsx` — new. Wraps `<video>`, manages progress + play state, click-to-seek, big Play overlay, mono time, keyboard.
3. `components/node/clip-preview.tsx` — new. Composes `<VideoPlayer>` with the Approve/Regenerate split CTA. Calls `approveScene` and the regenerate flow.
4. `stores/beat-graph-store.ts` — add a `regenerateScene(beatId, sceneId)` action that clears clip fields and flips beat status.
5. `components/node/node-detail-drawer.tsx` — when status is `preview`/`approved`, render `<ClipPreview>` instead of the placeholder.
6. Verify typecheck + build. Bundle stays in budget.

---

## 12. Cross-references

- `MOTION_LANGUAGE.md` §6.4 — clip-preview motion specifics.
- `AGENT_FLOW.md` — Phase 4 lesson; the state machine (`preview` → `approved`) is what triggers the player.
- `CANVAS_3D.md` §3 — node mesh's `approved` state takes over after `approveScene` lands.
- `MASTER_FRONTEND_DEV.md` §10 — `Button` variants reference.
- `lib/cloudinary-transforms.ts` — `buildClipUrl({ mood })` for the player `src`.

---

## 13. The prize

When this phase ships, the demo viewer sees:

1. The generation panel finishes its three steppers.
2. The drawer body fades to the clip preview: a 16:9 player with a soft drop-shadow, the mood-graded clip auto-playing.
3. A clean ember progress bar grows along the bottom; a mono `0:08 / 0:12` ticks in the corner.
4. They click Approve. The drawer slides out. The canvas behind shifts: the node they were on goes ember-saturated, scale 1.12, steady — *they can see they made progress.*

That's the second-most-important UX moment in Phase 4–5: **proof that the system delivered.** Ship clean.
