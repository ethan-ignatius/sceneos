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

interface BuildUrlOptions {
  colorGrade?: string;
  audioOverlay?: string;
  watermarkPublicId?: string;
}

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
  });

  return {
    publicId: result.public_id,
    url: result.secure_url,
    durationSeconds: typeof result.duration === "number" ? result.duration : 0,
  };
}

export function buildSpliceUrl(
  orderedPublicIds: string[],
  options: BuildUrlOptions = {},
): string | null {
  if (orderedPublicIds.length === 0) return null;

  const [first, ...rest] = orderedPublicIds;
  const overlays = rest
    .map((id) => `l_video:${toLayerId(id)},fl_splice`)
    .join("/");
  const overlaySegment = overlays ? `${overlays}/` : "";

  const modifiers: string[] = [];
  if (options.colorGrade) modifiers.push(options.colorGrade);
  if (options.audioOverlay) modifiers.push(`l_audio:${toLayerId(options.audioOverlay)}`);
  if (options.watermarkPublicId) {
    modifiers.push(`l_${toLayerId(options.watermarkPublicId)},g_south_east,x_24,y_24`);
  }
  const modifierSegment = modifiers.length ? `${modifiers.join("/")}/` : "";

  return `https://res.cloudinary.com/${CLOUD}/video/upload/${modifierSegment}${overlaySegment}${first}.mp4`;
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
