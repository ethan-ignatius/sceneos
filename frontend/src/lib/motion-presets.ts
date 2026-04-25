/**
 * Single source of motion durations, easings, and springs across SceneOS.
 * Tested for 60fps headroom on M-series and mid-range Windows hardware.
 *
 * RULES — see docs/MOTION_LANGUAGE.md §4:
 *   - Affordances → SPRING.bubble or EASE.outQuart at DURATIONS.quick
 *   - Layout transitions → SPRING.drawer or EASE.inOutQuart at DURATIONS.smooth
 *   - Canvas / nodes → SPRING.cloud at DURATIONS.cinematic
 *   - Page transitions → EASE.inOutQuart at DURATIONS.cinematic
 *   - Page-crumple is GSAP-driven (showpiece), not Motion-driven.
 *
 * If your value isn't in this file, you're freelancing. Stop and add it here first.
 */

// ────────────────────────────────────────────────────────────────────────
// Durations (seconds)
// ────────────────────────────────────────────────────────────────────────

export const DURATIONS = {
  instant: 0.12,
  quick: 0.22,
  smooth: 0.36,
  cinematic: 0.72,
  showpiece: 1.6,
} as const;

// ────────────────────────────────────────────────────────────────────────
// Named cubic-bezier easings (Motion-friendly tuples)
// Plus the full alexportfolio easing library for GSAP / RAF use.
// ────────────────────────────────────────────────────────────────────────

export const EASE = {
  outQuart: [0.25, 1, 0.5, 1] as const,
  inOutQuart: [0.76, 0, 0.24, 1] as const,
  filmIn: [0.16, 1, 0.3, 1] as const,
  filmOut: [0.7, 0, 0.84, 0] as const,
};

/**
 * Mathematical easing functions for RAF-driven custom timelines.
 * Borrowed wholesale from alexportfolio's `useTransitionAnimation` hook.
 * Use these when GSAP is overkill or when bridging scroll values.
 */
export const easingFns = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 + --t * t * t * t * t,
  easeInOutQuint: (t: number) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t),
  easeInExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t: number) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? 0.5 * Math.pow(2, 20 * t - 10)
      : 1 - 0.5 * Math.pow(2, -20 * t + 10);
  },
  easeInSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t: number) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInCirc: (t: number) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t: number) => Math.sqrt(1 - --t * t),
  easeInOutCirc: (t: number) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,
} as const;

export type EasingName = keyof typeof easingFns;

// ────────────────────────────────────────────────────────────────────────
// Springs (Motion-compatible)
// ────────────────────────────────────────────────────────────────────────

export const SPRING = {
  /** Canvas nodes, drawer-attachment cloud morph. */
  cloud: { type: "spring", stiffness: 110, damping: 24, mass: 1.2 },
  /** Chat bubbles, button press, micro-interactions. */
  bubble: { type: "spring", stiffness: 380, damping: 30 },
  /** Drawers, side panels. */
  drawer: { type: "spring", stiffness: 220, damping: 32 },
} as const;

// ────────────────────────────────────────────────────────────────────────
// Stagger helpers
// ────────────────────────────────────────────────────────────────────────

export const STAGGER = {
  /** Pills cascading in on landing. */
  pills: 0.08,
  /** Bubbles in the agent stream. */
  bubbles: 0.06,
  /** Drawer-internal sections. */
  drawerInner: 0.06,
} as const;
