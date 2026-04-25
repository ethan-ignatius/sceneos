import { useEffect, useState } from "react";
import { Database } from "lucide-react";

/**
 * Tiny chip in the chrome telling the user (and judges) that we're running
 * against the mock backend. Pings `/health` on mount; if the response carries
 * `{mockMode: true}` we render the chip.
 *
 * Per VIABILITY §5 V7 — demo-day reliability tell. "Yes, this is mock" is
 * a sophistication signal at a hackathon, not a downgrade signal.
 */
export function MockModeChip() {
  const [isMock, setIsMock] = useState<boolean | null>(null);

  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787")
      .replace(/\/$/, "");
    let cancelled = false;
    fetch(`${base}/api/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setIsMock(Boolean(d?.mockMode));
      })
      .catch(() => {
        // If health doesn't exist or backend's down, default to assuming
        // local dev = mock. Cheap heuristic.
        if (!cancelled) setIsMock(base.includes("localhost"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMock) return null;
  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-fg-tertiary/30 bg-bg-elev-1/70 px-2.5 py-1 caption-track text-[9px] text-fg-tertiary backdrop-blur-xl"
      title="Running against mock backend"
      aria-label="Mock backend mode"
    >
      <Database size={10} strokeWidth={1.5} aria-hidden="true" />
      <span>Mock mode</span>
    </div>
  );
}
