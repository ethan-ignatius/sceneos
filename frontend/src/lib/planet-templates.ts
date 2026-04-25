/**
 * Planet registry — maps each beat template (and mood, as fallback) to a
 * concrete planet visual: which texture, what atmosphere tint, scale,
 * whether it has rings, whether it emits its own light (Sun).
 *
 * The 7-beat `story.*` arc is the canonical path; each beat gets a distinct
 * planet so the canvas reads as a tiny solar system rather than a row of
 * generic orbs. Trailer / short / feature templates also map; if a template
 * isn't in the registry we fall back to the mood-based mapping.
 *
 * Asset license: CC BY 4.0 — Solar System Scope. See
 * `frontend/public/textures/planets/ATTRIBUTION.md`. The single line of
 * required credit is in the About / How-it-works modal.
 */
import type { BeatMood, BeatTemplate } from "@/types/manifest";

export interface PlanetSpec {
  /** Filename inside `/textures/planets/`. */
  texture: string;
  /** Tint of the atmosphere shell (additive halo around the planet). */
  atmosphereTint: string;
  /** Whether to use the same texture as an emissive map (only the Sun). */
  isEmissive: boolean;
  /** Whether to render the alpha-mapped ring companion mesh (Saturn). */
  hasRing: boolean;
  /** Base scale relative to the canonical 0.55 sphere radius. */
  baseScale: number;
  /** Y-axis rotation rate (rad/s). Slower = more deliberate. */
  spinY: number;
  /** Friendly name for analytics / a11y; not user-visible chrome. */
  bodyName: string;
}

// ── Body archetypes ─────────────────────────────────────────────────────

const SUN: PlanetSpec = {
  texture: "2k_sun.jpg",
  atmosphereTint: "#ffb874",
  isEmissive: true,
  hasRing: false,
  baseScale: 1.15,
  spinY: 0.04,
  bodyName: "Sun",
};

const MERCURY: PlanetSpec = {
  texture: "2k_mercury.jpg",
  atmosphereTint: "#a87447",
  isEmissive: false,
  hasRing: false,
  baseScale: 0.85,
  spinY: 0.05,
  bodyName: "Mercury",
};

const VENUS: PlanetSpec = {
  texture: "2k_venus_surface.jpg",
  atmosphereTint: "#d4a574",
  isEmissive: false,
  hasRing: false,
  baseScale: 1.0,
  spinY: 0.03,
  bodyName: "Venus",
};

const EARTH: PlanetSpec = {
  texture: "2k_earth_daymap.jpg",
  atmosphereTint: "#5e7080",
  isEmissive: false,
  hasRing: false,
  baseScale: 1.05,
  spinY: 0.06,
  bodyName: "Earth",
};

const MARS: PlanetSpec = {
  texture: "2k_mars.jpg",
  atmosphereTint: "#c97f3f",
  isEmissive: false,
  hasRing: false,
  baseScale: 0.95,
  spinY: 0.07,
  bodyName: "Mars",
};

const JUPITER: PlanetSpec = {
  texture: "2k_jupiter.jpg",
  atmosphereTint: "#d4a574",
  isEmissive: false,
  hasRing: false,
  baseScale: 1.2,
  spinY: 0.09, // gas giants spin fast in real life — keep that energy
  bodyName: "Jupiter",
};

const SATURN: PlanetSpec = {
  texture: "2k_saturn.jpg",
  atmosphereTint: "#c5b9a8",
  isEmissive: false,
  hasRing: true,
  baseScale: 1.1,
  spinY: 0.085,
  bodyName: "Saturn",
};

const URANUS: PlanetSpec = {
  texture: "2k_uranus.jpg",
  atmosphereTint: "#5e7080",
  isEmissive: false,
  hasRing: false,
  baseScale: 0.9,
  spinY: 0.05,
  bodyName: "Uranus",
};

const NEPTUNE: PlanetSpec = {
  texture: "2k_neptune.jpg",
  atmosphereTint: "#5e7080",
  isEmissive: false,
  hasRing: false,
  baseScale: 0.95,
  spinY: 0.05,
  bodyName: "Neptune",
};

const MOON: PlanetSpec = {
  texture: "2k_moon.jpg",
  atmosphereTint: "#6b6359",
  isEmissive: false,
  hasRing: false,
  baseScale: 0.8,
  spinY: 0.025,
  bodyName: "Moon",
};

// ── Per-template mapping ────────────────────────────────────────────────
// Each beat in the canonical `story.*` 7-beat arc earns its own planet so
// the canvas reads as a journey, not a row. Trailer / short / feature get
// distinct mappings too. When a template isn't in this table we fall through
// to mood-based defaults below.

const PLANET_BY_TEMPLATE: Partial<Record<BeatTemplate, PlanetSpec>> = {
  // story.* — canonical 7-beat dramatic arc
  "story.hook": SUN,
  "story.exposition": EARTH,
  "story.inciting": MERCURY,
  "story.rising": MARS,
  "story.climax": SATURN,
  "story.falling": MOON,
  "story.resolution": NEPTUNE,

  // trailer.* — 5 beats
  "trailer.establishing": EARTH,
  "trailer.hook": SUN,
  "trailer.rising": MARS,
  "trailer.climax-tease": SATURN,
  "trailer.sting": JUPITER,

  // short.* — 3 beats
  "short.hook": SUN,
  "short.turn": MARS,
  "short.payoff": JUPITER,

  // feature.* — 7 beats; URANUS for crisis (cool / outside the warm arc)
  "feature.setup": EARTH,
  "feature.inciting": MERCURY,
  "feature.rising": MARS,
  "feature.midpoint": JUPITER,
  "feature.crisis": URANUS,
  "feature.climax": SATURN,
  "feature.denouement": MOON,
};

const PLANET_BY_MOOD: Record<BeatMood, PlanetSpec> = {
  "wide-establish": EARTH,
  "intimate-hook": SUN,
  "kinetic-rising": MARS,
  "tense-climax": SATURN,
  "still-resolve": MOON,
  "punchy-sting": JUPITER,
};

export function planetForBeat(template: BeatTemplate, mood: BeatMood): PlanetSpec {
  return PLANET_BY_TEMPLATE[template] ?? PLANET_BY_MOOD[mood];
}

// ── Preload list (called from landing) ──────────────────────────────────
// Every texture used by any template — preload during the page-crumple so
// the canvas mount doesn't pay a Suspense gap on /canvas. Venus is omitted
// because no template currently maps to it; add when a future arc uses it.
export const PLANET_TEXTURE_PRELOAD_LIST: string[] = [
  SUN,
  MERCURY,
  EARTH,
  MARS,
  JUPITER,
  SATURN,
  URANUS,
  NEPTUNE,
  MOON,
].map((p) => `/textures/planets/${p.texture}`);

/** Saturn ring alpha-map — preload alongside the planet textures. */
export const SATURN_RING_TEXTURE = "/textures/planets/2k_saturn_ring_alpha.png";
