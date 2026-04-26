import { useEffect, useRef } from "react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { api } from "@/lib/api";

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Mounts once and persists every manifest change to MongoDB
 * (`/api/projects` upsert) on a 1.5s debounce.
 *
 * Without this, the only times the project hits MongoDB are on
 * resumeProject / discardProject / reset — which means a browser
 * refresh mid-session loses everything past the last archive event.
 * With this, every approveScene, updateScene, updateBeat, applyDecomp
 * etc. eventually flushes to Mongo and the project survives a refresh
 * (and a localStorage clear, and a different machine login).
 *
 * Fire-and-forget: errors are swallowed because Mongo is best-effort
 * persistence; the source of truth at runtime is the in-memory store
 * + the backend's session cache. Network blip → next save will catch up.
 */
export function ManifestAutoSync() {
  const manifest = useBeatGraphStore((s) => s.manifest);
  const editor = useBeatGraphStore((s) => s.editor);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!manifest) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const m = manifest;
    const e = editor.decisions ? editor : undefined;
    timerRef.current = window.setTimeout(() => {
      api
        .saveProject({
          projectId: m.projectId,
          manifest: m,
          status: "active",
          editor: e,
        })
        .catch(() => {
          /* swallow — best-effort persistence */
        });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [manifest, editor]);

  return null;
}
