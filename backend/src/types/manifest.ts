/**
 * Mirror of frontend/src/types/manifest.ts.
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
  | "feature.denouement";

export interface BeatArchetype {
  intent: string;
  mood: BeatMood;
  suggestedDuration: number;
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
  clipPrompt?: HiggsfieldClipPrompt;
  jobId?: string;
  clipPublicId?: string;
  clipUrl?: string;
  durationSeconds?: number;
  approved: boolean;
}

/**
 * A self-contained Higgsfield prompt envelope for one clip.
 * Produced by the LLM decomposition layer (services/prompt-decomposer.ts)
 * and consumed by services/higgsfield.ts when kicking off generation.
 */
export interface HiggsfieldClipPrompt {
  /** Text-to-image prompt that seeds the keyframe. */
  imagePrompt: string;
  /** Image-to-video motion prompt. Describes camera + subject motion + atmosphere. */
  motionPrompt: string;
  aspectRatio: HiggsfieldAspectRatio;
  resolution: HiggsfieldResolution;
  durationSeconds: number;
  /** Preferred Higgsfield model_id, e.g. "higgsfield-ai/dop/standard". */
  preferredModel: string;
}

export type HiggsfieldAspectRatio = "16:9" | "9:16" | "1:1";
export type HiggsfieldResolution = "720p" | "1080p";

export interface AgentTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}
