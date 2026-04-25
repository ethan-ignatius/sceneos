import { Hono } from "hono";
import type { StatusResponse } from "../types/api.js";

/**
 * GET /api/status/:jobId
 * Polls a Higgsfield job. When status flips to "succeeded", uploads the
 * resulting MP4 to Cloudinary and returns clipUrl + clipPublicId.
 *
 * Owner: Vishnu
 *
 * Implementation notes:
 *  - Poll Higgsfield via services/higgsfield.ts.getJobStatus(jobId)
 *  - On succeeded: download MP4, upload via services/cloudinary.ts.uploadVideo()
 *    with public_id = `sceneos/${projectId}/${beatId}/${sceneId}`.
 *  - Return clipUrl (Cloudinary delivery URL) AND clipPublicId (for fl_splice).
 */
export const statusRoute = new Hono();

statusRoute.get("/:jobId", async (c) => {
  const jobId = c.req.param("jobId");

  // TODO(vishnu): look up job from registry, call provider, upload to Cloudinary on success.
  const stub: StatusResponse = {
    jobId,
    status: "queued",
    pollAfterMs: 5000,
  };
  return c.json(stub, 501);
});
