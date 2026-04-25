# SceneOS — Backend Architecture

> For Vishnu / Ethan / anyone wiring up `backend/`. Frontend is largely owned by Alex.
> Last updated: 2026-04-25.

This document is the source of truth for how SceneOS works server-side. The frontend treats the backend as a thin orchestration layer over three external systems: **Higgsfield** (video gen), **Cloudinary** (media + concat + CDN), and optionally **CutOS** (editor handoff).

---

## 1. Mission

Take a master prompt + a partially filled beat graph from the frontend, drive the Higgsfield jobs that turn each beat into a clip, persist those clips to Cloudinary, build a final concatenation URL via Cloudinary's `fl_splice` transformation, and (optionally) push the manifest to CutOS for power-user editing.

The backend should be **stateless where possible**. The beat graph + manifest live on the frontend (Zustand) and Cloudinary (clip URLs). The backend's only "memory" is in-flight Higgsfield jobs being polled.

---

## 2. System overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          SceneOS Frontend                                 │
│  Zustand stores:  promptStore │ beatGraphStore │ renderStore              │
│  R3F canvas, agent bubble UI, node detail drawers                         │
└─────────────────┬────────────────────────────────────────────────────────┘
                  │ HTTPS (TanStack Query)
                  │
┌─────────────────▼────────────────────────────────────────────────────────┐
│                     SceneOS Backend (Hono / Node)                         │
│  Routes:                                                                  │
│   • POST /api/agent           — next-question or sufficiency verdict      │
│   • POST /api/generate        — kick off Higgsfield job                   │
│   • GET  /api/status/:jobId   — poll job, return clip URL when ready      │
│   • POST /api/cloudinary/sign — return signed upload params (if signed)   │
│   • POST /api/stitch/url      — given a manifest, return final video URL  │
│   • POST /api/cutos/import    — handoff manifest to CutOS editor          │
│  Services (lib/):                                                         │
│   • higgsfield.ts │ cloudinary.ts │ cutos.ts │ agent.ts                   │
└──┬──────────────┬───────────────────────┬───────────────────────────────┘
   │              │                       │
   │              │                       │
┌──▼──────┐  ┌────▼─────────┐   ┌─────────▼──────────────────────────────┐
│Higgsfield│  │  Cloudinary  │   │             CutOS                       │
│  API    │  │  (Storage +  │   │  Next.js 16 + Supabase + Kling +        │
│         │  │  Transforms) │   │  ElevenLabs + TwelveLabs                │
│  • i2v  │  │ • upload     │   │  Endpoints we will use:                 │
│  • t2v  │  │ • fl_splice  │   │   POST /api/projects/import-manifest    │
│ (proxied│  │ • overlays   │   │   (NEW — must be added to CutOS)         │
│  by us) │  │ • CDN deliv. │   │   POST /api/agent (existing, optional)  │
└─────────┘  └──────────────┘   └─────────────────────────────────────────┘
```

---

## 3. Service responsibilities

### `services/higgsfield.ts`
- Single point of contact with Higgsfield's Cloud API.
- Exposes `generateClip({ prompt, beatId, durationSeconds }) → { jobId }` and `getJobStatus(jobId) → { status, clipUrl? }`.
- Handles retries, backoff, and **never** exposes the API key to the frontend.
- If the official Higgsfield API is unavailable on hackathon day, swap in **Segmind** ([Segmind I2V wrapper](https://www.segmind.com/models/higgsfield-image2video/api)) or **Replicate** as a fallback. Keep this provider-agnostic with a single interface.

### `services/cloudinary.ts`
- Wraps the `cloudinary` Node SDK with our cloud name + API secret.
- `signUpload(params) → signedParams` — when we use signed uploads (recommended even at hackathon scope, since presets-only allows abuse).
- `buildFinalUrl(manifest) → string` — constructs the `fl_splice` transformation URL from an ordered list of public_ids. **The final cinematic is just this URL.**
- `addAudioOverlay(url, audioPublicId)` — adds an overlay audio track for VO/score (`l_audio:<id>`).
- `addColorGrade(url, mood)` — applies a brightness/contrast/saturation transformation matching the beat mood.

### `services/cutos.ts`
- Posts a manifest to CutOS's `/api/projects/import-manifest` endpoint (see §11 — **CutOS team must add this**).
- Returns `{ projectId, editUrl }` so SceneOS can deep-link the user.

### `services/agent.ts`
- The questionnaire LLM. Wraps OpenAI GPT-4o (or Claude Sonnet — mirror whatever the team has keys for; CutOS uses `@ai-sdk/openai`).
- Stateless per call. Frontend sends the conversation history; agent returns the next question or the sufficiency verdict + a refined prompt for Higgsfield.
- Uses tool/function calling: `askQuestion(question)` or `markSufficient(refinedPrompt, sceneDescription)`.

---

## 4. Data model

Authoritative TypeScript in [`docs/SHARED_TYPES.md`](SHARED_TYPES.md). Summary:

```ts
// The whole project. Lives in frontend Zustand; backend treats it as the request body.
interface Manifest {
  projectId: string;          // uuid, generated client-side
  videoType: VideoType;       // "trailer" | "short" | "feature"
  masterPrompt: string;
  createdAt: string;          // ISO
  beats: Beat[];              // ordered
  finalCloudinaryUrl?: string;// computed via fl_splice when all beats are approved
}

interface Beat {
  beatId: string;
  beatName: string;           // "Establishing", "Hook", ...
  template: BeatTemplate;     // archetype id; informs agent prompt and node visual
  status: BeatStatus;         // "pending" | "questioning" | "generating" | "ready" | "approved"
  scenes: Scene[];            // length 1 unless we go recursive (feature mode)
}

interface Scene {
  sceneId: string;
  conversation: AgentTurn[];  // back-and-forth with the questionnaire agent
  refinedPrompt?: string;     // emitted when sufficiency is hit
  jobId?: string;             // Higgsfield job
  clipPublicId?: string;      // Cloudinary public_id once uploaded
  clipUrl?: string;           // Cloudinary delivery URL for preview
  durationSeconds?: number;
  approved: boolean;
}

type BeatTemplate =
  | "trailer.establishing" | "trailer.hook" | "trailer.rising" | "trailer.climax-tease" | "trailer.sting"
  | "short.hook" | "short.turn" | "short.payoff"
  | "feature.setup" | "feature.inciting" | "feature.rising" | "feature.midpoint"
  | "feature.crisis" | "feature.climax" | "feature.denouement";
```

---

## 5. API contract

All endpoints accept and return JSON. Errors are `{ error: string, details?: unknown }` with appropriate HTTP status.

### `POST /api/agent`
The per-beat questionnaire turn.

**Request**
```ts
{
  manifest: Manifest;          // entire current state
  beatId: string;              // which beat the user is exploring
  userMessage?: string;        // null = "give me the first question"
}
```

**Response (one of)**
```ts
// More info needed
{ kind: "question"; question: string; reasoning: string; estimatedRemaining: number }

// Done — agent has enough to render
{ kind: "sufficient"; refinedPrompt: string; sceneSummary: string; suggestedDuration: number }
```

The `reasoning` and `estimatedRemaining` fields drive frontend UI cues (the soft progress meter inside the node).

### `POST /api/generate`
Kicks off a Higgsfield job for one scene.

**Request**
```ts
{ projectId: string; beatId: string; sceneId: string; refinedPrompt: string; durationSeconds: number }
```

**Response**
```ts
{ jobId: string; provider: "higgsfield" | "segmind" | "replicate"; pollAfterMs: number }
```

### `GET /api/status/:jobId`
Polled every `pollAfterMs` (typically 5–10 s).

**Response**
```ts
{ status: "queued" | "running" | "succeeded" | "failed";
  clipUrl?: string;            // Cloudinary delivery URL once succeeded
  clipPublicId?: string;       // for fl_splice URL building
  error?: string }
```

When a job succeeds, the backend should:
1. Download the Higgsfield-hosted MP4
2. Upload to Cloudinary (resource_type: "video") with public_id = `sceneos/${projectId}/${beatId}/${sceneId}`
3. Return both URL and public_id to the frontend

### `POST /api/stitch/url`
Pure function: given a manifest, build the final Cloudinary URL.

**Request**: `{ manifest: Manifest }`
**Response**: `{ finalUrl: string; thumbnailUrl: string; durationSeconds: number }`

This endpoint does **no I/O**. It just constructs a URL. We expose it as an endpoint so the URL-construction logic lives in one place (the backend) and frontend doesn't need the Cloudinary node SDK.

The URL pattern is:

```
https://res.cloudinary.com/<cloud>/video/upload/
  fl_splice/  (base flag)
  l_video:<scene2_public_id>,fl_splice/   (each subsequent clip)
  l_video:<scene3_public_id>,fl_splice/
  ...
  <scene1_public_id>.mp4
```

Reference: [Cloudinary — Dynamically Trim and Concatenate Videos](https://cloudinary.com/documentation/video_trimming_and_concatenating).

### `POST /api/cutos/import`
Hands off the manifest to CutOS for fine editing.

**Request**: `{ manifest: Manifest }`
**Response**: `{ projectId: string; editUrl: string }`

Internally calls CutOS's `POST /api/projects/import-manifest` (see §11).

---

## 6. External integrations

### Generation provider tiering — `GENERATION_PROVIDER` env var

Generation is dispatched through `backend/src/services/provider.ts`, which reads `GENERATION_PROVIDER` and returns the active provider's `generate` / `getStatus` functions. Routes do not import provider-specific clients directly — they call `getProvider().impl.generate(...)`. This is what lets us flip tiers between Saturday's recording, Sunday's live demo, and on-stage emergency without code changes.

| Tier | Value | Characteristics | When to use |
|---|---|---|---|
| 1 | `higgsfield` (default) | Best quality (Sora 2 / Veo 3.1 / Kling 3.0 routed by Higgsfield). 60–180s per clip. | Recording the 2-minute demo video Saturday/Sunday morning. |
| 2 | `kling` | Direct Kling 3.0 API. ~15–30s per clip. Slightly lower visual quality than tier 1, normalised via Cloudinary color grade so it matches the recording. | Live on-stage demo. |
| 3 | `replicate` | Multi-model gateway. Use only if both Higgsfield AND Kling are down. | Emergency only. |
| 4 | `cached` | Returns pre-rendered Cloudinary public_ids from `services/cached-demo.ts`. Instant. | On-stage emergency switch — when *anything* else flakes. Render the demo project Saturday night, paste public_ids in, and you have a guaranteed working demo. |

**JobId encoding** — every `jobId` returned by `/api/generate` is `provider::providerJobId`. `/api/status/:jobId` decodes the prefix to dispatch — keeps the backend stateless across restarts.

**Color-grade normalisation** — when running `kling` for the live demo, the upload pipeline applies `e_brightness:N,e_contrast:N,e_saturation:N` per beat (mood-driven) so the on-stage output matches the LUT of the higgsfield-tier recorded clips. Judges shouldn't notice the tier switch.

### Higgsfield
- **Auth:** API key in `HIGGSFIELD_API_KEY` env var. Server-only. Never sent to the browser.
- **Models:** prefer Sora 2 or Veo 3.1 for quality if available; fall back to Kling 3.0 internally.
- **Latency:** Sora 2 / Veo 3.1 take 60–180 s per clip. Frontend polls; show choreographed loading state.
- **Failure:** if API errors or quota hits, the `kling` and `cached` tiers exist — flip the env var, redeploy in seconds.

### Cloudinary
- **Auth:** Cloud name + API key + API secret in env. Public cloud name is also fine to expose to frontend (it's in the URL).
- **Storage:** `resource_type: "video"`, naming convention `sceneos/{projectId}/{beatId}/{sceneId}`.
- **Upload preset:** create one named `sceneos_unsigned` for any client-side direct uploads (e.g., user-supplied reference media). Server-side uploads use signed credentials.
- **Concat:** `fl_splice` ([docs](https://cloudinary.com/documentation/video_trimming_and_concatenating)).
- **Overlays:** `l_video:` for clips, `l_audio:` for VO, `l_text:` for subtitle/captions.
- **Color grading per beat:** `e_brightness:N,e_contrast:N,e_saturation:N`.
- **CDN:** automatic. Final URL is globally cached.

### CutOS (optional handoff)
- **Endpoint we need them to add:** `POST /api/projects/import-manifest`
- **Payload we'll send:**

```ts
{
  projectName: string;
  resolution: "1920x1080";
  frameRate: 24;
  beats: Array<{
    beat_id: string;
    prompt: string;
    duration: number;
    clip_url: string;          // Cloudinary public delivery URL
    clip_storage_path?: string;
  }>;
}
```

- **Expected response:** `{ projectId: string }` so we can redirect to `https://cutos.example/projects/{projectId}`.
- See CutOS recon (CONTEXT §10 changelog) for the existing data shape we should produce.

### OpenAI / Anthropic (questionnaire agent)
- **Auth:** `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
- **Model:** GPT-4o (fast, cheap, mirrors CutOS) or Claude Sonnet 4.6 (better at structured tool calls). Both work.
- **Prompt strategy:** stateless per call; system prompt explains the beat archetype and the sufficiency criteria; user message is the current `Manifest` + the beat being explored.

---

## 7. Storage & state

| Data | Where it lives | Why |
|---|---|---|
| Master prompt, beat graph, conversation history | Frontend Zustand + `localStorage` | Hackathon scope, no auth, no DB needed |
| Generated clips (.mp4) | Cloudinary | CDN, transforms, concat all in one |
| Higgsfield job IDs | Backend in-memory (Map) | Short-lived, fine to lose on restart |
| Final cinematic URL | Constructed on-demand from the manifest | No persistence needed — the URL is deterministic |
| Project metadata for CutOS handoff | CutOS's Supabase | CutOS already owns persistence |

If we want resilience across browser refresh: persist the manifest to `localStorage` keyed by `projectId`. That's it. No auth, no Supabase for SceneOS itself.

---

## 8. Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Higgsfield job times out (>5 min) | Backend polling loop | Mark job failed, surface error in frontend node UI; offer "regenerate" button |
| Higgsfield API quota exceeded | 429 from Higgsfield | Auto-fallback to Segmind/Replicate provider (config flag) |
| Cloudinary upload fails | Server SDK error | Retry up to 2 times with exponential backoff; if still failing, surface error |
| Agent LLM returns malformed JSON | Validation via Zod | Re-call with a "format your reply as valid JSON" reminder |
| User refreshes mid-generation | Manifest hydration from `localStorage` | Re-attach to existing `jobId` via `/api/status` |

---

## 9. Auth / security (hackathon-mode)

- No user accounts. No login. Single-session.
- All API keys (Higgsfield, Cloudinary secret, OpenAI) live server-side only.
- CORS: open `*` for the demo origin only. Tighten for any post-hackathon deploy.
- Rate limiting: not in scope for hackathon, but if we deploy publicly, gate `/api/generate` behind a simple per-IP token bucket.

---

## 10. Implementation order (recommended)

For Vishnu / Ethan:

1. **Day 1 morning** — `services/cloudinary.ts` + `POST /api/stitch/url`. This is pure-function-y and easiest to test. Get it producing a valid `fl_splice` URL given mock public_ids.
2. **Day 1 mid** — `services/higgsfield.ts` + `POST /api/generate` + `GET /api/status/:jobId`. End-to-end one-clip flow first; do not parallelize multiple clips until that works.
3. **Day 1 afternoon** — `services/agent.ts` + `POST /api/agent`. Get one beat's questionnaire converging on a refined prompt.
4. **Day 1 evening** — wire frontend → backend for one beat → one clip → final URL.
5. **Day 2 morning** — multi-beat parallel generation, Cloudinary concat with all real clips.
6. **Day 2 morning, stretch** — `POST /api/cutos/import` (only if CutOS team adds the endpoint in time).

---

## 11. Outstanding asks of CutOS team

CutOS does not currently expose a manifest-import endpoint. If we want the editor handoff in the demo, the CutOS team needs to add:

```ts
// POST /api/projects/import-manifest
// in app/api/projects/import-manifest/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { projectName, resolution, frameRate, beats } = await req.json();
  // 1. Create a `projects` row (lib/projects.ts → createProject)
  // 2. For each beat, insert into project's media[] with storageUrl = beat.clip_url
  // 3. Build clips[] sequentially on V1 starting at t=0, lengths = beat.duration
  // 4. Return { projectId }
}
```

If that endpoint isn't ready by Day 2 noon, drop the CutOS handoff feature for the demo and pitch it as "next steps" on Devpost.

---

## 12. Out of scope (this hackathon)

- User authentication / accounts
- Multi-user collaboration
- Project saving across sessions for multiple users
- Stripe / billing
- Mobile responsive design (canvas is desktop-only at MVP)
- Internationalization (English only — though CutOS dubbing supports 29 languages, we don't expose that as a SceneOS feature for v0)
- Custom training / fine-tuning
- Video format options other than 1080p / 24fps
