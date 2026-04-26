import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Trash2, Play, Plus } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { BeatStatus } from "@/types/manifest";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { SceneOSMark } from "@/components/ui/sceneos-mark";

/**
 * The reel cabinet. Every project the user has ever started is archived
 * here when they Save & exit (or Make Another from final delivery). Each
 * row resumes the project on /canvas with the manifest restored verbatim,
 * or discards it permanently after a two-step confirmation.
 *
 * Capped at 12 most recent in the store; oldest drop off when the cap is
 * exceeded. The capping happens on archive (in beat-graph-store.reset and
 * resumeProject), so this route never has to truncate — it just renders.
 *
 * Layout sized for 12 max:
 *   12 rows × ~76px = ~912px → overruns a 720p viewport. Header is
 *   sticky-positioned with backdrop-blur so the eyebrow + Back link stay
 *   in place while the list scrolls underneath. No virtualization needed
 *   at this scale.
 */
export function ProjectsRoute() {
  const navigate = useNavigate();
  const projects = useBeatGraphStore((s) => s.projects);
  const resumeProject = useBeatGraphStore((s) => s.resumeProject);
  const discardProject = useBeatGraphStore((s) => s.discardProject);

  const handleResume = (id: string) => {
    resumeProject(id);
    navigate("/canvas");
  };

  // Two-step delete confirmation. First click arms the row (icon goes
  // ember + label flips to "Confirm"); second click within 3s actually
  // discards. Auto-disarms after 3s of inactivity so the user can't
  // accidentally double-tap and lose work, but they can also cancel
  // by clicking ANY other row's trash (which re-arms that row instead).
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  const handleDelete = (id: string) => {
    if (armedDeleteId === id) {
      // Second click on the same row → actually delete.
      if (armTimerRef.current) {
        window.clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      setArmedDeleteId(null);
      discardProject(id);
      return;
    }
    // First click → arm this row, disarm any other.
    if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    setArmedDeleteId(id);
    armTimerRef.current = window.setTimeout(() => {
      setArmedDeleteId(null);
      armTimerRef.current = null;
    }, 3000);
  };

  return (
    <main className="film-grain min-h-screen bg-bg-base">
      {/* Sticky top chrome — backdrop-blur so the list scrolling under it
          reads as continuous, not abruptly cut off. ● SceneOS brand mark
          matches the same dot+wordmark pattern landing's footer + final
          delivery's top chrome use, so the route reads as the same
          product. The Back link is the secondary affordance. */}
      <header className="sticky top-0 z-20 border-b border-fg-tertiary/12 bg-bg-base/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[64rem] items-center justify-between gap-4 px-6 py-5 md:py-6">
          <div className="flex items-center gap-5">
            <SceneOSMark className="text-fg-tertiary/85" />
            <span aria-hidden="true" className="text-fg-tertiary/30">·</span>
            <div className="font-body text-caption font-medium uppercase tracking-[0.18em] text-fg-tertiary">
              Projects · <span className="font-mono tabular-nums text-fg-secondary">{projects.length}</span> archived
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary focus-visible:outline-none focus-visible:text-brand-ember"
          >
            <ArrowLeft size={13} strokeWidth={1.5} aria-hidden="true" />
            Landing
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[64rem] px-6 pb-12 pt-6 md:pt-8">
        {projects.length === 0 ? (
          // Empty state with a forward CTA — the back link in the header
          // gets you out, this gets you started.
          <div className="border-y border-fg-tertiary/15 py-20 text-center">
            <div className="font-body text-body-sm font-medium text-fg-secondary">
              Nothing archived yet.
            </div>
            <p className="mx-auto mt-2 max-w-prose font-body text-pill leading-relaxed text-fg-tertiary">
              Save and exit a project from the canvas or editor and it lands here.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-ember/55 bg-brand-ember/10 px-4 py-2 font-body text-pill font-medium text-brand-ember transition-[border-color,background-color] duration-200 hover:border-brand-ember hover:bg-brand-ember/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              <Plus size={12} strokeWidth={2} aria-hidden="true" />
              Direct a cinematic
            </button>
          </div>
        ) : (
          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: STAGGER.bubbles, delayChildren: 0.05 } },
            }}
            className="divide-y divide-fg-tertiary/12 border-y border-fg-tertiary/12"
          >
            {projects.map((p) => {
              const beats = p.manifest.beats;
              const total = beats.length;
              const approved = beats.filter((b) => b.status === "approved").length;
              const date = new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(p.archivedAt));
              const time = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(p.archivedAt));
              const isComplete = approved === total && total > 0;
              return (
                <motion.li
                  key={p.id}
                  variants={{
                    hidden: { opacity: 0, y: 4 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
                  className="group relative"
                >
                  {/* Whole row is the resume affordance. Buttons inside
                      stop-propagation so Discard/Delete don't trigger
                      the row's onClick. ArrowUpRight on the right hand
                      side appears on hover as a "you're going somewhere"
                      cue. */}
                  <button
                    type="button"
                    onClick={() => handleResume(p.id)}
                    aria-label={`Resume ${p.masterPrompt}`}
                    className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-4 px-3 py-4 text-left transition-colors duration-150 hover:bg-bg-elev-1/40 focus-visible:bg-bg-elev-1/55 focus-visible:outline-none sm:gap-6 sm:px-4"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-baseline gap-2">
                        <p className="line-clamp-1 flex-1 font-body text-body-sm font-medium leading-snug text-fg-primary transition-colors group-hover:text-brand-ember">
                          {p.masterPrompt}
                        </p>
                        <ArrowUpRight
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className="flex-shrink-0 text-fg-tertiary opacity-0 transition-[opacity,color,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-ember group-hover:opacity-100"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="font-mono text-micro tabular-nums text-fg-tertiary">
                          {date} · {time}
                        </span>
                        <span aria-hidden="true" className="text-fg-tertiary/30">·</span>
                        <span className="font-mono text-micro uppercase tracking-[0.08em] text-fg-tertiary">
                          {p.manifest.videoType}
                        </span>
                        <span aria-hidden="true" className="text-fg-tertiary/30">·</span>
                        <BeatProgressStrip
                          beats={beats.map((b) => b.status)}
                        />
                        <span
                          className={cn(
                            "font-mono text-micro tabular-nums",
                            isComplete ? "text-brand-ember" : "text-fg-tertiary",
                          )}
                        >
                          {approved}/{total}
                          {isComplete ? " · ready" : ""}
                        </span>
                      </div>
                    </div>
                  </button>
                  {/* Row actions — pinned right, sit OUTSIDE the resume
                      button so clicks don't bubble into the row. Visible
                      at low opacity by default, full opacity on group
                      hover so the row stays clean at idle. */}
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:right-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResume(p.id);
                      }}
                      className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 font-body text-pill font-medium text-brand-ember opacity-80 transition-[opacity,color,background-color] duration-200 hover:bg-brand-ember/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ember focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base"
                    >
                      <Play size={11} strokeWidth={2} aria-hidden="true" />
                      Resume
                    </button>
                    {armedDeleteId === p.id ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        aria-label={`Confirm discard: ${p.masterPrompt}`}
                        title="Click again to confirm"
                        className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 font-body text-pill font-medium text-state-error transition-colors hover:text-state-error/80 focus-visible:outline-none"
                      >
                        <Trash2 size={11} strokeWidth={1.75} aria-hidden="true" />
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        aria-label={`Discard project: ${p.masterPrompt}`}
                        title="Discard"
                        className="pointer-events-auto grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary opacity-0 transition-[opacity,color] duration-200 group-hover:opacity-90 hover:text-state-error focus-visible:opacity-100 focus-visible:outline-none focus-visible:text-state-error"
                      >
                        <Trash2 size={11} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </main>
  );
}

/**
 * Per-beat progress strip — one pip per beat. Approved beats glow ember;
 * unapproved are hairline dots. Reads as a tiny progress bar, gives the
 * user a glanceable receipt of how far through the cinematic each
 * archived project actually got.
 *
 * Sits inline in the row's metadata strip so it doesn't take its own
 * row of vertical space; max width caps to ~80px even for a 12-beat
 * project so it doesn't push the date strip into a wrap.
 */
function BeatProgressStrip({ beats }: { beats: BeatStatus[] }) {
  return (
    <span
      role="img"
      aria-label={`${beats.filter((s) => s === "approved").length} of ${beats.length} beats approved`}
      className="inline-flex items-center gap-[3px]"
    >
      {beats.map((status, i) => {
        const isApproved = status === "approved";
        const isInFlight = status === "preview" || status === "generating";
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-1 w-1.5 rounded-[1px]",
              isApproved
                ? "bg-brand-ember shadow-[0_0_4px_rgba(240,168,104,0.6)]"
                : isInFlight
                  ? "bg-brand-ember/55"
                  : "bg-fg-tertiary/30",
            )}
          />
        );
      })}
    </span>
  );
}
