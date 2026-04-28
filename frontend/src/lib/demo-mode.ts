/**
 * Demo-mode runtime — flips api.ts into deterministic, latency-bounded
 * mock responses for the LA Hacks live demo. The recorded YouTube demo
 * runs the real pipeline; this file is for the Science Fair stage and
 * Top 5 finalists ceremony, where wall-clock budget is fixed (~2.5 min)
 * and Veo's 90-180s render would torch the pitch.
 *
 * Demo mode is now ON BY DEFAULT — running `npm run dev` boots straight
 * into the cyberpunk-7 fixture flow with no query string required.
 * This is the right default for the LA Hacks live demo: no one has to
 * remember to type `?demo=1`, and there's no flicker of "real backend
 * unavailable" state during the pitch. To boot the real pipeline,
 * append `?live=1` to the URL.
 *
 *   • Default (no URL flag)  → demo mode active (cyberpunk7 fixture)
 *   • `?live=1`              → real pipeline (calls FastAPI backend)
 *   • `?demo=trailer5`       → legacy lighthouse 5-beat
 *   • `?demo=short3`         → legacy lighthouse 3-beat
 */

export type DemoFixtureId = "cyberpunk7" | "trailer5" | "short3" | "feature7";

export function isDemoMode(): boolean {
  // Build-time opt-out wins over everything else. CI / Vercel
  // production builds can ship with VITE_DEMO_MODE=0 to force the real
  // pipeline regardless of the URL.
  if (import.meta.env.VITE_DEMO_MODE === "0") return false;
  if (typeof window === "undefined") return false;
  // Test envs shim `window` for localStorage but don't add a real
  // `location` — return false so unit tests don't unintentionally
  // route api calls through demo mocks. Real browsers always have a
  // string `window.location.search` (possibly ""), so this branch
  // never fires in production.
  const search = (window as unknown as { location?: { search?: string } }).location?.search;
  if (typeof search !== "string") return false;
  const params = new URLSearchParams(search);
  // Explicit live override → leave demo mode.
  if (params.has("live")) return false;
  // Otherwise — demo by default.
  return true;
}

/**
 * Default fixture is `cyberpunk7` — the 7-beat sand-court cyberpunk
 * cinematic. ~2.5 min stage budget, drives "story" videoType (7 beats).
 *
 * `?demo=trailer5` — legacy 5-beat lighthouse short film.
 * `?demo=short3`   — legacy 3-beat trailer, fastest fallback.
 * `?demo=feature7` — alias for cyberpunk7 (kept for old URLs).
 */
export function getDemoFixtureId(): DemoFixtureId {
  if (typeof window === "undefined") return "cyberpunk7";
  const v = new URLSearchParams(window.location.search).get("demo");
  if (v === "short3" || v === "short" || v === "3") return "short3";
  if (v === "trailer5" || v === "trailer" || v === "5") return "trailer5";
  if (v === "feature7" || v === "feature" || v === "7") return "cyberpunk7";
  // No flag, ?demo=1, or ?demo=cyberpunk7 → default
  return "cyberpunk7";
}

/**
 * `?fast=1` — compresses the mock-render timeline 30%. Use only if
 * rehearsal shows you're behind the budget.
 */
export function isDemoFastMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("fast");
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Compressed render timeline for the mock api.status state machine.
 * Real Veo 3.1 Fast: 90-180s. Mock: ~22s (or ~15s in fast mode). The
 * stage-weighted progress curve in GenerationPanel makes this read
 * as honest because the bar already decelerates through the render
 * window — it just decelerates over 22s instead of 120s.
 *
 * 22s wasn't picked at random:
 *   • 10s and below felt obviously canned ("Veo doesn't render in 8s")
 *   • Above 30s eats the 2.5 min on-stage budget once you stack 7 beats
 *   • 22s is long enough that the user reads each stage label change
 *     (veo_pending → veo_running → cloudinary_uploading → done) and
 *     short enough that the parallel-pre-bake fast path keeps the
 *     overall demo flow under budget.
 *
 * The pacing emphasizes the parts judges care about:
 *   • 0-2.5s    queued        — "waiting for Veo capacity"
 *   • 2.5-6s    veo_pending   — "cold-starting Veo 3.1 Fast"
 *   • 6-15s     veo_running   — "rendering frames" (slowest visible phase)
 *   • 15-21s    cloudinary    — "uploading to CDN"
 *   • 22s       done          — clip URL revealed
 */
export interface RenderStage {
  atMs: number;
  status: "queued" | "running" | "succeeded";
  stage?: string;
}

export function renderTimeline(): RenderStage[] {
  const k = isDemoFastMode() ? 0.7 : 1.0;
  return [
    { atMs: 0, status: "queued" },
    { atMs: 2500 * k, status: "running", stage: "veo_pending" },
    { atMs: 6000 * k, status: "running", stage: "veo_running" },
    { atMs: 15000 * k, status: "running", stage: "cloudinary_uploading" },
    { atMs: 22000 * k, status: "succeeded", stage: "cloudinary_uploaded" },
  ];
}

/**
 * Total demo render duration in seconds. Used by the GenerationPanel's
 * elapsed-time display so the per-provider PROVIDER_BASE_SECONDS map
 * (which assumes a real ~150s Vertex run) can be overridden in demo
 * mode without polluting the production estimate.
 */
export function demoRenderTotalSeconds(): number {
  return isDemoFastMode() ? 15 : 22;
}

/**
 * Demo job registry — keyed by jobId. api.generate writes here, api.status
 * reads from here. Module-scoped so the mock state survives across calls
 * but is wiped on page reload (matches the real backend's _JOBS dict).
 */
interface DemoJob {
  startedAtMs: number;
  clipPublicId: string;
  clipUrl: string;
  lastFrameUrl?: string;
}

const DEMO_JOBS = new Map<string, DemoJob>();

export function registerDemoJob(jobId: string, job: DemoJob): void {
  DEMO_JOBS.set(jobId, job);
}

export function getDemoJob(jobId: string): DemoJob | undefined {
  return DEMO_JOBS.get(jobId);
}

/**
 * Resolve where a job is on the timeline given its dispatch time. Used
 * by the mocked api.status to return realistic stage transitions.
 */
export function resolveJobStage(
  job: DemoJob,
  now: number = Date.now(),
): { status: "queued" | "running" | "succeeded"; stage?: string } {
  const elapsed = now - job.startedAtMs;
  const tl = renderTimeline();
  let cur: RenderStage = tl[0];
  for (const s of tl) {
    if (elapsed >= s.atMs) cur = s;
  }
  return { status: cur.status, stage: cur.stage };
}

/**
 * Pull the active demo fixture's reference-image list for a given
 * manifest beat index. Used by the agent drawer to surface "Imagen
 * generated these character/location refs" thumbnails during the
 * thinking phase. Returns [] when the fixture has no refs (legacy
 * lighthouse fixtures), or when the index is out of range, or when
 * not in demo mode.
 */
export async function getDemoBeatReferences(
  beatIndexInManifest: number,
): Promise<{ url: string; label: string }[]> {
  if (!isDemoMode()) return [];
  const { DEMO_FIXTURES } = await import("./demo-fixtures");
  const fx = DEMO_FIXTURES[getDemoFixtureId()];
  const fb = fx.beats[beatIndexInManifest % fx.beats.length];
  return fb?.referenceImages ?? [];
}

/**
 * Pull the target Cloudinary public_id for a given manifest beat
 * index. Surfaced by the GenerationPanel's CloudinaryTrace so the
 * uploading reveal lands on a deterministic publicId rather than
 * waiting for /api/status to return one. Returns null when not in
 * demo mode (in real runs, the panel reveals from status payload
 * once cloudinary_uploaded fires).
 */
export async function getDemoBeatTargetPublicId(
  beatIndexInManifest: number,
): Promise<string | null> {
  if (!isDemoMode()) return null;
  const { DEMO_FIXTURES } = await import("./demo-fixtures");
  const fx = DEMO_FIXTURES[getDemoFixtureId()];
  const fb = fx.beats[beatIndexInManifest % fx.beats.length];
  return fb?.clipPublicId ?? null;
}

/**
 * Synchronous variant for callers that already have the fixture
 * imported. Less ergonomic — prefer the async helper for components
 * that aren't already importing demo-fixtures.
 */
export function getDemoBeatTargetPublicIdSync(
  fx: { beats: { clipPublicId: string }[] },
  beatIndexInManifest: number,
): string | null {
  return fx.beats[beatIndexInManifest % fx.beats.length]?.clipPublicId ?? null;
}
