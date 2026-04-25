# SceneOS · Devpost Submission

> Copy-paste ready. Each section maps directly to its Devpost field.

---

## Elevator Pitch (200 char limit)

Powerful filmmaking, reimagined for one. SceneOS turns one idea into a finished cinematic, collapsing a film crew, 24 hours of editing, and a cinematographer's vocabulary into one creator's hands.

*(189 / 200 chars)*

---

## Inspiration

While travelling on a bus, Alex recalled a video from Cluely's CEO discussing the rapidly rising demand for AI video generation, and how the CEO was openly hiring people who were especially good at AI video content creation, asserting that even companies with 100x the budget of Cluely would be hopping on this trend tenfold over the next year.

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

The frontend is React 19 + Vite 7 + Tailwind v4, with Motion 12 driving state-based animation and GSAP 3.12 carrying the showpiece bridge transition between landing and canvas, while the 3D canvas runs on React Three Fiber 9 + drei 10 with a custom CameraRig replacing OrbitControls so the camera reads as a film camera rather than a 3D viewport. State lives in two Zustand v5 stores (manifest and preferences), the chrome stack pairs Lenis-driven smooth scroll with a lazy-loaded cmdk command palette, a custom cinematic cursor that lerps slightly behind the mouse, and a persistent `fl_splice` URL strip that composes itself live as beats approve, and the typography is a deliberate three-font system of Fraunces (display), Manrope (body), and Geist Mono (technical strings) with one uppercase tracking value of 0.18em and italics reserved for connectives. Voice and vision are progressive enhancements at the landing input through the Web Speech API and drag-drop reference images, and the audio language is five cues synthesized directly from the Web Audio API rather than sample files.

The backend is FastAPI + LangGraph, with the agent modelled as a state machine over a beat graph (pending, questioning, ready-to-generate, generating, preview, approved): decompose runs through a structured LangGraph node that turns the master prompt into 5 to 7 beat-level scene specs, per-beat questioning probes for missing fields like lighting, framing, mood, and sensory detail until the prompt envelope is camera-tight, and generation hands off to Veo or fal.ai depending on a provider toggle. Stitching is pure URL composition through Cloudinary's `fl_splice`, so there is no server-side rendering, no FFmpeg, and no waiting on a final encode.

---

## Challenges we ran into

The frontend started generic, with the default shadcn skin, Inter for body, Playfair-flavored serifs for display, and Sparkles icons next to AI features, and it read like every other AI product in 2026, so we threw the whole thing out and rebuilt typography, palette, motion language, and microcopy from a single thesis ("Tesla designing a Christopher Nolan trailer"), running three full audit-and-rebuild cycles before the system actually held up at every size. The 3D canvas hit four production crashes worth naming: a hardcoded CameraRig position that silently overrode our ResponsiveCamera computation on portrait viewports (resolved by passing the camera distance as a prop), a first-commit null crash inside `@react-three/postprocessing` 3.0.4 under React 19 + R3F 9 (resolved by removing the entire EffectComposer and letting atmosphere shells and the holographic active overlay carry the visual weight), a per-character text animation that broke words mid-character (resolved by grouping characters into non-breaking inline-block word containers), and a Zustand v5 + StrictMode max-update-depth crash on fresh-array selectors (resolved with `useShallow` from `zustand/react/shallow`).

The backend was its own ride, and the architectural call we are proudest of is the fast/slow path split: the decompose call from the landing route is fire-and-forget, so the user submits, the bridge transition starts immediately, and the API resolves in the background to patch the manifest when it arrives, which means that if the API ever fails the user is already on the canvas with template defaults and the demo never blocks on the API. We also had to think hard about what is actually feasible for a 2-to-5-minute live demo, because while Higgsfield produces the highest-quality cinematic output for filmmaking right now its latency is too long for live demo, Veo is faster but still noticeable, and fal.ai is the fastest with acceptable quality, so we built a provider toggle exposed via the command palette with a "best model" path for serious cinematic generation and a "speedrun model" path for live demo and fast iteration.

---

## Accomplishments that we're proud of

We got the entire pipeline stitched together end to end (prompt to decompose to 3D canvas to per-beat conversation to clip generation to live URL stitching to final cinematic delivery, with mock and live modes, reduced-motion fallbacks, and error boundaries protecting every stage), and we did it on the back of close to 6 hours of pre-build investigation on the flight and commute, where we worked through pipeline architecture, design philosophy, market positioning, B2B-versus-B2C strategy, and the "what would we ship if this were a real funded startup" thought experiment almost as if this were a startup planning sprint instead of a hackathon kickoff. We also held the design bar as non-negotiable across the whole build, holding every screen to the screenshot test, every microcopy string to the director's voice, and every animation to the four-reasons rule, while ruthlessly protecting the three demo-winning moments (the landing-to-canvas portal, the 3D star-map first reveal, and the live Cloudinary URL strip composing itself in real time).

---

## What we learned

We learned that SceneOS must offer value to its users by both stripping away the time needed to perform high-skill craft (because that craft is automated) and removing the prerequisite skill bar (video editing, cinematography, filmwriting) that gates high-volume cinematic content today. We did not want SceneOS to be a simple wrapper that calls AI video creation, because the wrapper has been tried and the wrapper is the bottom of the market; we wanted a whole guided, intuitive, clean, satisfying suite that goes from idea to completed video with every step in between automated or guided by the user's thoughts projected through their voice, with the option to type when the mic is unavailable. The director conversation, the 3D canvas, and the persistent URL strip are the real differentiators, while the wrapper underneath is a commodity.

We also learned that the cinematic register is built by deletion rather than addition, that demo-day calculus is its own product discipline (the 800ms perception threshold, the three protected moments, the mock-mode safety net for a backend failure mid-demo, the reduced-motion kill switch for a stuttering projector), and that two co-founders sketching a startup on a flight then shipping in 36 hours is a rare and worth-protecting thing, because the 6 hours of philosophy work we did up front paid off in every single design decision afterward.

---

## What's next for SceneOS

SceneOS intends to expand into a full suite that uses video generation APIs as the engine driving what modern post-production software does, focused entirely on AI, with stronger models, pricing tiers, and deliberate B2B and B2C positioning. Three concrete next steps:

**1. Provider tiering and pricing.** A free tier on the speedrun model (fal.ai), a pro tier on the cinematic model (Veo, Higgsfield), and a studio tier with batch generation, brand-kit imports, voiceover synthesis, and export pipelines for editorial software (Premiere XML, Final Cut Pro XML), with pricing experiments informing which tier creators stay in and what the right price is for the volume use case versus the cinematic one.

**2. A B2B agency workflow.** Brands and agencies routinely need 50 to 200 social-media variants for a single campaign, and SceneOS's pipeline (one prompt to many beats to many clips to one stitched cinematic) is already a variant engine, so the B2B layer adds brand-kit constraints, multi-variant prompt expansion, stakeholder approval workflows, and rights-managed export, while the per-account revenue dwarfs B2C.

**3. A multimodal director's notebook.** Today the conversation is text-led with voice and vision as progressive enhancements, but the next step is full multimodal direction: drop a reference reel and the agent learns the visual language from it, hum a melody and the agent picks a score direction, sketch a storyboard panel and the agent matches framing across beats, all with the same goal we started with, which is to lower the prerequisite-skill bar to zero while raising the ceiling of what one person can ship in a day.

The longer arc is that SceneOS is a bet that the next decade of social-media content is dominated by individuals with cinematic taste and zero crew, and that the tooling layer between idea and finished cinematic is the one that defines who wins. We want to be that tooling layer.
