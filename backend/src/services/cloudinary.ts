/**
 * Cloudinary service — server-side signing + URL construction.
 *
 * Owner: Vishnu
 *
 * Reference:
 *   https://cloudinary.com/documentation/video_trimming_and_concatenating
 *   https://cloudinary.com/documentation/video_layers
 */
import { v2 as cloudinary } from "cloudinary";
import type { Manifest } from "../types/manifest.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
} else {
  console.warn("[cloudinary] CLOUDINARY_* env vars are not all set. URL construction will fail.");
}

/**
 * Build the final fl_splice URL from an ordered list of public_ids.
 *
 * Pattern:
 *   {base}/video/upload/l_video:<id2>,fl_splice/l_video:<id3>,fl_splice/.../<id1>.mp4
 *
 * The first clip is the "base." Each subsequent clip is overlaid then spliced.
 *
 * The replace `/` → `:` is required because Cloudinary uses `:` as the path
 * separator inside `l_video:` overlay references.
 */
export function buildSpliceUrl(orderedPublicIds: string[]): string | null {
  if (orderedPublicIds.length === 0 || !cloudName) return null;
  const [first, ...rest] = orderedPublicIds;
  const overlays = rest.map((id) => `l_video:${id.replace(/\//g, ":")},fl_splice`).join("/");
  const segment = overlays ? `${overlays}/` : "";
  return `https://res.cloudinary.com/${cloudName}/video/upload/${segment}${first}.mp4`;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Upload an MP4 from a remote URL (provider-hosted) into Cloudinary with a
 * deterministic public_id so the same clip is addressable from fl_splice URLs.
 *
 * Cloudinary's `uploader.upload(url)` fetches the source server-side, so we
 * never have to stream the video through this process.
 */
export async function uploadVideoFromUrl(
  remoteUrl: string,
  publicId: string,
): Promise<{ publicId: string; url: string; durationSeconds: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in backend/.env",
    );
  }
  const result = await cloudinary.uploader.upload(remoteUrl, {
    resource_type: "video",
    public_id: publicId,
    overwrite: true,
    unique_filename: false,
    use_filename: false,
  });
  return {
    publicId: result.public_id,
    url: result.secure_url,
    durationSeconds: typeof result.duration === "number" ? result.duration : 0,
  };
}

/** Sum of approved scene durations across the manifest. */
export function totalDuration(manifest: Manifest): number {
  return manifest.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved)
    .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
}
