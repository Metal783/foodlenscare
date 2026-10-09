/** 用户对照包装核对的字段；不从 OCR 全文猜测营养表列和单位。 */
import { NUTRIENT_FIELDS } from '../data/nutrition.js';
import { splitIngredientLines } from '../recognize/parse-label.js';

/** 会直接影响摄入量判断的成分，缺了就必须明确说「算不出来」 */
const INTAKE_RELEVANT = ['sugar', 'sodium', 'fat', 'saturatedFat'];

/**
 * 把用户核对过的内容并回标签结构。
 *
 * 关于营养值：**允许只填一部分**。
 *
 * 早期实现要求「要么七项全空、要么七项齐全」，理由是避免把 NRV% 或每份
 * 数值误当成每 100 克含量。但真实包装不会把七项都印出来——葡萄汁那瓶只有
 * 五项（没有糖、没有饱和脂肪），于是用户明明照着包装如实填写，却完全用不了，
 * 只能被迫把包装上没印的数字填成 0，那是假数据。
 *
 * 现在的规则：填几项就算几项；没填的项目明确标成「未标示、无法计算」，
 * 并要求用户在核对框里确认自己填的就是包装上印的。
 */
export function reviewLabel(label, { ingredientText, allergenDeclaration = '', nutrients = {}, unit = 'g' }) {
  if (!ingredientText?.trim()) throw new Error('请填写完整配料；没有看清时请重新拍摄。');
  if (!['g', 'ml'].includes(unit)) throw new Error('请选择每 100 克或每 100 毫升。');

  const values = {};
  const confidence = {};
  const filledFields = [];
  const missingFields = [];

  for (const field of NUTRIENT_FIELDS) {
    const raw = nutrients[field.key];
    if (raw == null || String(raw).trim() === '') {
      values[field.key] = null;
      confidence[field.key] = 0;
      missingFields.push(field.key);
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field.label}请填写大于或等于 0 的数值。`);
    }
    values[field.key] = value;
    confidence[field.key] = 1;
    filledFields.push(field.key);
  }

  const anyFilled = filledFields.length > 0;
  const allFilled = missingFields.length === 0;

  // 缺哪些项会导致哪一类判断算不出来，要写进「依据在哪」
  const uncomputable = missingFields
    .filter((key) => INTAKE_RELEVANT.includes(key))
    .map((key) => NUTRIENT_FIELDS.find((f) => f.key === key)?.label || key);

  return {
    ...label,
    ingredientText: ingredientText.trim(),
    ingredientLines: splitIngredientLines(ingredientText),
    allergenDeclaration: allergenDeclaration.trim(),
    ingredientsConfirmed: true,

    // readingOnly：完全没填营养值 → 只给配料层面的提醒
    readingOnly: !anyFilled,
    // nutritionConfirmed：填过营养值（可以是部分）
    nutritionConfirmed: anyFilled,
    // nutritionPartial：填了一部分，页面要提示「未标示的项目算不出来」
    nutritionPartial: anyFilled && !allFilled,

    nutritionPer100g: values,
    confidence,
    filledFields,
    missingFields,
    uncomputable,

    declaredPer: 'per100g',
    servingBasis: 'per100g',
    servingUnit: unit,
    servingLabel: unit === 'ml' ? '每 100 毫升' : '每 100 克',
    imageQuality: {},
    unavailableReason: null
  };
}
