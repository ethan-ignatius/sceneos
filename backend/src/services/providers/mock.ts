/**
 * Mock video provider. Returns one of a handful of public sample MP4s after a
 * simulated generation latency. Lets us validate the entire pipeline (route →
 * job registry → Cloudinary upload → fl_splice URL construction) without any
 * paid third-party API.
 *
 * The sample MP4s come from Google's public test bucket. They're stable, CORS-
 * unrestricted, and fetchable by Cloudinary's `uploader.upload(url)` call.
 */
import { randomUUID } from "node:crypto";
import type {
  ProviderGenerateParams,
  ProviderGenerateResult,
  ProviderStatusResult,
  VideoProvider,
} from "./types.js";

const SAMPLE_CLIPS: string[] = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
];

const MOCK_LATENCY_MS = Number(process.env.MOCK_GENERATION_LATENCY_MS ?? 12_000);

interface MockJob {
  readyAt: number;
  clipUrl: string;
  prompt: string;
}

const jobs = new Map<string, MockJob>();

export const mockProvider: VideoProvider = {
  name: "mock",
  async generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult> {
    const providerJobId = `mock_${randomUUID()}`;
    jobs.set(providerJobId, {
      readyAt: Date.now() + MOCK_LATENCY_MS,
      clipUrl: SAMPLE_CLIPS[Math.floor(Math.random() * SAMPLE_CLIPS.length)]!,
      prompt: params.prompt,
    });
    return { providerJobId, pollAfterMs: 5000 };
  },
  async getStatus(providerJobId: string): Promise<ProviderStatusResult> {
    const job = jobs.get(providerJobId);
    if (!job) return { status: "failed", error: `unknown mock job ${providerJobId}` };
    if (Date.now() < job.readyAt) return { status: "running" };
    return { status: "succeeded", clipUrl: job.clipUrl };
  },
};
