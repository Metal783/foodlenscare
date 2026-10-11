import { useEffect, useRef, useState } from "react";
import type { SessionKind } from "./Onboarding";
import { played, report, useBackend } from "./backend";
export type CareVoice = { id: string; sender: string; relation: string; recipient: string; sentAt: string; audioUrl: string; duration: number; played: boolean; completedOnce: boolean; progress: number; demo: boolean; summary?: string };
export type VoicePlayer = { voices: CareVoice[]; currentId: string | null; isPlaying: boolean; loading: boolean; error: string; toggle: (id: string) => void; play: (id: string) => void; pause: () => void };
export function useVoicePlayer(_session: SessionKind): VoicePlayer {
  const data = useBackend();
  const audio = useRef<HTMLAudioElement | null>(null);
  const current = useRef<string | null>(null);
  const progress = useRef<Record<string, { progress: number; completedOnce: boolean }>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, update] = useState(0);
  const voices: CareVoice[] = data.messages.filter(m => m.recipient === data.account?.id).map(m => {
    const family = data.families.find(f => f.member.id === m.sender);
    return { id: m.id, sender: family?.member.name || "家人", relation: family?.relation || "家人", recipient: data.account?.name || "本人", sentAt: m.sentAt, audioUrl: m.audioDataUrl, duration: m.duration, played: !!m.playedAt, completedOnce: progress.current[m.id]?.completedOnce || false, progress: progress.current[m.id]?.progress || 0, demo: false, summary: m.note || undefined };
  });
  useEffect(() => {
    const player = new Audio(); audio.current = player;
    const tick = () => { if (current.current) { progress.current[current.current] = { ...progress.current[current.current], progress: player.currentTime }; update(n => n + 1); } };
    const started = () => { setLoading(false); setPlaying(true); if (current.current) void played(current.current).catch(report); };
    const stopped = () => setPlaying(false);
    const ended = () => { if (current.current) progress.current[current.current] = { progress: player.currentTime, completedOnce: true }; stopped(); update(n => n + 1); };
    const failed = () => { setError("语音无法播放，请刷新后重试。"); setLoading(false); setPlaying(false); };
    player.addEventListener("timeupdate", tick); player.addEventListener("playing", started); player.addEventListener("pause", stopped); player.addEventListener("ended", ended); player.addEventListener("error", failed);
    return () => { player.pause(); player.removeAttribute("src"); player.removeEventListener("timeupdate", tick); player.removeEventListener("playing", started); player.removeEventListener("pause", stopped); player.removeEventListener("ended", ended); player.removeEventListener("error", failed); audio.current = null; };
  }, [data.account?.id]);
  useEffect(() => { if (current.current && !voices.some(v => v.id === current.current)) { audio.current?.pause(); current.current = null; setCurrentId(null); } }, [data.messages, data.families]);
  const play = (id: string) => {
    const voice = voices.find(v => v.id === id), player = audio.current;
    if (!voice || !player) return;
    window.speechSynthesis?.cancel(); setError(""); setLoading(true);
    if (current.current !== id) { player.pause(); current.current = id; setCurrentId(id); player.src = voice.audioUrl; player.currentTime = voice.progress >= voice.duration ? 0 : voice.progress; }
    else if (player.ended) player.currentTime = 0;
    void player.play().catch(() => { setLoading(false); setError("播放没有开始，请再次点击播放。"); });
  };
  const pause = () => { audio.current?.pause(); setLoading(false); };
  return { voices, currentId, isPlaying, loading, error, play, pause, toggle: id => current.current === id && isPlaying ? pause() : play(id) };
}
