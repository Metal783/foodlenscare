/**
 * 规则层与解析层自测（零依赖，直接用 Node 运行）
 *
 * 运行：
 *   node tools/rule-selftest.mjs
 *
 * 覆盖范围：
 *   1. 八大致敏物质匹配（含别名、复合配料写法、致敏物质提示）
 *   2. INS 添加剂编码翻译
 *   3. 营养阈值与五色风险分级（含灰色补拍链路）
 *   4. 「一句话结论」的口语化输出
 *   5. 标签纯文本解析器（兜底通道的字段提取）
 *
 * 之所以单独做一套 Node 自测，是因为这些逻辑是作品的「可信性基础」，
 * 改一行阈值就应该能立刻验证有没有把结论改坏。
 */

import { evaluate, matchAllergens, RISK_LEVELS } from '../src/core/rules.js';
import { SAMPLE_CASES } from '../src/data/sample-labels.js';
import { splitIngredientLines, parseLabelText, parseNutrition } from '../src/recognize/parse-label.js';
import { collectAdditives } from '../src/data/additives.js';
import { DAILY_LIMITS } from '../src/data/nutrition.js';

/* ------------------------------------------------------------ 迷你断言 */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? `　→ ${detail}` : ''}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------ 测试用画像 */

const PROFILE_BASE = {
  completed: true,
  ageGroup: 'age70',
  concerns: ['sugar', 'salt', 'fat'],
  allergens: ['peanut', 'milk'],
  conditions: [],
  voiceOn: false
};

const PROFILE_NO_ALLERGY = { ...PROFILE_BASE, allergens: [], conditions: ['diabetes'] };

function labelFromCase(testCase) {
  return {
    productName: testCase.productName,
    ingredientText: testCase.ingredientText,
    ingredientLines: splitIngredientLines(testCase.ingredientText),
    allergenDeclaration: testCase.allergenDeclaration || '',
    nutritionPer100g: { ...testCase.nutritionPer100g },
    confidence: { ...testCase.confidence },
    channelLabel: '自测',
    servingLabel: '每 100 g',
    servingGrams: 100,
    servingBasis: 'per100g',
    imageQuality: { blurry: false, tooSmall: false }
  };
}

function run(testCase, profile = PROFILE_BASE, servingGrams = 100, consumed = {}) {
  return evaluate({
    label: labelFromCase(testCase),
    profile,
    consumedToday: { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0, ...consumed },
    servingGrams
  });
}

/* ------------------------------------------------------------------ 1 */

group('一、八大致敏物质匹配（GB 7718-2025 附录 D）');
{
  const cookie = SAMPLE_CASES.find((c) => c.id === 'peanut-cookie');
  const hits = matchAllergens(labelFromCase(cookie));
  const ids = hits.map((h) => h.allergenId);

  check('花生饼干命中「花生」', ids.includes('peanut'), `实际命中：${ids.join('、')}`);
  check('花生饼干命中「含麸质的谷物」（小麦粉）', ids.includes('gluten'));
  check('花生饼干命中「蛋类」（鸡蛋）', ids.includes('egg'));
  check('花生饼干命中「乳制品」（乳粉）', ids.includes('milk'));
  check('命中项带有配料表行号', hits.every((h) => h.line === null || Number.isInteger(h.line)));

  const soybean = SAMPLE_CASES.find((c) => c.id === 'sausage');
  const soyHits = matchAllergens(labelFromCase(soybean)).map((h) => h.allergenId);
  check('香肠命中「大豆」（大豆蛋白）', soyHits.includes('soy'), `实际：${soyHits.join('、')}`);
  check('香肠不误报「花生」', !soyHits.includes('peanut'));

  const milk = SAMPLE_CASES.find((c) => c.id === 'plain-milk');
  const milkHits = matchAllergens(labelFromCase(milk)).map((h) => h.allergenId);
  check('纯牛奶命中「乳及乳制品」', milkHits.includes('milk'));
  check('纯牛奶不误报「蛋类」', !milkHits.includes('egg'));

  // 别名与复合配料写法
  const aliasLabel = labelFromCase({
    productName: '测试',
    ingredientText: '配料：面粉、植物奶油、酱油、燕麦、巴旦木、虾皮',
    nutritionPer100g: {},
    confidence: {}
  });
  const aliasHits = matchAllergens(aliasLabel).map((h) => h.allergenId);
  for (const [expected, term] of [
    ['gluten', '面粉'],
    ['milk', '植物奶油'],
    ['soy', '酱油'],
    ['gluten', '燕麦'],
    ['nut', '巴旦木'],
    ['crustacean', '虾皮']
  ]) {
    check(`别名「${term}」→ ${expected}`, aliasHits.includes(expected), `实际：${aliasHits.join('、')}`);
  }
}

/* ------------------------------------------------------------------ 2 */

group('二、INS 添加剂编码翻译（GB 2760）');
{
  const cookie = SAMPLE_CASES.find((c) => c.id === 'peanut-cookie');
  const additives = collectAdditives(cookie.ingredientText);
  const names = additives.map((a) => a.name);
  check('INS 322 → 卵磷脂', names.includes('卵磷脂'), `实际：${names.join('、')}`);
  check('INS 330 → 柠檬酸', names.includes('柠檬酸'));

  const sausage = SAMPLE_CASES.find((c) => c.id === 'sausage');
  const sausageAdditives = collectAdditives(sausage.ingredientText).map((a) => a.name);
  check('INS 250 → 亚硝酸钠', sausageAdditives.includes('亚硝酸钠'), `实际：${sausageAdditives.join('、')}`);
  check('INS 621 → 谷氨酸钠（味精）', sausageAdditives.includes('谷氨酸钠'));

  check('纯牛奶没有 INS 编码添加剂',
    collectAdditives(SAMPLE_CASES.find((c) => c.id === 'plain-milk').ingredientText).length === 0);
  check('不会把普通数字误判成 INS 编码',
    collectAdditives('配料：水、糖 100 g').length === 0);
}

/* ------------------------------------------------------------------ 3 */

group('三、风险分级（五色）');
{
  // 主用例用「只关注营养、没有过敏」的画像，才能单独验证营养分级；
  // 过敏引起的红色在下面单独验证。
  const results = SAMPLE_CASES.map((testCase) => ({
    id: testCase.id,
    expected: testCase.expectLevel,
    expectedWithAllergy: testCase.expectLevelWithAllergy ?? null,
    actual: run(testCase, PROFILE_NO_ALLERGY, servingOf(testCase)).level,
    actualWithAllergy: run(testCase, PROFILE_BASE, servingOf(testCase)).level
  }));

  for (const r of results) {
    if (r.expected) check(`${r.id}（无过敏画像）预期 ${r.expected}`, r.actual === r.expected, `实际 ${r.actual}`);
    if (r.expectedWithAllergy) {
      check(
        `${r.id}（含乳制品/花生过敏画像）预期 ${r.expectedWithAllergy}`,
        r.actualWithAllergy === r.expectedWithAllergy,
        `实际 ${r.actualWithAllergy}`
      );
    }
  }

  // 同一件牛奶，对不同画像应给出不同结论
  const milkCase = SAMPLE_CASES.find((c) => c.id === 'plain-milk');
  check('纯牛奶对乳制品过敏者 → 红色', run(milkCase, PROFILE_BASE).level === 'red');

  const milkNoAllergy = run(milkCase, PROFILE_NO_ALLERGY);
  check('纯牛奶对不过敏者 → 绿色', milkNoAllergy.level === 'green', `实际 ${milkNoAllergy.level}`);

  // 同一件花生饼干，对有过敏者是红色，对无过敏者不是红色
  const cookie = SAMPLE_CASES.find((c) => c.id === 'peanut-cookie');
  check('花生饼干对花生过敏者 → 红色', run(cookie, PROFILE_BASE).level === 'red');
  check('花生饼干对无过敏者 → 不是红色', run(cookie, PROFILE_NO_ALLERGY).level !== 'red');

  // 当日额度耗尽后，同一件食品应升级为橙色
  const drink = SAMPLE_CASES.find((c) => c.id === 'sugar-drink');
  const drinkFull = run(drink, PROFILE_NO_ALLERGY, 500);
  check('含糖饮料 500 mL → 橙色', drinkFull.level === 'orange', `实际 ${drinkFull.level}`);

  const lowSugarCase = {
    ...SAMPLE_CASES.find((c) => c.id === 'plain-milk'),
    id: 'low',
    productName: '低糖苏打饼干',
    ingredientText: '配料：小麦粉、植物油、食用盐、碳酸氢钠',
    allergenDeclaration: '',
    nutritionPer100g: {
      ...SAMPLE_CASES.find((c) => c.id === 'plain-milk').nutritionPer100g,
      sugar: 2,
      sodium: 80,
      fat: 3,
      saturatedFat: 0.5
    },
    expectLevel: null
  };
  // 阈值边界：一天上限的 15% 以下不改变整件食品的结论
  const negligible = run({ ...lowSugarCase, nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 2 } },
    PROFILE_NO_ALLERGY, 100, { sugar: DAILY_LIMITS.sugar.limit });
  check('当日额度用尽但这一份只占 8% → 仍为绿色', negligible.level === 'green', `实际 ${negligible.level}`);

  // 当日额度用尽且这一份占到 15% 以上 → 橙色
  const stillMaterial = run({ ...lowSugarCase, nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 5 } },
    PROFILE_NO_ALLERGY, 100, { sugar: DAILY_LIMITS.sugar.limit });
  check('当日额度用尽且这一份占 20% → 橙色', stillMaterial.level === 'orange', `实际 ${stillMaterial.level}`);

  // 一份就吃掉一天上限六成以上 → 橙色（无需等额度耗尽）
  const bigShare = run({ ...lowSugarCase, nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 16 } },
    PROFILE_NO_ALLERGY, 100, {});
  check('一份糖占一天上限 64% → 橙色', bigShare.level === 'orange', `实际 ${bigShare.level}`);

  // 一份占一天上限三成到六成之间 → 黄色
  const midShare = run({ ...lowSugarCase, nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 10 } },
    PROFILE_NO_ALLERGY, 100, {});
  check('一份糖占一天上限 40% → 黄色', midShare.level === 'yellow', `实际 ${midShare.level}`);

  // 没有勾选任何关注方向时，量级判断不应放松
  const noConcern = run({ ...lowSugarCase, nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 16 } },
    { ...PROFILE_NO_ALLERGY, concerns: [], conditions: [] }, 100, {});
  check('未勾选关注方向时，64% 仍判橙色', noConcern.level === 'orange', `实际 ${noConcern.level}`);

  // 大份量的含糖食品：额度快用完时应升级为橙色
  const sugaryCase = {
    ...lowSugarCase,
    productName: '含糖测试品',
    ingredientText: '配料：小麦粉、白砂糖、植物油、食用盐',
    nutritionPer100g: { ...lowSugarCase.nutritionPer100g, sugar: 12 }
  };
  const bigPortion = run(sugaryCase, PROFILE_NO_ALLERGY, 300, { sugar: 20 });
  check('单份糖量占满当日剩余额度 → 橙色', bigPortion.level === 'orange', `实际 ${bigPortion.level}`);

  // 乳糖豁免：纯牛奶的糖来自天然乳糖，不应被当作「添加糖超标」来警告
  const milkLactose = run(milkCase, PROFILE_NO_ALLERGY, 250);
  const sugarEntry = milkLactose.nutrients.find((n) => n.key === 'sugar');
  check('纯牛奶里的糖被识别为天然乳糖并豁免', sugarEntry?.exempt === true, JSON.stringify(sugarEntry?.reasons));
  check('牛奶每 100 g 含糖 4.8 g 时不再报「太甜」', milkLactose.level === 'green', milkLactose.headline);

  // 有添加糖的乳饮料不应豁免
  const milkDrink = {
    ...milkCase,
    productName: '调味乳饮料',
    ingredientText: '配料：水、生牛乳、白砂糖、乳粉、食用香精',
    nutritionPer100g: { ...milkCase.nutritionPer100g, sugar: 11 }
  };
  const drinkAssess = run(milkDrink, PROFILE_NO_ALLERGY, 300);
  check('含白砂糖的调味乳不豁免，判为橙色/黄色',
    drinkAssess.level === 'orange' || drinkAssess.level === 'yellow', `实际 ${drinkAssess.level}`);
  // 灰色：模糊照片
  const blurry = SAMPLE_CASES.find((c) => c.id === 'blurry-photo');
  const gray = run(blurry);
  check('模糊照片 → 灰色', gray.level === 'gray', `实际 ${gray.level}`);
  check('灰色不给结论，只请补拍', gray.headline.includes('再拍'), gray.headline);
  check('灰色结果里没有营养判断', gray.nutrients.length === 0);

  // 缺失两个新国标强制项也应判灰（GB 28050-2025 的「糖」「饱和脂肪」）
  const missingSugar = labelFromCase({
    ...SAMPLE_CASES.find((c) => c.id === 'plain-milk'),
    nutritionPer100g: {
      energy: 268, protein: 3.2, fat: 3.6, carbohydrate: 4.8, sodium: 55
      // 故意不提供 saturatedFat 与 sugar
    },
    confidence: { energy: 0.9, protein: 0.9, fat: 0.9, carbohydrate: 0.9, sodium: 0.9 }
  });
  const missing = evaluate({
    label: missingSugar,
    profile: PROFILE_BASE,
    consumedToday: { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0 },
    servingGrams: 100
  });
  check('缺「糖」「饱和脂肪」两项强制标示 → 灰色', missing.level === 'gray', `实际 ${missing.level}`);

  // 只缺一项时不阻断结论，但必须在依据里说明
  const missingOne = labelFromCase({
    ...SAMPLE_CASES.find((c) => c.id === 'plain-milk'),
    nutritionPer100g: {
      energy: 268, protein: 3.2, fat: 3.6, carbohydrate: 4.8, sodium: 55, saturatedFat: 2.3
      // 只缺 sugar
    },
    confidence: { energy: 0.9, protein: 0.9, fat: 0.9, carbohydrate: 0.9, sodium: 0.9, saturatedFat: 0.9 }
  });
  const soft = evaluate({
    label: missingOne,
    profile: PROFILE_NO_ALLERGY,
    consumedToday: { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0 },
    servingGrams: 100
  });
  check('只缺「糖」一项时不判灰', soft.level !== 'gray', `实际 ${soft.level}`);
  check('只缺一项时依据里如实说明',
    soft.basis.some((b) => b.lines.some((l) => l.includes('糖') && l.includes('没有读到'))));
}

/** 按品名推断「一份」的克数，与演示通道保持一致 */
function servingOf(testCase) {
  const text = `${testCase.productName}${testCase.netContent || ''}`;
  if (/饮料|果汁|茶|水|奶|乳/.test(text)) {
    const ml = text.match(/(\d{3,4})\s*(mL|ml|毫升)/);
    return ml ? Number(ml[1]) : 250;
  }
  if (/饼干|酥|糖|巧克力|糕点|薯片/.test(text)) return 50;
  if (/面|米|粉/.test(text)) return 50;
  if (/肠|火腿|肉/.test(text)) return 60;
  return 100;}

/* ------------------------------------------------------------------ 4 */

group('四、一句话结论（输出人话，不是数据）');
{
  const red = run(SAMPLE_CASES.find((c) => c.id === 'peanut-cookie'));
  check('红色结论点名具体过敏原', red.headline.includes('花生'), red.headline);
  check('红色结论口语化为「别吃」', red.headline.includes('别吃'), red.headline);
  check('红色结论不含专业术语（如 Arachis）', !/Arachis|致敏物质|置信度/.test(red.headline));

  const orange = run(SAMPLE_CASES.find((c) => c.id === 'sugar-drink'), PROFILE_NO_ALLERGY, 500);
  check('橙色结论说清「甜」', /甜/.test(orange.headline), orange.headline);
  check('橙色结论给出量级（百分比或倍数）', /%|一整天的量|倍/.test(orange.headline), orange.headline);
  for (const awkward of ['限额的 一整天的量', '限额的 两倍', '限额的 3 倍']) {
    check(`橙色结论不出现别扭句式「${awkward}」`, !orange.headline.includes(awkward), orange.headline);
  }

  const yellow = run(SAMPLE_CASES.find((c) => c.id === 'spinach-noodle'), PROFILE_BASE);
  check('黄色结论给出可执行建议', yellow.advice.length > 10, yellow.advice);

  check('每条结论都有可展开的依据', Array.isArray(red.basis) && red.basis.length >= 3);
  check('依据里明确区分「规则判定」与「模型推测」',
    red.basis.some((b) => b.kind === 'rule') && red.basis.some((b) => b.kind === 'model'));
  check('依据来源可追溯到具体标准',
    red.basis.some((b) => /GB 7718-2025/.test(b.source)), red.basis.map((b) => b.source).join(' | '));
  check('风险等级四重编码齐备（颜色/文字/图标/语音）',
    ['red', 'orange', 'yellow', 'green', 'gray'].every(
      (k) => RISK_LEVELS[k] && RISK_LEVELS[k].label && RISK_LEVELS[k].text && RISK_LEVELS[k].emoji && RISK_LEVELS[k].speechLead
    ));
}

/* ------------------------------------------------------------------ 5 */

group('五、标签文本解析（OCR 兜底通道）');
{
  const rawText = [
    '产品名称：全麦消化饼干',
    '净含量：200 g',
    '配料：全麦粉、小麦粉、白砂糖、植物油、碳酸氢钠、食用盐、大豆磷脂',
    '致敏物质提示：含有小麦、大豆',
    '营养成分表',
    '项目 每 100 g',
    '能量 1950 kJ',
    '蛋白质 7.5 g',
    '脂肪 20.0 g',
    '饱和脂肪 9.5 g',
    '碳水化合物 65.0 g',
    '糖 18.0 g',
    '钠 280 mg'
  ].join('\n');

  const nutrition = parseNutrition(rawText);
  check('解析出能量 1950 kJ', nutrition.per100g.energy === 1950, String(nutrition.per100g.energy));
  check('解析出饱和脂肪 9.5 g（不会误取脂肪）', nutrition.per100g.saturatedFat === 9.5, String(nutrition.per100g.saturatedFat));
  check('解析出糖 18.0 g（不会误取碳水化合物）', nutrition.per100g.sugar === 18, String(nutrition.per100g.sugar));
  check('解析出钠 280 mg', nutrition.per100g.sodium === 280, String(nutrition.per100g.sodium));
  check('识别出「每 100 g」口径', nutrition.declaredPer === 'per100g');

  const parsed = parseLabelText(rawText);
  check('抽出产品名称', parsed.productName === '全麦消化饼干', parsed.productName);
  check('抽出配料表区段', parsed.ingredientText.includes('全麦粉') && !parsed.ingredientText.includes('营养成分表'));
  check('抽出致敏物质提示', parsed.allergenDeclaration === '含有小麦、大豆', parsed.allergenDeclaration);
  check('抽出净含量', parsed.netContent === '200 g', parsed.netContent);
  check('配料表切分出行号', parsed.ingredientLines.length >= 2);
  check('解析结果可直接送进规则层（命中大豆）',
    matchAllergens(parsed).map((h) => h.allergenId).includes('soy'));

  // 每份口径
  const perServing = parseNutrition('项目 每份\n钠 400 mg\n糖 12 g');
  check('识别出「每份」口径', perServing.declaredPer === 'perServing');
  check('每份口径下仍能取到钠 400', perServing.per100g.sodium === 400);
}

/* ---------------------------------------------------------------- 结果 */

console.log(`\n${'─'.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  · ${f.name}${f.detail ? `　→ ${f.detail}` : ''}`);
  process.exitCode = 1;
} else {
  console.log('规则层与解析层自测全部通过。');
}
