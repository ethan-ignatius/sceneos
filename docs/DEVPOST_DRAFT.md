# SceneOS — Devpost Submission Draft

> Working draft. Polish 30 minutes before submission. Last updated: 2026-04-25.

---

## Project name

**SceneOS — Direct your idea into a cinematic.**

---

## Tagline (max 200 chars on Devpost)

> Pizza-ordering simplicity for cinematic video. A node-canvas exploration of cinematography theory, an agent that asks just-enough questions, Higgsfield generation, Cloudinary URL-based stitching.

---

## Inspiration

The cinematic-video industry has a knowledge bottleneck, not a generation bottleneck. Sora 2, Veo 3.1, and Kling 3.0 can already render film-quality shots from prompts. What's still scarce is the human knowledge needed to *direct* those models — three-act structure, beats, conflict-resolution shape, framing language, pacing.

We watched friends drop $5K on a 90-second branded trailer that took six weeks. We watched indie filmmakers abandon scripts because they couldn't afford a DP. Meanwhile, the AI tools were *right there* — but the people who needed them most didn't know how to direct them.

So we built **SceneOS**: a tool that encodes cinematography knowledge directly into the UX, takes a creative idea as input, and renders a polished cinematic as output. Pizza-ordering simplicity, but for cinematic video.

---

## What it does

Type a creative prompt. Pick a video type (trailer, short, or feature). The page crumples away into a **3D canvas of glowing story-beat nodes** — Establishing, Hook, Rising, Climax Tease, Sting for trailers; three-act structure for features.

Click a node. A drawer opens. An **agent powered by GPT-4o** asks you cinematography questions — *just enough* questions, adapting to how specific your prompt was. Once it has enough, it builds a refined Higgsfield prompt and renders that beat as a 5–10 second cinematic clip.

Approve each beat. As you do, a **Cloudinary `fl_splice` URL** builds in real time in the Stitch Tray — your final cinematic is a single transformation URL. No render farm. No waiting.

Click "Render." The cinematic plays.

For power users, click "Open in CutOS" — your beats hand off seamlessly to a multi-track timeline editor with WebGL effects, 29-language dubbing, AI morph transitions, and semantic search across every clip.

---

## How we built it

### Frontend
- **Vite 7 + React 19 + TypeScript 5.7** — latest, fast HMR
- **Tailwind CSS v4** for styling, **shadcn/ui via 21st.dev** for owned components
- **Motion (formerly Framer Motion)** for choreographed UI animation
- **GSAP** for the page-crumple showpiece transition
- **React Three Fiber + drei + postprocessing** for the 3D beat-map canvas — Forza-style camera rig, GLSL post-processing, custom shaders for the node-glow bloom
- **Zustand** for state, **TanStack Query** for async
- **@cloudinary/react** + **@cloudinary/url-gen** for media

### Backend
- **Hono on Node + TypeScript** — lightweight, modern, hackathon-friendly
- **Cloudinary Node SDK** for server signing and URL construction
- **OpenAI GPT-4o** as the questionnaire agent
- **Higgsfield Cloud API** (with Segmind / Replicate fallbacks)

### The Cloudinary insight
The clever bit: we treat **Cloudinary's `fl_splice` transformation as our entire post-production pipeline**. The final cinematic is *not* a rendered file — it's a transformation URL. As clips approve, we append `l_video:<public_id>,fl_splice/` segments. Color grading per beat? `e_brightness:N,e_contrast:N`. Audio overlay? `l_audio:<id>`. CDN delivery is automatic.

The same primitives that would normally require Premiere, After Effects, and a render farm collapse into a single GET request. That's the magic.

### CutOS handoff (stretch)
SceneOS hands a manifest to **CutOS** (`POST /api/projects/import-manifest`), which loads every beat as a clip on a multi-track timeline. From there, the user gets the full editor — split, trim, effects, transitions, ElevenLabs dubbing, TwelveLabs semantic search.

---

## Challenges we ran into

1. **Higgsfield API maturity.** Documentation is uneven; the Python SDK exists but third-party gateways (Segmind, Replicate) needed as fallbacks. We built a provider-agnostic interface so the demo would survive whichever provider was up.
2. **The page-crumple transition.** We initially tried a CSS-only approach; ended up writing a custom GLSL shader with GSAP-driven uniforms. Worth it.
3. **Cloudinary `fl_splice` URL length.** With 7+ clips the URL gets long; we explored named transformation profiles to compress it.
4. **The R3F canvas + agent drawer simultaneously.** Three.js's render loop fights React's reconciliation; we use `useFrame` carefully and isolate UI overlays from the canvas tree.
5. **Information sufficiency thresholds.** Calibrating "how many questions is enough" — too few feels random, too many feels like a survey. We tuned per beat archetype.

---

## Accomplishments we're proud of

- **The page-crumple transition** is a literal showpiece. Judges will not have seen this elsewhere.
- **The 3D node canvas** runs at 60 fps on M1 / M2 / mid-range Windows. Lazy-loaded so the landing stays under 200 KB.
- **Cloudinary URL as the stitch engine** — collapses post-production to a GET request.
- **Provider-agnostic generation** — Higgsfield primary, Segmind/Replicate failover. Demo-day-resilient.
- **CutOS handoff** opens the door for power users without complicating the simple flow.
- **No generic UI anywhere.** Every screen is hand-tuned to a godly.website / awwwards quality bar.

---

## What we learned

- **The bottleneck isn't generation, it's direction.** Encoding domain knowledge into UX is a more durable competitive advantage than any single model integration.
- **Cloudinary is a programmable post-production API.** We had no idea `fl_splice` could carry a whole pipeline until we read the docs cover-to-cover.
- **Pizza-ordering simplicity is a real engineering constraint.** Every step we cut took two hours. Every step we shipped justified its existence.
- **Motion-as-language scales.** Once we'd locked in the spring/ease presets, every new component knew how to feel.

---

## What's next for SceneOS

- **Recursive beat trees** for full features — scenes inside acts, shots inside scenes.
- **Direct Higgsfield API tier** when the public API stabilizes — no third-party gateways.
- **Persistent projects + auth** via Supabase, mirroring CutOS.
- **Music & sound design** — a beat-aware generative score that responds to the cinematography.
- **Collaborative canvas** — multi-user direction, real-time presence on the beat tree.
- **Mobile creation** — at least viewing on phones; full creation might wait for a tablet build.

---

## Built with

`react` `react-19` `typescript` `vite` `tailwindcss` `motion` `gsap` `react-three-fiber` `three.js` `drei` `zustand` `tanstack-query` `cloudinary` `cloudinary-react` `hono` `node` `openai` `gpt-4o` `higgsfield` `cutos` `radix-ui` `lucide` `shadcn-ui` `21st.dev` `figma-make`

---

## Tracks submitted

- **Flicker To Flow** (Productivity) — main track
- **Cloudinary Company Challenge** — sponsor track
- **Best UI/UX**
- **Best Social Impact Hack** (democratizing cinematic storytelling)
- **High Quality Sponsormaxxing**
- **MLH: Best Domain Name from GoDaddy Registry**

---

## Cloudinary track-specific writeup

> *(Required for the Cloudinary Company Challenge submission.)*

### How we used Cloudinary

SceneOS uses Cloudinary as **the post-production pipeline itself**, not just for storage. Specifically:

1. **Storage** — every Higgsfield-generated MP4 lands in Cloudinary as `resource_type: video`, namespaced by project/beat/scene.
2. **Concatenation via `fl_splice`** — the final cinematic is a single transformation URL composed of `l_video:` + `fl_splice` segments per approved clip.
3. **Color grading per beat mood** — `e_brightness`, `e_contrast`, `e_saturation` transformations applied per clip based on its archetype (warm for hooks, cool for resolves).
4. **Audio overlay** — `l_audio:` for VO and ambient score.
5. **CDN delivery** — automatic, globally cached. The user's "render" button gives them a URL that streams from the nearest edge.
6. **React AI Starter Kit** — we used `create-cloudinary-react` as the project scaffold. The Cloudinary-specific Claude / Cursor rules saved hours of integration time.

### Our experience with the Starter Kit

The interactive setup was friction-free — we ran `npx create-cloudinary-react`, entered our cloud name, picked Claude as our AI assistant, and had a pre-configured `.env`, working `<UploadWidget>`, and `claude.md` rules in under 90 seconds. The Cloudinary-specific Claude rules were the unexpected highlight: when our agent was building transformation URLs, having those rules in-context meant fewer round-trips with the AI to get correct `fl_splice` syntax.

### What we'd give as feedback

- A canonical `<VideoPlayer>` component with custom controls would have saved us building one. (Maybe `@cloudinary/react`'s `<AdvancedVideo>` with skin slots?)
- More transformation examples for **video concatenation specifically** in the React Quick Start docs — `fl_splice` is in the URL reference but not the React-side examples.
- A built-in helper for `buildSpliceUrl(clipPublicIds[])` would have been a single-line solve. We wrote one — happy to PR if useful.

The kit was the right call. SceneOS would not have shipped in 36 hours without it.
