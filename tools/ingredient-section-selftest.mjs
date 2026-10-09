/**
 * 配料区段定位的回归测试。
 *
 * 这些用例全部来自真实失败（葡萄汁那瓶「营养表在上、配料表在下」）
 * 与 OCR 常见错字，用来锁住「不要把营养表当成配料」这条底线。
 *
 * 运行：node tools/ingredient-section-selftest.mjs
 */
import { extractIngredientSection, findIngredientHeading, parseLabelText } from '../src/recognize/parse-label.js';

let pass = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? `　→ ${detail}` : ''}`);
  }
}

console.log('配料区段定位（真实失败回归）\n');

/* ------------------------------------------------------------------
   1. 营养表在上、配料表在下 —— 这是葡萄汁那瓶的真实排版
   ------------------------------------------------------------------ */
console.log('一、营养表排在前面的排版');
{
  const text = [
    '营养成分表',
    '项目 每100毫升',
    '能量 194千焦',
    '蛋白质 0克',
    '脂肪 0克',
    '碳水化合物 11.4克',
    '钠 8毫克',
    '产品类型：果汁饮料',
    '配料表：水、葡萄浓缩汁',
    '产品标准号：GB/T 31121'
  ].join('\n');

  const section = extractIngredientSection(text);
  check('配料区段不包含「营养成分表」', !section.includes('营养成分'), section.slice(0, 60));
  check('配料区段不包含能量数值', !section.includes('194'), section.slice(0, 60));
  check('配料区段不包含产品类型', !section.includes('产品类型'), section.slice(0, 60));
  check('配料区段从「配料表」开始', section.startsWith('配料表'), section.slice(0, 30));
  check('配料区段包含水与葡萄浓缩汁', section.includes('水') && section.includes('葡萄浓缩汁'), section);
  check('产品标准号没有被算进配料', !section.includes('GB/T'), section);

  const label = parseLabelText(text);
  check('解析结果配料为「水、葡萄浓缩汁」',
    label.ingredientText.includes('水、葡萄浓缩汁'), label.ingredientText);
  check('解析结果配料不含营养项目名',
    !/能量|蛋白质|碳水化合物/.test(label.ingredientText), label.ingredientText);
}

/* ------------------------------------------------------------------
   2. 配料表在前、营养表在后 —— 正常排版不能被改坏
   ------------------------------------------------------------------ */
console.log('\n二、常规排版（配料在前）');
{
  const text = [
    '配料表：小麦粉、白砂糖、花生仁、植物油、鸡蛋',
    '致敏物质提示：含有小麦、花生、蛋类',
    '营养成分表',
    '能量 2080千焦'
  ].join('\n');

  const section = extractIngredientSection(text);
  check('配料区段以「配料表」开头', section.startsWith('配料表'), section);
  check('配料区段在「致敏物质」处结束', !section.includes('致敏物质提示'), section);
  check('配料区段不含营养成分表', !section.includes('营养成分表'), section);
  check('配料区段保留全部五种配料',
    ['小麦粉', '白砂糖', '花生仁', '植物油', '鸡蛋'].every((x) => section.includes(x)), section);
}

/* ------------------------------------------------------------------
   3. OCR 错字标题
   ------------------------------------------------------------------ */
console.log('\n三、OCR 错字标题');
{
  const cases = [
    ['配科表：水、葡萄浓缩汁', '配科表'],
    ['妃 料 表: 水,区区沁缩。', '妃料表'],
    ['配料：水、白砂糖', '配料']
  ];
  for (const [text, expected] of cases) {
    const heading = findIngredientHeading(text);
    check(`「${text.slice(0, 14)}…」能定位到标题「${expected}」`,
      heading !== null && heading.heading.replace(/\s/g, '') === expected.replace(/\s/g, ''),
      heading ? `实际「${heading.heading}」` : '没找到');
  }
}

/* ------------------------------------------------------------------
   4. 只有「成分」两个字的情况（兜底分支）
   ------------------------------------------------------------------ */
console.log('\n四、只写「成分」的兜底');
{
  const onlyIngredient = '成分配料：水、白砂糖';
  const heading = findIngredientHeading(onlyIngredient);
  check('孤立「成分」可作为兜底标题', heading !== null, heading ? heading.heading : '没找到');

  const nutritionFirst = '营养成分表\n能量 100千焦';
  const none = findIngredientHeading(nutritionFirst);
  check('营养表里的「成分」不会被当成配料标题', none === null, none ? none.heading : '');
}

/* ------------------------------------------------------------------
   5. 完全没有配料标题 —— 必须返回空，不能猜
   ------------------------------------------------------------------ */
console.log('\n五、没有配料标题时');
{
  const label = parseLabelText('营养成分表\n能量 194千焦\n钠 8毫克');
  check('配料文本为空', label.ingredientText === '', label.ingredientText);
  check('配料行为空', label.ingredientLines.length === 0, String(label.ingredientLines.length));
}

console.log(`\n${'─'.repeat(56)}`);
console.log(`通过 ${pass} 项，失败 ${failures.length} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const name of failures) console.log(`  · ${name}`);
  process.exitCode = 1;
} else {
  console.log('配料区段定位全部通过。');
}
