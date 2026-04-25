/**
 * Kling AI video-generation service — live-demo tier.
 *
 * Direct Kling API for image-to-video / text-to-video. ~15–30s per clip,
 * lower bandwidth than going through Higgsfield. Output goes through
 * Cloudinary's color-grade transformations to bring it to parity with the
 * higher-tier recorded-demo output (LUT match — see HACKATHON_STRATEGY §7).
 *
 * Owner: Vishnu (skeleton wiring), Ethan (color-grade tuning)
 *
 * Reference:
 *   https://api-singapore.klingai.com (CutOS uses the same endpoint for morphs)
 *   CutOS' implementation: app/api/kling/route.ts (JWT signing pattern to mirror)
 */
import type { JobStatus } from "../types/api.js";
import { encodeJobId, type GenerateClipParams } from "./provider.js";

export async function generate(_params: GenerateClipParams): Promise<{ jobId: string }> {
  // TODO(vishnu): JWT sign with KLING_ACCESS_KEY/SECRET, POST text2video.
  // Mirror CutOS' app/api/kling/route.ts JWT pattern.
  void encodeJobId;
  throw new Error("services/kling.ts: generate not implemented");
}

export async function getStatus(_jobId: string): Promise<{ status: JobStatus; clipUrl?: string; error?: string }> {
  // TODO(vishnu): GET /v1/videos/{id}, parse data.task_status.
  throw new Error("services/kling.ts: getStatus not implemented");
}
