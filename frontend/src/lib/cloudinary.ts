import { Cloudinary } from "@cloudinary/url-gen";

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

if (!cloudName) {
  console.warn(
    "[cloudinary] VITE_CLOUDINARY_CLOUD_NAME is not set. Set it in frontend/.env to enable media transforms.",
  );
}

export const cloudinary = new Cloudinary({
  cloud: {
    cloudName: cloudName ?? "demo",
  },
  url: {
    secure: true,
  },
});

export const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Build the final fl_splice URL from an ordered list of public_ids.
 *
 * Pattern (per https://cloudinary.com/documentation/video_trimming_and_concatenating):
 *   {base}/video/upload/l_video:<id2>,fl_splice/l_video:<id3>,fl_splice/.../<id1>.mp4
 *
 * The first clip is the "base." Each subsequent clip is overlaid then spliced.
 *
 * NOTE: this client-side helper exists so the frontend can show the URL building in
 * real time. The authoritative URL is built server-side via POST /api/stitch/url.
 */
export function buildSpliceUrl(orderedPublicIds: string[]): string | null {
  if (orderedPublicIds.length === 0 || !cloudName) return null;
  const [first, ...rest] = orderedPublicIds;
  const overlays = rest.map((id) => `l_video:${id.replace(/\//g, ":")},fl_splice`).join("/");
  const segment = overlays ? `${overlays}/` : "";
  return `https://res.cloudinary.com/${cloudName}/video/upload/${segment}${first}.mp4`;
}
