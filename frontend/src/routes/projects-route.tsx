import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { ArrowLeft, ArrowUpRight, Trash2, Play, Plus, Cloud, HardDrive, LogIn, Lock } from "lucide-react";
import { useBeatGraphStore, type ArchivedProject } from "@/stores/beat-graph-store";
import type { BeatStatus } from "@/types/manifest";
import { api, type MongoProject } from "@/lib/api";
import { DURATIONS, EASE, STAGGER } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { SceneOSMark } from "@/components/ui/sceneos-mark";
import { AuthChip } from "@/components/ui/auth-chip";

// Whether Auth0 is wired up for this build. When unset, we fall back to
// the previous "everyone sees their localStorage" behavior so dev
// without env vars still works. See main.tsx for the same flag.
const AUTH_REQUIRED = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN && import.meta.env.VITE_AUTH0_CLIENT_ID,
);

interface MergedProject {
  id: string;
  masterPrompt: string;
  archivedAt: string;
  videoType: string;
  manifest: ArchivedProject["manifest"];
  editor?: ArchivedProject["editor"];
  beatStatuses: BeatStatus[];
  approvedCount: number;
  totalBeats: number;
  source: "local" | "mongo" | "both";
}

function mergeProjects(
  local: ArchivedProject[],
  remote: MongoProject[],
): MergedProject[] {
  const seen = new Set<string>();
  const result: MergedProject[] = [];
  const remoteMap = new Map(remote.map((p) => [p.id, p]));

  for (const lp of local) {
    seen.add(lp.id);
    const beats = lp.manifest.beats;
    result.push({
      id: lp.id,
      masterPrompt: lp.masterPrompt,
      archivedAt: lp.archivedAt,
      videoType: lp.manifest.videoType,
      manifest: lp.manifest,
      editor: lp.editor,
      beatStatuses: beats.map((b) => b.status),
      approvedCount: beats.filter((b) => b.status === "approved").length,
      totalBeats: beats.length,
      source: remoteMap.has(lp.id) ? "both" : "local",
    });
  }

  for (const rp of remote) {
    if (seen.has(rp.id)) continue;
    if (!rp.manifest) continue;
    const beats = (rp.manifest as any).beats || [];
    result.push({
      id: rp.id,
      masterPrompt: rp.masterPrompt,
      archivedAt: rp.archivedAt || rp.updatedAt,
      videoType: rp.videoType,
      manifest: rp.manifest as any,
      editor: rp.editor as any,
      beatStatuses: beats.map((b: any) => b.status),
      approvedCount: beats.filter((b: any) => b.status === "approved").length,
      totalBeats: beats.length,
      source: "mongo",
    });
  }

  result.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
  return result;
}

/**
 * The reel cabinet. Projects from both localStorage (Zustand) and
 * MongoDB Atlas, merged and deduplicated.
 */
export function ProjectsRoute() {
  const navigate = useNavigate();
  const localProjects = useBeatGraphStore((s) => s.projects);
  const resumeProject = useBeatGraphStore((s) => s.resumeProject);
  const discardProject = useBeatGraphStore((s) => s.discardProject);

  const [remoteProjects, setRemoteProjects] = useState<MongoProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listProjects()
      .then(setRemoteProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const merged = mergeProjects(localProjects, remoteProjects);

  const handleResume = (project: MergedProject) => {
    if (project.source === "mongo") {
      const store = useBeatGraphStore.getState();
      const injected: ArchivedProject = {
        id: project.id,
        archivedAt: project.archivedAt,
        masterPrompt: project.masterPrompt,
        manifest: project.manifest,
        editor: project.editor,
      };
      useBeatGraphStore.setState({
        projects: [injected, ...store.projects],
      });
      resumeProject(project.id);
    } else {
      resumeProject(project.id);
    }
    navigate("/canvas");
  };

  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  const handleDelete = (id: string) => {
    if (armedDeleteId === id) {
      if (armTimerRef.current) {
        window.clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      setArmedDeleteId(null);
      discardProject(id);
      setRemoteProjects((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    setArmedDeleteId(id);
    armTimerRef.current = window.setTimeout(() => {
      setArmedDeleteId(null);
      armTimerRef.current = null;
    }, 3000);
  };

  return (
    <main className="film-grain min-h-screen bg-bg-base">
      <header className="sticky top-0 z-20 border-b border-fg-tertiary/12 bg-bg-base/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[64rem] items-center justify-between gap-4 px-6 py-5 md:py-6">
          <div className="flex items-center gap-5">
            <SceneOSMark className="text-fg-tertiary/85" />
            <span aria-hidden="true" className="text-fg-tertiary/30">·</span>
            <div className="font-body text-caption font-medium uppercase tracking-[0.18em] text-fg-tertiary">
              Projects · <span className="font-mono tabular-nums text-fg-secondary">{merged.length}</span> archived
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
        {loading ? (
          <div className="border-y border-fg-tertiary/15 py-20 text-center">
            <div className="font-body text-body-sm font-medium text-fg-secondary">
              Loading projects…
            </div>
          </div>
        ) : merged.length === 0 ? (
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
            {merged.map((p) => {
              const date = new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(p.archivedAt));
              const time = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(p.archivedAt));
              const isComplete = p.approvedCount === p.totalBeats && p.totalBeats > 0;
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
                  <button
                    type="button"
                    onClick={() => handleResume(p)}
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
                          {p.videoType}
                        </span>
                        <span aria-hidden="true" className="text-fg-tertiary/30">·</span>
                        <BeatProgressStrip beats={p.beatStatuses} />
                        <span
                          className={cn(
                            "font-mono text-micro tabular-nums",
                            isComplete ? "text-brand-ember" : "text-fg-tertiary",
                          )}
                        >
                          {p.approvedCount}/{p.totalBeats}
                          {isComplete ? " · ready" : ""}
                        </span>
                        {p.source === "mongo" && (
                          <span title="Stored in MongoDB Atlas">
                            <Cloud size={10} strokeWidth={1.5} className="text-brand-ember/60" />
                          </span>
                        )}
                        {p.source === "local" && (
                          <span title="Local only (browser)">
                            <HardDrive size={10} strokeWidth={1.5} className="text-fg-tertiary/40" />
                          </span>
                        )}
                        {p.source === "both" && (
                          <span title="Synced: local + MongoDB Atlas" className="flex items-center gap-0.5">
                            <HardDrive size={10} strokeWidth={1.5} className="text-fg-tertiary/40" />
                            <Cloud size={10} strokeWidth={1.5} className="text-brand-ember/60" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:right-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResume(p);
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
