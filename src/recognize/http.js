/**
 * 主通道：多模态大模型视觉理解
 *
 * 说明（方案 4.2）：
 * 直接把包装照片交给具备视觉能力的大模型，输出结构化字段并附置信度。
 * 优势是零样本、对版面差异鲁棒、无需训练数据。
 *
 * 本文件负责：图片 → base64 → 请求 → JSON 解析 → 归一化为 ParsedLabel。
 * 未配置 `config.vision.endpoint` 时抛出可识别的错误，由路由层降级到模拟通道。
 */

import { CONFIG, VISION_PROMPT } from './config.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';
import { splitIngredientLines } from './parse-label.js';

/**
 * 读取为 data URL。大图先等比压缩，避免请求体过大导致超时。
 * @param {File|Blob} file
 * @param {number} maxSide
 */
export async function toDataUrl(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  if (scale === 1 && file.type === 'image/jpeg') {
    bitmap.close?.();
    return blobToDataUrl(file);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blobToDataUrl(blob || file);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('照片读取失败。'));
    reader.readAsDataURL(blob);
  });
}

/** 是否已配置真实接口 */
export function isConfigured() {
  return Boolean(CONFIG.vision.endpoint);
}

/**
 * 调用视觉接口。
 * @param {{file:File|Blob, signal?:AbortSignal}} input
 * @returns {Promise<{label:import('../core/rules.js').ParsedLabel, channel:string, elapsedMs:number, raw:any}>}
 */
export async function recognize({ file, signal }) {
  if (!isConfigured()) {
    const error = new Error('尚未配置多模态视觉接口（src/recognize/config.js → vision.endpoint）。');
    error.code = 'E_NOT_CONFIGURED';
    throw error;
  }

  const started = performance.now();
  const dataUrl = await toDataUrl(file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.vision.timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const body = {
    model: CONFIG.vision.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    temperature: 0
  };
  if (CONFIG.vision.jsonMode) body.response_format = { type: 'json_object' };

  let response;
  try {
    response = await fetch(CONFIG.vision.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONFIG.vision.authorization ? { Authorization: CONFIG.vision.authorization } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (cause) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      const error = new Error('识别超时了，请检查网络后再试一次。');
      error.code = 'E_TIMEOUT';
      throw error;
    }
    const error = new Error('连不上识别服务，请检查网络。');
    error.code = 'E_NETWORK';
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = new Error(`识别服务返回 ${response.status}，请稍后再试。`);
    error.code = 'E_HTTP';
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? safeJson(content) : content;
  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('识别服务返回的内容不是结构化字段，已改用其他通道。');
    error.code = 'E_FORMAT';
    throw error;
  }

  return {
    label: normalize(parsed),
    channel: 'http',
    elapsedMs: Math.round(performance.now() - started),
    raw: payload
  };
}

/** 模型有时会把 JSON 包在代码块里 */
function safeJson(text) {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 把模型输出归一化为 ParsedLabel，并做类型与范围清洗。
 * 任何非数字、负数都会被置为 null，绝不猜测填充。
 * @param {any} parsed
 */
export function normalize(parsed) {
  const nutritionPer100g = {};
  const confidence = {};
  for (const field of NUTRIENT_FIELDS) {
    const raw = parsed?.nutritionPer100g?.[field.key];
    const value = typeof raw === 'string' ? Number(raw.replace(/[^\d.\-]/g, '')) : Number(raw);
    nutritionPer100g[field.key] = Number.isFinite(value) && value >= 0 ? value : null;

    const c = Number(parsed?.confidence?.[field.key]);
    confidence[field.key] = Number.isFinite(c)
      ? Math.max(0, Math.min(1, c))
      : nutritionPer100g[field.key] === null
        ? 0
        : 0.8;
  }

  // 模型若给出每份数值，换算为每 100 g，保证规则层口径统一
  const declaredPer = parsed?.declaredPer === 'perServing' ? 'perServing' : 'per100g';
  const servingGrams = Number(parsed?.servingGrams);
  if (declaredPer === 'perServing' && Number.isFinite(servingGrams) && servingGrams > 0) {
    for (const key of Object.keys(nutritionPer100g)) {
      const v = nutritionPer100g[key];
      if (Number.isFinite(v)) nutritionPer100g[key] = Math.round((v / servingGrams) * 100 * 10) / 10;
    }
  }

  const ingredientText = typeof parsed?.ingredientText === 'string' ? parsed.ingredientText.trim() : '';

  return {
    productName: (parsed?.productName || '').toString().trim() || '未识别名称的食品',
    ingredientText,
    ingredientLines: splitIngredientLines(ingredientText),
    allergenDeclaration: (parsed?.allergenDeclaration || '').toString().trim(),
    netContent: (parsed?.netContent || '').toString().trim(),
    nutritionPer100g,
    confidence,
    unreadable: Array.isArray(parsed?.unreadable) ? parsed.unreadable.map(String) : [],
    channel: 'http',
    channelLabel: '多模态大模型视觉识别',
    servingLabel: '每 100 g',
    servingGrams: Number.isFinite(servingGrams) && servingGrams > 0 ? servingGrams : 100,
    servingBasis: 'per100g',
    imageQuality: {}
  };
}
