import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Trash2, Play } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
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
    <main className="film-grain min-h-screen bg-bg-base px-6 py-6 md:py-8">
      <div className="mx-auto max-w-[64rem] space-y-7">
        {/* Top bar — caption-track status left, Back link right. No Fraunces
            hero, no italic prose receipt. The list is the subject. */}
        <header className="flex items-center justify-between gap-4">
          <div className="font-body text-micro font-medium uppercase tracking-[0.08em] text-fg-tertiary">
            Projects · {projects.length} archived
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill text-fg-tertiary transition-colors hover:text-fg-primary"
          >
            <ArrowLeft size={13} strokeWidth={1.5} aria-hidden="true" />
            Landing
          </button>
        </header>

        {projects.length === 0 ? (
          <div className="border-y border-fg-tertiary/15 py-16 text-center">
            <div className="font-body text-body-sm font-medium text-fg-secondary">
              Nothing archived yet.
            </div>
            <p className="mx-auto mt-2 max-w-prose font-body text-pill leading-relaxed text-fg-tertiary">
              Save and exit a project from the canvas or editor and it lands here.
            </p>
          </div>
        ) : (
          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: STAGGER.bubbles, delayChildren: 0.1 } },
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
                    hidden: { opacity: 0, y: 4 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
                  className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 font-body text-body-sm font-medium leading-snug text-fg-primary">
                      {p.masterPrompt}
                    </p>
                    <div className="font-mono text-micro tabular-nums text-fg-tertiary">
                      {date} · {time} · {p.manifest.videoType} · {approved}/{total} approved
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleResume(p.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-body text-pill font-medium text-brand-ember transition-colors hover:text-brand-ember/80"
                    >
                      <Play size={11} strokeWidth={2} aria-hidden="true" />
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => discardProject(p.id)}
                      aria-label={`Discard project: ${p.masterPrompt}`}
                      title="Discard"
                      className="grid h-7 w-7 cursor-pointer place-items-center text-fg-tertiary transition-colors hover:text-state-error focus-visible:outline-none"
                    >
                      <Trash2 size={11} strokeWidth={1.5} aria-hidden="true" />
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
