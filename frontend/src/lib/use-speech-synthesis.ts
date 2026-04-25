import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser SpeechSynthesis (text-to-speech) wrapper.
 *
 * Feature-detects, picks a "neutral, calm" English voice if available,
 * exposes `speak(text)` and `cancel()`. Respects a `muted` flag passed in.
 *
 * Used in the agent bubble stream so the director's responses are spoken
 * back when the user submitted via voice (the natural voice-chat pairing).
 */

interface UseSpeechSynthesisOptions {
  muted?: boolean;
  /** Playback rate. 0.95 reads as deliberate / cinematic. */
  rate?: number;
  /** Pitch. 1.0 default. Slightly lower for a "director" voice. */
  pitch?: number;
  /** Volume 0..1. */
  volume?: number;
}

export function useSpeechSynthesis(opts: UseSpeechSynthesisOptions = {}) {
  const { muted = false, rate = 0.95, pitch = 0.95, volume = 0.85 } = opts;
  const [supported, setSupported] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const pickVoice = () => {
      const all = window.speechSynthesis.getVoices();
      // Prefer a calm en-US voice. Heuristic: en-US, female, "Google" or "Samantha".
      const score = (v: SpeechSynthesisVoice) => {
        const name = v.name.toLowerCase();
        let s = 0;
        if (v.lang.startsWith("en-")) s += 5;
        if (v.lang === "en-US" || v.lang === "en-GB") s += 2;
        if (name.includes("samantha") || name.includes("ava") || name.includes("aria")) s += 3;
        if (name.includes("google")) s += 1;
        if (name.includes("male") || name.includes("daniel") || name.includes("alex")) s += 1;
        return s;
      };
      const best = [...all].sort((a, b) => score(b) - score(a))[0] ?? null;
      voiceRef.current = best;
    };

    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supported || muted) return;
      try {
        // Cancel any in-flight utterance before queuing the next.
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore — speech synthesis can throw in private windows etc. */
      }
    },
    [supported, muted, rate, pitch, volume],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }, [supported]);

  return { speak, cancel, supported };
}
