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

// Pending moment queue. When a new moment fires while one is already
// playing or loading, we enqueue instead of preempting — that's why
// the user kept hearing the director cut off mid-sentence as they
// navigated through the app. Capped at 2 so a flood of moments
// doesn't echo back-to-back for minutes; the oldest gets dropped
// when the cap is exceeded.
type PendingMoment =
  | {
      kind: "moment";
      moment: NarrationMoment;
      context: Record<string, unknown>;
      beatId?: string;
    }
  | {
      kind: "summary";
      manifest: Manifest;
      continuityBible?: string;
    };
const _queue: PendingMoment[] = [];
const QUEUE_MAX = 2;
function _enqueue(p: PendingMoment): void {
  while (_queue.length >= QUEUE_MAX) _queue.shift();
  _queue.push(p);
}

// Web Audio routing was removed. The previous version connected the
// HTMLAudioElement through a GainNode at 1.6× to ride over the hero
// loop, but ElevenLabs masters MP3s with peaks near 0 dB — 1.6× of
// a near-0 dB peak clipped on every line. Chrome's soft-limiter
// then pulled the signal back down to safe levels, which is the
// "helicopter loud at first then quiets" the user reported. The
// fix is to play the audio at its native level via HTMLAudioElement
// (max 1.0) and rely on the upstream master being audible on its
// own. If we ever need a touch more headroom, add a
// DynamicsCompressorNode (gentle limiter) before any GainNode bump.
function _attachAudioToGraph(_audio: HTMLAudioElement): void {
  // Intentionally a no-op now. Kept as a hook for the future
  // compressor + gain path so the call site in _playAudio doesn't
  // change shape and accidentally re-introduce the clipping bug.
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
    // Clear the queue too — if the user hits skip mid-line, they
    // shouldn't immediately get the queued next line as a "surprise"
    // continuation. Skip means "stop the narrator entirely for now."
    _queue.length = 0;
    set({ status: "idle", currentText: null, currentMoment: null, currentBeatId: null });
  },

  playMoment: async (moment, context, beatId) => {
    if (isAudioMuted()) return;

    // Queue when the director is mid-line. Without this gate the new
    // call would `_stopAudio()` the playing line and start a fresh
    // load — the user heard "This is fant—" / "On the canvas—" /
    // "Beat one—" cutting each other off as they navigated. The
    // queue lets each moment finish, then the next plays.
    const liveStatus = get().status;
    if (liveStatus === "playing" || liveStatus === "loading") {
      _enqueue({ kind: "moment", moment, context, beatId });
      return;
    }

    const setStatusWithDrain = (s: NarrationStatus) => {
      set({ status: s });
      if (s === "done" || s === "error") _drainNarrationQueue();
    };

    const key = _cacheKey(moment, beatId);
    const cached = _cache.get(key);

    // Only treat the cache as a hit when it has a real audioSrc.
    // A cached entry with audioSrc:null was a backend failure path —
    // re-fetching gives the user a chance to hear real audio once the
    // upstream issue clears (ElevenLabs free-tier lockout, network
    // blip, etc.). Without this guard, one bad response permanently
    // poisons the moment for the rest of the session.
    if (cached && cached.audioSrc) {
      _stopAudio();
      set({ currentText: cached.text, currentMoment: moment, currentBeatId: beatId ?? null });
      _playAudio(cached.audioSrc, setStatusWithDrain);
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

      // Cache only successful syntheses. Failed ones (audioSrc=null)
      // fall through to browser TTS this time but stay re-fetchable
      // on the next moment.
      if (audioSrc) {
        _cache.set(key, { text, audioSrc, durationSeconds: res.durationSeconds });
      }

      if (get().currentMoment !== moment) return;

      set({ currentText: text });

      if (!audioSrc) {
        if (text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            text,
            () => setStatusWithDrain("done"),
            () => setStatusWithDrain("error"),
          );
        } else {
          setStatusWithDrain("done");
        }
        return;
      }

      _playAudio(audioSrc, setStatusWithDrain);
    } catch (err) {
      console.warn(`[narration] ${moment} failed:`, err);
      setStatusWithDrain("error");
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

    // Same queue gate as playMoment — summary should never preempt
    // a beat-level narration that's still finishing.
    const liveStatus = get().status;
    if (liveStatus === "playing" || liveStatus === "loading") {
      _enqueue({ kind: "summary", manifest, continuityBible });
      return;
    }

    const setStatusWithDrain = (s: NarrationStatus) => {
      set({ status: s });
      if (s === "done" || s === "error") _drainNarrationQueue();
    };

    const key = _cacheKey("summary");
    const cached = _cache.get(key);

    if (cached && cached.audioSrc) {
      _stopAudio();
      set({ currentText: cached.text, currentMoment: "summary", currentBeatId: null });
      _playAudio(cached.audioSrc, setStatusWithDrain);
      return;
    }

    _stopAudio();
    set({ status: "loading", currentMoment: "summary", currentBeatId: null, currentText: null });

    try {
      const res = await api.narrateSummary({ manifest, continuityBible });
      const text = res.text ?? "";
      const audioSrc = res.audioUrl ?? null;
      if (audioSrc) {
        _cache.set(key, { text, audioSrc, durationSeconds: res.durationSeconds });
      }

      set({ currentText: text });
      if (!audioSrc) {
        if (text) {
          set({ status: "playing" });
          _speakWithBrowserTTS(
            text,
            () => setStatusWithDrain("done"),
            () => setStatusWithDrain("error"),
          );
        } else {
          setStatusWithDrain("done");
        }
        return;
      }
      _playAudio(audioSrc, setStatusWithDrain);
    } catch (err) {
      console.warn("[narration] summary failed:", err);
      setStatusWithDrain("error");
    }
  },
}));

// Drain helper — defined after the store so it can call the same
// store actions to fire the next queued moment. Slight 200ms gap
// between consecutive lines so they don't sound mashed together.
function _drainNarrationQueue(): void {
  const next = _queue.shift();
  if (!next) return;
  window.setTimeout(() => {
    const store = useNarrationStore.getState();
    if (next.kind === "moment") {
      void store.playMoment(next.moment, next.context, next.beatId);
    } else {
      void store.playSummaryNarration(next.manifest, next.continuityBible);
    }
  }, 200);
}

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
