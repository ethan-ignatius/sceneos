import { Hono } from "hono";
import type { CutOSImportRequest, CutOSImportResponse } from "../types/api.js";

/**
 * POST /api/cutos/import
 * Hands a SceneOS manifest off to CutOS for power-user editing.
 *
 * Owner: Stretch goal
 *
 * Implementation notes:
 *  - Call services/cutos.ts → importManifest(manifest).
 *  - The CutOS team needs to add POST /api/projects/import-manifest. See
 *    docs/BACKEND_ARCHITECTURE.md §11 for the payload they should accept.
 *  - On success, return { projectId, editUrl } so SceneOS frontend can deep-link.
 */
export const cutosRoute = new Hono();

cutosRoute.post("/import", async (c) => {
  const body = (await c.req.json().catch(() => null)) as CutOSImportRequest | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  // TODO: call services/cutos.ts.importManifest(body.manifest).
  const stub: CutOSImportResponse = {
    projectId: "stub-project",
    editUrl: `${process.env.CUTOS_BASE_URL ?? "http://localhost:3000"}/projects/stub-project`,
  };
  return c.json(stub, 501);
});
