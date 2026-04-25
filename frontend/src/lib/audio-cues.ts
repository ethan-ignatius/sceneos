/**
 * Synthesized audio cues for SceneOS.
 *
 * We synthesize on-the-fly with the Web Audio API instead of bundling sample
 * files — no licensing/CC0 sourcing burden, no ~50–200KB per cue, and the
 * sounds adapt to volume/pitch programmatically.
 *
 * Mute persistence lives in localStorage (`sceneos:audio-muted`). The
 * landing's mute toggle writes here; every play-call reads here. No store.
 *
 * Browsers block `AudioContext.resume()` without a user gesture. The form
 * submit is the gesture; cues fire ~50–200ms after that submit, comfortably
 * inside the activation window.
 */

const STORAGE_KEY = "sceneos:audio-muted";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isAudioMuted(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === "true";
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(muted));
}

interface PlayOptions {
  /** Linear gain, 0..1. Defaults differ per cue. */
  volume?: number;
  /** Override the global mute state. Reserved for tests/diagnostics. */
  force?: boolean;
}

/**
 * Short percussive ember pop — filtered noise burst with a fast decay.
 *
 * Graph: noise (envelope-baked) → lowpass (2400Hz → 80Hz) → gain → dest.
 *
 * Duration ~150ms. Used at the page-crumple's ignition moment (+0.04s on
 * the timeline) and could be reused for click-confirms on the canvas.
 */
export function playEmberPop({ volume = 0.07, force = false }: PlayOptions = {}): void {
  if (!force && isAudioMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const duration = 0.15;
  const now = ctx.currentTime;

  // Filtered noise burst with envelope baked into the buffer
  const bufferSize = Math.max(1, Math.floor(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + 0.12);
  filter.Q.value = 4;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

/**
 * Cinematic riser — sub-bass glissando + bandpass-noise sweep.
 *
 * Graph (two parallel chains):
 *   sine osc (28Hz → 95Hz) → gain envelope → dest
 *   noise → bandpass (400Hz → 3500Hz) → gain envelope → dest
 *
 * Duration ~1.2s. Fires at the page-crumple's main thrust (+0.18s on the
 * timeline). Can be re-purposed for the final-delivery reveal.
 */
export function playCinematicRiser({ volume = 0.04, force = false }: PlayOptions = {}): void {
  if (!force && isAudioMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const duration = 1.2;
  const now = ctx.currentTime;

  // Sub-bass riser
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(28, now);
  sub.frequency.exponentialRampToValueAtTime(95, now + duration);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(volume * 1.4, now + duration * 0.7);
  subGain.gain.linearRampToValueAtTime(0, now + duration);

  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + duration);

  // Bandpass-filtered noise sweep
  const bufferSize = Math.max(1, Math.floor(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(400, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(3500, now + duration);
  noiseFilter.Q.value = 1.5;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(volume * 0.7, now + duration * 0.7);
  noiseGain.gain.linearRampToValueAtTime(0, now + duration);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}
