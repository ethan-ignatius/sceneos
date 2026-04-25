import { Hono } from "hono";
import type { StitchRequest, StitchResponse } from "../types/api.js";
import {
  buildSpliceUrl,
  buildThumbnailUrl,
  colorGradeFor,
  type SpliceClip,
} from "../services/cloudinary.js";
import type { BeatMood } from "../types/manifest.js";

/**
 * POST /api/stitch/url
 * Pure function: given a manifest, return the final Cloudinary fl_splice URL.
 *
 * Accepts:
 *   - manifest        — the project manifest
 *   - audioPublicId?  — Cloudinary audio public_id to overlay on the final cut
 *   - colorGrade?     — when true, applies the per-beat mood transform to each clip
 *
 * Filters: includes scenes from beats where status === "approved" AND the scene
 * has a clipPublicId. Beat order is preserved; scene order within a beat is preserved.
 *
 * Owner: Vishnu
 */
export const stitchRoute = new Hono();

stitchRoute.post("/url", async (c) => {
  const body = (await c.req.json().catch(() => null)) as StitchRequest | null;
  if (!body || !body.manifest || !Array.isArray(body.manifest.beats)) {
    return c.json({ error: "Invalid request body — expected { manifest: { beats: [...] } }" }, 400);
  }

  const { manifest, audioPublicId, colorGrade: applyColorGrade } = body;

  const approved = manifest.beats
    .filter((beat) => beat.status === "approved")
    .flatMap((beat) =>
      (beat.scenes ?? [])
        .filter((scene) => Boolean(scene.clipPublicId))
        .map((scene) => ({ scene, beat })),
    );

  if (approved.length === 0) {
    return c.json(
      {
        error:
          "No approved beats with scene.clipPublicId. Set beat.status='approved' and scene.clipPublicId on at least one scene.",
      },
      400,
    );
  }

  const clips: SpliceClip[] = approved.map(({ scene, beat }) => ({
    publicId: scene.clipPublicId!,
    colorGrade: applyColorGrade
      ? colorGradeFor(beat.archetype.mood as BeatMood)
      : undefined,
  }));

  const finalUrl = buildSpliceUrl(clips, { audioOverlay: audioPublicId });
  if (!finalUrl) {
    return c.json({ error: "Failed to build splice URL" }, 500);
  }

  const durationSeconds = approved.reduce(
    (sum, { scene }) => sum + (scene.durationSeconds ?? 0),
    0,
  );

  const response: StitchResponse = {
    finalUrl,
    thumbnailUrl: buildThumbnailUrl(clips[0]!.publicId),
    durationSeconds,
  };
  return c.json(response, 200);
});
