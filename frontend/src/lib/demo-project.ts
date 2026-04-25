/**
 * Demo-project canonical reference.
 *
 * The on-stage safety net is owned by the BACKEND via
 * `GENERATION_PROVIDER=cached` + `services/cached-demo.ts`. This file is the
 * frontend-side mirror — it documents which prompt and which beat order the
 * cached clips correspond to, so the demo plays consistently regardless of
 * which laptop is presenting.
 *
 * Saturday-night protocol (mirrors HACKATHON_STRATEGY §5):
 *   1. Set GENERATION_PROVIDER=higgsfield in backend/.env
 *   2. From Landing, type DEMO_PROMPT. Pick "Trailer". Run the full flow.
 *   3. Approve all 5 beats. Capture each clipPublicId.
 *   4. Paste public_ids into backend/src/services/cached-demo.ts.
 *   5. Verify: set GENERATION_PROVIDER=cached, re-run the demo, watch all
 *      five clips return instantly. Final fl_splice URL plays.
 *   6. Commit. Now the on-stage emergency switch is ready.
 */

export const DEMO_PROMPT =
  "A lone astronaut walks across the rust-red dunes of Mars at golden hour, " +
  "her visor reflecting the distant sun, the silence around her broken only " +
  "by her breath and the soft crunch of the regolith beneath her boots.";

/**
 * Canonical beat ordering for the demo project. Cached-tier clips MUST be
 * uploaded under public_ids that match these beat templates so the
 * `fl_splice` URL composes the trailer in this order.
 */
export const DEMO_TRAILER_ORDER = [
  "trailer.establishing",
  "trailer.hook",
  "trailer.rising",
  "trailer.climax-tease",
  "trailer.sting",
] as const;

export type DemoTemplate = (typeof DEMO_TRAILER_ORDER)[number];

/**
 * Suggested Cloudinary public_id naming convention so cached lookups work
 * consistently. Replace `<cloud_name>` at upload time with our actual cloud.
 *
 * Example: sceneos/demo/trailer/establishing
 */
export const demoPublicId = (template: DemoTemplate) =>
  `sceneos/demo/${template.replace(".", "/")}`;
