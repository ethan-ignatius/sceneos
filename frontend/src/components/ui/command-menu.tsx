import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Film,
  Sparkles,
  Volume2,
  VolumeX,
  Copy,
  RotateCcw,
  Compass,
  CornerDownLeft,
} from "lucide-react";
import { useBeatGraphStore, selectApprovedClipPublicIds } from "@/stores/beat-graph-store";
import { usePromptStore } from "@/stores/prompt-store";
import { isAudioMuted, setAudioMuted } from "@/lib/audio-cues";
import { buildSpliceUrl } from "@/lib/cloudinary";
import { DURATIONS, EASE } from "@/lib/motion-presets";
import { toast } from "sonner";

/**
 * Global ⌘K command palette. Mounted at App root, listens for meta+k / ctrl+k.
 *
 * Routes (per `examples/AUDIT.md` cross-cutting issues):
 *   - Jump to beat N (when on canvas)
 *   - Mute / unmute audio
 *   - Replay the page-crumple bridge
 *   - Copy fl_splice URL
 *   - Reset session (returns to /)
 *
 * Backed directly by the existing zustand stores — no separate command store.
 * The palette is opaque about *which* commands are available; it just shows
 * the ones whose preconditions are met.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const manifest = useBeatGraphStore((s) => s.manifest);
  const setActiveBeat = useBeatGraphStore((s) => s.setActiveBeat);
  const reset = useBeatGraphStore((s) => s.reset);
  const resetPrompt = usePromptStore((s) => s.reset);
  const approvedIds = useBeatGraphStore(selectApprovedClipPublicIds);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setOpen(false);

  const jumpToBeat = (beatId: string) => {
    setActiveBeat(beatId);
    if (window.location.pathname !== "/canvas") navigate("/canvas");
    close();
  };

  const toggleMute = () => {
    setAudioMuted(!isAudioMuted());
    toast.success(isAudioMuted() ? "Sound on" : "Muted");
    close();
  };

  const replayBridge = () => {
    navigate("/transition");
    close();
  };

  const copyUrl = async () => {
    const url = buildSpliceUrl(approvedIds);
    if (!url) {
      toast.error("Approve at least one clip first");
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Cloudinary URL copied");
    close();
  };

  const resetAll = () => {
    reset();
    resetPrompt();
    navigate("/");
    close();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATIONS.quick, ease: EASE.outQuart }}
          className="fixed inset-0 z-[9000] bg-bg-base/70 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: DURATIONS.smooth, ease: EASE.outQuart }}
            onClick={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-[18%] w-[min(40rem,90vw)] -translate-x-1/2 overflow-hidden rounded-md border border-brand-ember-dim/30 bg-bg-elev-1/95 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          >
            <Command label="Command palette" loop>
              <div className="border-b border-fg-tertiary/15 px-4 py-3">
                <Command.Input
                  autoFocus
                  placeholder="Type a command, beat name, or action…"
                  className="w-full bg-transparent font-body text-base text-fg-primary placeholder:text-fg-tertiary focus:outline-none"
                />
              </div>
              <Command.List className="max-h-[24rem] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-fg-tertiary">
                  No matches.
                </Command.Empty>

                {manifest && manifest.beats.length > 0 ? (
                  <Command.Group
                    heading="Jump to beat"
                    className="px-1 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:caption-track [&_[cmdk-group-heading]]:text-[10px]"
                  >
                    {manifest.beats.map((b, i) => (
                      <CommandRow
                        key={b.beatId}
                        icon={<Film size={14} strokeWidth={1.5} />}
                        label={`${(i + 1).toString().padStart(2, "0")} · ${b.beatName}`}
                        hint={b.archetype.mood.replace(/-/g, " ")}
                        onSelect={() => jumpToBeat(b.beatId)}
                      />
                    ))}
                  </Command.Group>
                ) : null}

                <Command.Group
                  heading="Actions"
                  className="px-1 pt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:caption-track [&_[cmdk-group-heading]]:text-[10px]"
                >
                  <CommandRow
                    icon={
                      isAudioMuted() ? (
                        <Volume2 size={14} strokeWidth={1.5} />
                      ) : (
                        <VolumeX size={14} strokeWidth={1.5} />
                      )
                    }
                    label={isAudioMuted() ? "Sound on" : "Mute audio"}
                    onSelect={toggleMute}
                  />
                  <CommandRow
                    icon={<Sparkles size={14} strokeWidth={1.5} />}
                    label="Replay page-crumple bridge"
                    onSelect={replayBridge}
                  />
                  <CommandRow
                    icon={<Copy size={14} strokeWidth={1.5} />}
                    label="Copy fl_splice URL"
                    hint={approvedIds.length === 0 ? "no approved clips yet" : `${approvedIds.length} clip${approvedIds.length === 1 ? "" : "s"}`}
                    onSelect={copyUrl}
                  />
                  <CommandRow
                    icon={<Compass size={14} strokeWidth={1.5} />}
                    label="Open canvas"
                    onSelect={() => {
                      if (window.location.pathname !== "/canvas") navigate("/canvas");
                      close();
                    }}
                  />
                  <CommandRow
                    icon={<RotateCcw size={14} strokeWidth={1.5} />}
                    label="Reset session"
                    onSelect={resetAll}
                  />
                </Command.Group>
              </Command.List>
              <div className="flex items-center justify-between border-t border-fg-tertiary/15 px-4 py-2 caption-track text-[9px] text-fg-tertiary">
                <span>SceneOS · ⌘K</span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft size={10} strokeWidth={1.5} aria-hidden="true" />
                  Select
                </span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

interface CommandRowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}

function CommandRow({ icon, label, hint, onSelect }: CommandRowProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 font-body text-sm text-fg-secondary transition-colors data-[selected=true]:bg-brand-ember/10 data-[selected=true]:text-fg-primary"
    >
      <span className="flex items-center gap-3">
        <span className="text-fg-tertiary">{icon}</span>
        <span>{label}</span>
      </span>
      {hint ? (
        <span className="caption-track text-[9px] text-fg-tertiary">{hint}</span>
      ) : null}
    </Command.Item>
  );
}
