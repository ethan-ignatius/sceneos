import type { ReactNode } from "react";

/**
 * Cloudinary splice URLs are gorgeous engineering but a typographic
 * disaster: 36-char UUIDs repeat 2-4× per overlay and overwhelm the
 * actual structure with what reads as visual noise. These helpers let
 * a render path:
 *   • collapse UUIDs to a 4-char prefix + ellipsis (when space-constrained)
 *   • highlight the magical Cloudinary tokens (fl_splice, l_video:,
 *     fl_layer_apply) in ember so the eye is drawn to the parts that
 *     are actually load-bearing — the glue that turns N independent
 *     clips into one continuous master cut, server-side, no FFmpeg.
 *
 * Used by:
 *   - PersistentUrlStrip (collapsed: true)
 *   - StitchTray         (collapsed: false — has room for full UUIDs)
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const TRANSFORM_TOKEN_RE = /(fl_splice|fl_layer_apply|l_video:)/g;

export function collapseUuids(s: string): string {
  return s.replace(UUID_RE, (m) => `${m.slice(0, 4)}…`);
}

type UrlToken = { kind: "transform" | "literal"; text: string };

function tokenizeUrl(s: string): UrlToken[] {
  if (!s) return [];
  const parts: UrlToken[] = [];
  let lastIndex = 0;
  TRANSFORM_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRANSFORM_TOKEN_RE.exec(s)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "literal", text: s.slice(lastIndex, match.index) });
    }
    parts.push({ kind: "transform", text: match[0] });
    lastIndex = TRANSFORM_TOKEN_RE.lastIndex;
  }
  if (lastIndex < s.length) {
    parts.push({ kind: "literal", text: s.slice(lastIndex) });
  }
  return parts;
}

interface RenderOptions {
  collapsed?: boolean;
  /** Tailwind class for the ember-highlighted transform tokens. */
  transformClassName?: string;
}

export function renderHighlightedUrl(s: string, opts: RenderOptions = {}): ReactNode {
  if (!s) return null;
  const { collapsed = false, transformClassName = "text-brand-ember/85" } = opts;
  const display = collapsed ? collapseUuids(s) : s;
  return tokenizeUrl(display).map((part, i) =>
    part.kind === "transform" ? (
      <span key={i} className={transformClassName}>
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}
