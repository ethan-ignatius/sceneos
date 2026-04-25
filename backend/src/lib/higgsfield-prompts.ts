/**
 * Pure helpers that translate a HiggsfieldClipPrompt into the JSON body shape
 * Higgsfield's queue endpoint expects.
 *
 * Reference (canonical request shapes):
 *   text-to-image:   POST https://platform.higgsfield.ai/{model_id}
 *                    body: { prompt, aspect_ratio, resolution }
 *   image-to-video:  POST https://platform.higgsfield.ai/{model_id}
 *                    body: { image_url, prompt, duration }
 *
 * services/higgsfield.ts is expected to take these bodies and POST them with
 * the `Authorization: Key {api_key}:{api_key_secret}` header.
 */

import type { HiggsfieldClipPrompt } from "../types/manifest.js";

export interface HiggsfieldText2ImageBody {
  prompt: string;
  aspect_ratio: string;
  resolution: string;
}

export interface HiggsfieldImage2VideoBody {
  image_url: string;
  prompt: string;
  duration: number;
  aspect_ratio?: string;
  resolution?: string;
}

export const HIGGSFIELD_BASE_URL = "https://platform.higgsfield.ai";

/** Default text-to-image model used to render the seed keyframe for a clip. */
export const DEFAULT_T2I_MODEL = "higgsfield-ai/soul/standard";

export function buildText2ImageBody(prompt: HiggsfieldClipPrompt): HiggsfieldText2ImageBody {
  return {
    prompt: prompt.imagePrompt,
    aspect_ratio: prompt.aspectRatio,
    resolution: prompt.resolution,
  };
}

export function buildImage2VideoBody(
  prompt: HiggsfieldClipPrompt,
  imageUrl: string,
): HiggsfieldImage2VideoBody {
  return {
    image_url: imageUrl,
    prompt: prompt.motionPrompt,
    duration: prompt.durationSeconds,
    aspect_ratio: prompt.aspectRatio,
    resolution: prompt.resolution,
  };
}

export function submitUrlFor(modelId: string): string {
  return `${HIGGSFIELD_BASE_URL}/${modelId}`;
}

export function statusUrlFor(requestId: string): string {
  return `${HIGGSFIELD_BASE_URL}/requests/${requestId}/status`;
}

export function cancelUrlFor(requestId: string): string {
  return `${HIGGSFIELD_BASE_URL}/requests/${requestId}/cancel`;
}

export function authHeader(apiKey: string, apiSecret: string): string {
  return `Key ${apiKey}:${apiSecret}`;
}
