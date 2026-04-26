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
  /**
   * Silence threshold in MILLISECONDS. After this much no-new-result
   * silence we stop listening and fire `onSettle(transcript)`. The
   * browser's native onend fires the moment the user pauses for ~0.5s
   * — too eager. With a 3000ms grace the user can think mid-sentence.
   * Default 3000.
   */
  silenceMs?: number;
  /**
   * Called when the recognition settles (silence threshold elapsed) OR
   * the user clicks the mic to stop. The current transcript is the
   * argument. Consumer typically auto-submits the form here.
   */
  onSettle?: (transcript: string) => void;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-US", silenceMs = 3000, onSettle } = opts;
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const transcriptRef = useRef<string>("");
  const onSettleRef = useRef<typeof onSettle>(onSettle);
  // Keep onSettle ref fresh without re-creating the recognition instance.
  onSettleRef.current = onSettle;
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
    // continuous=true so brief mid-sentence pauses don't kill the
    // session. Our own silence-debounce timer below decides when to
    // actually stop.
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      recRef.current = null;
    };
  }, [lang]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const armSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      // Settle: stop the recognition + invoke the consumer's callback.
      const rec = recRef.current;
      if (rec) {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final && onSettleRef.current) onSettleRef.current(final);
    }, silenceMs);
  };

  const start = () => {
    const rec = recRef.current;
    if (!rec) return;
    setError(null);
    setTranscript("");
    transcriptRef.current = "";
    rec.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0]?.transcript ?? "";
      }
      const trimmed = combined.trim();
      transcriptRef.current = trimmed;
      setTranscript(trimmed);
      // Each new result re-arms the silence countdown. If the user
      // keeps speaking the timer never fires; once they actually stop
      // for `silenceMs` we settle.
      armSilenceTimer();
    };
    rec.onerror = (e) => {
      setError(e.error ?? "speech-error");
      clearSilenceTimer();
      setListening(false);
    };
    rec.onend = () => {
      // continuous=true means onend fires on user stop or browser
      // reaching some internal limit. Either way, clean up. If we
      // already had a settle timer pending, let it run; otherwise fire
      // the callback ourselves with whatever transcript we have.
      const hadTimer = silenceTimerRef.current !== null;
      clearSilenceTimer();
      setListening(false);
      if (!hadTimer) {
        const final = transcriptRef.current.trim();
        if (final && onSettleRef.current) onSettleRef.current(final);
      }
    };
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
    clearSilenceTimer();
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  return { listening, supported, start, stop, transcript, error };
}
