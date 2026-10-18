/**
 * 离线通道：内置演示用例 → ParsedLabel
 *
 * 用途：答辩现场网络不稳定时的兜底（方案 8. 风险与应对）。
 * 预置三条主线用例，覆盖「红 / 橙 / 黄 / 绿 / 灰」五种分级，
 * 让评委在完全离线的环境下也能看到完整判断链路。
 */

import { SAMPLE_CASES, SAMPLE_BY_ID } from '../data/sample-labels.js';
import { splitIngredientLines } from './parse-label.js';

/** 演示主线三条：一次红色警示、一次控糖提示、一次补拍提示 */
export const DEMO_PRESETS = [
  { id: 'peanut-cookie', title: '含花生的饼干', hint: '演示「过敏原命中 → 红色」' },
  { id: 'sugar-drink', title: '含糖饮料', hint: '演示「控糖超标 → 橙色」' },
  { id: 'blurry-photo', title: '拍糊的照片', hint: '演示「看不清就不下结论 → 灰色」' }
];

/**
 * 把内置用例转成统一标签结构。
 * @param {string} id
 * @param {{servingGrams?:number}} [options]
 * @returns {import('../core/rules.js').ParsedLabel}
 */
export function caseToLabel(id, options = {}) {
  const testCase = SAMPLE_BY_ID.get(id) || SAMPLE_CASES[0];
  return buildLabel(testCase, options, '内置演示用例');
}

/**
 * @param {import('../data/sample-labels.js').LabelCase} testCase
 */
export function buildLabel(testCase, options = {}, channelLabel = '内置演示用例') {
  const ingredientLines = splitIngredientLines(testCase.ingredientText);
  const servingGrams = options.servingGrams || inferServing(testCase);
  return {
    productName: testCase.productName,
    ingredientText: testCase.ingredientText,
    ingredientLines,
    allergenDeclaration: testCase.allergenDeclaration || '',
    netContent: testCase.netContent || '',
    nutritionPer100g: { ...testCase.nutritionPer100g },
    confidence: { ...testCase.confidence },
    channel: 'demo',
    channelLabel,
    servingLabel: '每 100 g',
    servingGrams,
    servingBasis: 'per100g',
    imageQuality: { blurry: false, tooSmall: false },
    demoCaseId: testCase.id,
    note: testCase.note || ''
  };
}

/** 按品名粗略推断「一份」的克数，让预算对比更接近日常口语 */
export function inferServing(testCase) {
  const text = `${testCase.productName}${testCase.netContent || ''}`;
  if (/饮料|果汁|茶|水|奶|乳/.test(text)) {
    const ml = text.match(/(\d{3,4})\s*(mL|ml|毫升)/);
    return ml ? Number(ml[1]) : 250;
  }
  if (/饼干|酥|糖|巧克力|糕点|薯片/.test(text)) {
    return 50;
  }
  if (/面|米|粉/.test(text)) {
    // 挂面按一小把（干重 50 g）折算，更接近真实一顿的量
    return 50;
  }
  if (/肠|火腿|肉/.test(text)) {
    return 60;
  }
  return 100;
}

/**
 * 离线识别入口，签名与其他通道一致。
 * @param {Object} input
 * @param {string} input.caseId
 * @returns {Promise<{label:import('../core/rules.js').ParsedLabel, channel:string, elapsedMs:number}>}
 */
export async function recognize({ caseId }) {
  const started = performance.now();
  if (!SAMPLE_BY_ID.has(caseId)) {
    throw new Error(`内置用例里没有 ${caseId}。`);
  }
  const label = caseToLabel(caseId);
  return {
    label,
    channel: 'demo',
    elapsedMs: Math.round(performance.now() - started)
  };
}

/**
 * 一个确定性的「照片哈希 → 用例」映射，让演示时拍不同照片能得到不同结果，
 * 而不是永远返回同一个商品。
 * @param {string} seed
 */
export function pickCaseBySeed(seed) {
  const pool = SAMPLE_CASES.filter((c) => c.id !== 'blurry-photo');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return pool[hash % pool.length];
}
