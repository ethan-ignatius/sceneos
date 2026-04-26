import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./api";

// Smoke test for queue task #88: a hung Vertex/Cloudinary stream should
// be cleanly aborted by the route's 60s setTimeout, not leak the fetch
// indefinitely. Tests both stream APIs against the same simulated hang
// — fetch resolves only when the abort signal fires.

function installHangingFetch() {
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // hang forever — no abort hook means leaked fetch (the bug)
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("stream timeout abort", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalFetch) {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it("editorStream rejects with AbortError when its signal aborts after 60s", async () => {
    installHangingFetch();
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

    const iter = api.editorStream(
      {
        manifest: {
          projectId: "p1",
          videoType: "trailer",
          masterPrompt: "test",
          createdAt: "2026-04-26T00:00:00Z",
          beats: [],
        },
        decisions: { clips: [] },
        conversation: [],
      } as unknown as Parameters<typeof api.editorStream>[0],
      ctrl.signal,
    );

    // Drive the stream until the timeout fires. The iterator awaits the
    // hung fetch; advancing fake timers triggers the 60s setTimeout,
    // which aborts the controller, which rejects the fetch.
    const collected: unknown[] = [];
    const consumed = (async () => {
      try {
        for await (const ev of iter) collected.push(ev);
      } catch (err) {
        return err;
      }
      return null;
    })();

    await vi.advanceTimersByTimeAsync(60_000);
    const err = (await consumed) as Error | null;

    expect(ctrl.signal.aborted).toBe(true);
    expect(collected).toEqual([]);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("AbortError");
    clearTimeout(timeoutId);
  });

  it("agentStream rejects with AbortError when its signal aborts after 60s", async () => {
    installHangingFetch();
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

    const iter = api.agentStream(
      {
        manifest: {
          projectId: "p1",
          videoType: "trailer",
          masterPrompt: "test",
          createdAt: "2026-04-26T00:00:00Z",
          beats: [],
        },
        beatId: "b1",
      } as unknown as Parameters<typeof api.agentStream>[0],
      ctrl.signal,
    );

    const consumed = (async () => {
      try {
        for await (const _ of iter) { /* drain */ }
      } catch (err) {
        return err;
      }
      return null;
    })();

    await vi.advanceTimersByTimeAsync(60_000);
    const err = (await consumed) as Error | null;

    expect(ctrl.signal.aborted).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("AbortError");
    clearTimeout(timeoutId);
  });

  it("a stream that hasn't hit 60s yet keeps the controller un-aborted", async () => {
    installHangingFetch();
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

    // Advance just under the threshold — abort must NOT have fired yet.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(ctrl.signal.aborted).toBe(false);

    // One more second tips it over.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ctrl.signal.aborted).toBe(true);
    clearTimeout(timeoutId);
  });
});
