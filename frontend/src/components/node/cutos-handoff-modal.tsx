import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Manifest } from "@/types/manifest";
import { toast } from "sonner";

interface CutOSHandoffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: Manifest;
}

type State =
  | { kind: "importing" }
  | { kind: "ready"; editUrl: string }
  | { kind: "failed"; message: string };

/**
 * CutOS handoff modal — replaces the old fire-and-forget `window.open`.
 *
 * State machine:
 *   importing → calls api.cutosImport on first mount when open === true
 *   ready     → shows "Open in CutOS" CTA; user click opens the new tab
 *   failed    → shows the error + a Retry button
 *
 * Why a modal over a direct window.open: explicit user gesture inside the
 * dialog bypasses popup blockers, gives the user context about what's
 * happening, and lets them stay-here without losing the cinematic.
 */
export function CutOSHandoffModal({ open, onOpenChange, manifest }: CutOSHandoffModalProps) {
  const [state, setState] = useState<State>({ kind: "importing" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fire the import only when the dialog opens. Re-firing on each open
  // (i.e., user dismissed and reopened) is intentional — they may want
  // a fresh handoff.
  useEffect(() => {
    if (!open) return;
    setState({ kind: "importing" });
    let cancelled = false;
    (async () => {
      try {
        const res = await api.cutosImport({ manifest });
        if (cancelled || !mountedRef.current) return;
        if (!res.editUrl) {
          setState({ kind: "failed", message: "CutOS returned no edit URL." });
          return;
        }
        setState({ kind: "ready", editUrl: res.editUrl });
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setState({
          kind: "failed",
          message: err instanceof ApiError ? err.message : "CutOS handoff failed.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, manifest]);

  const projectShortId = manifest.projectId.slice(0, 8);
  const beatCount = manifest.beats.length;
  const duration = manifest.durationSeconds ?? 0;

  const openInCutOS = () => {
    if (state.kind !== "ready") return;
    const opened = window.open(state.editUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("Popup blocked. Allow popups and try again.");
      return;
    }
    onOpenChange(false);
  };

  const retry = () => {
    setState({ kind: "importing" });
    // Manually re-trigger by toggling open state would close; just re-fire.
    void (async () => {
      try {
        const res = await api.cutosImport({ manifest });
        if (!mountedRef.current) return;
        if (!res.editUrl) {
          setState({ kind: "failed", message: "CutOS returned no edit URL." });
          return;
        }
        setState({ kind: "ready", editUrl: res.editUrl });
      } catch (err) {
        if (!mountedRef.current) return;
        setState({
          kind: "failed",
          message: err instanceof ApiError ? err.message : "CutOS handoff failed.",
        });
      }
    })();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Open project in CutOS"
      caption="Handoff · CutOS"
      title="Importing your cinematic"
    >
      <div className="space-y-5">
        <p className="max-w-prose font-mono text-xs leading-relaxed text-fg-secondary">
          Your beat manifest is being uploaded to CutOS as an editable project.
          You can keep refining shots there — color, audio, subtitles — without
          re-running the questionnaire.
        </p>

        <dl className="grid grid-cols-3 gap-3 rounded-md border border-fg-tertiary/25 bg-bg-base/60 p-3 font-mono text-[11px]">
          <div className="space-y-1">
            <dt className="text-fg-tertiary uppercase tracking-[0.24em]">Project</dt>
            <dd className="text-fg-primary">{projectShortId}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-fg-tertiary uppercase tracking-[0.24em]">Beats</dt>
            <dd className="text-fg-primary tabular-nums">{beatCount}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-fg-tertiary uppercase tracking-[0.24em]">Duration</dt>
            <dd className="text-fg-primary tabular-nums">{duration}s</dd>
          </div>
        </dl>

        <StatusBlock state={state} />

        <div className="flex items-center justify-end gap-2 border-t border-fg-tertiary/20 pt-4">
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            Stay here
          </Button>
          {state.kind === "failed" ? (
            <Button variant="primary" size="md" onClick={retry}>
              Retry
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={openInCutOS}
              disabled={state.kind !== "ready"}
            >
              <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
              Open in CutOS
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function StatusBlock({ state }: { state: State }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] transition-colors duration-200",
        state.kind === "importing" && "border-fg-tertiary/40 text-fg-tertiary",
        state.kind === "ready" && "border-state-success/40 bg-state-success/10 text-state-success",
        state.kind === "failed" && "border-state-error/40 bg-state-error/10 text-state-error",
      )}
    >
      {state.kind === "importing" ? (
        <>
          <Loader2 size={12} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
          <span>Importing project to CutOS…</span>
        </>
      ) : state.kind === "ready" ? (
        <>
          <Check size={12} strokeWidth={2} aria-hidden="true" />
          <span>Imported. Ready to open.</span>
        </>
      ) : (
        <span>{state.message}</span>
      )}
    </div>
  );
}
