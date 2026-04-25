/**
 * Public Cloudinary demo videos used as placeholder clips while the team
 * has no real Higgsfield key. These are CORS-friendly and play in <video>.
 *
 * Replace these with real Cloudinary public_ids once the demo project is
 * rendered Saturday night (see HACKATHON_STRATEGY §5).
 */

import type { BeatTemplate } from "../types/manifest.js";

interface MockClip {
  publicId: string;
  url: string;
  durationSeconds: number;
}

/** Cloudinary's public demo cloud — these always resolve, no auth needed. */
const DEMO_CLOUD = "demo";

const make = (id: string, duration: number): MockClip => ({
  publicId: id,
  url: `https://res.cloudinary.com/${DEMO_CLOUD}/video/upload/${id}.mp4`,
  durationSeconds: duration,
});

/**
 * Trailer beats — five canned clips that all play. Real visual quality is
 * irrelevant here; what matters is that the frontend gets URLs that resolve.
 */
const TRAILER: Record<string, MockClip> = {
  "trailer.establishing": make("dog", 8),
  "trailer.hook": make("elephants", 12),
  "trailer.rising": make("dog", 18),
  "trailer.climax-tease": make("elephants", 14),
  "trailer.sting": make("dog", 8),
};

const SHORT: Record<string, MockClip> = {
  "short.hook": make("dog", 5),
  "short.turn": make("elephants", 10),
  "short.payoff": make("dog", 5),
};

const FEATURE: Record<string, MockClip> = {
  "feature.setup": make("elephants", 20),
  "feature.inciting": make("dog", 25),
  "feature.rising": make("elephants", 35),
  "feature.midpoint": make("dog", 25),
  "feature.crisis": make("elephants", 30),
  "feature.climax": make("dog", 25),
  "feature.denouement": make("elephants", 20),
};

const ALL: Record<string, MockClip> = { ...TRAILER, ...SHORT, ...FEATURE };

export function getMockClip(template: BeatTemplate | string): MockClip {
  return ALL[template] ?? make("dog", 8);
}
