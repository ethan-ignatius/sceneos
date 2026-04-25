/**
 * Mirror of backend/src/types/manifest.ts.
 * When you change a type here, update the other copy in the same commit.
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
 * Produced by the backend LLM decomposition layer and used by the
 * generate flow when calling Higgsfield.
 */
export interface HiggsfieldClipPrompt {
  imagePrompt: string;
  motionPrompt: string;
  aspectRatio: HiggsfieldAspectRatio;
  resolution: HiggsfieldResolution;
  durationSeconds: number;
  preferredModel: string;
}

export type HiggsfieldAspectRatio = "16:9" | "9:16" | "1:1";
export type HiggsfieldResolution = "720p" | "1080p";

export interface AgentTurn {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}
