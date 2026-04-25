import { motion } from "motion/react";
import { X, Copy, Sparkles, ExternalLink } from "lucide-react";
import { useBeatGraphStore, selectApprovedClipPublicIds } from "@/stores/beat-graph-store";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/lib/motion-presets";
import { buildSpliceUrl } from "@/lib/cloudinary";
import { toast } from "sonner";

interface StitchTrayProps {
  onClose: () => void;
}

export function StitchTray({ onClose }: StitchTrayProps) {
  const manifest = useBeatGraphStore((s) => s.manifest);
  const approvedIds = useBeatGraphStore(selectApprovedClipPublicIds);
  const totalCount = manifest?.beats.length ?? 0;
  const approvedCount = approvedIds.length;
  const allReady = approvedCount === totalCount && totalCount > 0;
  const previewUrl = buildSpliceUrl(approvedIds);

  const copy = async () => {
    if (!previewUrl) return;
    await navigator.clipboard.writeText(previewUrl);
    toast.success("Cloudinary URL copied");
  };

  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={SPRING.drawer}
      className="absolute right-6 top-20 z-40 w-[30rem] overflow-hidden rounded-xl border border-fg-tertiary/30 bg-bg-elev-2/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-fg-tertiary/20 px-5 py-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
            Stitch tray
          </div>
          <div className="mt-1 font-display text-lg italic text-fg-primary">
            {approvedCount} / {totalCount} ready
          </div>
        </div>
        <button onClick={onClose} className="text-fg-tertiary hover:text-fg-primary">
          <X size={18} strokeWidth={1.5} />
        </button>
      </header>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-5 gap-2">
          {manifest?.beats.map((b) => (
            <div
              key={b.beatId}
              className={`aspect-video overflow-hidden rounded-md border ${
                b.status === "approved"
                  ? "border-brand-ember/60 bg-brand-ember/8"
                  : "border-fg-tertiary/30 bg-bg-base"
              }`}
              title={b.beatName}
            >
              <div className="flex h-full items-end p-1.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-fg-tertiary">
                  {b.beatName}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-fg-tertiary/30 bg-bg-base/80 p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-fg-tertiary">
              Live URL
            </div>
            <button
              onClick={copy}
              disabled={!previewUrl}
              className="text-fg-tertiary transition-colors hover:text-fg-primary disabled:opacity-40"
              aria-label="Copy URL"
            >
              <Copy size={13} strokeWidth={1.5} />
            </button>
          </div>
          <div className="break-all font-mono text-[10px] leading-relaxed text-fg-secondary">
            {previewUrl ?? "Approve clips to see the URL build."}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button size="md" variant="primary" disabled={!allReady}>
            <Sparkles size={14} strokeWidth={1.5} />
            Render final cinematic
          </Button>
          <Button size="sm" variant="ghost" disabled={!allReady}>
            <ExternalLink size={13} strokeWidth={1.5} />
            Open in CutOS to fine-edit
          </Button>
        </div>
      </div>
    </motion.aside>
  );
}
