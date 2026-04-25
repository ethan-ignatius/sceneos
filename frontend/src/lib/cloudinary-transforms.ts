/**
 * Frontend mirror of backend/src/services/cloudinary.ts URL builders.
 * Use these for inline previews — clip thumbnails in the canvas, the
 * live-building fl_splice URL in the StitchTray, mood-graded preview
 * playback inside NodeDetailDrawer.
 *
 * The authoritative URL for the FINAL cinematic comes from the backend
 * (`POST /api/stitch/url`). These helpers exist so the UI can preview
 * grades and the URL building feels live, not server-deferred.
 */
import type { BeatMood } from "@/types/manifest";

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? "demo";

// ────────────────────────────────────────────────────────────────────────
// Per-mood color grade — keep in sync with backend/src/services/cloudinary.ts
// ────────────────────────────────────────────────────────────────────────

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
// Single clip URL with optional grade
// ────────────────────────────────────────────────────────────────────────

export function buildClipUrl(
  publicId: string,
  opts: { mood?: BeatMood; format?: "mp4" | "webm" } = {},
): string {
  const segments: string[] = [];
  if (opts.mood) segments.push(colorGradeFor(opts.mood));
  const segment = segments.length ? `${segments.join("/")}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${segment}${publicId}.${opts.format ?? "mp4"}`;
}

/** so_auto picks the most representative frame; jpg is universal. */
export function buildThumbnailUrl(publicId: string, opts: { mood?: BeatMood } = {}): string {
  const segments = ["so_auto"];
  if (opts.mood) segments.push(colorGradeFor(opts.mood));
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${segments.join("/")}/${publicId}.jpg`;
}

// ────────────────────────────────────────────────────────────────────────
// Final cut: fl_splice concatenation
// ────────────────────────────────────────────────────────────────────────

interface BuildSpliceOptions {
  /** Per-mood grade applied to the entire concatenated cut. */
  colorGrade?: string;
  /** Cloudinary public_id of an audio track to overlay. */
  audioOverlay?: string;
  /** Cloudinary public_id of a watermark image (lower-right corner). */
  watermarkPublicId?: string;
}

export function buildSpliceUrl(
  orderedPublicIds: string[],
  options: BuildSpliceOptions = {},
): string | null {
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

// ────────────────────────────────────────────────────────────────────────
// Caption overlay (l_text)
// ────────────────────────────────────────────────────────────────────────

export function withCaption(url: string, caption: string): string {
  const escaped = encodeURIComponent(caption).replace(/'/g, "%27");
  const layer = `l_text:Inter_36_bold:${escaped},co_white,bo_2px_solid_black,g_south,y_60`;
  return url.replace("/upload/", `/upload/${layer}/`);
}
