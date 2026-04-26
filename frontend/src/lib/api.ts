import type {
  AgentRequest,
  AgentResponse,
  AgentStreamEvent,
  DecomposeRequest,
  DecomposeResponse,
  EditorApplyRequest,
  EditorApplyResponse,
  EditorInitResponse,
  EditorStreamEvent,
  EditorTurnRequest,
  EditorTurnResponse,
  GenerateRequest,
  GenerateResponse,
  NarrateBeatRequest,
  NarrateBeatResponse,
  NarrateMomentRequest,
  NarrateMomentResponse,
  NarrateSummaryRequest,
  NarrateSummaryResponse,
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
import type { Manifest } from "@/types/manifest";
import {
  isDemoMode,
  getDemoFixtureId,
  registerDemoJob,
  getDemoJob,
  resolveJobStage,
  sleep,
} from "./demo-mode";
import { DEMO_FIXTURES } from "./demo-fixtures";

/**
 * API origin. In dev, default is same-origin (empty) so requests go through
 * Vite’s proxy to :8787 — works for both localhost and 127.0.0.1. Override
 * with `VITE_API_BASE_URL` when the backend runs elsewhere.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "" : "http://localhost:8787");

const BASE_URL = API_BASE_URL;

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
  init: { method: "GET" | "POST"; body?: TBody; signal?: AbortSignal } = { method: "GET" },
): Promise<TResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
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
 * Turn fetch failures into an actionable string. Call after ruling out
 * AbortError (intentional cancel). Returns "" for AbortError.
 */
export function formatDirectorReachabilityError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name === "AbortError") return "";
  if (err instanceof Error) {
    const m = (err.message || "").toLowerCase();
    if (
      m.includes("failed to fetch") ||
      m.includes("load failed") ||
      m.includes("networkerror") ||
      m.includes("network request failed")
    ) {
      return (
        `Can't connect to the API${API_BASE_URL ? ` (${API_BASE_URL})` : " (dev: use Vite proxy to :8787)"}. ` +
        `Run ./dev.sh, then check http://127.0.0.1:8787/api/health. ` +
        `If the API is elsewhere, set VITE_API_BASE_URL in frontend/.env and restart Vite.`
      );
    }
    return err.message;
  }
  return "Couldn't reach the director.";
}

// ────────────────────────────────────────────────────────────────────────
// Demo helpers — keep all the canned-response logic in one place so the
// real-mode code paths below stay readable. These run only when
// isDemoMode() is true (set via VITE_DEMO_MODE=1 or `?demo=1` on URL).
// ────────────────────────────────────────────────────────────────────────

function demoFixture() {
  return DEMO_FIXTURES[getDemoFixtureId()];
}

/**
 * Map a manifest beatId to a fixture beat by index. The manifest's
 * beat IDs are random UUIDs from buildInitialBeats(), so the demo
 * fixture can't pre-know them — but the request payload always
 * carries the beats in canvas order, so positional mapping is
 * deterministic.
 */
function fixtureBeatForId(beatId: string, orderedBeatIds: string[]) {
  const fx = demoFixture();
  const idx = orderedBeatIds.indexOf(beatId);
  // Wrap if the manifest has more beats than the fixture (e.g. demo=short3
  // but the user picked Movie/8-beat). Better than throwing and breaking
  // the demo flow on a wrong tier pick.
  return fx.beats[idx >= 0 ? idx % fx.beats.length : 0];
}

async function demoDecompose(body: DecomposeRequest): Promise<DecomposeResponse> {
  await sleep(1500);
  const fx = demoFixture();
  return {
    clips: body.beats.map((b, i) => {
      const fb = fx.beats[i % fx.beats.length];
      return {
        beatId: b.beatId,
        sceneSummary: fb.refinedSummary,
        refinedPrompt: fb.refinedPrompt,
      };
    }),
    continuityBible: fx.continuityBible,
  };
}

async function demoAgent(body: AgentRequest): Promise<AgentResponse> {
  await sleep(800);
  const orderedIds = body.manifest.beats.map((b) => b.beatId);
  const fb = fixtureBeatForId(body.beatId, orderedIds);
  const beat = body.manifest.beats.find((b) => b.beatId === body.beatId);
  const turns = beat?.scenes[0]?.conversation.length ?? 0;
  // First call (empty conversation) → seed question. Subsequent calls
  // walk the user toward sufficient on the second user message.
  if (!body.userMessage || turns === 0) {
    return {
      kind: "question",
      question: fb.firstQuestion,
      reasoning: "Establishing the emotional register for this beat.",
      estimatedRemaining: 1,
      suggestedAnswers: fb.suggestedAnswers,
    };
  }
  // After one user reply, the agent flips to sufficient — the demo
  // doesn't need a multi-turn back-and-forth eating stage time.
  return {
    kind: "sufficient",
    refinedPrompt: fb.refinedPrompt,
    sceneSummary: fb.refinedSummary,
    suggestedDuration: fb.durationSeconds,
  };
}

async function* demoAgentStream(
  body: AgentRequest,
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  yield { type: "ready" };
  // Three thought tokens — feels like Gemini's stream cadence.
  await sleep(400);
  yield { type: "thought", chunk: "Reading the conversation so far…" };
  await sleep(500);
  yield { type: "thought", chunk: "Mapping the user's intent to the beat archetype…" };
  await sleep(500);
  yield { type: "thought", chunk: "Composing the next move…" };
  await sleep(400);
  const result = await demoAgent(body);
  if (result.kind === "question") {
    yield {
      type: "result",
      kind: "question",
      question: result.question,
      reasoning: result.reasoning,
      estimatedRemaining: result.estimatedRemaining,
      suggestedAnswers: result.suggestedAnswers,
    };
  } else {
    yield {
      type: "result",
      kind: "sufficient",
      refinedPrompt: result.refinedPrompt,
      sceneSummary: result.sceneSummary,
      suggestedDuration: result.suggestedDuration,
    };
  }
  yield { type: "done" };
}

async function demoGenerate(body: GenerateRequest): Promise<GenerateResponse> {
  await sleep(400);
  // Pull the manifest from the store at dispatch time so we know the
  // canvas order without relying on the request to carry it.
  const { useBeatGraphStore } = await import("@/stores/beat-graph-store");
  const m = useBeatGraphStore.getState().manifest;
  const orderedIds = m?.beats.map((b) => b.beatId) ?? [body.beatId];
  const fb = fixtureBeatForId(body.beatId, orderedIds);
  const jobId = `demo-${body.beatId}-${Date.now()}`;
  registerDemoJob(jobId, {
    startedAtMs: Date.now(),
    clipPublicId: fb.clipPublicId,
    clipUrl: fb.clipUrl,
    lastFrameUrl: fb.lastFrameUrl,
  });
  return {
    jobId,
    provider: "vertex",
    pollAfterMs: 1000,
  };
}

async function demoStatus(jobId: string): Promise<StatusResponse> {
  await sleep(180);
  const job = getDemoJob(jobId);
  if (!job) {
    return { jobId, status: "failed", error: "Unknown demo jobId — already cleared." };
  }
  const stage = resolveJobStage(job);
  const base: StatusResponse = {
    jobId,
    status: stage.status,
    stage: stage.stage,
    pollAfterMs: 800,
    provider: "vertex",
    startedAt: new Date(job.startedAtMs).toISOString(),
  };
  if (stage.status === "succeeded") {
    base.clipPublicId = job.clipPublicId;
    base.clipUrl = job.clipUrl;
    base.lastFrameUrl = job.lastFrameUrl;
  }
  return base;
}

async function demoStitchUrl(): Promise<StitchResponse> {
  await sleep(1200);
  const fx = demoFixture();
  const totalDuration = fx.beats.reduce((s, b) => s + b.durationSeconds, 0);
  return {
    finalUrl: fx.masterCutUrl,
    thumbnailUrl: fx.masterCutUrl.replace(/\.mp4$/, ".jpg"),
    durationSeconds: totalDuration,
    audioPublicId: fx.audioPublicId,
  };
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
  if (isDemoMode()) {
    yield* demoAgentStream(body);
    return;
  }
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

/**
 * Stream `/api/editor/stream` SSE events. Same envelope as agentStream
 * — `type` discriminator, `result` event mirrors EditorTurnResponse so
 * consumers can branch on `kind` ("propose" | "commit") inside it.
 *
 * Editor latency on Vertex Gemini 2.5 Flash is ~6–8s per turn (same
 * profile as the main agent). Streaming gives the user transparent
 * thinking-token feedback during the wait so the UI never reads as
 * frozen.
 */
async function* editorStream(
  body: EditorTurnRequest,
  signal?: AbortSignal,
): AsyncGenerator<EditorStreamEvent, void, unknown> {
  const res = await fetch(`${BASE_URL}/api/editor/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let details: unknown = undefined;
    try { details = await res.json(); } catch { /* swallow */ }
    throw new ApiError(res.status, `editor/stream failed: ${res.status}`, details);
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
          yield JSON.parse(line.slice(6)) as EditorStreamEvent;
        } catch {
          /* swallow malformed event */
        }
      }
    }
  }
}

export const api = {
  /**
   * One-shot agent turn (`with_thinking=false` on the server). Use this for
   * the *first* question on an empty beat — it is much faster than
   * `agentStream`, which uses thinking + streaming and can double-call
   * Gemini. Keep `agentStream` for follow-up messages so the user still
   * sees live thought tokens.
   */
  agent: (body: AgentRequest, signal?: AbortSignal) =>
    isDemoMode()
      ? demoAgent(body)
      : request<AgentRequest, AgentResponse>("/api/agent", { method: "POST", body, signal }),

  agentStream,

  decompose: (body: DecomposeRequest) =>
    isDemoMode()
      ? demoDecompose(body)
      : request<DecomposeRequest, DecomposeResponse>("/api/decompose", { method: "POST", body }),

  generate: (body: GenerateRequest) =>
    isDemoMode()
      ? demoGenerate(body)
      : request<GenerateRequest, GenerateResponse>("/api/generate", { method: "POST", body }),

  status: (jobId: string) =>
    isDemoMode()
      ? demoStatus(jobId)
      : request<undefined, StatusResponse>(`/api/status/${encodeURIComponent(jobId)}`, {
          method: "GET",
        }),

  stitchUrl: (body: StitchRequest) =>
    isDemoMode()
      ? demoStitchUrl()
      : request<StitchRequest, StitchResponse>("/api/stitch/url", { method: "POST", body }),

  cutosImport: (body: CutOSImportRequest) =>
    request<CutOSImportRequest, CutOSImportResponse>("/api/cutos/import", {
      method: "POST",
      body,
    }),

  // ── Editor (Stage 7) ────────────────────────────────────────────────────

  editorInit: (manifest: Manifest) =>
    request<{ manifest: Manifest }, EditorInitResponse>("/api/editor/init", {
      method: "POST",
      body: { manifest },
    }),

  editorTurn: (body: EditorTurnRequest) =>
    request<EditorTurnRequest, EditorTurnResponse>("/api/editor/turn", {
      method: "POST",
      body,
    }),

  editorStream,

  editorApply: (body: EditorApplyRequest) =>
    request<EditorApplyRequest, EditorApplyResponse>("/api/editor/apply", {
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

  // ── Narration (ElevenLabs narrator) ──────────────────────────────────────

  narrateBeat: (body: NarrateBeatRequest) =>
    request<NarrateBeatRequest, NarrateBeatResponse>("/api/narrate/beat", {
      method: "POST",
      body,
    }),

  narrateSummary: (body: NarrateSummaryRequest) =>
    request<NarrateSummaryRequest, NarrateSummaryResponse>("/api/narrate/summary", {
      method: "POST",
      body,
    }),

  narrateMoment: (body: NarrateMomentRequest) =>
    request<NarrateMomentRequest, NarrateMomentResponse>("/api/narrate/moment", {
      method: "POST",
      body,
    }),

  // ── MongoDB-backed project persistence ──────────────────────────────────

  listProjects: () =>
    request<undefined, MongoProject[]>("/api/projects", { method: "GET" }),

  getProject: (projectId: string) =>
    request<undefined, MongoProject>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "GET",
    }),

  saveProject: (body: SaveProjectRequest) =>
    request<SaveProjectRequest, { ok: boolean; projectId: string }>("/api/projects", {
      method: "POST",
      body,
    }),

  deleteProject: (projectId: string) =>
    fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, "Delete failed");
        return (await res.json()) as { ok: boolean; projectId: string };
      }),
};

export interface MongoProject {
  id: string;
  masterPrompt: string;
  videoType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  thumbnailUrl: string | null;
  manifest: Manifest | null;
  editor: unknown;
}

export interface SaveProjectRequest {
  projectId: string;
  manifest: Manifest;
  status?: string;
  editor?: unknown;
}

export { ApiError };

