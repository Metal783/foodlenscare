/**
 * 闭环动作：从「一张照片」到「一句结论」
 *
 * 五步闭环（方案 3.1）的实现顺序：
 *   一 · 拍包装  → pickPhoto / 文件选择
 *   二 · 认标签  → processPhoto         （感知层 + 双通道）
 *   三 · 对画像  → evaluate             （规则层，读本地画像）
 *   四 · 判风险  → assessment.level     （五色分级）
 *   五 · 念出来  → speakAssessment      （语音播报 + 写入当日记录）
 *
 * 这里集中放跨页面共用的动作，页面只关心展示。
 */

import * as recognizer from '../recognize/index.js';
import { evaluate } from './rules.js';
import { addRecord, loadRecords, todayTotals, scaleNutrients } from './store.js';
import * as speech from './speech.js';
import { toast } from '../ui/dom.js';

const MAX_SIDE = 2000;

/**
 * @typedef {Object} PhotoLabel
 * @property {import('./rules.js').ParsedLabel} label
 * @property {'camera'|'album'|'demo'} origin
 * @property {string} [previewUrl]
 * @property {File|Blob|null} file
 * @property {Object} quality
 * @property {string|null} fallbackReason
 * @property {number} elapsedMs
 * @property {string} [demoCaseId]
 */

/**
 * 用 canvas 压缩照片再上传：老年人手机内存有限，原图直传容易崩；
 * 同时保证长边不超过 MAX_SIDE，识别精度与体积折中。
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function compressPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob || file;
  } catch {
    return file;
  }
}

/**
 * 打开系统相机 / 相册。不使用自定义相机流，避免部分机型权限反复弹窗。
 *
 * 实现上有两个坑，都踩过：
 *  1. 过去用「窗口重新获得焦点后 1.2 秒」来兜底「用户取消了选择」，
 *     但选照片慢一点（老人很常见）就会被这个定时器先 resolve 成 null，
 *     表现就是「点了按钮没反应」。现在只认 change 事件，
 *     再用 change 之外的 cancel 事件（支持的浏览器）来识别取消。
 *  2. 每次点击都新建一个隐藏 input 并 appendChild，某些机型上会偶发不弹窗。
 *     改为复用同一个 input 元素，只换监听。
 *
 * @param {'camera'|'album'} mode
 * @returns {Promise<File|null>} 用户选了照片返回 File，取消返回 null
 */
let sharedInput = null;
let pendingResolve = null;

function ensureInput() {
  if (sharedInput) return sharedInput;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.position = 'fixed';
  input.style.left = '-10000px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;

  const settle = (file) => {
    const resolve = pendingResolve;
    pendingResolve = null;
    input.value = ''; // 允许连续两次选同一张照片
    if (resolve) resolve(file || null);
  };

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    settle(file || null);
  });
  // 支持的浏览器会发 cancel，比任何超时猜测都可靠
  input.addEventListener('cancel', () => settle(null));

  document.body.appendChild(input);
  sharedInput = input;
  return input;
}

export async function pickPhoto(mode = 'camera') {
  const input = ensureInput();
  if (mode === 'camera') input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');

  // 上一次还没结束（用户连点两下）：先把它收尾，避免永久挂起
  if (pendingResolve) {
    const previous = pendingResolve;
    pendingResolve = null;
    previous(null);
  }

  const file = await new Promise((resolve) => {
    pendingResolve = resolve;
    input.click();
  });
  if (file && (!file.type.startsWith('image/') || file.size === 0)) {
    throw new Error('请选择一张有效的食品配料表照片。');
  }
  if (file && file.size > 20 * 1024 * 1024) {
    throw new Error('这张照片太大了，请换一张小于 20 MB 的照片。');
  }
  return file;
}

/**
 * 第二、三、四步：识别 → 对画像 → 分级。
 * @param {File|Blob} file
 * @param {'camera'|'album'} origin
 * @param {import('./store.js').Profile} profile
 * @returns {Promise<{photo:PhotoLabel, assessment:Object}>}
 */
export async function processPhoto(file, origin, profile, options = {}) {
  const prepared = file instanceof File ? await compressPhoto(file) : file;
  const previewUrl = URL.createObjectURL(prepared);

  let outcome;
  try {
    outcome = await recognizer.recognizePhoto({ file: prepared, signal: options.signal, onProgress: options.onProgress });
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
  const photo = {
    label: outcome.label,
    origin,
    previewUrl,
    file: prepared,
    quality: outcome.quality,
    fallbackReason: outcome.fallbackReason,
    elapsedMs: outcome.elapsedMs
  };

  const assessment = evaluateLabel(outcome.label, profile);
  return { photo, assessment };
}

/**
 * 离线演示用例：完全不联网，直接用车内置数据。
 * @param {string} caseId
 * @param {import('./store.js').Profile} profile
 */
export async function processDemoCase(caseId, profile) {
  const outcome = await recognizer.recognizeDemoCase(caseId);
  const photo = {
    label: outcome.label,
    origin: 'demo',
    previewUrl: null,
    file: null,
    quality: outcome.quality,
    fallbackReason: null,
    elapsedMs: outcome.elapsedMs,
    demoCaseId: caseId
  };
  const assessment = evaluateLabel(outcome.label, profile);
  return { photo, assessment };
}

/** 规则层评估：把本地画像与当日已摄入量喂给引擎 */
export function evaluateLabel(label, profile) {
  const totals = todayTotals();
  const servingGrams = Number(label.servingGrams) || 100;
  return evaluate({
    label,
    profile,
    consumedToday: {
      sodium: totals.sodium,
      sugar: totals.sugar,
      saturatedFat: totals.saturatedFat,
      fat: totals.fat
    },
    servingGrams
  });
}

/**
 * 第五步：念出来，并写入当日记录。
 * @param {{photo:PhotoLabel, assessment:Object}} result
 * @param {import('./store.js').Profile} profile
 * @param {{record?:boolean}} [options]
 */
export function speakAndRecord({ photo, assessment }, profile, options = {}) {
  if (profile.voiceOn) {
    speech.unlock();
    speech.speak(speech.buildSpeechText(assessment));
  }
  if (options.record !== true) return null;
  return recordResult({ photo, assessment }, options);
}

/** 写入当日记录：名称、结论、时间、风险等级与关键营养量 */
export function recordResult(result, options = {}) {
  const { photo, assessment } = result;
  if (options.consumptionConfirmed !== true || assessment.level === 'gray' || photo.label.readingOnly || photo.origin === 'demo') return null;
  const existing = result.consumptionRecordId && loadRecords().find((r) => r.id === result.consumptionRecordId);
  if (existing) return existing;
  const label = photo.label;
  const servingGrams = Number(label.servingGrams);
  if (!Number.isFinite(servingGrams) || servingGrams <= 0) throw new Error('请填写大于 0 的实际食用数量。');
  const nutrients = scaleNutrients(label.nutritionPer100g || {}, servingGrams);
  const item = addRecord({
    consumptionConfirmed: true,
    productName: label.productName || '未识别名称的食品',
    level: assessment.level,
    headline: assessment.headline,
    advice: assessment.advice,
    channel: label.channelLabel,
    servingGrams,
    servingUnit: label.servingUnit || 'g',
    nutrients,
    allergenHits: (assessment.allergenConflicts || []).map((a) => a.short),
    origin: photo.origin,
    demoCaseId: photo.demoCaseId || null,
    previewUrl: photo.previewUrl || null
  });
  result.consumptionRecordId = item.id;
  return item;
}

/** 统一的失败提示：任何异常都要给出下一步动作，而不是只报错 */
export function reportFailure(error) {
  console.error('[FoodLensCare] 处理失败：', error);
  const message =
    error?.code === 'E_TIMEOUT'
      ? '识别超时了，请再试一次。'
      : error?.message || '这张照片没处理好，请再拍一张。';
  toast(message, 3600);
  return message;
}
