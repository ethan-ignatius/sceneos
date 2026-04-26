/**
 * Demo-mode runtime — flips api.ts into deterministic, latency-bounded
 * mock responses for the LA Hacks live demo. The recorded YouTube demo
 * runs the real pipeline; this file is for the Science Fair stage and
 * Top 5 finalists ceremony, where wall-clock budget is fixed at 2-3 min
 * and Veo's 90-180s render would torch the pitch.
 *
 * Activation:
 *   • Build:   VITE_DEMO_MODE=1 in .env / vercel env
 *   • Runtime: ?demo=1 (or ?demo=trailer5 / ?demo=short3) on the URL
 *
 * The runtime toggle is the on-stage primitive — flip between mocked
 * and real on the same deployed build by changing the URL.
 */

export type DemoFixtureId = "trailer5" | "short3" | "feature7";

export function isDemoMode(): boolean {
  if (import.meta.env.VITE_DEMO_MODE === "1") return true;
  if (typeof window === "undefined") return false;
  // Test envs shim `window` for localStorage but don't add a real
  // `location` — guard so we don't throw "Cannot read 'search' of
  // undefined" inside vitest. Real browsers always have window.location.
  const search = (window as unknown as { location?: { search?: string } }).location?.search;
  if (typeof search !== "string") return false;
  return new URLSearchParams(search).has("demo");
}

/**
 * Default fixture is `trailer5` — the 5-beat short film. Best balance
 * of demo length (~50s of mocked render time) vs. narrative payoff.
 *
 * `?demo=short3` — fastest, 3-beat trailer, ~30s render time.
 * `?demo=feature7` — full lighthouse 7-beat arc, ~70s render time.
 *                    Only use this if you have the full 3-min Round-2 slot.
 */
export function getDemoFixtureId(): DemoFixtureId {
  if (typeof window === "undefined") return "trailer5";
  const v = new URLSearchParams(window.location.search).get("demo");
  if (v === "short3" || v === "short" || v === "3") return "short3";
  if (v === "feature7" || v === "feature" || v === "7") return "feature7";
  // ?demo=1 or ?demo=trailer5 → default
  return "trailer5";
}

/**
 * `?demo=1&fast=1` — compresses the mock-render timeline 30%. Use only
 * if rehearsal shows you're behind the 2-min Round-1 budget.
 */
export function isDemoFastMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("fast");
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Compressed render timeline for the mock api.status state machine.
 * Real Veo 3.1 Fast: 90-180s. Mock: 9s (or 6.3s in fast mode). The
 * stage-weighted progress curve in GenerationPanel makes this read
 * as honest because the bar already decelerates through the render
 * window — it just decelerates over 9s instead of 120s.
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
    { atMs: 1500 * k, status: "running", stage: "veo_pending" },
    { atMs: 3500 * k, status: "running", stage: "veo_running" },
    { atMs: 7000 * k, status: "running", stage: "cloudinary_uploading" },
    { atMs: 9000 * k, status: "succeeded", stage: "cloudinary_uploaded" },
  ];
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
