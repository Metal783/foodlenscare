import { useEffect, useRef, useState } from "react";
export function blobDataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("录音读取失败")); reader.readAsDataURL(blob); }); }
export function useRecorder() {
  const [status, setStatus] = useState<"idle" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const blob = useRef<Blob | null>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), timer = useRef<number | null>(null), alive = useRef(true), url = useRef(""), preview = useRef<HTMLAudioElement | null>(null), acquiring = useRef(false), generation = useRef(0);
  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const stopTracks = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  const receive = (value: Blob, duration: number) => { preview.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); blob.current = value; url.current = URL.createObjectURL(value); preview.current = new Audio(url.current); setAudioUrl(url.current); setSeconds(duration); setStatus("ready"); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; clearTimer(); if (recorder.current?.state === "recording") recorder.current.stop(); stopTracks(); preview.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  const start = async () => {
    if (acquiring.current || status === "recording") return;
    acquiring.current = true; const active = generation.current;
    preview.current?.pause(); blob.current = null; setStatus("idle"); setSeconds(0);
    try {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("当前地址不能使用麦克风，请选择已有录音；电脑可用localhost录音。");
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || generation.current !== active) { input.getTracks().forEach(t => t.stop()); return; }
      stream.current = input;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      const device = new MediaRecorder(input, mime ? { mimeType: mime } : {}); recorder.current = device;
      const chunks: Blob[] = [], started = performance.now();
      device.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      device.onstop = () => { clearTimer(); stopTracks(); if (alive.current && generation.current === active) { const value = new Blob(chunks, { type: device.mimeType }); if (value.size) receive(value, Math.min(120, Math.max(.1, (performance.now() - started) / 1000))); else { setStatus("idle"); setError("没有录到音频，请重新录制。"); } } };
      device.onerror = () => { clearTimer(); stopTracks(); if (alive.current) { setError("录音失败，请重试。"); setStatus("idle"); } };
      preview.current?.pause(); device.start(); setError(""); setSeconds(0); setStatus("recording");
      timer.current = window.setInterval(() => { const elapsed = (performance.now() - started) / 1000; setSeconds(Math.min(elapsed, 120)); if (elapsed >= 120 && device.state === "recording") device.stop(); }, 200);
    } catch (e) { stopTracks(); setError((e as Error).message); }
    finally { acquiring.current = false; }
  };
  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const loadFile = async (file: File) => {
    let objectUrl = "";
    const active = generation.current;
    try {
      if (!file.size || file.size > 8 * 1024 * 1024) throw new Error("请选择8MB以内的有效录音。");
      objectUrl = URL.createObjectURL(file); const probe = new Audio(objectUrl);
      const duration = await new Promise<number>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("录音时长读取超时，请换用WAV或MP4录音。")), 10000);
        probe.onloadedmetadata = () => { clearTimeout(timeout); Number.isFinite(probe.duration) ? resolve(probe.duration) : reject(new Error("无法读取录音时长，请换用WAV或MP4录音。")); };
        probe.onerror = () => { clearTimeout(timeout); reject(new Error("录音格式无法播放。")); };
      });
      if (!alive.current || generation.current !== active) return;
      if (duration <= 0 || duration > 120) throw new Error("请选择2分钟以内的录音。");
      const normalized = new Blob([file], { type: file.type === "audio/x-wav" ? "audio/wav" : file.type }); receive(normalized, duration); setError("");
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
  };
  const play = () => { if (!preview.current) return; void preview.current.play().catch(() => setError("无法试听，请重试。")); };
  return { status, seconds, error, audioUrl, blob, start, stop, loadFile, play };
}
