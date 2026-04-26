import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Trash2, Play } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";

/**
 * The reel cabinet. Every project the user has ever started is archived
 * here when they Save & exit (or Make Another from final delivery). Each
 * row resumes the project on /canvas with the manifest restored verbatim,
 * or discards it permanently.
 *
 * Capped at 12 most recent in the store; oldest drop off when the cap is
 * exceeded. The capping happens on archive (in beat-graph-store.reset and
 * resumeProject), so this route never has to truncate — it just renders.
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

  return (
    <main className="film-grain min-h-screen bg-bg-base px-6 py-10 md:py-14">
      <div className="mx-auto max-w-[64rem] space-y-10">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATIONS.cinematic, ease: EASE.filmIn }}
          className="space-y-3"
        >
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft size={12} strokeWidth={1.5} aria-hidden="true" />
            Back to landing
          </Button>
          <div className="font-body text-[12px] font-medium text-fg-tertiary">
            Projects · {projects.length} archived
          </div>
          <h1 className="font-display text-display-md italic text-fg-primary">
            Your reels.
          </h1>
          <p className="max-w-prose font-display italic text-lg text-fg-secondary">
            Every project you've started is here. Pick one up, or strike <em>the</em> set.
          </p>
        </motion.header>

        {projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-fg-tertiary/25 bg-bg-elev-1/30 p-10 text-center">
            <div className="font-display text-[1.5rem] italic leading-tight text-fg-secondary">
              Nothing archived yet.
            </div>
            <p className="mt-3 max-w-prose mx-auto font-body text-[13px] leading-relaxed text-fg-tertiary">
              Save and exit a project from the canvas or editor and it'll land here. You can resume it later, or discard it for good.
            </p>
          </div>
        ) : (
          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: STAGGER.bubbles, delayChildren: 0.15 } },
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
              return (
                <motion.li
                  key={p.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
                  className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="font-body text-[11px] tabular-nums text-fg-tertiary">
                      {date} · {time} · {p.manifest.videoType} · {approved}/{total} approved
                    </div>
                    <p className="line-clamp-2 font-display italic text-[1.125rem] leading-snug text-fg-primary">
                      "{p.masterPrompt}"
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleResume(p.id)}
                    >
                      <Play size={11} strokeWidth={1.5} aria-hidden="true" />
                      Resume
                    </Button>
                    <button
                      type="button"
                      onClick={() => discardProject(p.id)}
                      aria-label={`Discard project: ${p.masterPrompt}`}
                      title="Discard"
                      className="grid h-9 w-9 place-items-center rounded-full text-fg-tertiary transition-colors hover:text-state-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-state-error"
                    >
                      <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                    </button>
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
