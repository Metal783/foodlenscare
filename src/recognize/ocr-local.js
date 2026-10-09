/** 真实本地 OCR：照片在浏览器内处理，不上传到第三方。 */
import { parseLabelText, splitIngredientLines, findIngredientHeading } from './parse-label.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';

let enginePromise;
const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';

function abortError() { return new DOMException('读取已取消', 'AbortError'); }

function loadEngine() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const remote = window.location.protocol === 'file:';
    script.src = remote ? `${CDN}tesseract.min.js` : new URL('assets/ocr/tesseract.min.js', document.baseURI).href;
    const timer = setTimeout(() => finish(new Error('文字识别引擎加载超时，请检查网络后重试。')), 30000);
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.Tesseract);
    };
    script.onload = () => finish(window.Tesseract ? null : new Error('文字识别引擎加载失败。'));
    script.onerror = () => finish(new Error('文字识别引擎无法加载。双击版首次读取需要联网；也可以通过本地服务打开。'));
    document.head.appendChild(script);
  }).catch((error) => { enginePromise = null; throw error; });
  return enginePromise;
}

/** 提取严格按实际文字解析；无配料标题时只展示全文，不猜成配料。 */
export function labelFromOcr(data) {
  const rawText = String(data?.text || '').replace(/\r/g, '').trim();
  // 中文 OCR 通常在每个汉字之间加入空格，去除这些排版空格。
  const normalized = rawText.replace(/([\u3400-\u9fff])[ \t\u3000]+(?=[\u3400-\u9fff])/g, '$1');
  const score = Math.max(0, Math.min(1, Number(data?.confidence || 0) / 100));
  const label = parseLabelText(normalized, { channelLabel: '本机照片文字识别' });

  // 只有真的找到配料标题（含常见错字写法）才认这个配料区段；
  // 找不到就留空，让页面如实说明「没有读到配料表」，而不是猜一段出来。
  const heading = findIngredientHeading(normalized);
  if (!heading) {
    label.ingredientText = '';
    label.ingredientLines = [];
  } else {
    label.ingredientLines = splitIngredientLines(label.ingredientText);
    // 标题是错字时（配科表 / 妃料表）置信度打折，页面会提示用户核对
    label.ingredientHeadingSuspect = !/^(?:配料表|配料|原料与辅料|原料|原辅料)/.test(heading.heading);
  }

  for (const field of NUTRIENT_FIELDS) {
    // OCR 只转录全文，不自动把不可靠的表格排列解释为每 100 g 数值。
    label.nutritionPer100g[field.key] = null;
    label.confidence[field.key] = 0;
  }
  label.rawText = rawText;
  label.ocrConfidence = label.ingredientHeadingSuspect ? score * 0.7 : score;
  label.channel = 'localOcr';
  // 单纯 OCR 无法保证表格列与单位口径对应，因此不给摄入量结论。
  label.readingOnly = true;
  label.productName = /(?:产品名称|品名|名称)\s*[:：]/.test(normalized) ? label.productName : '';
  return label;
}

export async function recognize({ file, signal, onProgress }) {
  if (signal?.aborted) throw abortError();
  let worker;
  let stopped = false;
  let rejectStop;
  const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
  const stop = (error) => {
    stopped = true;
    if (worker) void worker.terminate().catch(() => {});
    rejectStop(error);
  };
  const cancel = () => stop(abortError());
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => stop(new Error('读取时间较长，请把配料表拍近一些再试。')), 120000);
  const run = async () => {
    onProgress?.({ text: '正在准备文字识别……', note: '首次使用需要稍等，照片留在本机。' });
    const engine = await loadEngine();
    if (stopped) throw abortError();
    const remote = window.location.protocol === 'file:';
    const base = new URL('assets/ocr/', document.baseURI).href;
    // 中文模型含拉丁字符；不叠加英文模型，避免把中文配料标题误读成英文。
    worker = await engine.createWorker('chi_sim', 1, {
      workerPath: remote ? `${CDN}worker.min.js` : `${base}worker.min.js`,
      corePath: remote ? 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js' : `${base}tesseract-core-lstm.wasm.js`,
      langPath: remote ? 'https://tessdata.projectnaptha.com/4.0.0_fast' : base.replace(/\/$/, ''),
      logger: (message) => {
        if (stopped) return;
        const reading = message.status === 'recognizing text';
        onProgress?.({ text: reading ? `正在读取照片上的字……${Math.round((message.progress || 0) * 100)}%` : '正在准备中文识别……', note: '可以随时取消读取，照片不会上传。' });
      },
      errorHandler: (error) => stop(new Error(`文字识别失败：${String(error?.message || error).slice(0, 100)}`))
    });
    if (stopped) { await worker.terminate(); throw abortError(); }
    await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(file);
    if (stopped) throw abortError();
    const label = labelFromOcr(data);
    if (!label.rawText) throw new Error('没有读到文字，请对准配料表靠近拍摄，避开反光。');
    return { label, channel: 'localOcr' };
  };
  try { return await Promise.race([run(), stopPromise]); }
  finally {
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (worker) await worker.terminate().catch(() => {});
  }
}
