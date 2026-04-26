# SceneOS · Devpost Submission

> Copy-paste ready. Each section maps directly to its Devpost field.

---

## Elevator Pitch (200 char limit)

Powerful filmmaking, reimagined for one. SceneOS turns one idea into a finished cinematic, collapsing a film crew, 24 hours of editing, and a cinematographer's vocabulary into one creator's hands.

*(189 / 200 chars)*

---

## Inspiration

While travelling on a bus, Alex recalled a video from Cluely's CEO discussing the rapidly rising demand for AI video generation. The CEO was openly hiring for that specific skill set, asserting that even companies with 100x Cluely's budget would be hopping on the trend tenfold over the next year.

Previously, for Alex's own startup, he had used Higgsfield AI to generate the scenes for a movie trailer promoting a food nutritional app, and the trailer leaned on a time-travel "come back to life" sequence that worked but required meticulous planning, scripting, and Alex reliving the inner cinematographer he had only pretentiously studied back in 8th grade. Even after the AI handed him the clips, the final 2-minute trailer still cost 24 hours of editing in post-production software.

Alex and Vishnu spent close to 2 solid hours on their flight from Toronto, Canada to Los Angeles, plus the commute up to UCLA, working through the idea, and by the end of the commute the question had shifted: it was no longer "is this technically feasible," because Google Vertex, Veo, and Higgsfield AI already solve the compute layer, the technical feasibility, and the cinematic output quality. The bottleneck was everything around them.

Then Ethan brought up the production math. According to industry estimates, a 30-second TV commercial typically runs anywhere from \$50,000 to \$500,000 or more in production cost, with the high end exceeding \$1M, and a music video usually lands between \$20,000 and \$1,000,000. An indie short film crew runs anywhere from 8 to 20 people (cinematographer, gaffer, editor, colorist, sound designer, foley artist, scriptwriter, and so on), industry rule of thumb pegs editing time at 1 to 3 hours per minute of finished narrative content, and pre-production planning takes weeks. Even with AI video models like Veo and Higgsfield in the mix, a creator still needs at least an ounce of filmmaking literacy to direct the output, which means there is a real roadblock to access.

The question that fell out of that conversation was the one we built around: what if any individual with a single spark of creativity could reimagine or build a whole movie trailer, short film, or even an entire movie alone, without bringing clips into a video editor for 24 hours, and without hard-focusing the storyline through professional consultations or back-and-forth with a strong LLM, because the whole pipeline lives inside one app where the spark of an idea becomes a finished cinematic without the creator ever having to leave the tab?

That is what SceneOS provides.

---

## What it does

SceneOS turns a single director's prompt into a finished cinematic short. The user types one line (something like "a 90s VHS recovery memory of the day my dog ran away"), and the app decomposes it into 5 to 7 beats on a 3D star-map canvas, interrogates each beat through a director-toned dialogue until the prompt is camera-tight, generates a clip per beat via Veo or fal.ai, and stitches the approved clips into a final cinematic through a Cloudinary `fl_splice` URL that composes itself live in a chrome strip as approvals land. The whole flow is one line in, one cinematic out, with no multi-step forms, no pricing tiers, and no login walls between the two.

The value lives in what collapses: a typical commercial crew of 12 becomes a single creator at a desk, 24 hours of editing becomes the length of a coffee, and a cinematographer's vocabulary becomes something the user never has to learn because the canvas and the agent absorb it on their behalf. SceneOS is not coming for the theatrical film industry, which produces work that genuinely needs irreplaceable craft and human taste, but it is coming for the volume layer beneath it (social-media content, brand variants, influencer ads, scrappy trailers, music-video drafts, pitch reels), because any creator who has scaled organically on TikTok or YouTube Shorts already knows that volume wins, and SceneOS hands a single creator a production studio inside a browser tab.

This submission applies to the **Flicker to Flow** track (a flickering creative impulse becomes finished output without context-switching through a video editor, a script doctor, and a cinematographer's vocabulary) and to the **Cloudinary** track (the entire stitching layer is pure URL composition through `fl_splice` with no server-side rendering, and the URL composes itself live as the user approves beats, which is the most direct demonstration we could think of for what `fl_splice` actually unlocks).

---

## How we built it

The frontend is React 19 + Vite 7 + Tailwind v4 with a deliberately tight design-token system: bg-base / bg-elev / bg-panel / bg-tile, fg-primary / secondary / tertiary, brand-ember and brand-ember-dim as the only accent, a single `0.18em` uppercase tracking, and a half-step text-size scale (overline 10 → micro 10.5 → caption 11 → chip 11.5 → pill 12.5 → meta 13 → meta-lg 13.5 → body-sm 14 → body 16 → body-lg 17 → lede 20). Italics are reserved for connectives. Motion 12 drives state-based animation, GSAP 3.12 carries the showpiece bridge transition between landing and canvas, and the 3D canvas runs on React Three Fiber 9 + drei 10 with a custom CameraRig that replaces OrbitControls so the view reads as a film camera rather than a 3D viewport. The planets themselves are textured spheres with status-aware emissive ramps, completion-star halos on approved beats, a "you are here" guidance overlay with a pulsing ember ring on the next pending beat, and a circuit-trace connecting path between them. State lives in Zustand v5 stores with `useShallow` guards on every fresh-array selector, and the chrome stack pairs Lenis-driven smooth scroll with a lazy-loaded cmdk command palette, a beat-progress strip showing per-beat status, and a persistent `fl_splice` URL strip that composes itself live as beats approve. Voice and vision are first-class inputs: the Web Speech API auto-starts on landing and inside every drawer with a 3-second silence threshold that auto-submits when the user stops talking (mid-sentence pauses are forgiven; the form fires hands-free), and reference images drag-drop into the agent conversation. The audio language is five cues synthesized directly from the Web Audio API rather than sample files. Display typography is Fraunces with custom axis tuning (`opsz` auto, `SOFT 50` / `SOFT 60` italic, `WONK 0`); body is Geist; technical strings are Geist Mono.

The backend is FastAPI + Vertex AI Gemini, with the agent modelled as a state machine over a beat graph (pending, questioning, ready-to-generate, generating, preview, approved). Decompose is a one-shot Gemini 2.5 Pro tool call that turns the master prompt into 5 to 7 beat-level scene specs plus a cross-beat continuity bible (locking the protagonist's appearance, the location's signature feature, the time-of-day arc, and the palette so the protagonist looks like the same person across all beats, not seven similar people). Per-beat questioning is a streaming Gemini 2.5 Flash conversation with tier-aware question caps (2 for trailers, 3 for short films, 5 for movies) and a structured tool schema that always emits 2 to 4 suggested-answer pills the user can click instead of typing. Generation hands off to Veo 3.1 Fast on Vertex AI by default (5× the per-minute quota of the quality tier; toggleable to `veo-3.1-generate-001` for full fidelity). The architectural call we are proudest of is the **concurrent speculative pre-bake**: the moment decompose returns refinedPrompts, we fire `/api/generate` for every beat in parallel and park each jobId on `scene.speculativeJobId`; while the user walks the canvas and does the per-beat conversation, Veo is rendering every beat simultaneously in the background; when the user hits "I have enough — generate" the drawer checks for an already-ready clip and flips straight to preview with zero new round-trip. The user's wait collapses from `sum(N × ~150s)` to `max(longest conversation, longest render)`. Stitching is pure URL composition through Cloudinary's `fl_splice`, so there is no server-side rendering, no FFmpeg, and no waiting on a final encode. Every job carries a server-side `startedAt` ISO timestamp through the status response so the frontend's elapsed-time bar survives drawer close/reopen instead of restarting at zero, and a backend `stage` field (`veo_running`, `cloudinary_uploading`, `cloudinary_uploaded`) keeps the visible stepper honest. When the active provider rejects a call (quota / safety / network), the dispatcher auto-falls-back to a cached lane and the response carries an `originalProvider` field so the UI surfaces a tasteful "Demo lane in use" badge rather than silently swapping a Veo render for a cached clip.

---

## Challenges we ran into

The frontend started generic, with the default shadcn skin, Inter for body, Playfair-flavored serifs for display, and Sparkles icons next to AI features, and it read like every other AI product in 2026, so we threw the whole thing out and rebuilt typography, palette, motion language, and microcopy from a single thesis ("Tesla designing a Christopher Nolan trailer"), running multiple full audit-and-rebuild cycles before the system actually held up at every size. We swept every hand-tuned `text-[N.5px]` and inline `bg-[#…]` and `shadow-[0_8px_…]` to tokens (`text-pill`, `bg-bg-panel`, `shadow-(--shadow-pill)`), so every value in the codebase is intentional rather than tuned-by-eye. The 3D canvas hit a stack of production issues worth naming: a hardcoded CameraRig position that silently overrode our ResponsiveCamera computation on portrait viewports (resolved by passing the camera distance as a prop), a first-commit null crash inside `@react-three/postprocessing` 3.0.4 under React 19 + R3F 9 (resolved by removing the entire EffectComposer and letting atmosphere shells and the holographic active overlay carry the visual weight), a per-character text animation that broke words mid-character (resolved by grouping characters into non-breaking inline-block word containers), a Zustand v5 + StrictMode max-update-depth crash on fresh-array selectors (resolved with `useShallow` from `zustand/react/shallow`), planets that briefly appeared and then vanished on canvas mount because of an outer Suspense unmount race (resolved by adding inner Suspense boundaries inside the Canvas so a single texture re-suspension never takes down the whole 3D tree), drag-pan over the canvas chrome triggering stuck text selection (resolved with `select-none` on the canvas main and explicit `select-text` opt-ins on the drawer + URL strip), and a stitch-tray double-card stack that came from leaving the floating Stitch pill visible underneath an open tray (resolved by gating the pill on `!stitchOpen` with AnimatePresence).

The Veo pipeline was a battle in itself. Veo 3.1 (full quality) takes 2 to 3 minutes per clip on the trial tier, and base64 transit twice through the user's wifi (Vertex → backend → Cloudinary, ~25 MB each direction) added another 30 to 90 seconds on bad networks. Sequential per-beat generation would have made the demo unwatchable, so we built the **concurrent speculative pre-bake** described above and then stacked further optimizations: switched to `veo-3.1-fast-generate-001` as the default (5× quota) with `VEO_SPEED_MODE` flagging 720p + audio-off for live demo, added millisecond-level timing telemetry (`[vertex.veo.timing] total=X submit=Y veo_done=Z cloudinary=W`) so latency regressions are visible in the log, propagated server-side `startedAt` so closing and reopening a drawer mid-render doesn't reset the elapsed clock, detected stuck jobs at 1.5× the estimate with a Cancel-and-retry banner, and added graceful "previous render expired" handling for the in-memory `_JOBS` dict getting wiped on backend restart. We also had to think hard about what is actually feasible for a 2-to-5-minute live demo, so we built a provider auto-fallback that swaps to a pre-baked cached lane when Veo quota / safety / network rejects a request, and the response carries `originalProvider` + `fallbackReason` so the UI surfaces it as a "Demo lane in use" badge rather than pretending a cached clip is a fresh Veo render.

The voice flow needed its own pass: the browser's native `SpeechRecognition.onend` fires the moment the user pauses for ~0.5 seconds, which kept killing sessions mid-sentence. We rewrote the hook to keep `continuous: true`, debounce a 3-second silence timer that re-arms on every `onresult`, and fire an `onSettle(transcript)` callback that the landing route + per-beat drawer wire straight into form submit. The result is hands-free: speak, pause to think, keep speaking, and 3 seconds after you actually finish the form auto-submits. The mic icon stays on `Mic` (not `MicOff`) while listening because the icon represents the current state of the mic, not the inverse action; container colors carry the active state via ember tint and a pulsing-bars indicator beside the input.

---

## Accomplishments that we're proud of

We got the entire pipeline stitched together end to end (prompt to decompose to 3D canvas to per-beat conversation to concurrent video generation to live URL stitching to in-canvas editor to final-delivery letterbox), and we did it on the back of close to 6 hours of pre-build investigation on the flight and commute, where we worked through pipeline architecture, design philosophy, market positioning, B2B-versus-B2C strategy, and the "what would we ship if this were a real funded startup" thought experiment almost as if this were a startup planning sprint instead of a hackathon kickoff.

The single technical accomplishment we are proudest of is the **concurrent speculative pre-bake**. Vanilla sequential video generation would have made a 5-beat short take 13 to 20 minutes of waiting; with the pre-bake the user's perceived wait collapses to ~3 minutes max, because every beat's Veo job dispatches the moment decompose returns and the per-beat agent conversations happen in parallel with the renders. The "I have enough — generate" button checks for an already-ready speculative clip and flips straight to preview with zero new round-trip. The pipeline waits only on the user, never on the model.

Beyond the pipeline we are proud of the **design discipline**: every value in the codebase is a token, every text size, every shadow, every panel background. We swept all hand-tuned px values, hardcoded hex strings, and inline shadows; we forced display font to a 14px floor; we put `text-wrap: balance` on every H1 and `text-wrap: pretty` on every paragraph; we held every screen to the screenshot test, every microcopy string to the director's voice, every animation to the four-reasons rule (reveal / acknowledge / bridge / signal), and we ruthlessly protected the three demo-winning moments (the landing-to-canvas portal, the 3D star-map first reveal with a "you are here" guide, and the live Cloudinary URL strip composing itself in real time).

---

## What we learned

We learned that SceneOS must offer value to its users by both stripping away the time needed to perform high-skill craft (because that craft is automated) and removing the prerequisite skill bar (video editing, cinematography, filmwriting) that gates high-volume cinematic content today. We did not want SceneOS to be a simple wrapper that calls AI video creation, because the wrapper has been tried and the wrapper is the bottom of the market; we wanted a whole guided, intuitive, clean, satisfying suite that goes from idea to completed video with every step in between automated or guided by the user's thoughts projected through their voice, with the option to type when the mic is unavailable. The director conversation, the 3D canvas, the concurrent speculative pre-bake, the live `fl_splice` URL strip, and the in-canvas editor are the real differentiators, while the wrapper underneath is a commodity.

We learned that **latency is a product surface**, not a backend metric. A 2-to-3-minute Veo wait is non-negotiable as a model output but absolutely negotiable as a user experience: collapse it with concurrency, mask it with conversation, surface it with `startedAt` + stage telemetry, and have an honest fallback ready. The wait that the user actually perceives is `max(longest conversation, longest render)`, not `sum`, once you architect for it.

We learned that **voice-first UX is a tighter constraint than text-first UX**, because the voice path can't ship a Send button. The 3-second silence threshold + auto-submit is the load-bearing piece, and the mic icon must show the current state (Mic when active) rather than the next action (MicOff to mute) — that mismatch was a real source of confusion until we fixed it.

We also learned that the cinematic register is built by deletion rather than addition, that demo-day calculus is its own product discipline (the 800ms perception threshold, the three protected moments, the cached-lane safety net for a backend failure mid-demo, the reduced-motion kill switch for a stuttering projector), that **every value should be a token** so the design system can be re-tuned globally rather than chased file-by-file, and that two co-founders sketching a startup on a flight then shipping in 36 hours is a rare and worth-protecting thing because the 6 hours of philosophy work we did up front paid off in every single design decision afterward.

---

## What's next for SceneOS

SceneOS intends to expand into a full suite that uses video generation APIs as the engine driving what modern post-production software does, focused entirely on AI, with stronger models, pricing tiers, and deliberate B2B and B2C positioning. Four concrete next steps:

**1. Provider tiering and pricing.** A free tier on the speedrun path (Veo Fast + fal.ai), a pro tier on the cinematic path (Veo full + Higgsfield), and a studio tier with batch generation, brand-kit imports, voiceover synthesis, and export pipelines for editorial software (Premiere XML, Final Cut Pro XML), with pricing experiments informing which tier creators stay in and what the right price is for the volume use case versus the cinematic one.

**2. A B2B agency workflow.** Brands and agencies routinely need 50 to 200 social-media variants for a single campaign, and SceneOS's pipeline (one prompt to many beats to many clips to one stitched cinematic) is already a variant engine. The concurrent speculative pre-bake we built for demo-day timing is the same primitive a variant engine needs at scale: dispatch all variants in parallel, surface them as they land, let the operator approve in bulk. The B2B layer adds brand-kit constraints, multi-variant prompt expansion, stakeholder approval workflows, and rights-managed export, while the per-account revenue dwarfs B2C.

**3. A multimodal director's notebook.** Today the conversation is text-led with voice as a hands-free first-class input and vision as drag-drop reference frames, but the next step is full multimodal direction: drop a reference reel and the agent learns the visual language from it, hum a melody and the agent picks a score direction, sketch a storyboard panel and the agent matches framing across beats. Gemini's multimodal capabilities make this a near-term build, not a research project.

**4. Server-to-server video transit.** Veo's base64 inline response is the single biggest latency tax on user-hosted deployments. Wiring Veo's `storageUri` GCS option through to Cloudinary's `fetch_from_url` upload would skip the user-machine roundtrip entirely, cutting our 50 MB-on-bad-wifi tax to zero. This is the cleanest single optimization left.

The longer arc: the next decade of social-media content belongs to individuals with cinematic taste and zero crew, and the tooling layer between idea and finished cinematic decides who wins. We are building that layer.

---

## Built with

```
react, vite, typescript, tailwindcss, motion, gsap, three.js, react-three-fiber, drei, zustand, lenis, cmdk, radix-ui, lucide, sonner, web-speech-api, web-audio-api, python, fastapi, uvicorn, httpx, google-genai, gemini-2.5-pro, gemini-2.5-flash, google-vertex-ai, veo-3.1, langgraph, fal.ai, higgsfield, cloudinary
```

---

## "Try it out" links

- **Live demo:** https://sceneos.us
- **GitHub repo:** https://github.com/ethan-ignatius/sceneos

---

## Share feedback about any technology you interacted with at this hackathon

**Cloudinary's `fl_splice` URL composition is the most under-marketed feature in their product.** The fact that we could stitch a multi-clip cinematic together as a pure URL transformation, with no server-side rendering pass and no FFmpeg in the loop, is the reason our pipeline ships in seconds instead of minutes, and the reason we can show a live-composing URL strip on our canvas as a track-hero demo moment. The documentation could surface this capability earlier and louder; we found it on a deep-dive through the docs but a lot of teams will miss it on a first pass. Same praise for the upload pipeline: forwarding a `data:` URI directly to `/v1_1/{cloud}/video/upload` saved us a temp-file dance.

**Google Veo 3.1 via Vertex AI** was the cinematic-quality benchmark for us. Veo 3.1 Fast (`veo-3.1-fast-generate-001`) was a meaningful win — 5× the per-minute quota at a small fidelity trade-off, which made the demo timing actually work. The 4 / 6 / 8-second duration constraint is a subtle gotcha (we snap any caller's request to the nearest allowed value); flagging this earlier in the API docs would save teams a 502 on first dispatch. Returning the rendered video as inline base64 was great for getting started but adds 33% transit overhead — a `gs://` storageUri option that Cloudinary's fetch-from-URL upload could consume server-to-server (skipping the local roundtrip entirely) would be the single biggest latency win for client-hosted backends on slow networks.

**Gemini 2.5 Pro + Flash via Vertex AI** were the LLM backbone. We used Pro for decompose (one-shot, cinematic synthesis is good with the long context) and Flash for the streaming per-beat conversation (lower latency, tool-calling is solid). The structured tool schema enforcement is rock-solid — Gemini honored 2-to-4-item array `min_items` / `max_items` constraints reliably across hundreds of calls. Streaming "thought" tokens via `GenerateContentConfig.thinking_config` gave us a transparency UX that turned the 3-8s latency into "the director is thinking" instead of "the app is frozen." If the Vertex SDK could expose tool-call streaming with intermediate argument deltas (the way it does for thoughts) we could land partial UI updates even faster.

**fal.ai** stayed in the codebase as a speedrun-tier fallback. Response time is impressively fast and the quality holds for a 2-minute demo flow.

**GitHub** remains the rock everything else stands on. No notes.

---

## Did you implement a generative AI model or API in your hack this weekend?

Yes, at every layer of the pipeline. SceneOS is a layered generative-AI system unified on Vertex AI:

- **Decompose** — Gemini 2.5 Pro one-shot tool call turns the master prompt into 5-7 beat scene specs plus a continuity bible (locking the protagonist's appearance, location, time-of-day arc, and palette so the same person walks through every beat instead of seven similar people).
- **Per-beat conversation** — Gemini 2.5 Flash streaming agent with a structured tool schema that always emits 2-4 suggested-answer pills the user can click instead of typing. Tier-aware question caps (2 for trailer, 3 for short film, 5 for movie) keep the demo timer honest. The streaming layer surfaces "thought" tokens during the 3-8s Gemini latency so the UI reads as active thinking instead of frozen.
- **Video generation** — Veo 3.1 Fast on Vertex AI by default (5× quota over the quality tier; toggleable to `veo-3.1-generate-001` for cinematic fidelity), with provider auto-fallback to fal.ai or a cached lane when quota / safety / network rejects. Every beat is dispatched concurrently the moment decompose returns, so renders happen in parallel with conversations.
- **Stitching** — Cloudinary `fl_splice` URL composition (no render farm, no FFmpeg, no encode wait) for the final cinematic + the in-canvas editor's deterministic re-bake on every decision change.

We used these models because the entire premise of SceneOS depends on collapsing a film crew into one creator's hands: the director conversation absorbs the cinematographer's vocabulary so the user never has to learn it, the video generation models take the camera-tight prompts that come out of that conversation and produce the actual footage, the continuity bible keeps the world consistent across beats, and the stitching layer turns those clips into a single shareable cinematic without the user ever leaving the browser tab. Unifying on Gemini + Vertex (instead of mixing Anthropic/OpenAI/Google) gave us one auth surface, one billing surface, and a clean fallback story when any single layer hiccups. Without generative AI at every layer, the product is a wrapper around a prompt textbox; with it, the product is a real production environment for one person, which is the entire pitch.
