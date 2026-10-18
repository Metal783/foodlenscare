/**
 * 规则引擎：过敏匹配 + 营养阈值判断 + 风险分级 + 依据追溯
 *
 * 设计原则（方案 4.3）：所有确定性判断放在规则层，纯本地执行，
 * 不依赖任何模型输出；模型只负责「理解与表达」。
 * 依据来源全部公开、可展开追溯：
 *  - 致敏物质：GB 7718-2025 附录 D
 *  - 添加剂：GB 2760 及其增补公告（INS 编码对照）
 *  - 营养阈值：《中国居民膳食营养素参考摄入量（2023 版）》《中国居民膳食指南（2022）》
 *  - 营养标签字段：GB 28050-2025（1+6 强制标示）
 */

import { ALLERGENS, ALLERGEN_BY_ID, isFuzzyAlias, normalizeAlias } from '../data/allergens.js';
import { collectAdditives } from '../data/additives.js';
import {
  DAILY_LIMITS,
  NUTRIENT_FIELDS,
  NUTRIENT_LABEL,
  CONCERN_BY_ID,
  CONDITION_BY_ID,
  scaleIntake,
  gradeIntake,
  INTAKE_TONE_TEXT
} from '../data/nutrition.js';

/* ------------------------------------------------------------------ 风险等级 */

/**
 * 五级风险。每一级同时给出颜色、文字标签、图标与语音用词，
 * 满足「颜色不得作为唯一信息载体」的适老化要求。
 */
export const RISK_LEVELS = {
  red: {
    id: 'red',
    label: '红色',
    text: '别吃',
    emoji: '⛔',
    speechLead: '这个不能吃。',
    tone: 'danger'
  },
  orange: {
    id: 'orange',
    label: '橙色',
    text: '要当心',
    emoji: '⚠️',
    speechLead: '这个要当心。',
    tone: 'warn'
  },
  yellow: {
    id: 'yellow',
    label: '黄色',
    text: '留意一下',
    emoji: '📌',
    speechLead: '这个可以吃，不过要留意一点。',
    tone: 'notice'
  },
  green: {
    id: 'green',
    label: '绿色',
    text: '可以吃',
    emoji: '✅',
    speechLead: '这个可以吃。',
    tone: 'ok'
  },
  gray: {
    id: 'gray',
    label: '灰色',
    text: '看不清',
    emoji: '❓',
    speechLead: '这张照片看不清。',
    tone: 'unknown'
  }
};

/* -------------------------------------------------------------- 结构定义 */

/**
 * @typedef {Object} ParsedLabel 归一化后的标签结构（感知层输出）
 * @property {string} productName
 * @property {string} [ingredientText] 配料表纯文本
 * @property {{line:number,text:string,isIngredient:boolean}[]} [ingredientLines] 按标签原始换行切分的配料表
 * @property {string} [allergenDeclaration] 包装上「致敏物质提示」原文
 * @property {Record<string, number|null>} nutritionPer100g
 * @property {Record<string, number>} confidence
 * @property {Record<string,{value:number,confidence:number,text:string,warning:string,conflict?:boolean}>} [nutritionCandidates] 待核对的区域识别数值及原文
 * @property {boolean} [ingredientsConfirmed] 配料已对照包装核对
 * @property {boolean} [nutritionConfirmed] 已核对至少一项营养，只有确认值用于摄入计算
 * @property {boolean} [nutritionPartial] 已核对的营养项目不完整
 * @property {string[]} [missingFields] 未标示或未核对的营养项目
 * @property {'g'|'ml'|null} [servingUnit] 每100克或每100毫升口径
 * @property {string} [channelLabel] 识别通道中文名
 * @property {string} [servingLabel] 份量口径描述
 * @property {number} [servingGrams]
 * @property {'per100g'|'perServing'} [servingBasis]
 * @property {{blurry?:boolean,tooSmall?:boolean,megapixels?:number}} [imageQuality]
 */

/**
 * @typedef {Object} AllergenHit
 * @property {string} allergenId
 * @property {string} alias
 * @property {'ingredient'|'declaration'} sourceKind
 * @property {number|null} line
 * @property {boolean} fuzzy
 * @property {string} source
 * @property {string} sourceText
 */

/**
 * @typedef {Object} RiskAssessment
 * @property {'red'|'orange'|'yellow'|'green'|'gray'} level
 * @property {string} headline
 * @property {string} advice
 * @property {Object[]} allergenConflicts
 * @property {Object[]} nutrients
 * @property {Object[]} basis
 */

/* -------------------------------------------------------------- 过敏匹配 */

/**
 * 判断某个致敏物质别名在配料表文本中的位置。
 * @param {string} text
 * @param {string} alias
 * @returns {{index:number, length:number}|null}
 */
function locateAlias(text, alias) {
  const needle = normalizeAlias(alias);
  if (!needle) return null;
  const index = text.indexOf(needle);
  if (index < 0) return null;
  return { index, length: needle.length };
}

/**
 * 将「配料表行号」反查出来，用于展示「来自配料表第几行」。
 * @param {{text:string, line:number}[]} lines
 * @param {{index:number, length:number}} loc
 */
function lineOfLocation(lines, loc) {
  let offset = 0;
  for (const line of lines) {
    const start = offset;
    const end = offset + line.text.length;
    if (loc.index < end) return line.line;
    offset = end + 1;
  }
  return lines.length ? lines[lines.length - 1].line : null;
}

/**
 * 从结构化标签中匹配八大致敏物质。
 *
 * 匹配范围＝配料表原文 + 包装致敏物质提示原文。两条来源分别标注，
 * 便于「依据在哪」区分「配料表第 3 行」与「包装已标示」。
 *
 * @param {ParsedLabel} label
 * @returns {AllergenHit[]}
 */
export function matchAllergens(label) {
  const ingredientText = label.ingredientText || '';
  const declaration = label.allergenDeclaration || '';
  const lines = label.ingredientLines?.length
    ? label.ingredientLines
    : [{ line: 1, text: ingredientText, isIngredient: true }];

  /** @type {Map<string, AllergenHit[]>} */
  const byAllergen = new Map();

  for (const allergen of ALLERGENS) {
    const hits = [];
    for (const alias of allergen.aliases) {
      const fuzzy = isFuzzyAlias(alias);
      for (const source of [
        { kind: 'ingredient', text: ingredientText },
        { kind: 'declaration', text: declaration }
      ]) {
        if (!source.text) continue;
        const loc = locateAlias(source.text, alias);
        if (!loc) continue;
        // 同一致敏物质在同一来源上只保留一次命中，优先非模糊写法
        const dup = hits.find((h) => h.sourceKind === source.kind && h.alias === normalizeAlias(alias));
        if (dup) continue;
        hits.push({
          allergenId: allergen.id,
          alias: normalizeAlias(alias),
          sourceKind: source.kind,
          line: source.kind === 'ingredient' ? lineOfLocation(lines, loc) : null,
          fuzzy,
          source: allergen.source,
          sourceText: source.kind === 'ingredient'
            ? (lines.find((l) => l.line === lineOfLocation(lines, loc))?.text || '')
            : declaration
        });
      }
    }
    if (hits.length) byAllergen.set(allergen.id, hits);
  }

  return [...byAllergen.entries()].map(([allergenId, hits]) => {
    const meta = ALLERGEN_BY_ID.get(allergenId);
    const best = hits.find((h) => !h.fuzzy) || hits[0];
    return {
      allergenId,
      label: meta.label,
      short: meta.short,
      emoji: meta.emoji,
      alias: best.alias,
      line: best.line === null ? hits.find((h) => h.line !== null)?.line ?? null : best.line,
      evidenceKind: hits.some((h) => h.sourceKind === 'ingredient') ? 'ingredient' : 'declaration',
      declared: hits.some((h) => h.sourceKind === 'declaration'),
      fuzzyOnly: hits.every((h) => h.fuzzy),
      hits
    };
  });
}

/* ---------------------------------------------------------- 营养阈值评估 */

/**
 * 评估单个营养成分相对「当日剩余额度」的位置。
 * @param {{key:string, amount:number, remaining:number, isConcern:boolean}} input
 */
export function evaluateNutrient({ key, amount, remaining, isConcern, naturalSugarOnly = false }) {
  const limit = DAILY_LIMITS[key];
  if (!limit) return null;
  const ratioOfDaily = amount / limit.limit;
  const hasBudget = remaining > 0;
  const allUsedUp = remaining <= 0;
  const overRemaining = allUsedUp || amount >= remaining;
  const grade = gradeIntake(amount, limit.limit);

  let level = 'green';
  const reasons = [];
  let exempt = false;

  // 量级阶梯（对所有营养成分一致，避免「没勾选关注就放松警惕」）：
  //   已超当日剩余额度，且这一份 ≥ 一天上限的 15%  → 橙色
  //   这一份 ≥ 一天上限的 60%                      → 橙色
  //   这一份 ≥ 一天上限的 30%                      → 黄色
  // 是否勾选「关注」不改变严重程度，只改变措辞与是否拿当日剩余额度做比较；
  // 若因为「没勾选」就把 228% 的量降级成黄色，是产品判断上的错误。
  const largeShare = ratioOfDaily >= 0.6;
  const material = ratioOfDaily >= 0.15;
  const notable = ratioOfDaily >= 0.3;
  const overHalfOfRemaining = hasBudget && amount >= remaining * 0.5;

  if (overRemaining && material) {
    level = 'orange';
    reasons.push(hasBudget ? 'singleServingOverRemaining' : 'dailyBudgetUsedUp');
  } else if (largeShare || (isConcern && overHalfOfRemaining && material)) {
    level = 'orange';
    reasons.push('singleServingLargeShare');
  } else if (notable) {
    level = 'yellow';
    reasons.push(isConcern ? 'concernModerate' : 'generalNotice');
  }

  // 乳糖豁免：纯牛奶/酸奶里的糖是天然乳糖，不是添加糖。
  // 规则层给出确定性判断，表达层负责解释「为什么这次不警告」。
  if (naturalSugarOnly && level !== 'green' && reasons.every((r) => /^(concern|general)/.test(r))) {
    level = 'green';
    exempt = true;
    reasons.push('lactoseExempt');
  }

  return {
    key,
    label: NUTRIENT_LABEL[key],
    unit: limit.unit,
    amount: Math.round(amount * 100) / 100,
    limit: limit.limit,
    remaining: Math.max(0, Math.round(remaining * 100) / 100),
    ratioOfDaily,
    grade,
    gradeText: INTAKE_TONE_TEXT[grade],
    level,
    reasons,
    isConcern,
    exempt,
    foodLabel: label(limit.limit, limit.unit),
    basis: limit.basis,
    source: limit.source
  };
}

/** 判断这份食品里的糖是否只可能来自乳类（生牛乳、乳粉、乳清等），且没有明显添加糖 */
const ADDED_SUGAR_MARKERS = [
  '白砂糖', '砂糖', '蔗糖', '果葡糖浆', '葡萄糖浆', '麦芽糖浆', '玉米糖浆', '淀粉糖浆',
  '蜂蜜', '焦糖', '糖蜜', '浓缩果汁', '果葡糖', '结晶果糖', '葡萄糖粉', '麦芽糊精'
];
const MILK_MARKERS = ['生牛乳', '牛乳', '羊乳', '乳粉', '奶粉', '乳清', '稀奶油', '乳固体', '发酵乳'];

function isLactoseOnlySugar(label) {
  const text = `${label.ingredientText || ''}${label.allergenDeclaration || ''}${label.productName || ''}`;
  if (!text) return false;
  const hasMilk = MILK_MARKERS.some((m) => text.includes(m));
  if (!hasMilk) return false;
  return !ADDED_SUGAR_MARKERS.some((m) => text.includes(m));
}

function label(value, unit) {
  return `${value} ${unit}`;
}

/* ------------------------------------------------------------ 主评估入口 */

/**
 * @typedef {Object} EvaluateInput
 * @property {ParsedLabel} label
 * @property {import('../core/store.js').Profile} profile
 * @property {{sodium:number, sugar:number, saturatedFat:number, fat:number}} consumedToday
 * @property {number} servingGrams 本次食用份量（克／毫升）
 */

/**
 * 执行完整规则评估。
 * @param {EvaluateInput} input
 * @returns {RiskAssessment}
 */
export function evaluate({ label, profile, consumedToday, servingGrams }) {
  if (label.readingOnly) return evaluateReading(label, profile);
  const gray = detectGray(label);
  if (gray.isGray) {
    return buildGray(gray, label);
  }

  const allergens = matchAllergens(label);
  const additives = collectAdditives(
    [label.ingredientText, label.allergenDeclaration].filter(Boolean).join(' ')
  );

  const myAllergens = new Set((profile.allergens || []).filter((a) => a !== 'none'));
  const allergenConflicts = allergens.filter((a) => myAllergens.has(a.allergenId));

  // 用户的关注方向 = 显式勾选 + 慢性病关联
  const concernNutrients = new Set();
  const concernNames = [];
  for (const c of profile.concerns || []) {
    const meta = CONCERN_BY_ID.get(c);
    if (!meta) continue;
    concernNames.push(meta.label);
    for (const n of meta.nutrients) concernNutrients.add(n);
  }
  for (const c of profile.conditions || []) {
    const meta = CONDITION_BY_ID.get(c);
    if (!meta) continue;
    if (!concernNames.includes(meta.label)) concernNames.push(meta.label);
    for (const n of meta.nutrients) concernNutrients.add(n);
  }

  const per100g = label.nutritionPer100g || {};

  // 乳糖豁免：牛奶、酸奶这类以生牛乳为唯一或主要配料的产品，
  // 其碳水绝大多数是天然乳糖，而膳食指南限制的是「添加糖」。
  // 营养标签本身不区分糖的来源，所以这里用配料表做一次判断，
  // 避免把一杯纯牛奶说成「太甜了」——那种提示会让老人不再信任工具。
  const lactoseOnly = isLactoseOnlySugar(label);

  const nutrients = [];
  for (const field of NUTRIENT_FIELDS) {
    const limit = DAILY_LIMITS[field.key];
    if (!limit) continue;                       // 能量、蛋白质、碳水不参与分级
    const raw = per100g[field.key];
    const per100 = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(per100)) continue;
    const amount = scaleIntake(per100, servingGrams);
    const consumed = Number(consumedToday?.[field.key]) || 0;
    const remaining = limit.limit - consumed;
    const evaluated = evaluateNutrient({
      key: field.key,
      amount,
      remaining,
      isConcern: concernNutrients.has(field.key),
      naturalSugarOnly: field.key === 'sugar' && lactoseOnly
    });
    if (evaluated) nutrients.push({ ...evaluated, incompleteToday: Boolean(consumedToday?.unknown?.[field.key]) });
  }

  let level = decideLevel({ allergenConflicts, nutrients });
  let headline = headlineFor({ level, allergenConflicts, nutrients, concernNames, label });
  let advice = adviceFor({ level, allergenConflicts, nutrients });
  if (label.nutritionPartial) {
    const missing = (label.missingFields || []).map(k => NUTRIENT_LABEL[k] || k).join('、');
    if (level === 'green') { level = 'gray'; headline = '已核对部分营养，缺失项目无法判断'; }
    advice = `仅计算您已核对的项目；${missing}未知，不能据此判断完整营养风险。${level === 'gray' ? '' : advice}`;
  }
  if (nutrients.some(n=>n.incompleteToday)) {
    if (level === 'green') { level = 'gray'; headline = '今日记录有缺失，剩余额度无法确定'; }
    advice += ' 今日部分已食用记录缺少营养数据，仅显示已知摄入量，不能确定完整余量。';
  }
  const basis = buildBasis({
    label,
    allergenConflicts,
    nutrients,
    allergens,
    additives,
    gray,
    profile,
    concernNames
  });

  const flags = {};
  for (const n of nutrients) flags[n.key] = n.grade;

  return {
    level,
    headline,
    advice,
    allergenConflicts,
    allAllergens: allergens,
    nutrients,
    additives,
    concernNames,
    basis,
    flags,
    quantity: { servingGrams, basis: label.servingBasis || 'per100g' }
  };
}

/* ------------------------------------------------------------ 灰级判定 */

/** 字段置信度低于该值即视为「读不准」 */
export const CONFIDENCE_FLOOR = 0.7;

/** 配料风险与营养完整度分别评估；未发现冲突不等于食品安全。 */
function evaluateReading(label, profile) {
  const gray = detectGray(label);
  const assessment = buildGray(gray, label);
  const allergens = matchAllergens(label);
  const mine = new Set(profile.allergens || []);
  const conflicts = allergens.filter((a) => mine.has(a.allergenId));
  const low = !label.ingredientsConfirmed && (label.ocrConfidence ?? 0) < CONFIDENCE_FLOOR;
  assessment.partial = true;
  assessment.nutritionUnavailable = true;
  assessment.allAllergens = allergens;
  assessment.allergenConflicts = conflicts;
  if (conflicts.length) {
    const names = conflicts.map((a) => a.short).join('、');
    assessment.level = 'red';
    assessment.headline = label.ingredientsConfirmed
      ? `核对的配料含有您过敏的${names}，请别吃`
      : `识别文字疑似含有您过敏的${names}，请先别吃并核对包装`;
    assessment.advice = `${low ? '文字识别把握较低，可能严重漏读。' : ''}请对照包装确认配料和致敏物质提示。营养信息尚未核对，本次不计算摄入量。`;
    assessment.basis.unshift({ kind: 'rule', title: '配料中的过敏冲突',
      lines: conflicts.map((a) => `您的画像设置了${a.short}过敏；${label.ingredientsConfirmed ? '核对后的文字' : 'OCR 文字'}命中「${a.alias}」。`),
      source: '用户过敏画像与配料词典匹配；OCR 文字须对照包装核对' });
  } else if (label.ingredientsConfirmed) {
    assessment.headline = '配料已核对，营养信息仍不足';
    assessment.advice = '核对的文字中未匹配到您的过敏成分，这不代表一定可以吃。可继续填写并核对营养表，再查看营养提醒。';
  } else if (low) {
    assessment.headline = '文字可能严重漏读，请核对或重新拍摄';
    assessment.advice = '识别把握较低，不能依赖这段文字判断食品风险。请先对照包装补齐配料和致敏提示，或重新拍一张清楚的照片。';
  }
  return assessment;
}

function detectGray(label) {
  const reasons = [];
  if (label.readingOnly) {
    reasons.push({ code: 'readingOnly', text: '本次已读取照片文字，营养表的列与单位尚未核对，不据此判断摄入量。' });
    if (!label.ingredientText) reasons.push({ code: 'noIngredientTitle', text: '没有找到清晰的配料标题，请查看识别全文或重新拍摄配料表。' });
    return { isGray: true, reasons, hard: reasons };
  }
  if (label.nutritionConfirmed && label.ingredientsConfirmed) {
    const missing = label.missingFields || [];
    return { isGray: false, hard: [], reasons: missing.length ? [{ code:'partialNutrition', soft:true,
      text:`${missing.map(k=>NUTRIENT_LABEL[k] || k).join('、')}没有已核对的数据，对应摄入量无法计算。` }] : [] };
  }
  const criticalKeys = ['energy', 'protein', 'fat', 'carbohydrate', 'sodium'];
  const per100g = label.nutritionPer100g || {};
  const hasNumber = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const present = criticalKeys.filter((k) => hasNumber(per100g[k]));
  const missingNew = ['saturatedFat', 'sugar'].filter((k) => !hasNumber(per100g[k]));

  if (!label.ingredientText && present.length === 0) {
    reasons.push({ code: 'noContent', text: '照片里没有读到配料表或营养成分表。' });
  }
  if (missingNew.length >= 2) {
    // 两个新增强制标示项都缺 → 说明这张照片根本没拍全
    reasons.push({
      code: 'missingNewField',
      text: `GB 28050-2025 要求的强制标示项「${missingNew
        .map((k) => NUTRIENT_LABEL[k])
        .join('、')}」都没有读到，标签可能没拍全。`
    });
  } else if (missingNew.length === 1) {
    // 只缺一项 → 不阻断结论，但要在依据里如实说明
    reasons.push({
      code: 'missingNewField',
      text: `GB 28050-2025 要求的强制标示项「${NUTRIENT_LABEL[missingNew[0]]}」没有读到，可能与包装标示或拍摄角度有关。`,
      soft: true
    });
  }

  const conf = label.confidence || {};
  const lowFields = Object.entries(conf)
    .filter(([, v]) => Number.isFinite(v) && v < CONFIDENCE_FLOOR)
    .map(([k]) => k);
  if (lowFields.length >= 3) {
    reasons.push({
      code: 'lowConfidence',
      text: `有 ${lowFields.length} 个字段没看清（${lowFields
        .slice(0, 3)
        .map((k) => NUTRIENT_LABEL[k] || k)
        .join('、')}等）。`
    });
  }

  if (label.imageQuality?.blurry) {
    reasons.push({ code: 'blurry', text: '照片有点糊，字迹看不清。' });
  }
  if (label.imageQuality?.tooSmall) {
    reasons.push({ code: 'tooSmall', text: '包装在画面里太小，标签占比不够。' });
  }

  // 硬性原因：完全读不到内容 / 模糊 / 过小 / 大范围低置信度
  const hard = reasons.filter((r) => !r.soft);
  return { isGray: hard.length > 0, reasons, hard };
}

function buildGray(gray, label) {
  const level = 'gray';
  const headline = label.readingOnly && label.ingredientText ? '已读取配料表，请对照照片核对' : label.readingOnly && label.rawText ? '已读取照片文字，未找到配料表标题' : label.unavailableReason && !label.imageQuality?.blurry && !label.imageQuality?.tooSmall
    ? '还没有读取到这张照片的配料表' : '照片有点看不清，能再拍一张吗？';
  const advice = label.readingOnly ? '下面是这张照片实际识别出的文字，可以放大和朗读。请核对错字与漏字；需要营养建议时还须核对包装已标示的营养项目和单位。' : label.unavailableReason || '把手机靠近包装背面，让配料表和营养成分表填满画面，光线亮一点再拍一次。';
  return {
    level,
    headline,
    advice,
    allergenConflicts: [],
    allAllergens: [],
    nutrients: [],
    additives: collectAdditives(label.ingredientText || ''),
    concernNames: [],
    basis: [
      {
        kind: 'conflict',
        title: label.readingOnly ? '营养信息为什么仍不足' : '为什么不给结论',
        lines: gray.reasons.map((r) => r.text),
        source: '方案 4.3 灰色等级：承认不知道，比编一个答案更重要'
      },
      {
        kind: 'model',
        title: '本次识别情况',
        lines: [
          `识别到配料表文本长度 ${(label.ingredientText || '').length} 字`,
          label.readingOnly ? `文字识别把握：${Math.round((label.ocrConfidence || 0) * 100)}%；${label.ingredientsConfirmed ? '配料已由用户核对' : '配料尚未核对'}` : `字段置信度：${Object.entries(label.confidence || {})
            .map(([k, v]) => `${NUTRIENT_LABEL[k] || k} ${(v * 100).toFixed(0)}%`)
            .join('、') || '无'}`
        ],
        source: '识别通道原始输出'
      }
    ],
    flags: {},
    quantity: { servingGrams: null, basis: 'per100g' },
    grayReasons: gray.reasons
  };
}

/* -------------------------------------------------------------- 分级决策 */

/** 用户未勾选任何关注方向时使用的兜底关注集合 */
const DEFAULT_CONCERNS = ['sugar', 'salt', 'fat'];

function decideLevel({ allergenConflicts, nutrients }) {
  if (allergenConflicts.length) return 'red';
  const levels = nutrients.map((n) => n.level);
  if (levels.includes('orange')) return 'orange';
  if (levels.includes('yellow')) return 'yellow';
  return 'green';
}

/* ------------------------------------------------------------ 一句话结论 */

/**
 * 生成「一句听得懂的话」。这是本作品最核心的产品判断：
 * 输出的不是分析报告，是一句人话（方案 3.4）。
 */
export function headlineFor({ level, allergenConflicts, nutrients, concernNames, label }) {
  const name = label.productName ? `这个${shortName(label.productName)}` : '这个';

  if (level === 'red') {
    const list = allergenConflicts
      .map((a) => `${a.emoji}${a.short}`)
      .join('、');
    const conjunction = allergenConflicts.length > 1 ? '都' : '';
    return `${name}里有${list}，您对${list}${conjunction}过敏，别吃。`;
  }

  if (level === 'orange') {
    const parts = [];
    for (const n of nutrients.filter((x) => x.level === 'orange')) {
      if (n.key === 'sugar' && n.reasons.includes('dailyBudgetUsedUp')) {
        parts.push('这个甜，而且您今天吃过的甜食已经够了');
      } else if (n.key === 'sodium' && n.reasons.includes('dailyBudgetUsedUp')) {
        parts.push('这个咸，而且您今天吃进去的盐已经够了');
      } else {
        parts.push(amountPhrase(n.key, n.ratioOfDaily));
      }
    }
    return `${name}，${parts.join('；')}，要少吃一点。`;
  }

  if (level === 'yellow') {
    const hot = nutrients
      .filter((x) => x.level === 'yellow')
      .sort((a, b) => b.ratioOfDaily - a.ratioOfDaily);
    if (hot.length) {
      const first = hot[0];
      if (first.key === 'sodium') {
        return `${name}可以吃，不过它盐分不低，一份差不多占了您一天限额的 ${percent(
          first.ratioOfDaily
        )}，做菜就别再放盐了。`;
      }
      if (first.key === 'sugar') {
        const mild = first.ratioOfDaily < 0.5;
        return mild
          ? `${name}可以吃，就是糖分不算少，一份占了您一天限额的 ${percent(
              first.ratioOfDaily
            )}，今天甜饮料和糕点少来一点。`
          : `${name}可以吃，不过糖不少，占了您一天限额的 ${percent(
              first.ratioOfDaily
            )}，今天甜的少来一点。`;
      }
      if (first.key === 'saturatedFat' || first.key === 'fat') {
        return `${name}可以吃，不过油偏多，占了您一天限额的 ${percent(
          first.ratioOfDaily
        )}，别多吃。`;
      }
    }
    return `${name}可以吃，营养上没什么大问题，就是别一次吃太多。`;
  }

  const concernText = concernNames.length ? `跟您关注的${concernNames.join('、')}不冲突` : '';
  return `${name}可以吃${concernText ? '，' + concernText : ''}，配料表里也没看到您过敏的东西。`;
}

function shortName(productName) {
  return productName.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
}

function percent(ratio) {
  const p = ratio * 100;
  if (p >= 300) return `${Math.round(p / 100)} 倍`;
  if (p >= 200) return '两倍还多';
  if (p >= 100) return '一整天的量';
  return `${Math.round(p)}%`;
}

/** 口语化量级短语：吃得太多时改用「顶了…」的句式，避免「限额的 两倍」这种别扭说法 */
function amountPhrase(key, ratio) {
  const noun = { sugar: '糖', sodium: '盐', fat: '油', saturatedFat: '油' }[key] || '这一项';
  const p = ratio * 100;
  // 需要带出「太甜了 / 太咸了」这类身体感受，光说数字老人没有体感
  if (p >= 100) {
    const feel = { sugar: '这个太甜了，', sodium: '这个太咸了，', fat: '这个太油了，', saturatedFat: '这个太油了，' }[key] || '';
    return `${feel}一份的${noun}就顶了${percent(ratio)}`;
  }
  return `一份的${noun}占了您一天限额的 ${Math.round(p)}%`;
}

/* ------------------------------------------------------------ 行动建议 */

export function adviceFor({ level, allergenConflicts, nutrients }) {
  if (level === 'red') {
    const names = allergenConflicts.map((a) => a.short).join('、');
    return `包装上已经标了「含${names}」。如果实在想吃，先问一下家里人或者医生；同一包也别分给同样过敏的家人。`;
  }
  if (level === 'orange') {
    const hot = nutrients.filter((n) => n.level === 'orange');
    if (hot.some((n) => n.key === 'sugar')) {
      return '今天剩下的时间尽量选不甜的，比如白开水、无糖豆浆。想吃甜的，和家人分着吃一半也行。';
    }
    if (hot.some((n) => n.key === 'sodium')) {
      return '今天剩下两顿吃清淡些，少放盐、少喝汤，多喝点白开水。';
    }
    return '今天剩下的时间吃得清淡些，少油少盐。';
  }
  if (level === 'yellow') {
    const hotYellow = nutrients
      .filter((n) => n.level === 'yellow')
      .sort((a, b) => b.ratioOfDaily - a.ratioOfDaily);
    const firstKey = hotYellow[0]?.key;
    if (firstKey === 'sodium') {
      return '可以正常吃，不过这一天里咸的东西要省着点，做菜少放盐，腌制品和酱菜先放一放。';
    }
    if (firstKey === 'sugar') {
      return '可以正常吃，不过今天甜的（甜饮料、糕点、糖果）少来一点，换着吃水果更好。';
    }
    if (firstKey === 'saturatedFat' || firstKey === 'fat') {
      return '可以正常吃，不过今天做菜少放点油，肥肉和油炸的先少吃。';
    }
    return '可以正常吃，注意一天别超过一两份。';
  }
  return '可以放心吃。记得一天吃的东西杂一点，蔬菜和粗粮也要有。';
}

/* ------------------------------------------------------------ 依据追溯 */

function buildBasis({ label, allergenConflicts, nutrients, allergens, additives, gray, concernNames }) {
  const blocks = [];

  /* 0. 读取限制的如实说明：缺字段等软性问题不阻断结论，但必须写清楚 */
  const softReasons = (gray?.reasons || []).filter((r) => r.soft);
  if (softReasons.length) {
    blocks.push({
      kind: 'model',
      title: '这张照片没读全的地方',
      lines: [...softReasons.map((r) => r.text), '缺项会影响判断的完整度，建议再对着包装拍一张更清楚的。'],
      source: 'GB 28050-2025 强制标示项清单'
    });
  }

  /* 1. 过敏匹配 */
  const conflictIds = new Set(allergenConflicts.map((a) => a.allergenId));
  blocks.push({
    kind: 'rule',
    title: '过敏原匹配（规则判定，非模型推测）',
    lines: allergens.length
      ? allergens.map((a) => {
          const where =
            a.evidenceKind === 'ingredient'
              ? `配料表第 ${a.line ?? '?'} 行「${a.alias}」`
              : `包装致敏物质提示「${a.alias}」`;
          const mark = conflictIds.has(a.allergenId) ? '【与您冲突】' : '【与您无关】';
          const fuzzy = a.fuzzyOnly ? '（间接写法，置信度略低）' : '';
          return `${a.emoji} ${a.label}：${where} ${mark}${fuzzy}`;
        })
      : ['配料表中未匹配到 GB 7718-2025 附录 D 的八大致敏物质。'],
    source: 'GB 7718-2025《预包装食品标签通则》附录 D'
  });

  /* 2. 营养阈值 */
  if (nutrients.length) {
    blocks.push({
      kind: 'rule',
      title: `营养阈值判断（本次按 ${label.servingLabel || '每 100 g'} 折算）`,
      lines: nutrients.map((n) => {
        const tone = n.gradeText;
        const concernMark = n.isConcern ? '（您关注的方向）' : '';
        return `${n.label} ${n.amount} ${n.unit}，占一天建议上限 ${n.limit} ${n.unit} 的 ${(
          n.ratioOfDaily * 100
        ).toFixed(0)}%，${tone}${concernMark}。`;
      }),
      source: nutrients[0].source
    });
  }

  /* 3. 添加剂名词翻译 */
  if (additives.length) {
    blocks.push({
      kind: 'rule',
      title: '配料表里的添加剂是什么（名词翻译，不做安全判定）',
      lines: additives.map((a) => `${a.code} = ${a.name}（${a.use}）`),
      source: 'GB 2760《食品安全国家标准 食品添加剂使用标准》'
    });
  } else {
    blocks.push({
      kind: 'rule',
      title: '配料表里的添加剂是什么',
      lines: ['这份配料表里没有识别到常见的 INS 编码添加剂。'],
      source: 'GB 2760《食品安全国家标准 食品添加剂使用标准》'
    });
  }

  /* 4. 识别通道与置信度（区分确定性与估算） */
  const conf = label.confidence || {};
  blocks.push({
    kind: label.nutritionConfirmed ? 'rule' : 'model',
    title: label.nutritionConfirmed ? '用户核对的标签字段' : '识别置信度（模型推测部分，与规则判定分开）',
    lines: [
      `识别通道：${label.channelLabel || '未知'}`,
      `配料表文本：${label.ingredientText ? `${label.ingredientText.length} 字` : '未读到'}`,
      label.nutritionConfirmed ? '配料和填写的营养值已由用户对照包装核对；未标示或未确认的字段保持未知。' : `字段置信度：${
        Object.entries(conf)
          .map(([k, v]) => `${NUTRIENT_LABEL[k] || k} ${(v * 100).toFixed(0)}%`)
          .join('、') || '无'
      }`,
      concernNames.length
        ? `比对依据：您的画像关注「${concernNames.join('、')}」`
        : '比对依据：您还没有设置关注方向，系统按通用营养建议提示'
    ],
    source: '识别层原始输出 + 本地画像'
  });

  return blocks;
}

/* ------------------------------------------------------------ 自测用例 */

/**
 * 规则层回归自测：用内置演示用例跑一遍分级，校验与预期是否一致。
 * 可在浏览器控制台执行 `import('./src/core/rules.js').then(m => m.selfTest())`。
 * @param {import('../data/sample-labels.js').LabelCase[]} cases
 */
export function selfTest(cases) {
  const results = [];
  const profiles = {
    default: {
      completed: true,
      ageGroup: 'age70',
      concerns: ['sugar', 'salt', 'fat'],
      allergens: ['peanut', 'milk'],
      conditions: [],
      voiceOn: false
    },
    noAllergy: {
      completed: true,
      ageGroup: 'age60',
      concerns: ['sugar'],
      allergens: [],
      conditions: ['diabetes'],
      voiceOn: false
    }
  };

  for (const testCase of cases) {
    const label = {
      productName: testCase.productName,
      ingredientText: testCase.ingredientText,
      allergenDeclaration: testCase.allergenDeclaration || '',
      ingredientLines: [{ line: 1, text: testCase.ingredientText, isIngredient: true }],
      nutritionPer100g: testCase.nutritionPer100g,
      confidence: testCase.confidence,
      channelLabel: '自测用例',
      servingLabel: '每 100 g',
      servingGrams: 100,
      imageQuality: { blurry: false, tooSmall: false }
    };
    const assessment = evaluate({
      label,
      profile: profiles.default,
      consumedToday: { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0 },
      servingGrams: 100
    });
    results.push({
      id: testCase.id,
      productName: testCase.productName,
      expected: testCase.expectLevel,
      actual: assessment.level,
      pass: testCase.expectLevel ? testCase.expectLevel === assessment.level : null,
      headline: assessment.headline
    });
  }
  return results;
}
