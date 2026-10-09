/**
 * 标签文本解析：把「一段食品标签文字」还原成结构化字段
 *
 * 这是兜底通道（华为云 OCR → 纯文本）与本地演示数据共用的解析器，
 * 也是把「印刷体转录」变成「可用字段」的关键一步。
 * 全部为纯函数，便于单测与答辩现场离线运行。
 */

import { NUTRIENT_FIELDS } from '../data/nutrition.js';

/** 营养字段别名表：覆盖常见标示写法，含 GB 28050-2025 新增的糖与饱和脂肪 */
const FIELD_ALIASES = {
  energy: ['能量', '热量'],
  protein: ['蛋白质', '蛋白'],
  fat: ['脂肪'],
  saturatedFat: ['饱和脂肪', '饱和脂肪酸', '饱和脂'],
  carbohydrate: ['碳水化合物', '碳水化物'],
  sugar: ['糖', '糖分', '总糖', '添加糖'],
  sodium: ['钠', '食盐', '盐分']
};

const NUM = '([0-9]+(?:\\.[0-9]+)?)';

/** 逐行扫描，避免把「饱和脂肪」误判成「脂肪」 */
function findByAlias(text, aliases) {
  for (const alias of aliases) {
    // 别名后允许出现任意非数字字符（含冒号、空格、单位前缀）后接数字
    const re = new RegExp(`${alias}[^0-9\\n]{0,8}${NUM}`, 'i');
    const m = text.match(re);
    if (m) return { value: Number(m[1]), alias, matched: m[0] };
  }
  return null;
}

/**
 * 解析每 100 g（或每份）的营养成分表。
 * @param {string} text
 * @returns {{per100g:Record<string,number|null>, found:number, missing:string[], declaredPer:'per100g'|'perServing'|'unknown'}}
 */
export function parseNutrition(text) {
  const per100g = {};
  const missing = [];
  let found = 0;

  for (const field of NUTRIENT_FIELDS) {
    const hit = findByAlias(text || '', FIELD_ALIASES[field.key] || [field.label]);
    if (hit) {
      per100g[field.key] = hit.value;
      found += 1;
    } else {
      per100g[field.key] = null;
      missing.push(field.key);
    }
  }

  // 单位口径：优先看「每 100 g / 每 100 毫升」，识别不了时按每 100 g 处理并标注
  let declaredPer = 'unknown';
  if (/每\s*100\s*(g|克|ml|毫升|ML)/i.test(text || '')) declaredPer = 'per100g';
  else if (/每\s*(份|包|袋|瓶|支|块)/.test(text || '')) declaredPer = 'perServing';

  return { per100g, found, missing, declaredPer };
}

/**
 * 把配料表切成「行」并编号，用于结果页展示「来自配料表第几行」。
 * 切分依据：换行符 → 分号／句号 → 逗号（顿号保留在行内，避免把「花生、小麦」割裂）。
 * @param {string} text 配料表区段原文
 * @returns {{line:number,text:string,isIngredient:boolean}[]}
 */
export function splitIngredientLines(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.replace(/\r/g, '').trim();

  let chunks = normalized.split(/[\n；;。]/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length < 3) {
    // 单行配料表：「配料：小麦粉、白砂糖、花生仁（12%）、植物油」
    // 顿号切分把每个配料分开，便于展示「来自配料表第几行」
    chunks = normalized.split(/[，,、]/).map((s) => s.trim()).filter(Boolean);
  }

  let line = 0;
  return chunks.map((chunk) => {
    line += 1;
    return {
      line,
      text: chunk,
      // 致敏物质提示行不算配料，但保留行号连续性
      isIngredient: !/致敏物质|过敏原|含有|可能含有/.test(chunk)
    };
  });
}

/**
 * 补齐营养表中缺失的新增强制标示项。
 * GB 28050-2025 把「糖」与「饱和脂肪」列为强制标示项；
 * 缺失即触发灰色等级（请用户补拍），不做推测填充。
 * @param {Record<string, number|null>} per100g
 */
export function missingMandatoryFields(per100g = {}) {
  return NUTRIENT_FIELDS.filter(
    (f) => f.mandatory && (per100g[f.key] == null || String(per100g[f.key]).trim() === '' || !Number.isFinite(Number(per100g[f.key])))
  ).map((f) => f.key);
}

/**
 * 从标签全文中抽取产品名称的兜底逻辑。
 * @param {string} text
 */
export function guessProductName(text) {
  if (!text) return '';
  const m = text.match(/(?:产品名称|品名|名称)[:：\s]*([^\n，,。；;]{2,24})/);
  if (m) return m[1].trim();
  const first = text.split(/[\n。]/).map((s) => s.trim()).find(Boolean);
  if (first && first.length <= 24 && !/\d{3}\s*(kJ|kJ|千焦|mg)/i.test(first)) return first;
  return '';
}

/**
 * 从标签全文中抽取「致敏物质提示」原文。
 * @param {string} text
 */
export function extractAllergenDeclaration(text) {
  if (!text) return '';
  const m = text.match(/(?:致敏物质提示|致敏物质|过敏原信息|过敏原|本品含有|含有)[:：\s]*([^\n]{2,80})/);
  return m ? m[1].trim() : '';
}

/**
 * 从标签全文中抽取净含量。
 * @param {string} text
 */
export function extractNetContent(text) {
  if (!text) return '';
  const m = text.match(/净含量[:：\s]*([^\n]{1,24})/);
  return m ? m[1].trim() : '';
}

/**
 * 一站式：纯文本 → 结构化标签字段。
 * @param {string} rawText
 * @param {Object} [options]
 * @param {Record<string, number>} [options.confidence] 外部给出的字段置信度，缺省按 0.8 计
 * @param {string} [options.productName]
 * @param {string} [options.channelLabel]
 * @returns {import('../core/rules.js').ParsedLabel}
 */
export function parseLabelText(rawText, options = {}) {
  const text = rawText || '';
  const nutrition = parseNutrition(text);
  const ingredientText = extractIngredientSection(text);
  const declaration = extractAllergenDeclaration(text);
  const confidence = {};
  for (const field of NUTRIENT_FIELDS) {
    const given = options.confidence?.[field.key];
    if (Number.isFinite(given)) confidence[field.key] = given;
    else confidence[field.key] = nutrition.per100g[field.key] === null ? 0 : declaredConfidence(text, field);
  }

  return {
    productName: options.productName || guessProductName(text) || '未识别名称的食品',
    ingredientText,
    ingredientLines: splitIngredientLines(ingredientText),
    allergenDeclaration: declaration,
    netContent: extractNetContent(text),
    nutritionPer100g: nutrition.per100g,
    missingFields: nutrition.missing,
    declaredPer: nutrition.declaredPer,
    confidence,
    channelLabel: options.channelLabel || '本地文本解析',
    servingLabel: nutrition.declaredPer === 'perServing' ? '每份' : '每 100 g',
    servingGrams: options.servingGrams || 100,
    servingBasis: nutrition.declaredPer === 'perServing' ? 'perServing' : 'per100g'
  };
}

/**
 * 配料表标题的候选写法（已去掉汉字之间的空白）。
 *
 * 单独把「成分」列出来是有风险的：营养成分表里就含「成分」两个字，
 * 而且实测中它常常排在配料表前面（葡萄汁那瓶就是「营养表在上、配料表在下」）。
 * 所以下面用 findIngredientHeading 而不是一个裸正则。
 */
const INGREDIENT_HEADINGS = [
  /配料表/g,
  /配料/g,
  /原料与辅料/g,
  /原料/g,
  /原辅料/g,
  /配科表/g,
  /配科/g,
  /妃料表/g,
  /妃料/g
];

/**
 * 营养成分表 / 营养标签的标题。
 *
 * 注意这里只能用「空格」而不能用 `\s`：
 * 用 `\s*` 会让 `营养成分表\n成分…` 里的换行被吃掉，把下一行的「成分」
 * 也包进营养标题的范围，于是那处「成分」就不再被判定为属于营养表，
 * 配料区段又会从它开始——原来的 bug 会以另一种形式复现。
 */
const NUTRITION_HEADING = /(?:营养[ \t\u3000]*成分表|营养[ \t\u3000]*成分|营养标签)/g;

/** 去掉汉字之间的空白，用来对付 OCR 把「妃 料 表」逐字分开的情况 */
function squeezeCjkSpaces(text) {
  return text.replace(/([\u3400-\u9fff])[ \t\u3000]+(?=[\u3400-\u9fff])/g, '$1');
}

/**
 * 找出真正的配料表标题位置。
 *
 * 规则：
 *  1. 「配料表 / 配料 / 原料 / 原辅料」这类写法优先，取全文最早命中；
 *  2. OCR 错字（配科、妃料）同样按第 1 条处理；
 *  3. 「成分」只在它不属于营养成分表时才作为兜底候选。
 *
 * @param {string} text
 * @returns {{index:number, heading:string, viaIngredients:boolean}|null}
 */
export function findIngredientHeading(text) {
  if (!text) return null;
  const squeezed = squeezeCjkSpaces(text);

  let best = null;
  for (const pattern of INGREDIENT_HEADINGS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(squeezed);
    if (!match) continue;
    if (!best || match.index < best.index) {
      best = { index: match.index, heading: match[0], viaIngredients: true };
    }
  }
  if (best) return best;

  // 兜底：只写了「成分」的情况，但必须排除营养成分表
  const nutritionSpans = [];
  for (const match of squeezed.matchAll(NUTRITION_HEADING)) {
    nutritionSpans.push([match.index, match.index + match[0].length]);
  }
  for (const match of squeezed.matchAll(/成分/g)) {
    const insideNutrition = nutritionSpans.some(
      ([start, end]) => match.index >= start && match.index < end
    );
    if (!insideNutrition) {
      return { index: match.index, heading: match[0], viaIngredients: false };
    }
  }
  return null;
}

/**
 * 提取配料表区段。
 *
 * 修复记录：原实现用 `(?:配料表|配料|原料|成分)` 取全文最早命中。
 * 遇到「营养成分表在上、配料表在下」的排版时，最早命中的是营养表里的「成分」，
 * 于是把能量、蛋白质、产品标准号全归进了配料——即使 OCR 一个字都没读错。
 * 现在改为按标题词优先级定位，并且不再把营养表的内容当成配料。
 */
export function extractIngredientSection(text) {
  if (!text) return '';
  // 与 findIngredientHeading 用同一份「去掉汉字间空白」的文本，索引才对得上
  const squeezed = squeezeCjkSpaces(text);
  const heading = findIngredientHeading(squeezed);

  // 没有配料标题就不猜：返回空，由页面如实说明「没有读到配料表」。
  // 之前这里会把整段文字当成配料，等于把营养表的内容当成配料表。
  if (!heading) return '';

  const tail = squeezed.slice(heading.index);

  // 终点：配料表之后出现的第一个「其他区段」标题
  const endMatch = tail
    .slice(1)
    .match(/(致敏物质|过敏原|营养[ \t\u3000]*成分表|营养[ \t\u3000]*成分|营养标签|净含量|保质期|贮存(?:条件|及运输条件)|生产日期|产品标准号|产品类型|食用方法|执行标准|果汁含量|产品名称|生产商|地址|产地)/);
  if (!endMatch) return tail.trim();
  const end = endMatch.index + 1;
  const sliced = tail.slice(0, end).trim();
  // 兜底：万一截断掉的信息比留下的还少，说明这个标签排版很特殊，
  // 宁可不截断（多留一点原文），也不要丢掉配料表主体。
  return sliced.length >= 6 ? sliced : tail.trim();
}

/**
 * 依据文本完整度给出字段置信度。
 * 有单位、有数字、有「每 100 g」口径的字段置信度更高；
 * 这一数值与模型置信度分开呈现（见结果页「依据在哪」）。
 */
function declaredConfidence(text, field) {
  const aliases = FIELD_ALIASES[field.key] || [field.label];
  for (const alias of aliases) {
    const re = new RegExp(`${alias}[^0-9\\n]{0,8}${NUM}\\s*(${field.unit}|毫克|克|ml|mL)?`, 'i');
    const m = text.match(re);
    if (!m) continue;
    let score = 0.85;
    if (m[2]) score += 0.08;                       // 带单位
    if (/每\s*100\s*(g|克|ml|毫升)/i.test(text)) score += 0.04; // 口径明确
    return Math.min(0.97, Math.round(score * 100) / 100);
  }
  return 0;
}
