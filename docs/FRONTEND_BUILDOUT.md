# SceneOS — Frontend Buildout Guide

> For Alex. Last updated: 2026-04-25.
> This is the operational playbook for turning the scaffolded frontend into
> the demo-ready product, in priority order, while Vishnu and Ethan handle
> the backend.

---

## 0. Ground rules

- Read `docs/FRONTEND_PHILOSOPHY.md` once. It's the design bible.
- The mock backend is your dev partner. Always run it. Never mock the frontend itself. (See `docs/MOCK_BACKEND.md`.)
- Two terminals, always:
  ```bash
  # terminal 1
  cd backend && npm run dev:mock
  # terminal 2
  cd frontend && npm run dev
  ```
- Quality bar is **godly.website / awwwards / 21st.dev**. If a section looks like a Tailwind UI starter, redesign before merging.
- Pizza-ordering simplicity: every interaction must earn its place. Cut steps before cutting polish.
- **One commit = one screen** (or one major polish pass). Easier to roll back, easier for the team to review.
- **Conventional commits**: `feat(scope): subject`, `fix(scope): subject`, `style(scope): subject`. No Claude attribution (already configured).

---

## 1. Build order (priority-ranked)

The order below is sequenced by demo impact. If you only ship items 1–4, we still win on UI/UX.

| # | Surface | Estimated effort | Demo-criticality |
|---|---|---|---|
| 1 | Landing — final visuals + interaction polish | 2h | 🔴 highest |
| 2 | Page-crumple transition (GSAP) | 3h | 🔴 highest |
| 3 | Canvas — R3F polish (bloom, vignette, camera) | 2h | 🔴 highest |
| 4 | Node detail drawer + agent bubble polish | 2h | 🟠 high |
| 5 | Stitch tray — live URL build animation | 1h | 🟠 high |
| 6 | Final delivery screen | 1h | 🟡 medium |
| 7 | Loading / generation states inside drawer | 1h | 🟡 medium |
| 8 | Audio cues (subtle) | 0.5h | 🟢 nice-to-have |
| 9 | Mute toggle, help modal | 0.5h | 🟢 nice-to-have |
| 10 | CutOS handoff modal | 0.5h | 🟢 nice-to-have, only if backend lands |

**If the wall hits 6h before the deadline,** stop at item 5. Items 6–10 are graceful drops.

---

## 2. Surface-by-surface guide

### 2.1 Landing (`src/routes/landing-route.tsx`)

**Goal:** the cleanest, most cinematic landing page judges have seen at the hackathon.

**What's there:** full layout, three video-type pills, ember-on-focus underline, mute + help footer.

**What you need to polish:**
- **Type rhythm.** The `text-display-lg italic` headline needs PP Editorial New (or Italiana fallback) at exactly the right size. Test at 1440×900 AND 1920×1080 — clamp() values are conservative; you may want to push the upper bound.
- **Background.** Right now there's a faint radial-glow ember + film-grain overlay. Layer in a *very* slow noise-shift animation behind the headline (like a slow living grain). Use the `.film-grain` class as a starting point; consider a second layer with a different `baseFrequency`.
- **Underline animation.** Currently CSS `transition`. Replace with a `<motion.span>` and use `EASE.outQuart` from `@/lib/motion-presets`. Should draw from left in 280ms.
- **Pills.** Currently functional but generic. Reference 21st.dev for an opinionated `pill` component — perhaps with a tiny indicator dot, or a sliding ember underline that morphs between pills with `layoutId`.
- **Submit affordance.** A `Begin` button is fine. Consider replacing with a `↵` icon inline in the input — feels more "one-line".
- **Hidden Easter egg.** A long-press on the version number in the bottom-left could open the demo project preset (`DEMO_PROMPT` from `@/lib/demo-project`). Useful safety net; tasteful for judges who poke.

**Constraints:**
- Total bundle of this route stays ≤200KB transferred. Lazy-load anything heavy.
- No images. Type, color, motion only.
- `prefers-reduced-motion` → all animations turn into instant CSS displays.

---

### 2.2 Page-crumple transition (`src/routes/crumple-bridge-route.tsx`)

**Goal:** the showpiece. The 3-second moment that lives in the demo video forever.

**What's there:** a GSAP timeline that fakes the crumple via scale + rotate + blur + opacity, with an ember flash overlay.

**What you should build (Plan A):**
A GLSL shader pass that does an actual paper-curl. The cheapest credible approach:
1. Render the landing screen to a texture (use `html-to-image` + `canvas` + `Plane` + `useTexture`).
2. Apply a curl shader (sample shader pseudocode below).
3. Animate the curl angle + ember-glow uniform with GSAP.
4. On complete, swap to canvas route.

```glsl
// Fragment (sketch — refine to taste)
vec2 curl(vec2 uv, float t) {
  float radius = mix(2.0, 0.05, t);
  float angle  = uv.x * radius;
  // ... shift uv along a cylinder, alpha-fade past the curl edge
}
```

**Plan B (use this if Plan A slips):** stick with the current GSAP scale/rotate/blur dissolve, but layer a second canvas behind it that fades up into the dunes-vista of the canvas page. Indistinguishable to judges if the timing is right.

**Constraints:**
- 1.6s duration. No longer; it kills demo pacing.
- Audio cue at 0.4s in: short analog-fire pop. -32 dB.
- `prefers-reduced-motion` → 200ms fade.

---

### 2.3 Canvas (`src/components/canvas/beat-map-3d.tsx`)

**Goal:** the spatial map of beat nodes. Forza-style traversal.

**What's there:** R3F canvas with 5 sphere nodes on a curved path, Bloom + Vignette post, Stars + Environment.

**What to polish:**
- **Camera rig.** Right now `OrbitControls` is on but locked. Replace with a custom rig that auto-glides the camera between nodes when the user clicks. Use `gsap` for camera position tweens with the `EASE.inOutQuart` easing. Source of inspiration: Lawted on Awwwards.
- **Node geometry.** Spheres are fine for v0. Consider replacing with a `RoundedBox` (drei) at 0.4 scale — slightly more architectural, less "ball." Or a custom shader sphere with a subtle internal noise.
- **Path between nodes.** Currently the nodes float independently. Add a faint dotted bezier curve connecting them — sample 32 points along the curve, place tiny `<points>` with `pointsMaterial`. The path teaches the order of beats.
- **Ambient particles.** Add a `<Sparkles>` (drei) component at low density. Adds depth without distraction.
- **Sound.** A faint film-projector whir loops while the canvas is active. Tasteful. Mute toggle in the corner respects the same state from Landing.
- **Performance.** Watch FPS in the React Three Fiber devtools. If it dips below 50fps:
  1. Lower `dpr` to `[1, 1.5]`.
  2. Drop postprocessing (`<EffectComposer>` block).
  3. Reduce `Stars` count to 800.

**Animation specifics:**
- Idle node breath: `scale = 1 + sin(t * 0.9) * 0.02`. Already in `node-mesh.tsx`.
- Hover node glow: emissiveIntensity 0.08 → 0.25. Already there.
- Active node lift: position.z += 0.4 over 360ms. Currently missing — add it.

---

### 2.4 Node detail drawer (`src/components/node/node-detail-drawer.tsx`)

**Goal:** where directorial questions happen. Should never feel like a form.

**What's there:** drawer slides in from right, agent bubble stream, "Generate scene" CTA.

**What to polish:**
- **Bubble reveal.** Currently bubbles spring in. Add a per-character typewriter reveal at ~25ms/char, capped at 1.6s total. Use Motion's text-character animation pattern.
- **Status pill.** "More questions recommended" / "Sufficient information collected." Currently a plain rounded box. Make it a glowing pill that pulses softly when sufficient, like the ember nodes on the canvas.
- **Drawer width.** 36rem on desktop is right. On 1920px screens consider 40rem.
- **Close handling.** Currently the X button. Add ESC key + click-outside (with `useEventListener`).
- **"Generate scene" CTA.** Currently disabled until sufficient. Add a subtle ember pulse on the CTA when sufficient is just reached, drawing the eye.

**Wiring to mock backend:**
```ts
// inside the form submit in agent-bubble-stream.tsx
import { api } from "@/lib/api";
import { useBeatGraphStore } from "@/stores/beat-graph-store";

const onSend = async (userMessage: string) => {
  const manifest = useBeatGraphStore.getState().manifest!;
  const beatId = useBeatGraphStore.getState().activeBeatId!;
  appendAgentTurn(beatId, scene.sceneId, { role: "user", content: userMessage, timestamp: nowISO() });
  const res = await api.agent({ manifest, beatId, userMessage });
  if (res.kind === "question") {
    appendAgentTurn(beatId, scene.sceneId, { role: "agent", content: res.question, timestamp: nowISO() });
  } else {
    updateScene(beatId, scene.sceneId, { refinedPrompt: res.refinedPrompt, durationSeconds: res.suggestedDuration });
    updateBeat(beatId, { status: "ready-to-generate" });
  }
};
```

---

### 2.5 Generation in progress

**What's needed:** when a beat moves into `generating` status, the drawer transitions from agent bubbles to a centered loading panel.

**Pattern:**
```tsx
{beat.status === "generating" ? (
  <GenerationPanel scene={scene} />
) : beat.status === "preview" ? (
  <ScenePreview scene={scene} mood={beat.archetype.mood} />
) : (
  <AgentBubbleStream beat={beat} />
)}
```

`GenerationPanel`:
- 16:9 placeholder with `animate-blur-pulse` (already in `index.css`).
- A noisy gradient that resolves into a colored frame (use a CSS `mask` + animated background gradient, or a tiny `<canvas>` with Perlin noise).
- Three steppers: "1. Storyboard generated" · "2. Clip rendering" · "3. Uploading to Cloudinary." Active one has an ember dot.
- Live timer ("0:32 / ~2:00"). The mock backend returns `pollAfterMs: 800`, so the user sees the steppers advance every ~1.6s — that's the rhythm.

**Wiring:**
```ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

const generate = useMutation({
  mutationFn: (req) => api.generate(req),
  onSuccess: (res) => {
    updateScene(beatId, sceneId, { jobId: res.jobId });
    updateBeat(beatId, { status: "generating" });
  },
});

const status = useQuery({
  queryKey: ["status", scene.jobId],
  queryFn: () => api.status(scene.jobId!),
  enabled: Boolean(scene.jobId) && beat.status === "generating",
  refetchInterval: (q) => (q.state.data?.pollAfterMs ?? 5000),
});

useEffect(() => {
  if (status.data?.status === "succeeded") {
    updateScene(beatId, sceneId, {
      clipUrl: status.data.clipUrl,
      clipPublicId: status.data.clipPublicId,
    });
    updateBeat(beatId, { status: "preview" });
  }
}, [status.data]);
```

---

### 2.6 Scene preview / clip preview

**Goal:** show the generated still + the 5s clip in the drawer, with an Approve / Regenerate split CTA.

**Use:**
```tsx
import { buildClipUrl, buildThumbnailUrl } from "@/lib/cloudinary-transforms";

const clipUrl = buildClipUrl(scene.clipPublicId!, { mood: beat.archetype.mood });
const thumbUrl = buildThumbnailUrl(scene.clipPublicId!, { mood: beat.archetype.mood });
```

**Custom video controls** — don't use the native player. Build a thin `<VideoPlayer>` component:
- Big play button overlay (Lucide `Play` icon).
- Custom scrubber (ember-tinted progress bar, click-to-seek).
- Time display in mono.
- Auto-pause when drawer closes.

The mood-graded URL is what makes the visual quality consistent across providers — apply it everywhere a clip plays.

---

### 2.7 Stitch tray (`src/components/stitch/stitch-tray.tsx`)

**Goal:** the URL building in real time as clips approve. The Cloudinary moment.

**What's there:** thumbnail row (placeholder), live URL display in mono, Render + Open-in-CutOS CTAs.

**What to polish:**
- **Thumbnails.** Replace the placeholder boxes with `buildThumbnailUrl(scene.clipPublicId, { mood: beat.archetype.mood })`. This is genuinely satisfying — judges see the cinematic "color signature" of each beat.
- **URL build animation.** Currently the URL just appears. Animate it: when a new beat is approved, slide the new `l_video:<id>,fl_splice/` segment in from the right with a typewriter effect. ~600ms.
- **Render CTA.** Big ember primary, full-width, disabled until `approvedCount === totalCount`. When enabled, pulses softly. Click → call `api.stitchUrl({ manifest })` → navigate to a final-delivery screen with the URL in `<video>`.

---

### 2.8 Final delivery (new route)

**Goal:** the cinematic plays. The user smiles. The pitch lands.

**Pattern:**
```tsx
// src/routes/final-delivery-route.tsx
function FinalDeliveryRoute() {
  const finalUrl = ...; // from the stitch response
  return (
    <main className="film-grain grid h-screen place-items-center bg-bg-base">
      <h2 className="text-display-md italic mb-6">Your cinematic.</h2>
      <video src={finalUrl} autoPlay controls className="w-[70vw] aspect-video" />
      <div className="mt-6 flex gap-3">
        <Button variant="primary"><Download /> Download MP4</Button>
        <Button variant="ghost"><Copy /> Copy share link</Button>
        <Button variant="ghost"><ExternalLink /> Open in CutOS</Button>
      </div>
    </main>
  );
}
```

Add the route to `App.tsx`. Navigate from `StitchTray`'s render button.

---

## 3. Shared components to build

These show up across surfaces; build them once and reuse:

- **`<VideoPlayer>`** — custom controls, mood-graded, ember scrubber. ~80 lines.
- **`<EmberPill>`** — status pill with optional pulse. Replaces three ad-hoc divs.
- **`<TypewriterText>`** — character-by-character reveal for agent bubbles + URL builder. ~30 lines using Motion.
- **`<Stepper>`** — three-step indicator for the GenerationPanel. ~40 lines.

---

## 4. Performance checklist (run before each commit)

- [ ] Lighthouse-style: landing transferred bundle ≤200KB, canvas ≤800KB.
- [ ] Canvas runs ≥55fps on a 1080p MacBook Air M2 (or equivalent Win laptop).
- [ ] No console warnings, no React StrictMode double-render warnings.
- [ ] All new components respect `prefers-reduced-motion`.
- [ ] `npm run build` succeeds (typecheck + Vite production build).

---

## 5. Stitch integration workflow

When you generate a screen with Google Stitch (`docs/STITCH_PROMPTS.md`):

1. Copy the Tailwind output.
2. Drop it into a temporary file in `src/components/_stitch-drafts/<screen-name>.tsx`.
3. Diff against the existing component for that screen.
4. Pull the **layout, typography, and copy** wholesale.
5. Pull the **motion** sparingly — Stitch defaults to Tailwind transitions; replace with our motion presets (`SPRING.bubble`, `EASE.outQuart`, etc.).
6. Pull the **colors** verbatim if they match the design tokens (they should, per the seed prompt).
7. Delete the file from `_stitch-drafts/` once integrated.

The `_stitch-drafts/` folder is gitignored implicitly because nothing references it from production. Keep it tidy.

---

## 6. Where the seams are

If you find yourself wanting to change something in `backend/`, ask first. The seams between FE/BE responsibilities:

| Concern | Owner | Touchpoint |
|---|---|---|
| Beat archetypes (intent, mood, directorNotes) | shared, FE source of truth | `frontend/src/lib/beat-templates.ts` — backend mirrors |
| Manifest / API types | shared | `frontend/src/types/{manifest,api}.ts` — backend mirrors |
| Generation provider dispatch | Vishnu | `backend/src/services/provider.ts` |
| Agent prompt | Ethan | `backend/src/services/agent.ts` |
| Mock implementations | shared | `backend/src/mock/*` |
| Cloudinary URL builders | shared, both sides | `backend/src/services/cloudinary.ts` ↔ `frontend/src/lib/cloudinary-transforms.ts` |
| All UI / motion / 3D | Alex (you) | `frontend/src/{routes,components}/*` |

If a type changes, update **both** copies in the same commit.

---

## 7. Daily checklist

Before pushing to `main` (which auto-runs in this repo because we're shipping fast):

- [ ] `npm run build` passes in `frontend/`.
- [ ] No TODO comments without owner names.
- [ ] No images committed to `frontend/public/` over 200KB. Use Cloudinary.
- [ ] No new dependencies without a one-line justification in the commit message.
- [ ] At least one screen demo'd to a non-team-member (gut check on polish).

---

## 8. The North Star

If a judge watches our 2-minute demo and remembers exactly **one** thing — the page-crumple → 3D canvas → final cinematic playing — you've done your job. Everything else is bonus.

Protect those three moments above all.
