/**
 * In-memory job registry. Maps our internal jobId to the provider's job id
 * plus metadata needed to construct the Cloudinary public_id and to cache
 * the upload result for repeat polls.
 *
 * Hackathon scope: a server restart loses in-flight jobs. Acceptable per
 * docs/BACKEND_ARCHITECTURE.md §7.
 */
import { randomUUID } from "node:crypto";
import type { GenerationProvider } from "../types/api.js";

export interface UploadResult {
  publicId: string;
  url: string;
  durationSeconds: number;
}

export interface JobRecord {
  jobId: string;
  providerJobId: string;
  providerName: GenerationProvider;
  projectId: string;
  beatId: string;
  sceneId: string;
  durationSeconds: number;
  /** Set once Cloudinary upload completes — subsequent polls return this directly. */
  upload?: UploadResult;
  /** In-flight upload promise — concurrent polls share it instead of double-uploading. */
  uploadPromise?: Promise<UploadResult>;
  /** Terminal error, if any (provider failure or upload failure). */
  error?: string;
}

const jobs = new Map<string, JobRecord>();

export function registerJob(input: Omit<JobRecord, "jobId">): string {
  const jobId = randomUUID();
  jobs.set(jobId, { ...input, jobId });
  return jobId;
}

export function getJob(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

export function publicIdFor(job: JobRecord): string {
  return `sceneos/${job.projectId}/${job.beatId}/${job.sceneId}`;
}

/**
 * Ensure the job's clip is uploaded to Cloudinary exactly once, even under
 * concurrent polling. Returns the cached result on subsequent calls.
 */
export async function ensureUpload(
  job: JobRecord,
  upload: () => Promise<UploadResult>,
): Promise<UploadResult> {
  if (job.upload) return job.upload;
  if (!job.uploadPromise) {
    job.uploadPromise = upload()
      .then((result) => {
        job.upload = result;
        job.uploadPromise = undefined;
        return result;
      })
      .catch((err) => {
        job.uploadPromise = undefined;
        job.error = err instanceof Error ? err.message : String(err);
        throw err;
      });
  }
  return job.uploadPromise;
}
