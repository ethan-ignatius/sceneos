import { useEffect, useRef, useState } from "react";

/**
 * Browser SpeechRecognition / webkitSpeechRecognition wrapper.
 *
 * Returns a tiny state machine: { listening, supported, start, stop, transcript }.
 * Live updates `transcript` while the user speaks (via interim results), then
 * settles on the final transcript on `end`. Consumer wires `transcript` into
 * its input draft and decides when to submit.
 *
 * Browsers: Chrome / Safari / Edge support webkitSpeechRecognition.
 * Firefox doesn't ship it (`supported` will be false; UI should hide the
 * mic button gracefully).
 */
type SpeechRecognitionEvent = Event & {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number; isFinal?: boolean };
  resultIndex: number;
};
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Stop after first final result. Default true — cleaner UX for one-shot dictation. */
  oneShot?: boolean;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-US", oneShot = true } = opts;
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang;
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [lang]);

  const start = () => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    setTranscript("");
    rec.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript ?? "";
      }
      setTranscript(combined.trim());
      // If a result is final and we're in one-shot mode, the recognition
      // engine will fire onend; no need to stop manually.
      void oneShot;
    };
    rec.onerror = (e) => {
      setError(e.error ?? "speech-error");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start");
    }
  };

  const stop = () => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  return { listening, supported, start, stop, transcript, error };
}
