import { useCallback, useEffect, useRef, useState } from 'react';

/** Each utterance owns its callbacks; cancelled or replaced speech cannot update a new one. */
export default function useAssistantSpeech() {
  const [speaking, setSpeaking] = useState<string | null>(null), [speechError, setSpeechError] = useState('');
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    const previous = current.current;
    current.current = null;
    if (previous) { previous.onend = null; previous.onerror = null; window.speechSynthesis?.cancel(); }
    setSpeaking(null); setSpeechError('');
  }, []);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('foodlenscare:stop-audio', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => { stop(); window.removeEventListener('foodlenscare:stop-audio', stop); document.removeEventListener('visibilitychange', hidden); };
  }, [stop]);
  const toggle = (key: string, value: string) => {
    if (speaking === key) { stop(); return; }
    stop(); setSpeechError('');
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') { setSpeechError('当前设备不支持朗读，请阅读文字。'); return; }
    if (!value.trim()) return;
    window.dispatchEvent(new Event('foodlenscare:stop-audio'));
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value); utterance.lang = 'zh-CN';
    current.current = utterance; setSpeaking(key);
    utterance.onend = () => { if (current.current === utterance) { current.current = null; setSpeaking(null); } };
    utterance.onerror = event => {
      if (current.current !== utterance) return;
      current.current = null; setSpeaking(null);
      if (event.error !== 'canceled' && event.error !== 'interrupted') setSpeechError('朗读未能完成，请重试。');
    };
    try { window.speechSynthesis.speak(utterance); }
    catch { if (current.current === utterance) { stop(); setSpeechError('朗读未能开始，请重试。'); } }
  };
  return { speaking, speechError, toggle, stop };
}
