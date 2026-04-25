import type {
  AgentRequest,
  AgentResponse,
  AgentStreamEvent,
  DecomposeRequest,
  DecomposeResponse,
  GenerateRequest,
  GenerateResponse,
  OrchestrateRequest,
  OrchestrateResponse,
  ReferenceGenerateRequest,
  ReferenceGenerateResponse,
  SessionGetResponse,
  SessionStartRequest,
  SessionStartResponse,
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

/**
 * Stream `/api/agent/stream` SSE events. Yields parsed event objects.
 *
 * Usage:
 *   const ctrl = new AbortController();
 *   for await (const ev of api.agentStream(req, ctrl.signal)) {
 *     if (ev.type === "result") { ... }
 *   }
 */
async function* agentStream(
  body: AgentRequest,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  const res = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let details: unknown = undefined;
    try { details = await res.json(); } catch { /* swallow */ }
    throw new ApiError(res.status, `agent/stream failed: ${res.status}`, details);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          yield JSON.parse(line.slice(6)) as AgentStreamEvent;
        } catch {
          /* swallow malformed event */
        }
      }
    }
  }
}

export const api = {
  // Legacy one-shot agent turn. Prefer agentStream() for live thinking UI.
  agent: (body: AgentRequest) =>
    request<AgentRequest, AgentResponse>("/api/agent", { method: "POST", body }),

  agentStream,

  decompose: (body: DecomposeRequest) =>
    request<DecomposeRequest, DecomposeResponse>("/api/decompose", { method: "POST", body }),

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

  // ── Round 4 modern surface ──────────────────────────────────────────────

  /** Start a demo or normal session. Demo mode pre-generates all 7 beats. */
  sessionStart: (body: SessionStartRequest) =>
    request<SessionStartRequest, SessionStartResponse>("/api/session/start", {
      method: "POST",
      body,
    }),

  /** Reconcile in-memory state on refresh / late-join. */
  sessionGet: (projectId: string) =>
    request<undefined, SessionGetResponse>(
      `/api/session/${encodeURIComponent(projectId)}`,
      { method: "GET" },
    ),

  /**
   * Run the deterministic per-beat pipeline. The frontend calls this
   * AFTER the agent emits `kind: "sufficient"` + `beatFacts`. In demo
   * mode this returns the pre-warmed speculative job (no new work).
   */
  orchestrate: (beatId: string, body: OrchestrateRequest) =>
    request<OrchestrateRequest, OrchestrateResponse>(
      `/api/orchestrate/${encodeURIComponent(beatId)}`,
      { method: "POST", body },
    ),

  /** Generate a character or location reference image via Imagen 3. */
  referenceGenerate: (body: ReferenceGenerateRequest) =>
    request<ReferenceGenerateRequest, ReferenceGenerateResponse>(
      "/api/references/generate",
      { method: "POST", body },
    ),
};

export { ApiError };
