/**
 * Mock CutOS handoff — pretends to import the manifest and returns a
 * believable project URL the frontend can deep-link.
 */
import type { CutOSImportResponse } from "../types/api.js";
import { uuid } from "./util.js";

export function mockCutosImport(): CutOSImportResponse {
  const projectId = `mock-${uuid().slice(0, 8)}`;
  return {
    projectId,
    editUrl: `${process.env.CUTOS_BASE_URL ?? "http://localhost:3000"}/projects/${projectId}`,
  };
}
