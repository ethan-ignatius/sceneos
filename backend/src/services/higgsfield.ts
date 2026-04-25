/**
 * Higgsfield video-generation service — recorded-demo tier.
 *
 * Tier: recorded-demo (best quality, slow). Uses the team's HIGGSFIELD_API_KEY
 * to dispatch through Higgsfield Cloud (which itself routes Sora 2 / Veo 3.1 /
 * Kling 3.0 internally).
 *
 * Owner: Vishnu
 * Reference:
 *   https://cloud.higgsfield.ai/
 *   https://github.com/higgsfield-ai/higgsfield-client (Python SDK)
 *   https://www.segmind.com/models/higgsfield-image2video/api (gateway fallback)
 */
import type { JobStatus } from "../types/api.js";
import { encodeJobId, type GenerateClipParams } from "./provider.js";

export async function generate(_params: GenerateClipParams): Promise<{ jobId: string }> {
  // TODO(vishnu): POST to Higgsfield, return providerJobId.
  // For now the route returns 501; once wired, return:
  //   const { id } = await higgsfieldClient.generate({...})
  //   return { jobId: encodeJobId("higgsfield", id) }
  void encodeJobId;
  throw new Error("services/higgsfield.ts: generate not implemented");
}

export async function getStatus(_jobId: string): Promise<{ status: JobStatus; clipUrl?: string; clipPublicId?: string; error?: string }> {
  // TODO(vishnu): GET Higgsfield job status, map to JobStatus union.
  // On succeeded, upload the Higgsfield-hosted MP4 to Cloudinary via
  // services/cloudinary.ts.uploadVideoFromUrl(clipUrl, "sceneos/<projectId>/<beatId>/<sceneId>")
  // and return clipPublicId so /api/stitch/url can splice it.
  throw new Error("services/higgsfield.ts: getStatus not implemented");
}
