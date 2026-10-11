/**
 * 模拟识别通道（演示用）
 *
 * 在拿到真实多模态接口密钥之前，用本通道跑通整条闭环：
 * 输入一张真实照片（File），输出与真实接口同构的 ParsedLabel，
 * 并根据照片字节确定性地选择一个内置用例，同时叠加小幅随机扰动模拟识别误差。
 *
 * 支持三种演示模式（通过 URL ?mock= 指定）：
 *   auto（默认）— 按照片内容确定性选一个用例
 *   high        — 返回高置信度的清晰结果
 *   low         — 返回低置信度、字段残缺的结果，用于演示灰色补拍链路
 */

import { SAMPLE_CASES } from '../data/sample-labels.js';
import { buildLabel, inferServing } from './demo.js';

/** FNV-1a 32 位哈希，用于把照片字节映射成稳定种子 */
function hashBytes(buffer) {
  const view = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(view.length / 4096)); // 大图抽样，避免遍历全部字节
  for (let i = 0; i < view.length; i += step) {
    hash ^= view[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/**
 * @param {Object} input
 * @param {File|Blob} input.file
 * @param {{blurry?:boolean,tooDark?:boolean,tooBright?:boolean,tooSmall?:boolean}} [input.quality]
 * @param {'auto'|'high'|'low'} [input.mode]
 * @returns {Promise<{label:import('../core/rules.js').ParsedLabel, channel:string, elapsedMs:number}>}
 */
export async function recognize({ file, quality = {}, mode = 'auto' }) {
  const started = performance.now();

  // 照片本身就不清楚时，模拟一个「读不准」的结果，走灰色补拍链路
  const ineffective = Boolean(quality.blurry || quality.tooDark || quality.tooBright || quality.tooSmall);
  const effectiveMode = ineffective ? 'low' : mode;

  const buffer = await file.arrayBuffer();
  const seed = hashBytes(buffer);
  const rand = seededRandom(seed);

  const pool = SAMPLE_CASES.filter((c) => c.id !== 'blurry-photo');
  const testCase =
    effectiveMode === 'high'
      ? pool[0]
      : pool[seed % pool.length];

  // 模拟接口往返耗时：让「正在看标签」这一步有可感知的进度
  await delay(effectiveMode === 'low' ? 900 : 1400);

  const label = buildLabel(testCase, { servingGrams: inferServing(testCase) }, '模拟多模态识别（演示）');
  label.channel = 'mock';
  label.rawText = testCase.ingredientText;

  if (effectiveMode !== 'high') {
    // 叠加 ±6% 的数值扰动，模拟真实识别误差（不改变量级，不影响分级结论）
    for (const [key, value] of Object.entries(label.nutritionPer100g)) {
      if (!Number.isFinite(value)) continue;
      const factor = 1 + (rand() - 0.5) * 0.12;
      label.nutritionPer100g[key] = Math.round(value * factor * 10) / 10;
    }
    for (const key of Object.keys(label.confidence)) {
      const v = label.confidence[key];
      label.confidence[key] = Math.max(0.55, Math.min(0.98, Math.round((v - rand() * 0.12) * 100) / 100));
    }
  }

  if (effectiveMode === 'low') {
    // 低置信度：字段残缺 + 置信度普遍偏低 → 规则层判为灰色
    label.productName = '（照片有点糊，名称没看清）';
    label.confidence = Object.fromEntries(
      Object.keys(label.confidence).map((k) => [k, Math.round((0.2 + rand() * 0.4) * 100) / 100])
    );
    label.nutritionPer100g = Object.fromEntries(
      Object.entries(label.nutritionPer100g).map(([k, v]) =>
        rand() < 0.5 ? [k, null] : [k, Number.isFinite(v) ? Math.round(v * 0.4 * 10) / 10 : null]
      )
    );
    label.imageQuality = { ...quality, blurry: true };
  } else {
    label.imageQuality = { ...quality };
  }

  return {
    label,
    channel: 'mock',
    elapsedMs: Math.round(performance.now() - started),
    demoCaseId: testCase.id
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
