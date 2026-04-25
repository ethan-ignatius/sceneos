import { Hono } from "hono";
import type { StitchRequest, StitchResponse } from "../types/api.js";
import { buildSpliceUrl, totalDuration } from "../services/cloudinary.js";

/**
 * POST /api/stitch/url
 * Pure function: given a manifest, return the final Cloudinary fl_splice URL.
 *
 * Owner: Vishnu (easiest first task — no I/O)
 */
export const stitchRoute = new Hono();

stitchRoute.post("/url", async (c) => {
  const body = (await c.req.json().catch(() => null)) as StitchRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const { manifest } = body;
  const orderedPublicIds = manifest.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved && s.clipPublicId)
    .map((s) => s.clipPublicId!);

  if (orderedPublicIds.length === 0) {
    return c.json({ error: "No approved clips with Cloudinary public_ids" }, 400);
  }

  const finalUrl = buildSpliceUrl(orderedPublicIds);
  if (!finalUrl) {
    return c.json({ error: "CLOUDINARY_CLOUD_NAME not configured" }, 500);
  }

  const response: StitchResponse = {
    finalUrl,
    // TODO: derive a thumbnail URL via Cloudinary so_auto + jpg transformation.
    thumbnailUrl: finalUrl.replace(".mp4", ".jpg"),
    durationSeconds: totalDuration(manifest),
  };
  return c.json(response, 200);
});
