/**
 * Global narration store — the co-director's voice.
 *
 * Zustand-based so any component can trigger narration (landing page,
 * drawer, stitch tray) and any component can observe it (the global
 * NarrationBar, drawer header, etc.) without prop drilling.
 *
 * Audio playback is managed via a singleton HTMLAudioElement. Cache is
 * per-moment-key so re-triggering the same moment doesn't re-generate.
 * Respects the global audio-mute toggle from audio-cues.ts.
 */
import { create } from "zustand";
import { api } from "@/lib/api";
import { isAudioMuted } from "@/lib/audio-cues";
import type { NarrationMoment } from "@/types/api";
import type { Manifest } from "@/types/manifest";

export type NarrationStatus = "idle" | "loading" | "playing" | "done" | "error";

interface NarrationState {
  status: NarrationStatus;
  currentText: string | null;
  currentMoment: NarrationMoment | null;
  currentBeatId: string | null;

  playMoment: (
    moment: NarrationMoment,
    context: Record<string, unknown>,
    beatId?: string,
  ) => Promise<void>;
  playBeatNarration: (beatId: string, manifest: Manifest, continuityBible?: string) => Promise<void>;
  playSummaryNarration: (manifest: Manifest, continuityBible?: string) => Promise<void>;
  stop: () => void;
}

let _audio: HTMLAudioElement | null = null;
const _cache = new Map<string, { text: string; audioSrc: string | null; durationSeconds: number }>();

function _cacheKey(moment: NarrationMoment, beatId?: string): string {
  return beatId ? `${moment}:${beatId}` : moment;
}

function _stopAudio() {
  if (_audio) {
    _audio.pause();
    _audio.currentTime = 0;
    _audio.onended = null;
    _audio.onerror = null;
    _audio = null;
  }
}

export const useNarrationStore = create<NarrationState>((set, get) => ({
  status: "idle",
  currentText: null,
  currentMoment: null,
  currentBeatId: null,

  stop: () => {
    _stopAudio();
    set({ status: "idle", currentText: null, currentMoment: null, currentBeatId: null });
  },

  playMoment: async (moment, context, beatId) => {
    if (isAudioMuted()) return;

    const key = _cacheKey(moment, beatId);
    const cached = _cache.get(key);

    if (cached) {
      _stopAudio();
      set({ currentText: cached.text, currentMoment: moment, currentBeatId: beatId ?? null });

      if (!cached.audioSrc) {
        set({ status: "done" });
        return;
      }

      const audio = new Audio(cached.audioSrc);
      _audio = audio;
      set({ status: "playing" });
      audio.onended = () => set({ status: "done" });
      audio.onerror = () => set({ status: "error" });
      audio.play().catch(() => set({ status: "error" }));
      return;
    }

    _stopAudio();
    set({ status: "loading", currentMoment: moment, currentBeatId: beatId ?? null, currentText: null });

    try {
      const res = await api.narrateMoment({ moment, context });
      const text = res.text ?? "";
      const audioSrc = res.audioBase64
        ? `data:audio/mpeg;base64,${res.audioBase64}`
        : res.audioUrl ?? null;

      _cache.set(key, { text, audioSrc, durationSeconds: res.durationSeconds });

      if (get().currentMoment !== moment) return;

      set({ currentText: text });

      if (!audioSrc) {
        set({ status: "done" });
        return;
      }

      const audio = new Audio(audioSrc);
      _audio = audio;
      set({ status: "playing" });
      audio.onended = () => set({ status: "done" });
      audio.onerror = () => set({ status: "error" });
      audio.play().catch(() => set({ status: "error" }));
    } catch (err) {
      console.warn(`[narration] ${moment} failed:`, err);
      set({ status: "error" });
    }
  },

  playBeatNarration: async (beatId, manifest, continuityBible) => {
    const beat = manifest.beats.find((b) => b.beatId === beatId);
    if (!beat) return;
    await get().playMoment(
      "beat_intro",
      { beat, manifest, continuityBible, masterPrompt: manifest.masterPrompt },
      beatId,
    );
  },

  playSummaryNarration: async (manifest, continuityBible) => {
    if (isAudioMuted()) return;

    const key = _cacheKey("summary");
    const cached = _cache.get(key);

    if (cached) {
      _stopAudio();
      set({ currentText: cached.text, currentMoment: "summary", currentBeatId: null });
      if (!cached.audioSrc) {
        set({ status: "done" });
        return;
      }
      const audio = new Audio(cached.audioSrc);
      _audio = audio;
      set({ status: "playing" });
      audio.onended = () => set({ status: "done" });
      audio.onerror = () => set({ status: "error" });
      audio.play().catch(() => set({ status: "error" }));
      return;
    }

    _stopAudio();
    set({ status: "loading", currentMoment: "summary", currentBeatId: null, currentText: null });

    try {
      const res = await api.narrateSummary({ manifest, continuityBible });
      const text = res.text ?? "";
      const audioSrc = res.audioUrl ?? null;
      _cache.set(key, { text, audioSrc, durationSeconds: res.durationSeconds });

      set({ currentText: text });
      if (!audioSrc) {
        set({ status: "done" });
        return;
      }
      const audio = new Audio(audioSrc);
      _audio = audio;
      set({ status: "playing" });
      audio.onended = () => set({ status: "done" });
      audio.onerror = () => set({ status: "error" });
      audio.play().catch(() => set({ status: "error" }));
    } catch (err) {
      console.warn("[narration] summary failed:", err);
      set({ status: "error" });
    }
  },
}));

/**
 * Convenience hook — thin wrapper that reads the store.
 * Components that only need to observe can use the store directly.
 */
export function useNarration() {
  const status = useNarrationStore((s) => s.status);
  const currentText = useNarrationStore((s) => s.currentText);
  const currentBeatId = useNarrationStore((s) => s.currentBeatId);
  const currentMoment = useNarrationStore((s) => s.currentMoment);
  const playMoment = useNarrationStore((s) => s.playMoment);
  const playBeatNarration = useNarrationStore((s) => s.playBeatNarration);
  const playSummaryNarration = useNarrationStore((s) => s.playSummaryNarration);
  const stop = useNarrationStore((s) => s.stop);

  return {
    status,
    currentText,
    currentBeatId,
    currentMoment,
    playMoment,
    playBeatNarration,
    playSummaryNarration,
    stop,
  };
}
