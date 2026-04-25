import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useBeatGraphStore } from "@/stores/beat-graph-store";
import type { Beat } from "@/types/manifest";

interface ClipPromptCardProps {
  beat: Beat;
}

/**
 * Renders the per-beat Higgsfield clip prompt that the LLM decomposition layer
 * produced. While decomposition is in flight, shows a soft skeleton; on error,
 * shows a terse failure note (the per-beat agent questionnaire is still usable).
 */
export function ClipPromptCard({ beat }: ClipPromptCardProps) {
  const status = useBeatGraphStore((s) => s.decompositionStatus);
  const error = useBeatGraphStore((s) => s.decompositionError);
  const scene = beat.scenes[0];
  const clipPrompt = scene?.clipPrompt;

  if (clipPrompt) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3 rounded-lg border border-brand-ember/30 bg-brand-ember/5 px-4 py-3"
      >
        <Header label="Higgsfield clip prompt" />
        <Field label="Image (text → image)" value={clipPrompt.imagePrompt} />
        <Field label="Motion (image → video)" value={clipPrompt.motionPrompt} />
        <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-tertiary">
          <Tag>{clipPrompt.preferredModel}</Tag>
          <Tag>{clipPrompt.aspectRatio}</Tag>
          <Tag>{clipPrompt.resolution}</Tag>
          <Tag>{clipPrompt.durationSeconds}s</Tag>
        </div>
      </motion.div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-fg-tertiary/30 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.24em] text-fg-tertiary">
        <Loader2 size={12} className="animate-spin" strokeWidth={1.5} />
        Decomposing master prompt…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.24em] text-red-400">
        Decomposition failed: {error ?? "unknown error"} — answer questions below to refine manually.
      </div>
    );
  }

  return null;
}

function Header({ label }: { label: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand-ember">
      {label}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-tertiary">
        {label}
      </div>
      <p className="mt-1 font-mono text-xs leading-relaxed text-fg-primary">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-fg-tertiary/40 px-2 py-0.5">{children}</span>
  );
}
