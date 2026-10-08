/**
 * 识别路由层
 *
 * 职责：
 *  1. 先做客观图片质量检测（为灰色等级提供硬性原因）；
 *  2. 按优先级选择通道：真实接口 → 模拟通道 → 内置演示用例；
 *  3. 统一超时、重试与降级，保证「任何单一环节出问题都不会导致作品无法演示」；
 *  4. 双通道互校验：两个通道对同一字段取值不一致时降低置信度（方案 4.2）。
 */

import { CONFIG } from './config.js';
import { measureImage, loadImage } from './quality.js';
import * as httpChannel from './http.js';
import * as mockChannel from './mock.js';
import * as demoChannel from './demo.js';
import * as ocrChannel from './ocr-huawei.js';
import { CHANNELS, CROSS_CHECK_TOLERANCE } from './channels.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';

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
export async function recognizePhoto({ file, signal, prefer = 'auto' }) {
  const started = performance.now();
  let quality = { blurry: false, tooSmall: false, tips: [] };
  let image = null;

  // 1. 客观质量检测（图片解码失败不阻断，交给置信度判断）
  try {
    image = await loadImage(file);
    quality = measureImage(image);
  } catch {
    quality = { blurry: true, tooSmall: false, tips: ['这张图片读不出内容，请重新拍一张。'] };
  }

  // 照片本身没法读时，模拟通道会返回低置信度结果 → 规则层判灰
  const hardBad = Boolean(quality.blurry || quality.tooDark || quality.tooBright || quality.tooSmall);

  const mockMode = readMockMode();

  // 2. 真实主通道
  if (!hardBad && prefer !== 'mock' && prefer !== 'demo' && httpChannel.isConfigured()) {
    try {
      const result = await withTimeout(
        httpChannel.recognize({ file, signal }),
        CONFIG.vision.timeoutMs,
        '识别超时了，请检查网络后再试一次。'
      );
      result.label.imageQuality = quality;
      return finalize(result, quality, null, started);
    } catch (error) {
      if (error?.code === 'E_NOT_CONFIGURED') {
        // 落回模拟通道
      } else if (CONFIG.fallback.retry > 0) {
        try {
          const retry = await withTimeout(
            httpChannel.recognize({ file, signal }),
            CONFIG.vision.timeoutMs,
            '识别超时了。'
          );
          retry.label.imageQuality = quality;
          return finalize(retry, quality, null, started);
        } catch (retryError) {
          return fallbackToMock({ file, quality, mockMode, started, reason: describeError(retryError) });
        }
      } else {
        return fallbackToMock({ file, quality, mockMode, started, reason: describeError(error) });
      }
    }
  }

  // 3. 华为云 OCR 兜底通道（仅在显式要求且已配置时启用）
  if (prefer === 'ocr' && ocrChannel.isConfigured()) {
    try {
      const result = await withTimeout(
        ocrChannel.recognize({ file }),
        CONFIG.huaweiOcr.timeoutMs,
        'OCR 通道超时。'
      );
      result.label.imageQuality = quality;
      return finalize(result, quality, null, started);
    } catch (error) {
      return fallbackToMock({ file, quality, mockMode, started, reason: describeError(error) });
    }
  }

  // 4. 模拟识别通道（默认路径：无需任何密钥即可演示）
  return fallbackToMock({ file, quality, mockMode, started, reason: null });
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
    const va = Number(a.nutritionPer100g?.[field.key]);
    const vb = Number(b.nutritionPer100g?.[field.key]);
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

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const error = new Error(message);
        error.code = 'E_TIMEOUT';
        reject(error);
      }, ms)
    )
  ]);
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
