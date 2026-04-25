/**
 * Single source of motion durations, easings, and springs across SceneOS.
 * Tested for 60fps headroom on M-series and mid-range Windows hardware.
 *
 * Rules — see docs/FRONTEND_PHILOSOPHY.md §5:
 *   - Affordances → SPRING.bubble or EASE.outQuart at DURATIONS.quick
 *   - Layout transitions → SPRING.drawer or EASE.inOutQuart at DURATIONS.smooth
 *   - Canvas / nodes → SPRING.cloud at DURATIONS.cinematic
 *   - Page transitions → EASE.inOutQuart at DURATIONS.cinematic
 *   - Page-crumple is GSAP-driven (showpiece), not Motion-driven.
 */

export const DURATIONS = {
  instant: 0.12,
  quick: 0.22,
  smooth: 0.36,
  cinematic: 0.72,
  showpiece: 1.6,
} as const;

export const EASE = {
  outQuart: [0.25, 1, 0.5, 1] as const,
  inOutQuart: [0.76, 0, 0.24, 1] as const,
  filmIn: [0.16, 1, 0.3, 1] as const,
  filmOut: [0.7, 0, 0.84, 0] as const,
};

export const SPRING = {
  cloud: { type: "spring", stiffness: 110, damping: 24, mass: 1.2 },
  bubble: { type: "spring", stiffness: 380, damping: 30 },
  drawer: { type: "spring", stiffness: 220, damping: 32 },
} as const;
