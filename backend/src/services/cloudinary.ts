/**
 * Cloudinary service: upload signing, provider-output persistence, and URL
 * builders for stitched final cuts.
 */
import { v2 as cloudinary } from "cloudinary";
import type { Manifest, BeatMood } from "../types/manifest.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
} else if (process.env.NODE_ENV !== "test") {
  console.warn("[cloudinary] CLOUDINARY_* env vars not set. Upload/signing disabled.");
}

const CLOUD = cloudName ?? "demo";

export interface SpliceClip {
  publicId: string;
  colorGrade?: string;
}

interface BuildUrlOptions {
  audioOverlay?: string;
  watermarkPublicId?: string;
  normalize?: { width: number; height: number; mode?: "fill" | "pad" } | false;
}

const DEFAULT_NORMALIZE = { width: 1920, height: 1080, mode: "fill" as const };

export interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export function signUpload(folder = "sceneos/user-media"): SignedUploadParams {
  requireCloudinaryCredentials("signUpload");
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    apiSecret!,
  );

  return {
    timestamp,
    signature,
    apiKey: apiKey!,
    cloudName: cloudName!,
    folder,
  };
}

/**
 * Build a Cloudinary fl_splice URL from ordered clips. Each clip can carry its
 * own mood grade, and every clip is normalized to a common frame size before
 * splicing so the video editor path tolerates mixed provider outputs.
 */
export function buildSpliceUrl(
  clips: SpliceClip[],
  options: BuildUrlOptions = {},
): string | null {
  if (clips.length === 0) return null;
  const [base, ...overlays] = clips;

  const segments: string[] = [];
  segments.push(...clipSegments(base, options.normalize));

  for (const overlay of overlays) {
    const id = toLayerId(overlay.publicId);
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
    segments.push(`l_audio:${toLayerId(options.audioOverlay)}`);
  }
  if (options.watermarkPublicId) {
    segments.push(`l_${toLayerId(options.watermarkPublicId)},g_south_east,x_24,y_24`);
  }

  const transformPath = segments.length ? `${segments.join("/")}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${transformPath}${base.publicId}.mp4`;
}

export async function uploadVideoFromUrl(
  remoteUrl: string,
  publicId: string,
): Promise<{
  publicId: string;
  url: string;
  durationSeconds: number;
}> {
  requireCloudinaryCredentials("uploadVideoFromUrl");

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

export function buildClipUrl(
  publicId: string,
  opts: { mood?: BeatMood; format?: "mp4" | "webm" } = {},
): string {
  const transformations = opts.mood ? `${colorGradeFor(opts.mood)}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${transformations}${publicId}.${opts.format ?? "mp4"}`;
}

export function buildThumbnailUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/so_auto/${publicId}.jpg`;
}

export function withCaption(url: string, caption: string): string {
  const escaped = encodeURIComponent(caption).replace(/'/g, "%27");
  const layer = `l_text:Inter_36_bold:${escaped},co_white,bo_2px_solid_black,g_south,y_60`;
  return url.replace("/upload/", `/upload/${layer}/`);
}

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

export function totalDuration(manifest: Manifest): number {
  return manifest.beats
    .flatMap((b) => b.scenes)
    .filter((s) => s.approved)
    .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
}

export function publicIdForScene(args: {
  projectId?: string;
  beatId?: string;
  sceneId?: string;
  fallbackJobId: string;
}): string {
  const projectId = sanitizeSegment(args.projectId ?? "unknown-project");
  const beatId = sanitizeSegment(args.beatId ?? "unknown-beat");
  const sceneId = sanitizeSegment(args.sceneId ?? args.fallbackJobId);
  return `sceneos/${projectId}/${beatId}/${sceneId}`;
}

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

function requireCloudinaryCredentials(caller: string): void {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(`${caller}: missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET`);
  }
}

function toLayerId(publicId: string): string {
  return publicId.replace(/\//g, ":");
}

function sanitizeSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unnamed";
}
