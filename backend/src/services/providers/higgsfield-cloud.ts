/**
 * Higgsfield Cloud provider — real video generation.
 *
 * NOT YET WIRED. The exact endpoint paths and request body shape need to be
 * confirmed against https://cloud.higgsfield.ai/ docs once API access is
 * available. The Python SDK at https://github.com/higgsfield-ai/higgsfield-client
 * is the canonical reference; this is a sketch of the equivalent fetch shape.
 *
 * Switching to this provider only requires setting HIGGSFIELD_API_KEY in env —
 * the dispatcher in services/generation.ts auto-selects it.
 */
import type {
  ProviderGenerateParams,
  ProviderGenerateResult,
  ProviderStatusResult,
  VideoProvider,
} from "./types.js";
import { ProviderQuotaError } from "./types.js";

const BASE_URL = process.env.HIGGSFIELD_BASE_URL ?? "https://cloud.higgsfield.ai";
const API_KEY = process.env.HIGGSFIELD_API_KEY;

function authHeaders(): Record<string, string> {
  if (!API_KEY) throw new Error("HIGGSFIELD_API_KEY not configured");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

export const higgsfieldProvider: VideoProvider = {
  name: "higgsfield",
  async generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult> {
    // TODO: confirm endpoint path + body schema against actual Higgsfield Cloud docs.
    // Sketch based on typical async-job APIs:
    const res = await fetch(`${BASE_URL}/api/generations`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        prompt: params.prompt,
        duration: params.durationSeconds,
        resolution: params.resolution ?? "1080p",
        start_image_url: params.startImageUrl,
        model: "sora-2",
      }),
    });
    if (res.status === 429) {
      throw new ProviderQuotaError("higgsfield", "Higgsfield rate limit / quota exceeded");
    }
    if (!res.ok) {
      throw new Error(`Higgsfield generate failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { generation_id: string };
    return { providerJobId: json.generation_id, pollAfterMs: 8000 };
  },
  async getStatus(providerJobId: string): Promise<ProviderStatusResult> {
    const res = await fetch(`${BASE_URL}/api/generations/${providerJobId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      return { status: "failed", error: `Higgsfield status ${res.status}` };
    }
    const json = (await res.json()) as {
      status: "queued" | "running" | "succeeded" | "failed";
      video_url?: string;
      error?: string;
    };
    return { status: json.status, clipUrl: json.video_url, error: json.error };
  },
};
