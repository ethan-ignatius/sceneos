/**
 * Manifest shape. Frontend canonical copy; the FastAPI backend (backend_py/sceneos_py)
 * accepts this via dict bodies.
 * Source of truth: docs/SHARED_TYPES.md
 */

export type VideoType = "trailer" | "short" | "feature";

export interface Manifest {
  projectId: string;
  videoType: VideoType;
  masterPrompt: string;
  createdAt: string;
  beats: Beat[];
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
  | "feature.denouement"
  // story.* — canonical 7-beat dramatic arc (added Module C / STATE.md).
  // Backend `beat_templates.STORY` is the source of truth.
  | "story.hook"
  | "story.exposition"
  | "story.inciting"
  | "story.rising"
  | "story.climax"
  | "story.falling"
  | "story.resolution";

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
  jobId?: string;
  clipPublicId?: string;
  clipUrl?: string;
  durationSeconds?: number;
  approved: boolean;
}

export interface AgentTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}
