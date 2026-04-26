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

// Shared Web Audio plumbing for the narrator. Routing the
// HTMLAudioElement through a MediaElementSource → GainNode → destination
// lets us drive a gain > 1.0, which is what HTMLAudioElement.volume
// can't do on its own (capped at 1.0). ElevenLabs' MP3 output is
// pre-mastered at a moderate level — 1.0 was reading as "quiet"
// against a 1080p background-video soundbed. 1.6x is the sweet spot:
// audible over the hero loop without clipping the narrator's chest
// register.
let _audioCtx: AudioContext | null = null;
let _gainNode: GainNode | null = null;
const _connectedAudios = new WeakSet<HTMLAudioElement>();
const NARRATOR_GAIN = 1.6;

function _ensureAudioGraph(): GainNode | null {
  if (typeof window === "undefined") return null;
  if (_gainNode && _audioCtx) {
    if (_audioCtx.state === "suspended") {
      // Browsers gate AudioContext behind a user gesture. If we hit a
      // "narrate now" moment before any click, the context is suspended
      // — try to resume; if the gesture hasn't happened yet, the resume
      // is a no-op until the next interaction. Either way, fall through
      // and the HTMLAudio plays at its native level.
      _audioCtx.resume().catch(() => {});
    }
    return _gainNode;
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
    _gainNode = _audioCtx.createGain();
    _gainNode.gain.value = NARRATOR_GAIN;
    _gainNode.connect(_audioCtx.destination);
    if (_audioCtx.state === "suspended") {
      _audioCtx.resume().catch(() => {});
    }
    return _gainNode;
  } catch {
    return null;
  }
}

function _attachAudioToGraph(audio: HTMLAudioElement): void {
  if (_connectedAudios.has(audio)) return;
  const gain = _ensureAudioGraph();
  if (!gain || !_audioCtx) return;
  try {
    const src = _audioCtx.createMediaElementSource(audio);
    src.connect(gain);
    _connectedAudios.add(audio);
  } catch {
    // createMediaElementSource throws if the element is already wired
    // OR cross-origin without CORS. ElevenLabs MP3s come as data: URIs
    // in our path, so cross-origin isn't an issue, but the try/catch
    // is here in case a future call site uses a remote URL — we'll
    // just play through the audio element's native output at 1.0.
  }
}

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

// One-time toast latch — when ElevenLabs is down (free-tier lockout,
// network, etc.) we want to TELL the user the narrator is on browser
// fallback rather than silently degrading. Fires once per session so
// every beat doesn't queue a toast.
let _browserTtsToastShown = false;
function _maybeShowBrowserTtsToast(): void {
  if (_browserTtsToastShown) return;
  _browserTtsToastShown = true;
  // Lazy import so this module stays free of route-time dependencies.
  void import("sonner").then(({ toast }) => {
    toast.message("Using browser voice for narration", {
      description:
        "ElevenLabs is unreachable (free-tier lockout or network) — running on the browser's built-in voice for now.",
      duration: 6000,
    });
  });
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
  _maybeShowBrowserTtsToast();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  // rate/pitch tuned for a "narrator" register on the OS voices, not
  // the chipmunk-fast default. Volume max — there's no Web Audio
  // hop here so 1.0 is the ceiling. Browser TTS is platform-quiet
  // on Windows / Mac compared to ElevenLabs MP3 + 1.6× gain, but at
  // these settings it should at least be hearable over the
  // background loop.
  utterance.rate = 0.92;
  utterance.pitch = 0.9;
  utterance.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  // Prefer Daniel / Aaron / Microsoft Guy (deep US/UK male voices
  // present on most platforms). Fall through to any English male
  // voice, then any English voice, then default.
  const preferred =
    voices.find(
      (v) =>
        /daniel|aaron|james|guy|david|google uk english male/i.test(v.name) &&
        v.lang.startsWith("en"),
    ) ??
    voices.find((v) => v.lang.startsWith("en") && /male/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"));
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
  // crossOrigin="anonymous" so createMediaElementSource doesn't taint
  // the audio when the src is a data:audio/mpeg URI (it doesn't, but
  // setting it explicitly future-proofs against a switch to remote
  // audioUrl from the backend).
  audio.crossOrigin = "anonymous";

  // Single play-trigger so we never call audio.play() twice. The
  // timer is the safety net if the canplay/canplaythrough events
  // are throttled by the browser (some Safari paths) — without it
  // the user heard nothing.
  let started = false;
  let timer: number | null = null;
  const clearTimer = () => {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  const tryStart = () => {
    clearTimer();
    if (started) return;
    if (_audio !== audio) return; // stopped while loading
    started = true;
    setStatus("playing");
    // Plug into the gain graph the FIRST time we play. Has to happen
    // before play() so the audio routes through the gain node from the
    // first sample — connecting it after play() can clip the head.
    _attachAudioToGraph(audio);
    audio.play().catch(() => {
      // Most common cause: browser autoplay policy blocked playback
      // because no user gesture preceded the call. Status flips to
      // error; the next click anywhere on the page will resume the
      // AudioContext for the NEXT moment.
      setStatus("error");
    });
  };

  audio.onended = () => {
    clearTimer();
    setStatus("done");
  };
  audio.onerror = () => {
    clearTimer();
    setStatus("error");
  };
  // Three triggers, first one wins:
  //   1. canplaythrough — ideal, full buffer available
  //   2. canplay — enough to start, may stall mid-line on slow links
  //   3. 700ms timer — some browsers throttle preload events; we
  //      fire play() anyway and let the browser stream as it can.
  audio.oncanplaythrough = tryStart;
  audio.oncanplay = tryStart;
  timer = window.setTimeout(tryStart, 700);

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
