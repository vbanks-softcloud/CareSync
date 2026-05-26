import { useEffect, useRef, useState, useCallback } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
};

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r: SpeechRecognitionLike = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript + " ";
        } else {
          interimText += res[0].transcript;
        }
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };
    r.onend = () => setListening(false);
    r.onerror = (e: any) => setError(e?.error ?? "Recognition error");
    recognitionRef.current = r;
    return () => {
      try {
        r.stop();
      } catch {}
    };
  }, []);

  const start = useCallback(() => {
    setError(null);
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    try {
      recognitionRef.current?.start();
      setListening(true);
    } catch (e: any) {
      setError(e?.message ?? "Could not start");
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  const setManual = useCallback((t: string) => {
    finalRef.current = t;
    setTranscript(t);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset, setManual };
}
