/**
 * Cloudinary service — server-side signing + URL construction.
 *
 * Cloudinary is treated as our **post-production pipeline**, not just
 * storage. Every transformation a film team would normally need
 * (concat, color grade, audio dub, captions, thumbnail extraction,
 * watermarking, format conversion, CDN delivery) is exposed here as a
 * URL-builder helper.
 *
 * Reference:
 *   https://cloudinary.com/documentation/video_trimming_and_concatenating
 *   https://cloudinary.com/documentation/video_layers
 *   https://cloudinary.com/documentation/video_manipulation_and_delivery
 */
import { v2 as cloudinary } from "cloudinary";
import type { Manifest, BeatMood } from "../types/manifest.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
} else if (process.env.NODE_ENV !== "test") {
  console.warn("[cloudinary] CLOUDINARY_* env vars not set. URL construction will use 'demo' cloud.");
}

const CLOUD = cloudName ?? "demo"; // demo cloud has public sample assets

// ────────────────────────────────────────────────────────────────────────
// Final cut: fl_splice concatenation
// ────────────────────────────────────────────────────────────────────────

/**
 * Build the final fl_splice URL from an ordered list of public_ids.
 *
 * Pattern:
 *   {base}/video/upload/<modifiers>/l_video:<id2>,fl_splice/.../<id1>.mp4
 *
 * Replaces "/" → ":" in overlay public_ids because Cloudinary uses ":" as
 * the separator inside l_video: references.
 */
export function buildSpliceUrl(orderedPublicIds: string[], options: BuildUrlOptions = {}): string | null {
  if (orderedPublicIds.length === 0) return null;
  const [first, ...rest] = orderedPublicIds;
  const overlays = rest.map((id) => `l_video:${id.replace(/\//g, ":")},fl_splice`).join("/");
  const overlaySegment = overlays ? `${overlays}/` : "";

  const modifiers: string[] = [];
  if (options.colorGrade) modifiers.push(options.colorGrade);
  if (options.audioOverlay) modifiers.push(`l_audio:${options.audioOverlay.replace(/\//g, ":")}`);
  if (options.watermarkPublicId)
    modifiers.push(`l_${options.watermarkPublicId.replace(/\//g, ":")},g_south_east,x_24,y_24`);
  const modifierSegment = modifiers.length ? `${modifiers.join("/")}/` : "";

  return `https://res.cloudinary.com/${CLOUD}/video/upload/${modifierSegment}${overlaySegment}${first}.mp4`;
}

interface BuildUrlOptions {
  colorGrade?: string;
  audioOverlay?: string;
  watermarkPublicId?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Color grade per beat mood (LUT-style normalization)
// ────────────────────────────────────────────────────────────────────────

/**
 * Per-mood color grade. Used to:
 *   1. Give each beat a distinct visual signature (warm hook, tense climax).
 *   2. Normalize visual quality across provider tiers (kling output graded
 *      to match higgsfield-tier recorded clips on stage).
 *
 * Apply per-clip via /transformations/<grade>/<id> in the upload URL, OR
 * embed in buildSpliceUrl({ colorGrade }) for the final cut.
 */
export function colorGradeFor(mood: BeatMood): string {
  switch (mood) {
    case "wide-establish":
      return "e_brightness:-15,e_contrast:10,e_saturation:-12";
    case "intimate-hook":
      return "e_brightness:-5,e_contrast:8,e_saturation:0";
    case "kinetic-rising":
      return "e_brightness:0,e_contrast:22,e_saturation:8";
    case "tense-climax":
      return "e_brightness:-22,e_contrast:30,e_saturation:-15";
    case "still-resolve":
      return "e_brightness:-8,e_contrast:5,e_saturation:-5";
    case "punchy-sting":
      return "e_brightness:5,e_contrast:25,e_saturation:12";
  }
}

// ────────────────────────────────────────────────────────────────────────
// Per-clip transforms (for inline previews)
// ────────────────────────────────────────────────────────────────────────

/** Build a delivery URL for a single clip with optional grade applied. */
export function buildClipUrl(publicId: string, opts: { mood?: BeatMood; format?: "mp4" | "webm" } = {}): string {
  const segments: string[] = [];
  if (opts.mood) segments.push(colorGradeFor(opts.mood));
  const segment = segments.length ? `${segments.join("/")}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${segment}${publicId}.${opts.format ?? "mp4"}`;
}

/** Extract a JPG thumbnail at the auto-best-frame point. */
export function buildThumbnailUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/so_auto/${publicId}.jpg`;
}

/** Add a caption layer (l_text) at the bottom of the frame. */
export function withCaption(url: string, caption: string): string {
  const escaped = encodeURIComponent(caption).replace(/'/g, "%27");
  const layer = `l_text:Inter_36_bold:${escaped},co_white,bo_2px_solid_black,g_south,y_60`;
  return url.replace("/upload/", `/upload/${layer}/`);
}

// ────────────────────────────────────────────────────────────────────────
// Server-side upload (Higgsfield URL → Cloudinary)
// ────────────────────────────────────────────────────────────────────────

export async function uploadVideoFromUrl(_remoteUrl: string, _publicId: string): Promise<{
  publicId: string;
  url: string;
  durationSeconds: number;
}> {
  // const result = await cloudinary.uploader.upload(remoteUrl, { resource_type: "video", public_id: publicId });
  // return { publicId: result.public_id, url: result.secure_url, durationSeconds: result.duration };
  throw new Error("services/cloudinary.ts: uploadVideoFromUrl not implemented");
}

/** Sum of approved scene durations across the manifest. */
export function totalDuration(manifest: Manifest): number {
  return manifest.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved)
    .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
}
