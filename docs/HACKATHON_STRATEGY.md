# SceneOS — LA Hacks 2026 Strategy

> Last updated: 2026-04-25. **Deadline: 2026-04-26 11:00am EDT.**

This document is the playbook: track choices, judging-criteria mapping, cross-prize plays, day-by-day plan, and the submission checklist.

---

## 1. Track decisions

### Main track: **Flicker To Flow** (Productivity)

> *"With all the chaos of the world, how can we turn the flickers into a flowstate? Use this track to focus on enhancing how we work, play, and connect."*

**Why this track:**
- The track explicitly asks for *"transforming friction into function."* Cinematic video production is one of the highest-friction creative workflows in the world (4–8 weeks, multiple specialists, $10–100K). SceneOS compresses that to a flow-state experience under 15 minutes.
- Productivity is the most generous interpretation track for creative tooling — and our product is, fundamentally, a productivity tool for creators.
- Less crowded than Light The Way (education) and Catalyst For Care (healthcare) which tend to attract the bulk of "save the world" projects.

### Sponsor track: **Cloudinary Company Challenge** ($2K + $500 Amazon gift card per team member)

> *"Leverage Cloudinary's React AI Starter Kit to create a groundbreaking application. Demonstrate how Cloudinary's powerful media platform can be used to build beautiful, performant, innovative web experiences."*

**Why this track:**
- Cloudinary maps **perfectly** to our architecture. We use it for:
  1. Storing every Higgsfield-generated clip (resource_type: video)
  2. Transforming clips (color grade, overlays) per beat mood
  3. **Concatenating the final cinematic via `fl_splice`** — this is the showpiece. The "stitch button" is literally a URL construction. No backend job, no waiting.
  4. CDN delivery to the user's browser
  5. Audio overlay (`l_audio:`) for VO/music
- The track wants **"production-ready"** — the URL-based stitch is exactly that.
- The starter kit (`create-cloudinary-react`) gives us React 19 + Vite 6 + TS preconfigured, plus Cloudinary best-practice scaffolding.
- $500 per teammate in Amazon gift cards is a real incentive at a 3-person team.

**How we frame the Cloudinary story for judges:**

> "We don't just store clips on Cloudinary — we use it as the **post-production pipeline itself**. Every cinematic SceneOS produces is a single Cloudinary transformation URL. The same primitives that would normally require Premiere, After Effects, and a render farm — concatenation, color grade, audio overlay, CDN delivery — collapse into a programmable URL. That's the magic."

---

## 2. Cross-prize plays (low cost, high upside)

These are prizes we can pursue without significantly altering our core build. Free upside.

### **Best UI/UX** (Wacom Intuos drawing tablet)
- **Effort:** zero extra. The product is already built around an award-winning UI bar (godly.website / awwwards / 21st.dev).
- **What to emphasize on Devpost:** the page-crumple transition, the R3F beat-map exploration, the choreographed agent bubbles, the cloud-like node expand/contract.

### **Best Use of ElevenLabs** (wireless earbuds, MLH)
- **Effort:** medium. ElevenLabs integration lives in CutOS (29-language dubbing, voice isolation). If we wire up the CutOS handoff and demonstrate dubbing one beat in the demo, we qualify.
- **Cost-benefit:** worth it ONLY if the CutOS handoff endpoint lands in time (see `BACKEND_ARCHITECTURE.md` §11). If not, skip and don't claim.

### **Organizers' Choice** (Magcubic projector)
- **Effort:** zero. Subjective award; we win by being polished and original.

### **High Quality Sponsormaxxing** (Amazon Echo Show)
- **Effort:** zero — we're naturally using Cloudinary heavily and can name-drop ElevenLabs (via CutOS), Higgsfield, and React 19.
- **Strategy:** be tasteful in the Devpost — list the integrations honestly, don't oversell.

### **Best Social Impact Hack** (JBL Flip 5)
- **Effort:** narrative-only. Pitch SceneOS as **democratizing cinematic storytelling for under-resourced creators** (indie filmmakers, small nonprofits, educators who can't afford production teams).
- This is a credible angle — we can frame it as "reducing the $10–100K barrier to entry for cinematic communication."

### **MLH: Best Domain Name** (GoDaddy Registry gift card)
- **Effort:** 5 minutes. Register `sceneos.video` or `sceneos.directs` or similar via GoDaddy. Free MLH credits make it free.

### **Best Use of MongoDB Atlas** (M5Stack IoT Kit, MLH)
- **Effort:** medium. We don't currently need MongoDB. **Skip.** Don't bend the architecture for a kit.

### **Most Questionable Use of 36 Hours** (inflatable dinosaur costume)
- **Effort:** zero. Joke prize; if we win it, great.

---

## 3. Judging criteria — how we score on each

LA Hacks rubric (from the Devpost):

### **Technical Depth**
> *"Does the team go beyond simple integrations or templates to demonstrate real technical understanding?"*

**Our story:**
- **Multi-provider AI orchestration:** Higgsfield primary, Segmind/Replicate fallback, OpenAI/Claude for the questionnaire agent. Provider-agnostic interface.
- **Cinematography theory encoded as a beat-template DSL.** Not just calling an API — we have an opinionated layer above generation models.
- **Cloudinary `fl_splice` as a stitching DSL.** We compose final videos as transformation URLs. Programmable post-production.
- **3D React Three Fiber canvas** with custom GLSL post-processing, Forza-style camera rig.
- **GSAP page-crumple transition** via custom shader.
- **Real-time agent questionnaire** with adaptive sufficiency thresholds.

### **Product Thinking & Impact**
> *"Strong projects show thoughtful product design, a clear use case, and a believable real-world impact."*

**Our story:**
- Replace $10K–$100K-per-finished-minute professional pipelines.
- "Pizza-ordering simplicity" — Tesla took 21 steps; SceneOS takes 7.
- Real users: indie creators, marketers, educators, small nonprofits, startup founders making explainer videos.

### **Execution & Polish**
> *"How well was the idea executed? Working functionality, smooth demo, cohesive product experience."*

**Our story:**
- The product is the demo. The page-crumple transition + R3F canvas + cinematography agent + final Cloudinary URL is the entire pitch.
- Choreographed motion at every interaction.
- Hardened happy-path: even if Higgsfield fails, fallback providers keep the demo running.

### **Originality & Insight**
> *"Creative thinking, clever implementations, or unique insights that make the project stand out."*

**Our story:**
- **The wedge:** *cinematography theory as a navigable canvas*. No competitor does this.
- **The insight:** the bottleneck isn't generation, it's direction.
- **The clever implementation:** Cloudinary URL-based stitching collapses the post-production pipeline into a single GET request.

---

## 4. Tracks we explicitly skip

| Track | Why skip |
|---|---|
| Sustain The Spark (Sustainability) | Forced fit — we'd be greenwashing |
| Catalyst For Care (Healthcare) | Forced fit; no medical angle |
| Light The Way (Education) | Plausible angle but Flicker To Flow is a stronger narrative match |
| ROBLOX Civility | Wrong platform |
| ASUS (local AI on hardware) | We're cloud-first; opposite premise |
| Cognition (AI for coding agents) | Wrong domain |
| Fetch.ai / Agentverse | Possible if we register the questionnaire agent on Agentverse — but it's a real engineering detour. Re-evaluate Day 2 morning if we have spare cycles. |
| World U (WorldID humans-only) | Doesn't fit our use case |
| Zetic (on-device AI) | Wrong premise |
| Arista (networking) | Wrong domain |
| Figma Make | Possible documentation play — if we use Figma Make at any step, capture screenshots and submit. Free upside, low effort. |
| Solana / Vultr / Gemma | No clear fit |

---

## 5. Day-by-day plan

> **Hard deadline: Sun 2026-04-26 11:00am EDT.** Submission needs Devpost page + GitHub link + 2–3 min demo video + in-person presence at Pauley Pavilion.

### Saturday 2026-04-25 (now)
- **Done:** Repo, CONTEXT, all docs, frontend skeleton, backend skeleton, prize-track decision, settings (no Claude attribution), memories. ✅
- **Evening (Alex):** Google Stitch session — generate the visual prototypes for Landing, Canvas, Node Detail, Agent Bubbles. Use prompts in `STITCH_PROMPTS.md`. Iterate to taste.
- **Evening (Vishnu/Ethan):** wire `services/cloudinary.ts` + `POST /api/stitch/url`. Test with mock public_ids — confirm a real `fl_splice` URL plays end-to-end.
- **Late evening:** Sleep. Tomorrow is execution.

### Sunday 2026-04-26 — execution day

| Time (EDT) | Task | Owner |
|---|---|---|
| 00:00–02:00 | Implement Landing + Crumple transition (GSAP showpiece) | Alex |
| 02:00–04:00 | R3F canvas + node mesh + camera rig | Alex |
| 00:00–04:00 | Higgsfield service + `/api/generate` + `/api/status` | Vishnu |
| 00:00–04:00 | Agent service + `/api/agent` + sufficiency logic | Ethan |
| 04:00–05:30 | Wire one full happy-path: prompt → 1 beat → 1 clip → Cloudinary | All |
| 05:30–07:00 | Multi-beat parallel generation; `fl_splice` end-to-end | All |
| 07:00–08:30 | Polish: agent bubbles, node breathe loop, color grade per beat | Alex |
| 07:00–08:30 | Demo project preset (a known-good prompt that always renders well) | Vishnu |
| 08:30–09:30 | Record 2-min demo video (see `DEMO_PHILOSOPHY.md`) | All |
| 09:30–10:30 | Devpost write-up (use `DEVPOST_DRAFT.md` as starting point) | All |
| 10:30–10:55 | Final submission — push, double-check repo public, paste links | All |
| 11:00 | **Deadline.** |

If we slip: cut the CutOS handoff first, then drop multi-beat parallelism (do them sequentially), then drop the recursive feature mode (only ship trailer + short).

---

## 6. Submission checklist

Per LA Hacks rules:

- [ ] Project Description on Devpost — explain what it does, problem solved, which track, company-challenge alignment
- [ ] Public GitHub repo (`https://github.com/ethan-ignatius/sceneos`) — well-documented (CONTEXT.md is the reading order)
- [ ] Demo Video (2–3 min) — see `DEMO_PHILOSOPHY.md`
- [ ] Devpost page complete — summary, technologies, additional resources (Figma if used)
- [ ] In-person presence at Pauley Pavilion judging phase (mandatory for prize eligibility)
- [ ] **Cloudinary track:** explicit mention of how Cloudinary was used and a paragraph on the team's experience with the React AI Starter Kit

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Higgsfield API access blocked or slow on demo day | Provider abstraction → swap to Segmind/Replicate. Keep a pre-rendered backup demo video. |
| Cloudinary upload preset misconfigured | Configure Saturday evening; test signed + unsigned paths. |
| 3D canvas performance bad on judges' laptops | R3F bundle is lazy-loaded; offer a 2D fallback canvas (React Flow or SVG). |
| Page-crumple transition too ambitious | Simplify to a CSS-only dissolve as a Plan B. Do the crumple last. |
| One teammate down (sick, sleep) | All shared services are interface-bound; anyone can pick up another's stub. |
| Demo video re-records eat into time | Lock the demo script Saturday evening; shoot once, edit minimally. |

---

## 8. North-star metric for the demo

If a judge has watched our demo, they should remember exactly **one** image: the page crumpling away, revealing a 3D canvas of glowing story-beat nodes, with the final Cloudinary URL building in real time as nodes lock in.

If we ship that one image, we win the room.
