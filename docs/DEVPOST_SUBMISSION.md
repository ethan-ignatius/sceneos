# SceneOS · Devpost Submission

> Copy-paste ready. Each section maps directly to its Devpost field.

---

## Elevator Pitch (200 char limit)

Powerful filmmaking, reimagined for one. SceneOS turns a single idea into a finished cinematic, collapsing a film crew, 24 hours of editing, and a cinematographer's vocabulary into one conversation.

*(199 / 200 chars)*

---

## Inspiration

While travelling on a bus, Alex recalled a video from Cluely's CEO discussing the rapidly rising demand for AI video generation. The CEO was openly hiring people who were especially good at AI video content creation, asserting that even companies with 100x the budget of Cluely would be hopping on this trend tenfold over the next year.

Previously, for Alex's own startup, he had used Higgsfield AI to generate the scenes for a movie trailer promoting a food nutritional app. The trailer leaned on a time-travel "come back to life" sequence. It worked, but it required meticulous planning, scripting, and Alex reliving the inner cinematographer he had only pretentiously studied back in 8th grade. Even after the AI handed him the clips, the final 2-minute trailer still cost 24 hours of editing in post-production software.

Alex and Vishnu spent close to 2 solid hours on their flight from Toronto, Canada to Los Angeles, plus the commute up to UCLA, working through the idea. By the end of the commute, the question had shifted. It was no longer "is this technically feasible." Google Vertex, Veo, and Higgsfield AI already solve the compute layer, the technical feasibility, and the cinematic output quality. The bottleneck was everything around them.

Then Ethan brought up the production math. According to industry estimates, a 30-second TV commercial typically runs anywhere from $50,000 to $500,000 or more in production cost, with the high end exceeding $1M. A music video usually lands between $20,000 and $1,000,000. An indie short film crew is 8 to 20 people: cinematographer, gaffer, editor, colorist, sound designer, foley artist, scriptwriter, and so on. Industry rule of thumb pegs editing time at 1 to 3 hours per minute of finished narrative content. Pre-production planning takes weeks. And even with AI video models like Veo and Higgsfield in the mix, a creator still needs at least an ounce of filmmaking literacy to direct the output. There is a real roadblock to access.

The question that fell out of that conversation was the one we built around. What if any individual with a single spark of creativity could reimagine or build a whole movie trailer, short film, or even an entire movie alone? No bringing clips into a video editor for 24 hours of editing. No hard-focusing the storyline through professional consultations or back-and-forth with a strong LLM. The whole pipeline lives inside one app, guided by one director conversation.

That is what SceneOS provides.

---

## What it does

SceneOS turns a single director's prompt into a finished cinematic short.

The user types one line. Something like "a 90s VHS recovery memory of the day my dog ran away." The app decomposes that prompt into 5 to 7 beats arranged on a 3D star-map canvas. Each beat is interrogated by a director-toned AI agent until the per-beat prompt is camera-tight. Each beat then generates a clip via Veo or fal.ai. The approved clips stitch into a final cinematic via Cloudinary's `fl_splice` URL transformation, which composes itself live in a chrome strip on the canvas as approvals land.

The user never sees a form longer than two fields. Never sees a pricing tier. Never logs in. They type one line, watch the canvas decompose, talk to the director agent, and walk away with a downloadable mp4.

The pitch in three numbers. The 2-minute trailer that previously cost Alex 24 hours of editing now takes the user roughly the length of a coffee. A typical commercial crew of 12 collapses to one person and one agent. The premise that "filmmaking literacy is required" stops being a wall and starts being optional.

The strategic frame matters here. SceneOS is not coming for the theatrical film industry. The theatrical film industry produces work that genuinely needs craft, time, and irreplaceable human taste, and we have nothing but respect for it. What SceneOS does is automate the volume layer underneath: the social-media volume, the brand content, the scrappy trailers, the influencer ads, the pitch decks for unfunded ideas, the music video drafts. Anyone who has watched a creator scale on TikTok, YouTube Shorts, or Reels already knows the truth: volume wins. The creator who organically ships 30 cinematic shorts in a month outpaces the creator who ships 3, regardless of how polished each piece is. Volume with cinematic fidelity beats craft alone, every time, in the social-media economy.

SceneOS is a volume engine with cinematic fidelity. It hands a single creator a production studio inside a browser tab.

That is what makes the product viable beyond a hackathon demo. The B2C use case (the creator with an idea at 2am) is obvious. The B2B layer (the agency that needs 50 product trailers, the brand that needs 200 social variants for a single campaign, the indie director who needs to mock up an entire pitch reel before pitching) follows naturally.

This submission lands in the **Flicker to Flow** track because SceneOS turns a flickering creative impulse into actual finished output without forcing the creator to context-switch through a video editor, a script doctor, and a cinematographer's vocabulary. It also lands in the **Cloudinary** track because the entire stitching layer is pure Cloudinary URL composition. No server-side rendering pass. No FFmpeg. The user's final cinematic is a single Cloudinary URL the user can copy and paste into a tweet, send to a brand, or embed in a portfolio. That URL composes itself live in front of the user as they approve beats, which is the most direct demonstration we could think of for what `fl_splice` actually unlocks.

---

## How we built it

The frontend is React 19 + Vite 7 + TypeScript 5.7 + Tailwind v4. Motion 12 handles state-driven animation. GSAP 3.12 carries the showpiece bridge transition between landing and canvas. The 3D canvas itself is React Three Fiber 9 plus drei 10, with a custom CameraRig replacing OrbitControls so the camera reads as a film camera, not a 3D viewport tool. Atmosphere shells, a holographic active overlay, drei Sparkles on the active beat, and a custom dashed-flow connecting path carry the visual weight without any postprocessing pipeline.

State lives in two Zustand v5 stores. One holds the manifest, the active beat, and the decompose status. The other holds preferences (mute, voiceover, reduced-motion override). Persistence runs through Zustand's persist middleware with `partialize`, which excludes transient UI state so a reload mid-decompose lands on idle, not eternal pending.

The chrome stack is opinionated. Lenis at App root for smooth scrolling. cmdk for a lazy-mounted command palette. A custom cinematic cursor that lerps slightly behind the actual mouse position. A persistent `fl_splice` URL strip that composes itself live as beats approve, animated with a per-character typewriter on each new tail segment plus an ember afterglow. A 1px hairline progress bar instead of a percentage meter for the director's questionnaire. A film-grain overlay at 6% opacity sitting above the 3D canvas and below all chrome.

The typography is a deliberate three-font system. Fraunces (variable, with the soft and wonk axes pushed) for display. Manrope (variable, semi-humanist) for body. Geist Mono for technical strings such as URLs, IDs, and timestamps. One uppercase tracking value of 0.18em across the entire app. Italics on connectives only, never on nouns or verbs. Smart quotes and proper en/em dashes everywhere.

Voice and vision land on the landing input. The Web Speech API drives recognition with an AnalyserNode-fed waveform visualization next to the input. Drag-drop reference images are sent to the agent as a vision input with a `[refs:N]` marker. Both are progressive enhancements; the core text flow does not require either to function.

The audio language is five synthesized cues built directly from the Web Audio API: approve, generate, land, confirm, failure. No sample files in the bundle. AudioParam modulation by an LFO gives the cues their alive, machine-working quality. Audio is opt-in (muted by default), persisted to localStorage.

The backend is FastAPI plus LangGraph. The agent is a state machine over a beat graph: pending, questioning, ready-to-generate, generating, preview, approved. Decompose runs through a structured LangGraph node that turns the master prompt into 5 to 7 beat-level scene specs. Per-beat questioning runs through a second graph that asks for the missing fields (lighting, framing, mood, sensory detail) until the prompt envelope is camera-tight. Generation hands off to Veo or fal.ai depending on a provider toggle. Stitching is pure URL composition through Cloudinary's `fl_splice` transformation: no server-side rendering, no FFmpeg, no waiting on a final encode.

Reduced motion is treated as a parallel design, not a checkbox. MotionConfig at the App root for Motion-driven animations. A matchMedia bridge for R3F's frame loop, GSAP timelines, autoplay video, and CSS keyframes. Every animation has a reduced-motion branch.

---

## Challenges we ran into

The frontend started generic. Default shadcn skin, Inter for body, Playfair-flavored serifs for display, Sparkles icons next to AI features. It read like every AI product in 2026. We threw the whole thing out and rebuilt typography, palette, motion language, and microcopy from a single thesis: "Tesla designing a Christopher Nolan trailer." That meant Fraunces plus Manrope plus Geist Mono with no Inter anywhere, warm-near-black at `#0a0908` (not cool-black, not pure black) with ember as the only accent, a four-reasons-only motion language (reveal, acknowledge, bridge, signal), and director-toned microcopy across every visible string. The audit-and-rebuild cycle ran three times before the typography actually held up at every size.

The 3D canvas hit four production crashes worth naming.

First, ResponsiveCamera was being silently overridden by a hardcoded camera position inside CameraRig, which meant portrait viewports kept cropping the outer beats no matter how the parent component computed FOV. The fix was passing `overviewZ` as a prop to CameraRig so both components agreed on the camera distance.

Second, `@react-three/postprocessing` 3.0.4 reads `.alpha` on a render-target that is null during the first commit on React 19 + R3F 9, crashing the canvas immediately. We removed the EffectComposer entirely and let the atmosphere shells, holographic active overlay, and Sparkles carry the visual weight. The cinematic register held without postprocessing.

Third, the per-character text animation on the headline was breaking words mid-character ("into" rendering as "int / o"). The fix was grouping characters by word into non-breaking inline-block containers so the browser could only break between words, never inside a word.

Fourth, Zustand v5 + React 19 + StrictMode crashes with max-update-depth on any selector that returns a fresh array on every call. The fix was `useShallow` from `zustand/react/shallow` on every fresh-array selector. This was non-obvious and took most of an afternoon to root-cause.

The backend was its own ride until we split the fast and slow paths. The decompose call from the landing route is fire-and-forget: the user submits, the bridge transition starts immediately, the API call resolves in the background, and the response patches into the manifest when it arrives. If the API fails, the user is already on the canvas with template defaults. The demo never blocks on the API. This single architectural decision saved the demo's viability when the live backend went down during testing.

We also had to think hard about what is feasible for a 2 to 5 minute live demo. Higgsfield AI produces the highest-quality cinematic output for filmmaking right now, but the latency is too long for a live demo. Veo is faster but still has noticeable latency on a single clip. fal.ai is the fastest with acceptable quality. So we built a provider toggle: a "best model" path for serious cinematic generation, and a "speedrun model" path for live demo and fast iteration. The toggle is exposed via the command palette so the presenter or user can switch on the fly. Same product, different pacing for different contexts.

Other rough edges we worked through along the way: optimistic agent messages that haunted the user when they closed the drawer mid-conversation (fixed with `cancelledRef` plus `mountedRef` on every async operation), a polling loop that kept firing after drawer unmount (fixed with cleanup setting `cancelRef.current` to true), a film-grain overlay at z-9999 that bled onto modals (dropped to z-15), an iOS keyboard pushing the landing input off-screen (`min-h-screen` swapped to `min-h-[100svh]`), bundle size creeping over our 200KB target (fixed by lazy-mounting the command palette and the entire 3D bundle).

---

## Accomplishments that we're proud of

We got the whole pipeline stitched together end to end: prompt to decompose to 3D canvas to per-beat conversation to clip generation to live URL stitching to final cinematic delivery. With mock and live modes. With reduced-motion fallbacks. With error boundaries protecting each stage so a single failure does not take down the demo.

We investigated the idea thoroughly before writing a single line of code. We spent close to 6 hours on the flight and the commute discussing pipeline architecture, design philosophy, market positioning, B2B versus B2C strategy, monetization tiers, and the "what would we ship if this were a real funded startup" thought experiment. That groundwork made every subsequent design decision faster and more confident, almost as if this were a startup planning sprint instead of a hackathon kickoff.

We treated the design bar as non-negotiable. Every screen had to work as a screenshot. Every microcopy string had to read in the director's voice. Every animation had to satisfy our four-reasons rule (reveal, acknowledge, bridge, signal). We threw out and rebuilt the typography pass three times before settling on Fraunces plus Manrope. We held the line on warm-near-black plus ember as the single accent across the entire app, even when "let's add purple for premium" was tempting.

We built three demo-winning moments and protected them ruthlessly: the landing-to-canvas portal, the 3D star-map first reveal, and the persistent Cloudinary URL strip composing itself live. Every chrome decision answered the same audit question: does this strengthen one of the three moments, or does it dilute them? If it dilutes, it does not ship.

---

## What we learned

We learned that SceneOS must offer value to its users by 1) stripping away the time needed to perform high-skill craft because that craft is automated, and 2) removing the prerequisite skill bar (video editing, cinematography, filmwriting) that gates high-volume cinematic content today.

We did not want SceneOS to be a wrapper that calls AI video creation. The wrapper has been tried; the wrapper is the bottom of the market. We wanted a guided, intuitive, clean, satisfying suite that goes from idea to completed video with every step in between automated or guided by the user's voice (with the option to type when the mic is unavailable). The director conversation is the differentiator. The 3D canvas is the differentiator. The persistent URL strip is the differentiator. The wrapper is a commodity.

We learned that the cinematic register is built by deletion, not addition. Every audit pass made things smaller, not bigger. Sparkles icons came out. Toast piles came out. Decoration motion came out. Half of the chrome came out. What remained earned its place.

We learned that demo-day calculus is its own product discipline. The 800ms perception threshold for any state change. The three winning moments protected through every chrome change. The mock-mode safety net for a backend failure mid-demo. The reduced-motion kill switch (`?nomotion=1`) for a stuttering projector. The pre-staged "this is on the roadmap" answer for the feature the judge asks about that we did not build.

And we learned that two co-founders sketching a startup on a flight, then shipping in 36 hours, is a rare and worth-protecting thing. The 6 hours of philosophy work paid off in every single design decision afterward.

---

## What's next for SceneOS

SceneOS intends to expand into a full suite that uses video generation APIs as the engine driving what modern post-production software does, focused entirely on AI. Three concrete next steps:

**1. Provider tiering and pricing.** A free tier on the speedrun model (fal.ai). A pro tier on the cinematic model (Veo, Higgsfield). A studio tier with batch generation, brand-kit imports, voiceover synthesis, and an export pipeline for editorial software (Premiere XML, Final Cut Pro XML). Pricing experiments will inform the product roadmap: which tier do creators stay in, which features pull them up, what is the right price point for the volume use case versus the cinematic use case.

**2. A B2B agency workflow.** Brands and agencies need 50 to 200 social-media variants for a single campaign. SceneOS's pipeline (one prompt to many beats to many clips to a stitched cinematic) is already a variant engine. The B2B layer adds brand-kit constraints, multi-variant prompt expansion, approval workflows for stakeholders, and rights-managed export. The B2B revenue per account dwarfs B2C, and the product is most of the way there.

**3. A multimodal director's notebook.** Today, the conversation is text-led with voice and vision as progressive enhancements. The next step is full multimodal direction. Drop a reference reel, the agent learns the visual language from it. Hum a melody, the agent picks a score direction. Sketch a storyboard panel, the agent matches framing across beats. The goal is the same one we started with: lower the prerequisite-skill bar to zero, while raising the ceiling of what one person can ship in a day.

The longer arc: SceneOS is a bet that the next decade of social-media content is dominated by individuals with cinematic taste and zero crew, and that the tooling layer between idea and finished cinematic is the one that defines who wins. We want to be that tooling layer.
