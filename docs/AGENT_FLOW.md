# AGENT_FLOW — Phase 4 Lesson Reflection

> **Phase 4 surface:** the node-detail drawer + agent questionnaire + sufficient/generate state transitions + generation-in-progress panel. The middle 60 seconds of the demo. Read this **before** touching `components/node/*` or `components/agent/*`.

Phase 0–3 built the showpiece (landing → page-crumple → canvas reveal). Phase 4 is the work after the user is on the canvas: clicking a node, talking to the director-agent, watching the generation light up. This is where the "agent" half of "node-canvas exploration UI" actually appears on screen.

---

## 1. The state machine that drives everything

Every visual change in Phase 4 derives from `beat.status` and the contents of `beat.scenes[0]`. There is no separate UI state machine — the manifest is the state machine.

```
pending          ─ click a node ──→ questioning
questioning      ─ user answers; agent responds  ↻
                 ─ agent says "sufficient"  ──────→ ready-to-generate
ready-to-generate ─ user clicks Generate ───────→ generating
generating       ─ poll succeeded ───────────────→ preview
preview          ─ user approves ────────────────→ approved
```

Every component reads `beat.status` and renders accordingly:

| status | drawer body | footer | CTA | sidebar visual |
|---|---|---|---|---|
| pending / questioning | `<AgentBubbleStream>` | "More questions recommended" | disabled | breathing |
| ready-to-generate | `<AgentBubbleStream>` | "Sufficient information collected" + ember | **pulses** | ember-pulse on node |
| generating | `<GenerationPanel>` | timer + steppers | hidden | breathing |
| preview | `<ClipPreview>` (Phase 5) | approve/regenerate | — | ember |
| approved | preview frame | — | — | ember saturated |

**Key insight:** because UI is `f(beat.status)`, you never need to write an `if (justFinishedGenerating) {…}`. You just write `if (status === "preview") {…}` and the truth lives in the manifest. State transitions happen via `updateBeat({ status: … })` in the store.

---

## 2. AnimatePresence + drawer enter/exit

The drawer is an `AnimatePresence` child in `canvas-route.tsx`:

```tsx
<AnimatePresence>{activeBeatId ? <NodeDetailDrawer key={activeBeatId} /> : null}</AnimatePresence>
```

Two non-obvious things to know:

1. **`key={activeBeatId}`** — when the user switches to a different beat, the drawer unmounts and remounts. This is intentional: it triggers a fresh enter animation, and (more importantly) it tears down any stale agent-call promises in the old drawer.
2. **`exit` works because the parent is `AnimatePresence`.** Without that wrapper, the `exit` prop is silently ignored. This is the #1 Motion gotcha.

The drawer uses `SPRING.drawer` (220 stiffness, 32 damping) — a quick, decisive enter.

---

## 3. `staggerChildren` + `delayChildren` (the drawer's content cascade)

Per spec §4.1: header → status pill → CTA stagger by 60ms.

```tsx
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    hidden: {},
    visible: { transition: { staggerChildren: STAGGER.drawerInner } }, // 0.06s
  }}
>
  <motion.div variants={fadeUp}>{header}</motion.div>
  <motion.div variants={fadeUp}>{statusPill}</motion.div>
  <motion.div variants={fadeUp}>{cta}</motion.div>
</motion.div>
```

`staggerChildren` does not animate anything itself — it only schedules child animations. Each child still needs a `variants` object that contains both `hidden` and `visible` keys.

**`delayChildren`** (used on the landing pills) shifts the *start* of the stagger; useful when you want the parent to fade in first, then its children cascade.

---

## 4. Character-by-character agent reveal

The `<TextSplitter>` from Phase 0 already wraps each character in a `<span>` with `animation-delay`. We reuse it here with a different keyframe:

```css
.reveal-chars > span > span {
  opacity: 0;
  animation: reveal-char 0.18s ease-out forwards;
}
@keyframes reveal-char {
  0% { opacity: 0; transform: translateY(2px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

```tsx
<TextSplitter
  text={turn.content}
  className="reveal-chars"
  baseDelay={0}
  jitter={0}                              // no jitter — typewriter, not flicker
  // We compute per-char delay via inline override (see implementation)
/>
```

**Cap the total time at 1.6s regardless of length.** Long answers shouldn't take 8 seconds to read in. The trick: scale the per-char delay so `chars.length * delay ≤ 1.6`.

```ts
const charsLen = turn.content.length;
const targetDelay = Math.min(0.025, 1.6 / charsLen); // 25ms cap, scale down for long text
```

Pass `targetDelay` as `jitter` with `baseDelay` of 0 → each char's delay is `pseudoRandom(i) * targetDelay`. That's not actually sequential — that's randomized, which reads as flicker not typewriter. To get true typewriter:

```tsx
// Use the data-index attribute already set by TextSplitter; bind via CSS:
.reveal-chars > span > span {
  animation-delay: calc(var(--char-delay) * var(--idx, 0));
}
```

But CSS counters by index aren't a thing. The cleanest path is to compute and write `style.animationDelay` per `<span>` ourselves — **fork TextSplitter for sequential reveal**, or pass a `delayStrategy="sequential"` prop. We add the sequential mode here.

**User bubbles render instantly** — the user already knows what they wrote.

---

## 5. Sufficient pill + Generate-CTA ember-pulse

The CSS keyframe `ember-pulse` already exists (`index.css:171`). To enable it conditionally, just toggle the class:

```tsx
<div className={cn("rounded-lg border px-3 py-2 …", isReady && "ember-pulse")}>
  {isReady ? "Sufficient information collected" : "More questions recommended"}
</div>
<Button className={cn("w-full", isReady && "ember-pulse")} disabled={!isReady}>
  Generate scene
</Button>
```

**Why CSS keyframes here, not Motion?** Two reasons:
1. The pulse runs *forever* until status changes. Motion's `animate` is great for one-shot transitions; pure CSS is better for indefinite loops (zero JS each frame).
2. We already wired reduced-motion overrides to disable `.ember-pulse` in `index.css:233`. Motion-driven pulses would need their own reduced-motion check.

The principle: **Motion for transitions, CSS for indefinite loops.**

---

## 6. Generation panel — the three-stepper + live timer

When status flips to `generating`, we hide the agent stream and show:

```
  ┌─────────────────────────────────────┐
  │   [16:9 placeholder, blur-pulse]   │
  └─────────────────────────────────────┘
   ● Storyboard generated (✓)
   ● Clip rendering (current — ember dot)
   ○ Uploading to Cloudinary (pending)

   0:32 / ~2:00
```

**Stepper progression:** the mock backend's `/api/status` returns `running` for ~1.6s then `succeeded`. We mirror this with three discrete UI stages keyed off elapsed time (since the mock doesn't expose stage-level progress yet):

```ts
const elapsed = (Date.now() - startMs) / 1000;
const stage = elapsed < 0.5 ? 0 : elapsed < 1.2 ? 1 : 2;
```

**Active dot animates between rows** with `motion.span layoutId="gen-active-dot"` — the same sliding pattern as the landing's pill underline. One layoutId, one currently-active row, Motion morphs between them.

**Live timer** updates via `useEffect` + `setInterval` writing to local state. No need for refs since the timer drives a *single* `<time>` element — one re-render per second isn't expensive.

**Blur-pulse** uses the existing `.animate-blur-pulse` keyframe (already in `index.css`). The 16:9 placeholder is a `<div>` with that class.

---

## 7. API wiring (`api.agent`, `api.generate`, `api.status`)

The mock backend's contract from `backend/src/mock/agent.ts`:

```ts
type AgentResponse =
  | { kind: "question"; question: string; reasoning: string; estimatedRemaining: number }
  | { kind: "sufficient"; refinedPrompt: string; sceneSummary: string; suggestedDuration: number };
```

**Lifecycle:**

```tsx
async function handleSubmit(message: string) {
  // 1. Optimistically append the user turn locally so the UI updates immediately.
  appendAgentTurn(beatId, sceneId, { role: "user", content: message, timestamp: nowISO() });

  // 2. Call the agent. The backend reads the manifest from us so it has full context.
  const res = await api.agent({ manifest, beatId, userMessage: message });

  // 3. If it's still asking, append the question.
  if (res.kind === "question") {
    appendAgentTurn(beatId, sceneId, { role: "agent", content: res.question, timestamp: nowISO() });
    return;
  }

  // 4. If sufficient, store refinedPrompt on the scene and flip beat status.
  updateScene(beatId, sceneId, { refinedPrompt: res.refinedPrompt, durationSeconds: res.suggestedDuration });
  updateBeat(beatId, { status: "ready-to-generate" });
  appendAgentTurn(beatId, sceneId, {
    role: "agent",
    content: `Got it. ${res.sceneSummary}. Ready to generate when you are.`,
    timestamp: nowISO(),
  });
}
```

**Generation polling:**

```tsx
async function handleGenerate() {
  updateBeat(beatId, { status: "generating" });
  const { jobId, pollAfterMs } = await api.generate({
    projectId, beatId, sceneId,
    refinedPrompt: scene.refinedPrompt!,
    durationSeconds: scene.durationSeconds ?? beat.archetype.suggestedDuration,
    beatTemplate: beat.template,
  });

  // Poll until succeeded.
  let delay = pollAfterMs;
  for (;;) {
    await sleep(delay);
    const status = await api.status(jobId);
    if (status.status === "succeeded") {
      updateScene(beatId, sceneId, { jobId, clipPublicId: status.clipPublicId, clipUrl: status.clipUrl });
      updateBeat(beatId, { status: "preview" });
      return;
    }
    if (status.status === "failed") {
      // Surface error; revert status. Out of scope for hackathon — toast it.
      updateBeat(beatId, { status: "ready-to-generate" });
      return;
    }
    delay = status.pollAfterMs ?? 800;
  }
}
```

**Why not use TanStack Query?** It's installed, but for a per-beat agent loop, plain async/await + the existing zustand store is simpler. TanStack would shine if multiple beats were polling simultaneously and we wanted dedup/cache — out of scope.

**Race-condition guard:** if the user closes the drawer mid-call, the optimistic state was already written. The remote response will append once the promise resolves — *even though the drawer remounts*, because the data lives in the store, not in the drawer's local state.

---

## 8. The "first agent question" — render on drawer open

Currently `AgentBubbleStream` shows a hardcoded `seedHint` when the conversation is empty. We replace that with a real call:

```tsx
useEffect(() => {
  if (scene.conversation.length > 0) return;
  let cancelled = false;
  (async () => {
    const res = await api.agent({ manifest, beatId, userMessage: undefined });
    if (cancelled) return;
    if (res.kind === "question") {
      appendAgentTurn(beatId, sceneId, {
        role: "agent",
        content: res.question,
        timestamp: nowISO(),
      });
      updateBeat(beatId, { status: "questioning" });
    }
  })();
  return () => { cancelled = true; };
}, [activeBeatId]);
```

`cancelled` flag handles the case where the user closes the drawer before the response lands. Without it, we'd append a stale agent turn.

---

## 9. Decision matrix

| feature | ship | risk | floor if it slips |
|---|---|---|---|
| 4.1 Drawer content stagger | ✅ yes | low | unstaggered enter |
| 4.2 Char-by-char reveal | ✅ yes | medium | instant text (no reveal) |
| 4.2 Wire `api.agent` for real | ✅ yes | medium | hardcoded canned questions in FE |
| 4.3 Sufficient pill + CTA pulse | ✅ yes | low | static pill |
| 4.4 Generation panel | ✅ yes | low | "Generating…" plain text |
| 4.4 Three-stepper progression | ✅ yes | low | single status line |
| 4.4 Live timer | ✅ yes | low | no timer |
| `api.generate` + `api.status` polling | ✅ yes | medium | flip directly to preview after 1.5s `setTimeout` |

**Time budget:** ~3 hours total. If wiring slips at the 2-hour mark, ship 4.1/4.3 + cosmetic 4.4 + skip 4.2 reveal.

---

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| Backend not running → fetch fails → drawer is stuck on first question | render an inline error in the bubble stream; offer Retry. |
| User spam-clicks Send → multiple agent calls in flight | disable Send while a call is pending; track `inFlight` local state. |
| User closes drawer mid-call → cancelled response | the promise still resolves; appendAgentTurn writes to store; data persists for the next open. Acceptable. |
| Char-by-char reveal makes long answers tedious | cap total reveal time at 1.6s; for very long content (>200 chars), drop reveal entirely. |
| Generation panel polls forever if backend hangs | hard timeout at 30s → revert to ready-to-generate + show error toast. |
| Beat status changes while generation panel is mounted | the panel reads `beat.status` each render; if status flips to `preview`, switch panels. AnimatePresence handles the swap. |
| Mock backend's `/api/agent` returns `sufficient` after exactly 2 user turns — but FE renders 1 seed question + 2 user answers + 1 final agent turn = the user might expect more conversation | the directorial seed-question + 2 follow-ups is the entire flow by design (see beat-templates.ts). 2 questions is the moat being applied; don't extend. |

---

## 11. Implementation map

1. `index.css` — add `reveal-char` keyframe; ensure `.reveal-chars` selector is reduced-motion-safe.
2. `lib/text-splitter.tsx` — add `delayStrategy: "sequential" | "jitter"` prop. Default `jitter` (existing behavior).
3. `components/agent/agent-bubble.tsx` — agent turns use `<TextSplitter delayStrategy="sequential" jitter={revealCap}>`; user turns instant.
4. `components/agent/agent-bubble-stream.tsx` — wire `api.agent()` on mount + on submit; track `inFlight` to disable input; handle the seed first-question.
5. `components/node/generation-panel.tsx` — new. 16:9 blur-pulse placeholder, three steppers with sliding ember dot via `layoutId`, live timer.
6. `components/node/node-detail-drawer.tsx` — staggered content, conditional generation panel when status === "generating", wire Generate CTA to `api.generate()` polling loop.
7. `lib/utils.ts` — verify `sleep(ms)` helper exists; add if not.
8. Verify typecheck + build. Bundle stays within budget.

---

## 12. Cross-references

- `MOTION_LANGUAGE.md` §4 — when Motion vs CSS keyframe.
- `SHADERS_AUDIO.md` — Phase 2 lesson on why ref-bridges beat React state for hot loops; same principle here for the timer.
- `CANVAS_3D.md` §3 — the *state-from-store* pattern for node visuals; same pattern drives the drawer body.
- `MOCK_BACKEND.md` — agent + clips contract; `runMockAgentTurn` returns a question or sufficient based on `userTurnCount`.
- `SHARED_TYPES.md` — `AgentResponse`, `GenerateResponse`, `StatusResponse` shapes.
- `MASTER_FRONTEND_DEV.md` §10 — `<TextSplitter>` signatures.

---

## 13. The prize

When this phase ships, the demo viewer sees:

1. They click a node. Drawer slides in from the right with a spring; header/pill/CTA cascade.
2. The director-agent's first question types itself in, character by character.
3. They type a reply. Send. The reply appears instantly. The agent's next question types in.
4. Two questions in, the pill flips to ember and pulses. The Generate CTA pulses. *They know exactly what to click next.*
5. They click Generate. The drawer body swaps to a generation panel. Three steppers march. A timer ticks. ~1.6 seconds in, it succeeds.

This is the "pizza-ordering simplicity" moment for the agent-questionnaire half of the product. It's the second-most-visible surface after the page-crumple. Ship it cleanly.
