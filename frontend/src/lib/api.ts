import type {
  AgentRequest,
  AgentResponse,
  DecomposeRequest,
  DecomposeResponse,
  GenerateRequest,
  GenerateResponse,
  StatusResponse,
  StitchRequest,
  StitchResponse,
  CutOSImportRequest,
  CutOSImportResponse,
} from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<TBody, TResponse>(
  path: string,
  init: { method: "GET" | "POST"; body?: TBody } = { method: "GET" },
): Promise<TResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let details: unknown = undefined;
    try {
      details = await res.json();
    } catch {
      /* swallow */
    }
    throw new ApiError(res.status, `API ${path} failed: ${res.status}`, details);
  }
  return (await res.json()) as TResponse;
}

export const api = {
  agent: (body: AgentRequest) =>
    request<AgentRequest, AgentResponse>("/api/agent", { method: "POST", body }),

  decompose: (body: DecomposeRequest) =>
    request<DecomposeRequest, DecomposeResponse>("/api/decompose", {
      method: "POST",
      body,
    }),

  generate: (body: GenerateRequest) =>
    request<GenerateRequest, GenerateResponse>("/api/generate", { method: "POST", body }),

  status: (jobId: string) =>
    request<undefined, StatusResponse>(`/api/status/${encodeURIComponent(jobId)}`, {
      method: "GET",
    }),

  stitchUrl: (body: StitchRequest) =>
    request<StitchRequest, StitchResponse>("/api/stitch/url", { method: "POST", body }),

  cutosImport: (body: CutOSImportRequest) =>
    request<CutOSImportRequest, CutOSImportResponse>("/api/cutos/import", {
      method: "POST",
      body,
    }),
};

export { ApiError };
