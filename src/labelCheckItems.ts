import { analysisInput } from './analysisInput.ts';

export type LabelCheck = { id: string; title: string; note: string; needsCheck: boolean };
const nutrients: Record<string, string> = { energy: '能量', protein: '蛋白质', fat: '脂肪', saturatedFat: '饱和脂肪', carbohydrate: '碳水化合物', sugar: '糖', sodium: '钠' };

/** Reading reminders only: these never confirm or modify OCR evidence. */
export function labelChecklist(label: any): LabelCheck[] {
  const input = analysisInput(label), basis = input.declaredPer, serving = String(input.servingLabel || '').trim();
  const portion = serving.match(/^每\s*份\s*[（(]?\s*(\d+(?:\.\d+)?)\s*(克|g|毫升|ml)\s*[)）]?$/i);
  const basisValid = basis === 'per100g' ? /^每\s*100\s*(克|g|毫升|ml)$/i.test(serving)
    : basis === 'perServing' && !!portion && Number(portion[1]) > 0 && Number(portion[1]) <= 100000;
  const ingredient = typeof input.ingredientText === 'string' && !!input.ingredientText.trim();
  const allergens = typeof input.allergenDeclaration === 'string' && !!input.allergenDeclaration.trim();
  const checks: LabelCheck[] = [
    { id: 'ingredients', title: '完整配料表', needsCheck: !ingredient, note: ingredient ? '已读到配料文字，请对照包装查看是否完整，尤其留意折角或反光处。' : '未读清配料表，请补拍完整配料区域。' },
    { id: 'basis', title: '营养计量口径', needsCheck: !basisValid, note: basisValid ? `已读到${serving}，请对照表头；每份并不代表实际食用份量。` : '计量口径未读清或不完整，请补拍表头；每份还需看清对应克数或毫升数。' },
    { id: 'allergens', title: '过敏原及交叉接触提示', needsCheck: !allergens, note: allergens ? '已读到过敏原声明，请同时核对完整配料及“可能含有”等提示；识别不保证完整。' : '未读到单独声明，请在包装上查找“含有”“可能含有”等提示；未读到不代表没有过敏原。' },
  ];
  const values = (basis === 'perServing' ? input.nutritionPerServing : input.nutritionPer100g) || {};
  for (const [key, title] of Object.entries(nutrients)) {
    const value = values[key], evidence = input.nutritionEvidence[key];
    const maximum = basis === 'per100g' ? key === 'energy' ? 4200 : key === 'sodium' ? 100000 : 100 : 100000;
    let reason = '';
    if (value == null) reason = '未读到，请核对包装是否标有该项；不能当作零。';
    else if (evidence.conflict) reason = '识别候选有冲突，请补拍该行及单位。';
    else if (evidence.warning) reason = '识别有单位或格式提示，请核对数值和单位。';
    else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) reason = '识别值格式或范围异常，请核对该行。';
    else if (typeof evidence.confidence !== 'number' || !Number.isFinite(evidence.confidence) || evidence.confidence < .7 || evidence.confidence > 1) reason = '识别把握不足或缺少依据，请补拍该行。';
    else if (!basisValid) reason = '已有数值候选，但计量口径不完整，请先核对表头。';
    checks.push({ id: key, title, needsCheck: !!reason, note: reason || '已读到可用数值候选，仍请对照包装查看；不会因勾选而提高可信度。' });
  }
  checks.push({ id: 'storage', title: '保质期与储存说明', needsCheck: true, note: '请另外查看日期、储存条件和开封后的说明，当前未自动读取这些信息。' });
  return checks;
}
