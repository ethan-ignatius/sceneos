import { create } from "zustand";
import type { JobStatus } from "@/types/api";

interface JobRecord {
  jobId: string;
  beatId: string;
  sceneId: string;
  status: JobStatus;
  startedAt: string;
  clipUrl?: string;
  clipPublicId?: string;
  error?: string;
}

interface RenderState {
  jobs: Record<string, JobRecord>;
  upsertJob: (job: JobRecord) => void;
  patchJob: (jobId: string, patch: Partial<JobRecord>) => void;
  reset: () => void;
}

export const useRenderStore = create<RenderState>((set) => ({
  jobs: {},
  upsertJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.jobId]: job } })),
  patchJob: (jobId, patch) =>
    set((s) => ({
      jobs: s.jobs[jobId] ? { ...s.jobs, [jobId]: { ...s.jobs[jobId], ...patch } } : s.jobs,
    })),
  reset: () => set({ jobs: {} }),
}));
