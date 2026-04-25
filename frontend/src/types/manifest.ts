/**
 * Manifest shape. Frontend canonical copy; the FastAPI backend (backend_py/sceneos_py)
 * accepts this via dict bodies.
 * Source of truth: docs/SHARED_TYPES.md
 */

/**
 * Backend-canonical video types as of round 4 (2026-04-25):
 *   "story"   — 7-beat dramatic arc (the primary path)
 *   "trailer" — 5-beat trailer
 *   "short"   — 3-beat short
 * "feature" is retained for backwards-compat but is not produced by
 * /api/session/start.
 */
export type VideoType = "story" | "trailer" | "short" | "feature";

export type SessionMode = "demo" | "normal";

export interface Manifest {
  projectId: string;
  videoType: VideoType;
  masterPrompt: string;
  createdAt: string;
  beats: Beat[];
  /** Set by /api/session/start. The orchestrator + agent both read this. */
  mode?: SessionMode;
  /**
   * Picked by /api/session/start (mood/videoType-based) and stamped onto
   * the manifest. /api/stitch/url uses this as the audio overlay if no
   * explicit audioPublicId is in the stitch request body.
   */
  audioPublicId?: string;
  finalCloudinaryUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface Beat {
  beatId: string;
  beatName: string;
  template: BeatTemplate;
  status: BeatStatus;
  scenes: Scene[];
  archetype: BeatArchetype;
}

export type BeatStatus =
  | "pending"
  | "questioning"
  | "ready-to-generate"
  | "generating"
  | "preview"
  | "approved";

export type BeatTemplate =
  | "story.hook"
  | "story.exposition"
  | "story.inciting"
  | "story.rising"
  | "story.climax"
  | "story.falling"
  | "story.resolution"
  | "trailer.establishing"
  | "trailer.hook"
  | "trailer.rising"
  | "trailer.climax-tease"
  | "trailer.sting"
  | "short.hook"
  | "short.turn"
  | "short.payoff"
  | "feature.setup"
  | "feature.inciting"
  | "feature.rising"
  | "feature.midpoint"
  | "feature.crisis"
  | "feature.climax"
  | "feature.denouement";

export interface BeatArchetype {
  /** One-line beat purpose for UI display. */
  intent: string;
  /** Visual mood — informs Cloudinary color grade transformation. */
  mood: BeatMood;
  /** Suggested duration. Final duration is per-scene. */
  suggestedDuration: number;
  /**
   * Directorial guidance the agent prepends to its system prompt when
   * questioning + composing a Higgsfield prompt for this beat. This is
   * the moat — keep it specific (lens, movement, light, blocking, pace).
   */
  directorNotes: string;
}

export type BeatMood =
  | "wide-establish"
  | "intimate-hook"
  | "kinetic-rising"
  | "tense-climax"
  | "still-resolve"
  | "punchy-sting";

export interface Scene {
  sceneId: string;
  conversation: AgentTurn[];
  refinedPrompt?: string;
  /** Stamped by /api/orchestrate when it composes the final prompt. */
  clipPrompt?: ClipPrompt;
  jobId?: string;
  clipPublicId?: string;
  clipUrl?: string;
  /**
   * Cloudinary `so_99p` derivative of clipPublicId. Set by /api/status when
   * the job succeeds. Pass as `previousLastFrameUrl` to the next
   * /api/orchestrate call to chain consecutive scenes.
   */
  lastFrameUrl?: string;
  durationSeconds?: number;
  approved: boolean;
}

/**
 * Provider-agnostic clip prompt envelope returned by /api/orchestrate.
 * Mirrors the backend's `compose_clip_prompt()` output. Frontend usually
 * just stamps this on the scene; the orchestrator already submitted the
 * generation job.
 */
export interface ClipPrompt {
  imagePrompt: string;
  motionPrompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
  durationSeconds: number;
  preferredModel?: string;
}

export interface AgentTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}
