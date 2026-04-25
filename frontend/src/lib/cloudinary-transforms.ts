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

// Shared by buildSpliceUrl and buildSpliceUrlSegments. Keeps the overlay
// + transform-modifier logic in one place; each caller composes the parts
// it needs.
function buildModifierSegment(options: BuildSpliceOptions): string {
  const modifiers: string[] = [];
  if (options.colorGrade) modifiers.push(options.colorGrade);
  if (options.audioOverlay) modifiers.push(`l_audio:${options.audioOverlay.replace(/\//g, ":")}`);
  if (options.watermarkPublicId)
    modifiers.push(`l_${options.watermarkPublicId.replace(/\//g, ":")},g_south_east,x_24,y_24`);
  return modifiers.length ? `${modifiers.join("/")}/` : "";
}

function overlayFor(id: string): string {
  return `l_video:${id.replace(/\//g, ":")},fl_splice/`;
}

export function buildSpliceUrl(
  orderedPublicIds: string[],
  options: BuildSpliceOptions = {},
): string | null {
  if (orderedPublicIds.length === 0) return null;
  const [first, ...rest] = orderedPublicIds;
  const overlaySegment = rest.map(overlayFor).join("");
  const modifierSegment = buildModifierSegment(options);
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${modifierSegment}${overlaySegment}${first}.mp4`;
}

/**
 * Splits a splice URL into the four logical pieces the Stitch Tray needs
 * to render a typewriter on just the newest segment.
 *
 *   head:   "https://res.cloudinary.com/.../upload/[transforms]/"
 *   middle: "l_video:a,fl_splice/l_video:b,fl_splice/" (all-but-newest overlays)
 *   tail:   "l_video:c,fl_splice/" (the newest overlay — gets typewriter+glow)
 *   base:   "id1.mp4"
 *
 * Returns null when there's nothing to splice yet (≤ 1 approved clip).
 * For 1 clip, callers should render a single fade-in URL — there's no
 * "tail" to type because no overlay segment exists yet.
 */
export function buildSpliceUrlSegments(
  orderedPublicIds: string[],
  options: BuildSpliceOptions = {},
): { head: string; middle: string; tail: string; base: string } | null {
  if (orderedPublicIds.length === 0) return null;
  const [first, ...rest] = orderedPublicIds;
  const base = `${first}.mp4`;
  const head = `https://res.cloudinary.com/${CLOUD}/video/upload/${buildModifierSegment(options)}`;

  if (rest.length === 0) {
    return { head, middle: "", tail: "", base };
  }
  const overlays = rest.map(overlayFor);
  const tail = overlays[overlays.length - 1];
  const middle = overlays.slice(0, -1).join("");
  return { head, middle, tail, base };
}

/**
 * Maps each beat mood to a brand-aligned hex tint, used for the bottom-edge
 * gradient on stitch-tray thumbnails. Loose pairing — meant to *hint* at
 * the mood, not re-grade.
 */
export function moodAccentColor(mood: BeatMood): string {
  switch (mood) {
    case "wide-establish":
      return "#5e7080"; // brand-cool
    case "intimate-hook":
      return "#f0a868"; // brand-ember
    case "kinetic-rising":
      return "#d4a373"; // state-warning warm
    case "tense-climax":
      return "#a87447"; // brand-ember-dim
    case "still-resolve":
      return "#6f9c7d"; // state-success cool
    case "punchy-sting":
      return "#c4727b"; // state-error warm
  }
}

// ────────────────────────────────────────────────────────────────────────
// Caption overlay (l_text)
// ────────────────────────────────────────────────────────────────────────

export function withCaption(url: string, caption: string): string {
  const escaped = encodeURIComponent(caption).replace(/'/g, "%27");
  const layer = `l_text:Inter_36_bold:${escaped},co_white,bo_2px_solid_black,g_south,y_60`;
  return url.replace("/upload/", `/upload/${layer}/`);
}
