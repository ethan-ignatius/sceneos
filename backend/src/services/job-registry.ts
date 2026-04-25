/**
 * In-memory job registry for Higgsfield generation jobs.
 *
 * Each /api/generate creates one local jobId; the backend then drives a
 * two-stage state machine (text-to-image → image-to-video) inside services/
 * higgsfield.ts. The frontend polls /api/status with the local jobId only.
 */

import type { HiggsfieldClipPrompt } from "../types/manifest.js";

export type JobStage =
  | "t2i_running"
  | "i2v_running"
  | "succeeded"
  | "failed";

export interface Job {
  jobId: string;
  stage: JobStage;
  clipPrompt: HiggsfieldClipPrompt;
  t2iRequestId?: string;
  i2vRequestId?: string;
  imageUrl?: string;
  videoUrl?: string;
  cloudinaryUrl?: string;
  cloudinaryPublicId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  beatId?: string;
  sceneId?: string;
  projectId?: string;
}

const jobs = new Map<string, Job>();

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function putJob(job: Job): void {
  jobs.set(job.jobId, { ...job, updatedAt: new Date().toISOString() });
}
