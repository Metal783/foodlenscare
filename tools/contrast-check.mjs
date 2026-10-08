import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ 色值 */
const TOKENS = {
  '--c-brand': '#0F4C81',
  '--c-brand-ink': '#0A3560',
  '--c-brand-soft': '#E8F1FA',
  '--c-ink': '#16202B',
  '--c-ink-2': '#3A4653',
  '--c-ink-3': '#5A6673',
  '--c-line': '#C9D3DE',
  '--c-line-soft': '#E3E9F0',
  '--c-surface': '#FFFFFF',
  '--c-surface-2': '#F4F7FA',
  '--c-surface-3': '#EAF0F6',
  '--c-risk-red': '#B3261E',
  '--c-risk-red-soft': '#FBE9E7',
  '--c-risk-orange': '#9A4A00',
  '--c-risk-orange-soft': '#FDF0E2',
  '--c-risk-yellow': '#7A5A00',
  '--c-risk-yellow-soft': '#FCF4DC',
  '--c-risk-green': '#1B5E3A',
  '--c-risk-green-soft': '#E6F2EA',
  '--c-risk-gray': '#4A5560',
  '--c-risk-gray-soft': '#EDF0F3',
  '风险红底白字': ['#B3261E', '#FFFFFF'],
  '风险橙底白字': ['#9A4A00', '#FFFFFF'],
  '风险黄底白字': ['#7A5A00', '#FFFFFF'],
  '风险绿底白字': ['#1B5E3A', '#FFFFFF'],
  '风险灰底白字': ['#4A5560', '#FFFFFF'],
  '结论区 红底深字': ['#FBE9E7', '#5E120C'],
  '结论区 橙底深字': ['#FDF0E2', '#4A2400'],
  '结论区 黄底深字': ['#FCF4DC', '#3D2D00'],
  '结论区 绿底深字': ['#E6F2EA', '#0C3722'],
  '结论区 灰底深字': ['#EDF0F3', '#23292E'],
  '正文 深字白底': ['#FFFFFF', '#16202B'],
  '正文 深字浅灰底': ['#F4F7FA', '#16202B'],
  '次要文字 白底': ['#FFFFFF', '#3A4653'],
  '注释文字 白底': ['#FFFFFF', '#5A6673'],
  '注释文字 浅灰底': ['#F4F7FA', '#5A6673'],
  '页头标题 白底': ['#FFFFFF', '#0A3560'],
  '主按钮 白字蓝底': ['#0F4C81', '#FFFFFF'],
  '次按钮 蓝字白底': ['#FFFFFF', '#0A3560'],
  '语音按钮 深字浅黄底': ['#FFE9A8', '#0A3560'],
  '提示底色深字': ['#16202B', '#FFFFFF']
};

const CANDIDATES = ['--c-brand', '--c-brand-ink', '--c-ink', '--c-ink-2', '--c-ink-3', '--c-surface', '--c-surface-2'];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

const results = [];
for (const [name, value] of Object.entries(TOKENS)) {
  if (Array.isArray(value)) {
    const ratio = contrastRatio(value[0], value[1]);
    results.push({ name, fg: value[1], bg: value[0], ratio });
  } else if (CANDIDATES.includes(name)) {
    // 令牌两两对关键底色做一次核查
    for (const bg of ['#FFFFFF', '#F4F7FA']) {
      results.push({ name: `${name} on ${bg}`, fg: value, bg, ratio: contrastRatio(value, bg) });
    }
  }
}

const sorted = results.sort((a, b) => a.ratio - b.ratio);
console.log('名称'.padEnd(28), '前景'.padEnd(10), '背景'.padEnd(10), '对比度');
for (const row of sorted) {
  console.log(
    row.name.padEnd(28),
    row.fg.padEnd(10),
    row.bg.padEnd(10),
    row.ratio.toFixed(2) + ':1',
    row.ratio >= 7 ? 'AAA' : row.ratio >= 4.5 ? 'AA' : row.ratio >= 3 ? 'AA-large' : 'FAIL'
  );
}

const failing = sorted.filter((r) => r.ratio < 4.5);
console.log('\n低于 4.5:1 的项目数：', failing.length);
for (const row of failing) console.log('  -', row.name, row.ratio.toFixed(2));

/* --------------------------------------------------- 生成数据文件（可选） */

const emitIndex = process.argv.indexOf('--emit');
if (emitIndex >= 0) {
  const target = process.argv[emitIndex + 1];
  if (!target) {
    console.error('用法：node tools/contrast-check.mjs --emit src/data/contrast-report.js');
    process.exit(1);
  }
  // 只保留「文字/图标 on 背景」的项：排除纯色块对比与令牌级重复项
  const textRows = sorted
    .filter((r) => !r.name.startsWith('--c-'))
    .sort((a, b) => b.ratio - a.ratio);
  const lowest = textRows[textRows.length - 1];
  const body = textRows.find((r) => r.name === '正文 深字白底');
  const head = textRows.find((r) => r.name === '页头标题 白底');

  const file = `/**
 * 对比度实测报告（由 tools/contrast-check.mjs 计算后写入，勿手改数值）
 *
 * 重新生成：
 *   node tools/contrast-check.mjs --emit src/data/contrast-report.js
 *
 * 依据：工信部《移动互联网应用（APP）适老化通用设计规范》
 *  —— 文本与图标对比度不小于 4.5:1，大字号不小于 3:1。
 * 统计范围只含「文字/图标」与背景的对比度；纯色块之间的比值
 * （如浅灰底与白底的 1.08:1）不构成文字可读性问题，故不纳入达标判定。
 */

export const CONTRAST_REPORT = {
  generatedAt: '${new Date().toISOString().slice(0, 10)}',
  standard: '文本与图标对比度不小于 4.5:1，大字号不小于 3:1',
  lowestTextRatio: ${lowest.ratio.toFixed(2)},
  lowestTextPair: '${lowest.name.replace(/'/g, "\\'")}',
  bodyTextRatio: ${(body?.ratio ?? 0).toFixed(2)},
  headlineRatio: ${(head?.ratio ?? 0).toFixed(2)},
  rows: [
${textRows
  .map(
    (r) =>
      `    { name: '${r.name.replace(/'/g, "\\'")}', fg: '${r.fg}', bg: '${r.bg}', ratio: ${r.ratio.toFixed(2)} }`
  )
  .join(',\n')}
  ]
};
`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL(`../${target.replace(/^\.\//, '')}`, import.meta.url), file, 'utf8');
  console.log(`\n已写入 ${target}（共 ${textRows.length} 条）`);
}

