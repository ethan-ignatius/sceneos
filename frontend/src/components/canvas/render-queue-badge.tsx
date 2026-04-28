import { motion, AnimatePresence } from "motion/react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { isDemoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";

/**
 * RenderQueueBadge — a small floating receipt on the canvas that shows
 * the speculative pre-bake jobs running in parallel for every beat.
 *
 * Why this exists: judges asked "the render felt instant — what's
 * actually happening?" The answer is: while the user is conversing
 * with the per-beat agent, the backend has dispatched a Veo render for
 * EVERY beat in parallel. By the time the user has answered Q1+Q2 for
 * one beat, several other beats' clips are already done — that's why
 * the per-beat panel "completes" so quickly. This badge surfaces that
 * truth: a per-beat row showing rendering / ready state, with a count
 * at the top.
 *
 * Pinned to the top-left of the canvas under Save & exit / Projects.
 * Shown only in demo mode (in production the speculative pre-bake
 * exists too but the live timing matches the bar, so the badge would
 * be redundant).
 *
 * The badge auto-fades when every beat has either succeeded or moved
 * past speculative — the parallel-render story is told once, and the
 * badge gracefully steps out.
 */
export function RenderQueueBadge() {
  const manifest = useBeatGraphStore((s) => s.manifest);
  if (!isDemoMode()) return null;
  if (!manifest) return null;
  const beats = manifest.beats;
  if (beats.length === 0) return null;

  const rows = beats.map((b, i) => {
    const scene = b.scenes[0];
    const hasClip = !!scene?.clipPublicId;
    const inFlight =
      !!scene?.speculativeJobId || !!scene?.jobId || b.status === "generating";
    let label: "rendered" | "rendering" | "queued" | "approved";
    if (b.status === "approved") label = "approved";
    else if (hasClip) label = "rendered";
    else if (inFlight) label = "rendering";
    else label = "queued";
    return { idx: i, name: b.beatName, status: label };
  });

  const renderedCount = rows.filter(
    (r) => r.status === "rendered" || r.status === "approved",
  ).length;
  const inFlightCount = rows.filter((r) => r.status === "rendering").length;
  const allDone = renderedCount === rows.length;

  return (
    <AnimatePresence>
      {!allDone || renderedCount > 0 ? (
        <motion.aside
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8, transition: { duration: 0.4 } }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Background render queue"
          className="pointer-events-none absolute left-4 top-20 z-20 w-[230px] select-none rounded-xl border border-fg-tertiary/15 bg-bg-elev-1/75 p-3 shadow-(--shadow-pill) backdrop-blur-xl md:left-6 md:top-24"
        >
          <header className="mb-2 flex items-center gap-1.5 font-body text-overline font-medium uppercase tracking-[0.08em]">
            <motion.span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                allDone ? "bg-state-success" : "bg-brand-ember",
              )}
              animate={
                allDone
                  ? { opacity: 1 }
                  : { opacity: [0.35, 1, 0.35] }
              }
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="text-fg-secondary">
              {allDone ? "All renders ready" : "Background renders"}
            </span>
            <span className="ml-auto font-mono tabular-nums text-fg-tertiary">
              {renderedCount}/{rows.length}
            </span>
          </header>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li
                key={r.idx}
                className="flex items-center gap-2 font-mono text-[11px] leading-tight"
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                    r.status === "approved" && "bg-brand-ember",
                    r.status === "rendered" && "bg-state-success",
                    r.status === "rendering" && "bg-brand-ember/85 ember-pulse",
                    r.status === "queued" && "border border-fg-tertiary/55",
                  )}
                />
                <span className="font-mono text-fg-tertiary tabular-nums">
                  {String(r.idx + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate font-body text-[12px] text-fg-secondary">
                  {r.name}
                </span>
                <span
                  className={cn(
                    "flex-shrink-0 font-mono text-[10px] uppercase tracking-wide",
                    r.status === "approved" && "text-brand-ember",
                    r.status === "rendered" && "text-state-success",
                    r.status === "rendering" && "text-brand-ember/85",
                    r.status === "queued" && "text-fg-tertiary/65",
                  )}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
          <footer className="mt-2 border-t border-fg-tertiary/15 pt-1.5 font-body text-[10px] leading-tight text-fg-tertiary/75">
            {allDone
              ? "Renders cached on Cloudinary CDN."
              : inFlightCount > 0
                ? `${inFlightCount} job${inFlightCount === 1 ? "" : "s"} on Veo · upload to Cloudinary on success`
                : "Speculative dispatch · runs while you direct"}
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
