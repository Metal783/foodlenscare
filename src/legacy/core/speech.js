/**
 * 语音播报
 *
 * 方案的三个关键点在这里落地：
 *  1. 「念出来」是闭环的最后一步——结论必须可被朗读；
 *  2. 拍照读取的配料表原文支持「语音朗读」；
 *  3. 老人视力下降，语音是主要信息通道之一，与颜色、文字标签三通道并行。
 *
 * 使用浏览器内置 Web Speech API，不依赖任何外部服务，不产生网络请求，
 * 断网也能播报（离线演示可靠性）。
 */

let cachedVoice = null;
let unlocked = false;

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** 优先挑中文语音；Safari 上需等 voices 异步就绪 */
function pickVoice() {
  if (!isSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  cachedVoice =
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /Ting|Yaoyao|Xiaoxiao|婷婷|Microsoft/i.test(v.name)) ||
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null;
  return cachedVoice;
}

if (isSupported()) {
  // 语音列表在部分浏览器上是异步加载的
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

/**
 * 播报一段文本。
 * @param {string} text
 * @param {{rate?:number, onEnd?:Function}} [options]
 * @returns {boolean} 是否成功发起播报
 */
export function speak(text, options = {}) {
  if (!isSupported() || !text) return false;
  try {
    window.speechSynthesis.cancel(); // 防止上一条结论与新结论叠着念
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = 'zh-CN';
    // 老年人听读需要更慢的语速：默认 0.85，可在设置里调
    utterance.rate = options.rate ?? 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (options.onEnd) utterance.onend = options.onEnd;
    utterance.onerror = () => {
      unlocked = false;
    };
    window.speechSynthesis.speak(utterance);
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function stop() {
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* 忽略 */
  }
}

export function isSpeaking() {
  if (!isSupported()) return false;
  try {
    return window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

/**
 * 部分移动端浏览器要求先有一次用户手势才允许语音。
 * 画像设置里的「语音开关」正是一次手势，用它完成解锁。
 */
export function unlock() {
  if (!isSupported() || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.lang = 'zh-CN';
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* 忽略 */
  }
}

/**
 * 生成适合朗读的结论文本：结论 + 建议 + 依据摘要。
 * 数字要读成中文量词，否则语音引擎会把「28.5」念得别扭。
 * @param {{headline:string, advice:string, level:string}} assessment
 */
export function buildSpeechText(assessment) {
  const parts = [assessment.headline, assessment.advice].filter(Boolean);
  return parts.join(' ');
}
