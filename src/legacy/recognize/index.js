/**
 * 识别路由层
 *
 * 职责：
 *  1. 先做客观图片质量检测（为灰色等级提供硬性原因）；
 *  2. 按优先级选择真实视觉接口、云端 OCR 与本机中文 OCR；
 *  3. 演示用例独立运行，模拟通道仅用于显式开发测试；
 *  4. 提供双通道互校验函数，供接入服务后使用。
 */

import { CONFIG } from './config.js';
import { measureImage, loadImage } from './quality.js';
import * as httpChannel from './http.js';
import * as mockChannel from './mock.js';
import * as demoChannel from './demo.js';
import * as ocrChannel from './ocr-huawei.js';
import * as paddleOcr from './ocr-paddle.js';
import { CHANNELS, CROSS_CHECK_TOLERANCE } from './channels.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';

/** 未读取到真实标签时保持空字段，不用演示商品替代用户照片。 */
function unreadOutcome(quality, started, reason) {
  return finalize({ channel: 'unavailable', label: {
    productName: '', ingredientText: '', ingredientLines: [], allergenDeclaration: '',
    nutritionPer100g: Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, null])),
    confidence: Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, 0])),
    channelLabel: '尚未读取配料表', servingGrams: 100, servingBasis: 'per100g',
    unavailableReason: reason
  } }, quality, reason, started);
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('读取已取消', 'AbortError');
}

/**
 * @typedef {Object} RecognizeOutcome
 * @property {import('../core/rules.js').ParsedLabel} label
 * @property {string} channelId
 * @property {ImageQuality} quality
 * @property {string|null} fallbackReason
 * @property {number} elapsedMs
 */

/**
 * 识别一张包装照片。
 * @param {Object} input
 * @param {File|Blob} input.file
 * @param {AbortSignal} [input.signal]
 * @param {'auto'|'http'|'mock'|'ocr'} [input.prefer] 手动指定通道（调试用）
 * @returns {Promise<RecognizeOutcome>}
 */
export async function recognizePhoto({ file, signal, prefer = 'auto', onProgress }) {
  const started = performance.now();
  let failedService = false;
  checkAbort(signal);
  let quality = { blurry: false, tooSmall: false, tips: [] };
  let image = null;

  // 1. 客观质量检测（图片解码失败不阻断，交给置信度判断）
  try {
    image = await loadImage(file);
    quality = measureImage(image);
  } catch {
    quality = { blurry: true, tooSmall: false, tips: ['这张图片读不出内容，请重新拍一张。'] };
  }
  if (image?.src) URL.revokeObjectURL(image.src);
  checkAbort(signal);

  // 照片本身无法读取时，保持空字段并提示补拍。
  const hardBad = Boolean(quality.blurry || quality.tooDark || quality.tooBright || quality.tooSmall);

  const mockMode = readMockMode();

  // 模拟识别只能显式用于开发测试；日常拍照不返回构造数据。
  if (prefer === 'mock') return fallbackToMock({ file, quality, mockMode, started, reason: '模拟识别：以下内容为演示数据。' });
  // 白底标签容易被亮度阈值误判为反光。本机 OCR 仍尝试读取可解码的照片。
  if (!image || (hardBad && !CONFIG.paddleOcr.enabled)) return unreadOutcome(quality, started, '照片不够清楚，请调整光线并重新拍摄。');

  // 2. 真实主通道
  if (prefer !== 'ocr' && httpChannel.isConfigured()) {
    try {
      const result = await withTimeout(
        (requestSignal) => httpChannel.recognize({ file, signal: requestSignal }),
        CONFIG.vision.timeoutMs,
        '识别超时了，请检查网络后再试一次。', signal
      );
      checkAbort(signal);
      result.label.imageQuality = quality;
      return finalize(result, quality, null, started);
    } catch (error) {
      checkAbort(signal);
      if (error?.code === 'E_NOT_CONFIGURED') {
        // 尝试已配置的 OCR 通道。
      } else if (CONFIG.fallback.retry > 0) {
        try {
          const retry = await withTimeout(
            (requestSignal) => httpChannel.recognize({ file, signal: requestSignal }),
            CONFIG.vision.timeoutMs,
            '识别超时了。', signal
          );
          checkAbort(signal);
          retry.label.imageQuality = quality;
          return finalize(retry, quality, null, started);
        } catch (retryError) {
          checkAbort(signal);
          failedService = true;
        }
      } else {
        failedService = true;
      }
    }
  }

  // 3. 华为云 OCR 兜底通道（仅在显式要求且已配置时启用）
  if (ocrChannel.isConfigured()) {
    try {
      const result = await withTimeout(
        (requestSignal) => ocrChannel.recognize({ file, signal: requestSignal }),
        CONFIG.huaweiOcr.timeoutMs,
        'OCR 通道超时。', signal
      );
      checkAbort(signal);
      result.label.imageQuality = quality;
      return finalize(result, quality, null, started);
    } catch (error) {
      checkAbort(signal);
      failedService = true;
    }
  }

  // 按文字位置识别中文包装，生成待核对的营养候选。
  let paddleFailure = null;
  if (CONFIG.paddleOcr.enabled) {
    try {
      const result = await paddleOcr.recognize({ file, signal, onProgress });
      checkAbort(signal);
      return finalize(result, quality, failedService ? '云端服务不可用，已改用本机中文区域识别。' : null, started);
    } catch (error) { checkAbort(signal); paddleFailure = error.message; }
  }
  // 新引擎失败时明确报告原因；不再自动改用旧 OCR。
  if (paddleFailure) return unreadOutcome(quality, started, `新版中文 OCR 读取失败：${paddleFailure}`);
  // 本机与云端通道均关闭时保持空标签。
  return unreadOutcome(quality, started, failedService ? '读取服务暂时不可用，请稍后重试。' : '尚未连接食品标签读取服务。这张照片已选好，但还不能读取真实配料。您可以返回重拍，或到首页体验演示用例。');
}

async function fallbackToMock({ file, quality, mockMode, started, reason }) {
  const result = await mockChannel.recognize({ file, quality, mode: mockMode });
  result.label.imageQuality = quality;
  return finalize(result, quality, reason, started);
}

/** 离线演示：直接用车内置用例，完全不走网络 */
export async function recognizeDemoCase(caseId) {
  const started = performance.now();
  const result = await demoChannel.recognize({ caseId });
  result.label.imageQuality = { blurry: caseId === 'blurry-photo', tooSmall: false };
  return {
    label: result.label,
    channelId: 'demo',
    quality: result.label.imageQuality,
    fallbackReason: null,
    elapsedMs: Math.round(performance.now() - started)
  };
}

function finalize(result, quality, fallbackReason, started) {
  const label = result.label;
  label.channel = result.channel || label.channel;
  label.channelLabel = label.channelLabel || CHANNELS[label.channel]?.label || '未知通道';
  label.imageQuality = quality;
  return {
    label,
    channelId: label.channel,
    quality,
    fallbackReason,
    elapsedMs: Math.round(performance.now() - started)
  };
}

/* ------------------------------------------------------- 双通道互校验 */

/**
 * 两个通道对同一字段的取值是否一致。
 * @param {import('../core/rules.js').ParsedLabel} a
 * @param {import('../core/rules.js').ParsedLabel} b
 * @returns {{conflicts:string[], merged:import('../core/rules.js').ParsedLabel}}
 */
export function crossCheck(a, b) {
  const conflicts = [];
  const merged = { ...a, confidence: { ...a.confidence }, nutritionPer100g: { ...a.nutritionPer100g } };

  for (const field of NUTRIENT_FIELDS) {
    const rawA = a.nutritionPer100g?.[field.key];
    const rawB = b.nutritionPer100g?.[field.key];
    const va = rawA == null || String(rawA).trim() === '' ? NaN : Number(rawA);
    const vb = rawB == null || String(rawB).trim() === '' ? NaN : Number(rawB);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    const base = Math.max(Math.abs(va), Math.abs(vb), 1e-6);
    const diff = Math.abs(va - vb) / base;
    if (diff > CROSS_CHECK_TOLERANCE) {
      conflicts.push(field.key);
      // 取值范围小的那个更保守；同时把置信度压到阈值以下以触发补拍
      merged.nutritionPer100g[field.key] = Math.min(va, vb);
      merged.confidence[field.key] = Math.min(
        Number(a.confidence?.[field.key] ?? 0.8),
        Number(b.confidence?.[field.key] ?? 0.8),
        0.55
      );
    }
  }

  merged.crossCheck = { conflicts, channels: [a.channelLabel, b.channelLabel] };
  return { conflicts, merged };
}

/* ---------------------------------------------------------------- 工具 */

async function withTimeout(run, ms, message, signal) {
  checkAbort(signal);
  const controller = new AbortController();
  let timer;
  let cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException('读取已取消', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = 'E_TIMEOUT';
      reject(error);
      controller.abort();
    }, ms);
  });
  try { return await Promise.race([run(controller.signal), interrupted]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

function describeError(error) {
  if (!error) return '识别服务暂时不可用。';
  switch (error.code) {
    case 'E_TIMEOUT':
      return '识别服务响应超时，已改用本地演示数据。';
    case 'E_NETWORK':
      return '网络连不上识别服务，已改用本地演示数据。';
    case 'E_FORMAT':
      return '识别结果格式异常，已改用本地演示数据。';
    case 'E_HTTP':
      return `识别服务返回错误（${error.status ?? '未知'}），已改用本地演示数据。`;
    case 'E_NOT_CONFIGURED':
      return '尚未配置真实识别接口，当前使用模拟识别。';
    default:
      return error.message || '识别失败，已改用本地演示数据。';
  }
}

function readMockMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mock');
    return mode === 'low' || mode === 'high' ? mode : 'auto';
  } catch {
    return 'auto';
  }
}
