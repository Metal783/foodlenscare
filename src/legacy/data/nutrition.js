/**
 * 营养阈值与每日参考摄入量
 *
 * 依据：
 *  - 《中国居民膳食营养素参考摄入量（2023 版）》
 *  - 《中国居民膳食指南（2022）》—— 每日食盐 < 5 g（折合钠 < 2000 mg）、
 *    添加糖 < 50 g（最好 < 25 g）、烹调油 25—30 g
 *  - 老年人群（60 岁以上）在上述基础上进一步下调，作为默认「老年基线」
 *  - GB 28050-2025《预包装食品营养标签通则》—— 成分表由「1+4」扩充为「1+6」，
 *    新增饱和脂肪（酸）与糖为强制标示项，本文件按 1+6 定义字段
 *
 * 注意：以下数值为公开发布的国家标准与膳食指南推荐值，用于「提示」而非「诊断」，
 * 不替代医生或营养师意见。
 */

/** 营养成分字段定义（GB 28050-2025 强制标示 1+6，能量+蛋白质+脂肪+饱和脂肪+碳水化合物+糖+钠） */
export const NUTRIENT_FIELDS = [
  { key: 'energy', label: '能量', unit: 'kJ', mandatory: true },
  { key: 'protein', label: '蛋白质', unit: 'g', mandatory: true },
  { key: 'fat', label: '脂肪', unit: 'g', mandatory: true },
  { key: 'saturatedFat', label: '饱和脂肪', unit: 'g', mandatory: true, isNew: true },
  { key: 'carbohydrate', label: '碳水化合物', unit: 'g', mandatory: true },
  { key: 'sugar', label: '糖', unit: 'g', mandatory: true, isNew: true },
  { key: 'sodium', label: '钠', unit: 'mg', mandatory: true }
];

export const NUTRIENT_LABEL = Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, f.label]));
export const NUTRIENT_UNIT = Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, f.unit]));

/**
 * 每日上限（老年基线），键为营养成分字段。
 * limit 为「每日建议上限」，ratio 为单次摄入达到当日上限多少比例时开始提示。
 */
export const DAILY_LIMITS = {
  sodium: {
    limit: 1500,
    unit: 'mg',
    basis: '每日食盐 < 5 g 的控盐目标，并针对 60 岁以上人群下调至 1500 mg 钠',
    source: '《中国居民膳食指南（2022）》·《中国居民膳食营养素参考摄入量（2023 版）》',
    attention: 'high',
    keywords: ['盐', '咸', '血压', '高血压', '控盐']
  },
  sugar: {
    limit: 25,
    unit: 'g',
    basis: '添加糖每日最好控制在 25 g 以内（最高不超过 50 g）',
    source: '《中国居民膳食指南（2022）》',
    attention: 'high',
    keywords: ['糖', '甜', '血糖', '糖尿病', '控糖']
  },
  saturatedFat: {
    limit: 20,
    unit: 'g',
    basis: '饱和脂肪供能比应低于总能量的 10%，折合每日约 20 g 以内',
    source: '《中国居民膳食营养素参考摄入量（2023 版）》',
    attention: 'medium',
    keywords: ['血脂', '控脂', '脂肪', '心血管']
  },
  fat: {
    limit: 60,
    unit: 'g',
    basis: '烹调油每日 25—30 g，加上食物本身脂肪，全天脂肪摄入建议不超过约 60 g',
    source: '《中国居民膳食指南（2022）》',
    attention: 'low',
    keywords: ['血脂', '控脂', '脂肪']
  }
};

/** 用户画像中的关注方向 */
export const CONCERNS = [
  {
    id: 'sugar',
    label: '控糖',
    emoji: '🍬',
    note: '少吃甜的，留意血糖',
    nutrients: ['sugar'],
    keywords: ['糖', '甜', '血糖', '糖尿病']
  },
  {
    id: 'salt',
    label: '控盐',
    emoji: '🧂',
    note: '吃得淡一点，留意血压',
    nutrients: ['sodium'],
    keywords: ['盐', '咸', '血压', '高血压']
  },
  {
    id: 'fat',
    label: '控脂',
    emoji: '🫒',
    note: '少油，留意血脂',
    nutrients: ['fat', 'saturatedFat'],
    keywords: ['血脂', '脂肪', '油腻', '心血管']
  }
];

export const CONCERN_BY_ID = new Map(CONCERNS.map((c) => [c.id, c]));

/** 年龄段选项（逐屏单问题，无需键盘输入） */
export const AGE_GROUPS = [
  { id: 'age60', label: '60 — 69 岁', emoji: '6️⃣' },
  { id: 'age70', label: '70 — 79 岁', emoji: '7️⃣' },
  { id: 'age80', label: '80 岁以上', emoji: '8️⃣' }
];

/**
 * 常见慢性病选项：只用于把「营养阈值」讲得更贴近个人情况，
 * 不用于任何疾病诊断。
 */
export const CONDITIONS = [
  { id: 'hypertension', label: '高血压', emoji: '🩺', nutrients: ['sodium'] },
  { id: 'diabetes', label: '糖尿病', emoji: '🩸', nutrients: ['sugar'] },
  { id: 'hyperlipidemia', label: '高血脂', emoji: '🫀', nutrients: ['saturatedFat', 'fat'] },
  { id: 'coronary', label: '冠心病', emoji: '🫀', nutrients: [] },
  { id: 'none', label: '以上都没有', emoji: '✅', nutrients: [] }
];

export const CONDITION_BY_ID = new Map(CONDITIONS.map((c) => [c.id, c]));

/**
 * 单次摄入相对「每日上限」的分档。
 * 返回 'ok' | 'notice' | 'high' | 'over'
 */
export function gradeIntake(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 'unknown';
  const ratio = value / limit;
  if (ratio >= 1) return 'over';
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'notice';
  return 'ok';
}

/** 每 100 g 分档 → 中文说法（用于「依据在哪」里解释数值含义） */
export const INTAKE_TONE_TEXT = {
  over: '已经达到或超过一天的建议上限',
  high: '占一天建议上限的大半',
  notice: '占一天建议上限的一部分',
  ok: '占一天建议上限很少',
  unknown: '暂时无法判断'
};

/**
 * 把「每 100 g」的标示值折算成本次实际吃进去的量。
 * @param {number} per100g
 * @param {number} grams 本次食用份量（克／毫升）
 */
export function scaleIntake(per100g, grams) {
  const v = Number(per100g);
  const g = Number(grams);
  if (!Number.isFinite(v)) return NaN;
  if (!Number.isFinite(g) || g <= 0) return v;
  return (v * g) / 100;
}

/** 常用份量默认值：用于「一份」的口语化换算，避免所有食品都按 100 g 比较 */
export const DEFAULT_SERVING = {
  drink: 250,
  bottle: 500,
  pack: 100,
  noodle: 100,
  milk: 250
};

