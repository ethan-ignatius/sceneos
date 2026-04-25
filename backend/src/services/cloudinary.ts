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

/** A single clip in a splice chain. `colorGrade` is the raw transform string
 *  (e.g. "e_brightness:-15,e_contrast:10,e_saturation:-12"); use `colorGradeFor(mood)`
 *  to get one from a beat mood. */
export interface SpliceClip {
  publicId: string;
  colorGrade?: string;
}

/**
 * Build the final fl_splice URL from an ordered list of clips.
 *
 * Cloudinary processes URL transformations left-to-right, applied to the resource
 * on the right. We exploit that to:
 *   1. Apply the base clip's grade first (leftmost prefix transform).
 *   2. For each overlay clip, open it as a layer, apply its grade, then
 *      `fl_layer_apply,fl_splice` to commit it onto the running concat.
 *   3. Append audio/watermark modifiers last so they apply to the final concat.
 *
 * Patterns:
 *   No grades       → `l_video:<id2>,fl_splice/<id1>.mp4`
 *   Per-clip grades → `<grade1>/l_video:<id2>/<grade2>/fl_layer_apply,fl_splice/<id1>.mp4`
 *
 * "/" inside an overlay public_id is replaced with ":" because Cloudinary uses
 * ":" as the separator inside l_video: references.
 */
export function buildSpliceUrl(clips: SpliceClip[], options: BuildUrlOptions = {}): string | null {
  if (clips.length === 0) return null;
  const [base, ...overlays] = clips;

  const segments: string[] = [];

  // Base clip's transforms (normalize + optional grade) apply before any layers.
  segments.push(...clipSegments(base, options.normalize));

  // Each overlay opens a layer, applies its transforms, then commits with splice.
  for (const overlay of overlays) {
    const id = overlay.publicId.replace(/\//g, ":");
    const transforms = clipSegments(overlay, options.normalize);
    if (transforms.length > 0) {
      segments.push(`l_video:${id}`);
      segments.push(...transforms);
      segments.push("fl_layer_apply,fl_splice");
    } else {
      segments.push(`l_video:${id},fl_splice`);
    }
  }

  if (options.audioOverlay) {
    segments.push(`l_audio:${options.audioOverlay.replace(/\//g, ":")}`);
  }
  if (options.watermarkPublicId) {
    segments.push(`l_${options.watermarkPublicId.replace(/\//g, ":")},g_south_east,x_24,y_24`);
  }

  const transformPath = segments.length ? `${segments.join("/")}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${transformPath}${base.publicId}.mp4`;
}

interface BuildUrlOptions {
  /** Audio public_id to overlay across the final concat. */
  audioOverlay?: string;
  /** Watermark image public_id (south-east corner). */
  watermarkPublicId?: string;
  /**
   * Normalize each clip's resolution before splicing. Cloudinary refuses to
   * splice videos whose dimensions differ, so this defaults ON. Pass `false`
   * to skip normalization (only safe when every input shares one resolution).
   */
  normalize?: { width: number; height: number; mode?: "fill" | "pad" } | false;
}

const DEFAULT_NORMALIZE = { width: 1920, height: 1080, mode: "fill" as const };

/** Build the per-clip transform segments (resize + grade), ordered for Cloudinary. */
function clipSegments(
  clip: SpliceClip,
  normalize: BuildUrlOptions["normalize"],
): string[] {
  const out: string[] = [];
  if (normalize !== false) {
    const n = normalize ?? DEFAULT_NORMALIZE;
    const mode = n.mode ?? "fill";
    out.push(`c_${mode},w_${n.width},h_${n.height}`);
  }
  if (clip.colorGrade) out.push(clip.colorGrade);
  return out;
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
// Server-side upload (provider URL → Cloudinary)
// ────────────────────────────────────────────────────────────────────────

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
