/**
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
  generatedAt: '2026-10-08',
  standard: '文本与图标对比度不小于 4.5:1，大字号不小于 3:1',
  lowestTextRatio: 5.45,
  lowestTextPair: '注释文字 浅灰底',
  bodyTextRatio: 16.46,
  headlineRatio: 12.42,
  rows: [
    { name: '正文 深字白底', fg: '#16202B', bg: '#FFFFFF', ratio: 16.46 },
    { name: '提示底色深字', fg: '#FFFFFF', bg: '#16202B', ratio: 16.46 },
    { name: '正文 深字浅灰底', fg: '#16202B', bg: '#F4F7FA', ratio: 15.31 },
    { name: '结论区 灰底深字', fg: '#23292E', bg: '#EDF0F3', ratio: 12.86 },
    { name: '页头标题 白底', fg: '#0A3560', bg: '#FFFFFF', ratio: 12.42 },
    { name: '次按钮 蓝字白底', fg: '#0A3560', bg: '#FFFFFF', ratio: 12.42 },
    { name: '结论区 黄底深字', fg: '#3D2D00', bg: '#FCF4DC', ratio: 12.14 },
    { name: '结论区 橙底深字', fg: '#4A2400', bg: '#FDF0E2', ratio: 12.14 },
    { name: '结论区 绿底深字', fg: '#0C3722', bg: '#E6F2EA', ratio: 11.51 },
    { name: '结论区 红底深字', fg: '#5E120C', bg: '#FBE9E7', ratio: 11.42 },
    { name: '语音按钮 深字浅黄底', fg: '#0A3560', bg: '#FFE9A8', ratio: 10.33 },
    { name: '次要文字 白底', fg: '#3A4653', bg: '#FFFFFF', ratio: 9.63 },
    { name: '主按钮 白字蓝底', fg: '#FFFFFF', bg: '#0F4C81', ratio: 8.86 },
    { name: '风险绿底白字', fg: '#FFFFFF', bg: '#1B5E3A', ratio: 7.75 },
    { name: '风险灰底白字', fg: '#FFFFFF', bg: '#4A5560', ratio: 7.61 },
    { name: '风险红底白字', fg: '#FFFFFF', bg: '#B3261E', ratio: 6.54 },
    { name: '风险黄底白字', fg: '#FFFFFF', bg: '#7A5A00', ratio: 6.38 },
    { name: '风险橙底白字', fg: '#FFFFFF', bg: '#9A4A00', ratio: 6.26 },
    { name: '注释文字 白底', fg: '#5A6673', bg: '#FFFFFF', ratio: 5.86 },
    { name: '注释文字 浅灰底', fg: '#5A6673', bg: '#F4F7FA', ratio: 5.45 }
  ]
};
