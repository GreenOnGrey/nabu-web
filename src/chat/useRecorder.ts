import { useCallback, useEffect, useRef, useState } from "react";

/** Push-to-talk recording with MediaRecorder. */
export function useRecorder() {
  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const stopped = useRef<((b: Blob | null) => void) | null>(null);

  const cleanup = () => {
    window.clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
    rec.current = null;
    setRecording(false);
  };

  const start = useCallback(async () => {
    if (!supported || rec.current) return;
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.onstop = () => {
        const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || "audio/webm" }) : null;
        cleanup();
        stopped.current?.(blob);
        stopped.current = null;
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
      const began = Date.now();
      timer.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 250);
    } catch {
      setError(true);
      cleanup();
    }
  }, [supported]);

  const stop = useCallback(() => new Promise<Blob | null>((resolve) => {
    const r = rec.current;
    if (!r || r.state === "inactive") return resolve(null);
    stopped.current = resolve;
    r.stop();
  }), []);

  useEffect(() => () => cleanup(), []);

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return { supported, recording, seconds: `${mm}:${ss}`, error, start, stop };
}
