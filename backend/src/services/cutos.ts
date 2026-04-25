/**
 * CutOS handoff service.
 *
 * Owner: Stretch goal — only ship if the CutOS team adds the import endpoint.
 *
 * Implementation notes (see docs/BACKEND_ARCHITECTURE.md §6 + §11):
 *  - Posts the SceneOS manifest to CutOS's /api/projects/import-manifest.
 *  - Expected payload shape is in docs/SHARED_TYPES.md §5 (CutOSImportPayload).
 *  - Returns { projectId, editUrl } so the frontend can deep-link.
 */
import type { Manifest } from "../types/manifest.js";

interface CutOSImportPayload {
  projectName: string;
  resolution: "1920x1080";
  frameRate: 24;
  beats: Array<{
    beat_id: string;
    prompt: string;
    duration: number;
    clip_url: string;
    clip_storage_path?: string;
  }>;
}

export async function importManifest(manifest: Manifest): Promise<{ projectId: string; editUrl: string }> {
  const payload: CutOSImportPayload = {
    projectName: `SceneOS · ${manifest.masterPrompt.slice(0, 40)}…`,
    resolution: "1920x1080",
    frameRate: 24,
    beats: manifest.beats.flatMap((b) =>
      b.scenes
        .filter((s) => s.approved && s.clipUrl)
        .map((s) => ({
          beat_id: b.beatId,
          prompt: s.refinedPrompt ?? "",
          duration: s.durationSeconds ?? 5,
          clip_url: s.clipUrl!,
        })),
    ),
  };

  const baseUrl = process.env.CUTOS_BASE_URL ?? "http://localhost:3000";
  const token = process.env.CUTOS_API_TOKEN;

  if (payload.beats.length === 0) {
    throw new Error("No approved clips with clipUrl available for CutOS import");
  }

  const res = await fetch(`${baseUrl}/api/projects/import-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CutOS import failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const body = (await res.json().catch(() => ({}))) as { projectId?: string; editUrl?: string };
  if (!body.projectId) {
    throw new Error("CutOS import response missing projectId");
  }

  return {
    projectId: body.projectId,
    editUrl: body.editUrl ?? `${baseUrl}/projects/${body.projectId}`,
  };
}
