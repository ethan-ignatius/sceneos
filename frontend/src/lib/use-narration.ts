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

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
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
    _audio.oncanplaythrough = null;
    // Detach the source so the browser stops decoding any buffered MP3.
    // Without this, a fast re-play of the same `Audio` instance can
    // overlap the still-decoding tail of the previous one — that's the
    // glitchy stutter the user heard.
    _audio.src = "";
    _audio.load();
    _audio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function _speakWithBrowserTTS(
  text: string,
  onEnd: () => void,
  onError: () => void,
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 0.85;
  utterance.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) =>
      /daniel|aaron|james|google uk english male/i.test(v.name) && v.lang.startsWith("en"),
  ) ?? voices.find((v) => v.lang.startsWith("en") && /male/i.test(v.name))
    ?? voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;

  utterance.onend = onEnd;
  utterance.onerror = onError;
  window.speechSynthesis.speak(utterance);
}

/**
 * Single shared playback helper used by every narration entry point.
 *
 * Glitch defense: explicit `preload = "auto"` + waiting for
 * `canplaythrough` before calling `play()` so we never start playback
 * while the MP3 is still decoding (the user's "glitchy" report).
 *
 * Volume defense: the HTMLAudioElement defaults to 1.0 already, but we
 * set it explicitly so the system mixer never picks an attenuated
 * default. ElevenLabs' MP3 output is pre-mastered at a moderate level —
 * the perceived "quiet" ramp comes from the browser pacing the buffer.
 */
function _playAudio(
  src: string,
  setStatus: (s: NarrationStatus) => void,
): void {
  _stopAudio();
  const audio = new Audio();
  _audio = audio;
  audio.volume = 1.0;
  audio.preload = "auto";
  // Don't fight other media — narration is the priority voice in the
  // canvas, so we don't auto-duck (frontend has its own video volume).
  audio.onended = () => setStatus("done");
  audio.onerror = () => setStatus("error");
  audio.oncanplaythrough = () => {
    if (_audio !== audio) return; // stopped while loading
    setStatus("playing");
    audio.play().catch(() => setStatus("error"));
  };
  audio.src = src;
  audio.load();
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
        if (cached.text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            cached.text,
            () => set({ status: "done" }),
            () => set({ status: "error" }),
          );
        } else {
          set({ status: "done" });
        }
        return;
      }

      _playAudio(cached.audioSrc, (s) => set({ status: s }));
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
        if (text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            text,
            () => set({ status: "done" }),
            () => set({ status: "error" }),
          );
        } else {
          set({ status: "done" });
        }
        return;
      }

      _playAudio(audioSrc, (s) => set({ status: s }));
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
        if (cached.text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            cached.text,
            () => set({ status: "done" }),
            () => set({ status: "error" }),
          );
        } else {
          set({ status: "done" });
        }
        return;
      }
      _playAudio(cached.audioSrc, (s) => set({ status: s }));
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
        if (text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            text,
            () => set({ status: "done" }),
            () => set({ status: "error" }),
          );
        } else {
          set({ status: "done" });
        }
        return;
      }
      _playAudio(audioSrc, (s) => set({ status: s }));
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
