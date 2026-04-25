import { Hono } from "hono";
import type { CutOSImportRequest, CutOSImportResponse } from "../types/api.js";
import { isMockMode } from "../lib/mock-mode.js";
import { mockCutosImport } from "../mock/index.js";
import { importManifest } from "../services/cutos.js";

/**
 * POST /api/cutos/import
 * Hands the manifest to CutOS for power-user editing.
 *
 * In MOCK_MODE returns a believable project URL the frontend can deep-link
 * (the URL won't open a real CutOS project; that's fine for FE dev).
 *
 * Real implementation hits CutOS' POST /api/projects/import-manifest —
 * which the CutOS team must add (see BACKEND_ARCHITECTURE.md §11).
 */
export const cutosRoute = new Hono();

cutosRoute.post("/import", async (c) => {
  const body = (await c.req.json().catch(() => null)) as CutOSImportRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  if (isMockMode()) {
    return c.json(mockCutosImport(), 200);
  }

  try {
    const response: CutOSImportResponse = await importManifest(body.manifest);
    return c.json(response, 200);
  } catch (err) {
    return c.json(
      { error: "CutOS import failed", details: (err as Error).message },
      502,
    );
  }
});
