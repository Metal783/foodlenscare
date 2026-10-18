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
  generatedAt: '2026-10-10',
  standard: '文本与图标对比度不小于 4.5:1，大字号不小于 3:1',
  lowestTextRatio: 5.58,
  lowestTextPair: '第三版过敏标签',
  bodyTextRatio: 17.05,
  headlineRatio: 12.75,
  rows: [
    { name: '正文 深字白底', fg: '#191D1A', bg: '#FFFFFF', ratio: 17.05 },
    { name: '提示底色深字', fg: '#FFFFFF', bg: '#191D1A', ratio: 17.05 },
    { name: '正文 深字浅灰底', fg: '#191D1A', bg: '#F7FAF5', ratio: 16.19 },
    { name: '设计稿浅色字段', fg: '#191D1A', bg: '#F1F4EF', ratio: 15.36 },
    { name: '结论区 灰底深字', fg: '#23292E', bg: '#EDF0F3', ratio: 12.86 },
    { name: '页头标题 白底', fg: '#003B20', bg: '#FFFFFF', ratio: 12.75 },
    { name: '次按钮 品牌绿字白底', fg: '#003B20', bg: '#FFFFFF', ratio: 12.75 },
    { name: '结论区 黄底深字', fg: '#3D2D00', bg: '#FCF4DC', ratio: 12.14 },
    { name: '结论区 橙底深字', fg: '#4A2400', bg: '#FDF0E2', ratio: 12.14 },
    { name: '结论区 绿底深字', fg: '#0C3722', bg: '#EBF5E6', ratio: 11.82 },
    { name: '结论区 红底深字', fg: '#5E120C', bg: '#FBE9E7', ratio: 11.42 },
    { name: '第三版默认标签', fg: '#003B20', bg: '#E8F5E9', ratio: 11.34 },
    { name: '主按钮 白字品牌绿底', fg: '#FFFFFF', bg: '#004726', ratio: 10.88 },
    { name: '语音按钮 深字浅黄底', fg: '#003B20', bg: '#FFE9A8', ratio: 10.61 },
    { name: '设计稿联系家人', fg: '#003B20', bg: '#B0F0BE', ratio: 9.75 },
    { name: '设计稿共享说明', fg: '#004726', bg: '#E8F5E9', ratio: 9.68 },
    { name: '次要文字 白底', fg: '#414941', bg: '#FFFFFF', ratio: 9.32 },
    { name: '设计稿求助入口', fg: '#7C241B', bg: '#FFDBD6', ratio: 7.70 },
    { name: '风险灰底白字', fg: '#FFFFFF', bg: '#4A5560', ratio: 7.61 },
    { name: '第三版待核对标签', fg: '#4A5560', bg: '#EDF0F3', ratio: 6.65 },
    { name: '风险红底白字', fg: '#FFFFFF', bg: '#B3261E', ratio: 6.54 },
    { name: '风险绿底白字', fg: '#FFFFFF', bg: '#256B2B', ratio: 6.53 },
    { name: '风险黄底白字', fg: '#FFFFFF', bg: '#7A5A00', ratio: 6.38 },
    { name: '风险橙底白字', fg: '#FFFFFF', bg: '#9A4A00', ratio: 6.26 },
    { name: '注释文字 白底', fg: '#5C6660', bg: '#FFFFFF', ratio: 5.96 },
    { name: '设计稿语音头像', fg: '#754000', bg: '#FFCC73', ratio: 5.68 },
    { name: '注释文字 浅灰底', fg: '#5C6660', bg: '#F7FAF5', ratio: 5.66 },
    { name: '第三版需留意标签', fg: '#9A4A00', bg: '#FDF0E2', ratio: 5.59 },
    { name: '第三版过敏标签', fg: '#B3261E', bg: '#FBE9E7', ratio: 5.58 }
  ]
};
