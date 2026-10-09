/** 用户对照包装核对的字段；不从 OCR 全文猜测营养表列和单位。 */
import { NUTRIENT_FIELDS } from '../data/nutrition.js';
import { splitIngredientLines } from '../recognize/parse-label.js';

export function reviewLabel(label, { ingredientText, allergenDeclaration = '', nutrients = {}, unit = 'g' }) {
  if (!ingredientText?.trim()) throw new Error('请填写完整配料；没有看清时请重新拍摄。');
  if (!['g', 'ml'].includes(unit)) throw new Error('请选择每 100 克或每 100 毫升。');
  const values = {};
  let filled = 0;
  for (const field of NUTRIENT_FIELDS) {
    const raw = nutrients[field.key];
    if (raw == null || String(raw).trim() === '') { values[field.key] = null; continue; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field.label}请填写大于或等于 0 的数值。`);
    values[field.key] = value;
    filled++;
  }
  if (filled && filled !== NUTRIENT_FIELDS.length) throw new Error('请核对并填写全部七项营养值；包装未标示的项目请留空，不要填成 0。也可以清空全部营养值，仅核对配料。');
  return {
    ...label, ingredientText: ingredientText.trim(), ingredientLines: splitIngredientLines(ingredientText),
    allergenDeclaration: allergenDeclaration.trim(), ingredientsConfirmed: true,
    readingOnly: filled !== NUTRIENT_FIELDS.length, nutritionConfirmed: filled === NUTRIENT_FIELDS.length,
    nutritionPer100g: values, confidence: Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, values[f.key] === null ? 0 : 1])),
    declaredPer: 'per100g', servingBasis: 'per100g', servingUnit: unit,
    servingLabel: unit === 'ml' ? '每 100 毫升' : '每 100 克',
    imageQuality: {}, unavailableReason: null
  };
}
