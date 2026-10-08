/**
 * 食品添加剂对照表（GB 2760 常见品种 + INS 国际编码）
 * 用途：还原小包装标签上以 INS 号表示的添加剂，让老人看得懂「E 编码」是什么。
 * 本表只做「名词翻译」，不参与风险分级判定——是否安全由剂量与个人状况决定，
 * 本作品不代替营养师结论（见方案第十章边界声明）。
 */

/**
 * @typedef {{ins:string,name:string,alias?:string,use:string}} Additive
 */

/** @type {Additive[]} */
export const ADDITIVES = [
  { ins: 'INS 102', name: '柠檬黄', use: '着色剂' },
  { ins: 'INS 110', name: '日落黄', use: '着色剂' },
  { ins: 'INS 122', name: '偶氮玉红', alias: '苋菜红', use: '着色剂' },
  { ins: 'INS 124', name: '胭脂红', use: '着色剂' },
  { ins: 'INS 129', name: '诱惑红', use: '着色剂' },
  { ins: 'INS 133', name: '亮蓝', use: '着色剂' },
  { ins: 'INS 150d', name: '焦糖色（亚硫酸铵法）', alias: '焦糖色', use: '着色剂' },
  { ins: 'INS 160a', name: 'β-胡萝卜素', use: '着色剂' },
  { ins: 'INS 171', name: '二氧化钛', use: '着色剂' },
  { ins: 'INS 200', name: '山梨酸', use: '防腐剂' },
  { ins: 'INS 202', name: '山梨酸钾', use: '防腐剂' },
  { ins: 'INS 210', name: '苯甲酸', use: '防腐剂' },
  { ins: 'INS 211', name: '苯甲酸钠', use: '防腐剂' },
  { ins: 'INS 223', name: '焦亚硫酸钠', use: '防腐剂／漂白剂' },
  { ins: 'INS 250', name: '亚硝酸钠', use: '护色剂' },
  { ins: 'INS 251', name: '硝酸钠', use: '护色剂' },
  { ins: 'INS 260', name: '乙酸', alias: '醋酸', use: '酸度调节剂' },
  { ins: 'INS 270', name: '乳酸', use: '酸度调节剂' },
  { ins: 'INS 296', name: '苹果酸', use: '酸度调节剂' },
  { ins: 'INS 300', name: '抗坏血酸', alias: '维生素C', use: '抗氧化剂' },
  { ins: 'INS 301', name: '抗坏血酸钠', use: '抗氧化剂' },
  { ins: 'INS 306', name: '混合生育酚', alias: '维生素E', use: '抗氧化剂' },
  { ins: 'INS 322', name: '卵磷脂', alias: '大豆卵磷脂', use: '乳化剂' },
  { ins: 'INS 330', name: '柠檬酸', use: '酸度调节剂' },
  { ins: 'INS 331', name: '柠檬酸钠', use: '酸度调节剂' },
  { ins: 'INS 338', name: '磷酸', use: '酸度调节剂' },
  { ins: 'INS 339', name: '磷酸钠', use: '水分保持剂' },
  { ins: 'INS 407', name: '卡拉胶', use: '增稠剂' },
  { ins: 'INS 412', name: '瓜尔胶', use: '增稠剂' },
  { ins: 'INS 415', name: '黄原胶', use: '增稠剂' },
  { ins: 'INS 418', name: '结冷胶', use: '增稠剂' },
  { ins: 'INS 420', name: '山梨糖醇', use: '甜味剂' },
  { ins: 'INS 421', name: '甘露糖醇', use: '甜味剂' },
  { ins: 'INS 440', name: '果胶', use: '增稠剂' },
  { ins: 'INS 466', name: '羧甲基纤维素钠', alias: 'CMC', use: '增稠剂' },
  { ins: 'INS 471', name: '单，双甘油脂肪酸酯', use: '乳化剂' },
  { ins: 'INS 481', name: '硬脂酰乳酸钠', use: '乳化剂' },
  { ins: 'INS 500', name: '碳酸钠', alias: '食用碱', use: '膨松剂' },
  { ins: 'INS 503', name: '碳酸铵', use: '膨松剂' },
  { ins: 'INS 507', name: '盐酸', use: '酸度调节剂' },
  { ins: 'INS 621', name: '谷氨酸钠', alias: '味精', use: '增味剂' },
  { ins: 'INS 627', name: '5’-呈味核苷酸二钠', use: '增味剂' },
  { ins: 'INS 631', name: '5’-肌苷酸二钠', use: '增味剂' },
  { ins: 'INS 951', name: '阿斯巴甜', use: '甜味剂' },
  { ins: 'INS 952', name: '环己基氨基磺酸钠', alias: '甜蜜素', use: '甜味剂' },
  { ins: 'INS 954', name: '糖精钠', use: '甜味剂' },
  { ins: 'INS 955', name: '三氯蔗糖', alias: '蔗糖素', use: '甜味剂' },
  { ins: 'INS 960', name: '甜菊糖苷', use: '甜味剂' },
  { ins: 'INS 968', name: '赤藓糖醇', use: '甜味剂' },
  { ins: 'INS 1520', name: '丙二醇', use: '水分保持剂' }
];

// 仅识别带前缀的编码写法（INS 621 / INS621 / E621 / E 621），避免把普通数字误判为添加剂
const INS_RE = /\b(?:INS|E)[\s\-]?(\d{3}[a-z]?)\b/gi;

/** 只按 INS 号建立索引（大小写不敏感） */
const BY_INS = new Map(
  ADDITIVES.map((a) => [a.ins.replace(/^INS\s*/i, '').toLowerCase(), a])
);

/**
 * 从配料表全文中找出所有以 INS/E 编码出现的添加剂，并翻译成中文名。
 * @param {string} text
 * @returns {{code:string,name:string,use:string,raw:string}[]}
 */
export function findAdditivesByCode(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = new Map();
  for (const match of text.matchAll(INS_RE)) {
    const code = match[1].toLowerCase();
    const hit = BY_INS.get(code);
    if (!hit) continue;
    if (found.has(code)) continue;
    found.set(code, {
      code: `INS ${match[1]}`,
      name: hit.name,
      use: hit.use,
      raw: match[0]
    });
  }
  return [...found.values()];
}

/**
 * 从配料表全文中找出以中文名／别名出现的添加剂。
 * @param {string} text
 */
export function findAdditivesByName(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = new Map();
  for (const additive of ADDITIVES) {
    const names = [additive.name, additive.alias].filter(Boolean);
    for (const name of names) {
      const idx = text.indexOf(name);
      if (idx < 0) continue;
      if (found.has(additive.ins)) break;
      found.set(additive.ins, {
        code: additive.ins,
        name: additive.name,
        use: additive.use,
        raw: name,
        offset: idx
      });
      break;
    }
  }
  return [...found.values()];
}

/**
 * 汇总配料表中的添加剂（编码优先，中文名补充）。
 * @param {string} text
 */
export function collectAdditives(text) {
  const byCode = findAdditivesByCode(text);
  const have = new Set(byCode.map((a) => a.code));
  const byName = findAdditivesByName(text).filter((a) => !have.has(a.code));
  return [...byCode, ...byName];
}
