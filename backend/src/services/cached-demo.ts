/**
 * Cached demo-project provider — the on-stage safety net.
 *
 * Tier 3: when GENERATION_PROVIDER=cached, /api/generate returns the
 * pre-rendered Cloudinary clip that matches the requested beat template.
 * No live model calls. No latency. The user's "render" still produces a
 * fl_splice URL; the only difference is that all five clips were rendered
 * the night before and uploaded to Cloudinary.
 *
 * Saturday-night protocol (see HACKATHON_STRATEGY §5):
 *   1. Pick the canonical demo prompt ("a lone astronaut on Mars").
 *   2. Run one full pipeline through Higgsfield with GENERATION_PROVIDER=higgsfield.
 *   3. Capture the resulting Cloudinary public_ids.
 *   4. Paste them into DEMO_TRAILER_CLIPS below.
 *   5. Verify each clip plays.
 *   6. Commit. The on-stage emergency switch is now ready.
 */
import type { JobStatus } from "../types/api.js";
import type { GenerateClipParams } from "./provider.js";

interface CachedClip {
  publicId: string;          // Cloudinary public_id, e.g. "sceneos/demo/trailer/establishing"
  clipUrl: string;           // full Cloudinary delivery URL
  durationSeconds: number;
}

/**
 * Fill these Saturday night after rendering the demo project.
 * Keys are beat templates; values are the rendered clip records.
 */
const DEMO_TRAILER_CLIPS: Record<string, CachedClip | undefined> = {
  // TODO(saturday-night): replace placeholders with real Cloudinary data.
  "trailer.establishing": undefined,
  "trailer.hook": undefined,
  "trailer.rising": undefined,
  "trailer.climax-tease": undefined,
  "trailer.sting": undefined,
};

const ACTIVE_JOBS = new Map<string, CachedClip>();

export async function generate(params: GenerateClipParams): Promise<{ jobId: string }> {
  const template = params.beatTemplate ?? "trailer.establishing";
  const cached = DEMO_TRAILER_CLIPS[template];
  if (!cached) {
    throw new Error(
      `services/cached-demo.ts: no cached clip for template "${template}". ` +
        `Render and populate DEMO_TRAILER_CLIPS before flipping GENERATION_PROVIDER=cached.`,
    );
  }
  const jobId = `${params.beatId}-${params.sceneId}-${Date.now()}`;
  ACTIVE_JOBS.set(jobId, cached);
  return { jobId };
}

export async function getStatus(
  jobId: string,
): Promise<{ status: JobStatus; clipUrl?: string; clipPublicId?: string; error?: string }> {
  const cached = ACTIVE_JOBS.get(jobId);
  if (!cached) return { status: "failed", error: "Unknown cached job" };
  // Cached jobs always succeed immediately — that's the whole point.
  return { status: "succeeded", clipUrl: cached.clipUrl };
}

/** Convenience for stitch tests — returns ordered public_ids of the demo trailer. */
export function demoOrderedPublicIds(): string[] {
  return [
    DEMO_TRAILER_CLIPS["trailer.establishing"]?.publicId,
    DEMO_TRAILER_CLIPS["trailer.hook"]?.publicId,
    DEMO_TRAILER_CLIPS["trailer.rising"]?.publicId,
    DEMO_TRAILER_CLIPS["trailer.climax-tease"]?.publicId,
    DEMO_TRAILER_CLIPS["trailer.sting"]?.publicId,
  ].filter((id): id is string => Boolean(id));
}
