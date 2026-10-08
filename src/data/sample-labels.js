/**
 * 内置演示用例（离线兜底数据）
 *
 * 用途有两种：
 *  1. 答辩或路演现场网络不稳定时，不依赖任何接口即可走完整条闭环（见方案 8. 风险与应对）；
 *  2. 作为规则引擎的回归测试样本，覆盖红色／橙色／黄色／绿色／灰色五种分级。
 *
 * 所有配料表与营养数据均为「演示构造数据」，仅用于功能演示，
 * 不代表任何真实商品的标示内容。
 */

/**
 * @typedef {Object} LabelCase
 * @property {string} id
 * @property {string} emoji
 * @property {string} productName
 * @property {string} netContent
 * @property {string} ingredientText
 * @property {Record<string, number|null>} nutritionPer100g
 * @property {string} [allergenDeclaration] 包装上的致敏物质提示原文
 * @property {Record<string, number>} confidence 字段置信度
 * @property {string} note
 * @property {string} [expectLevel] 预期风险等级：在「只关注营养、没有过敏」的画像下的判定结果
 * @property {string|null} [expectLevelWithAllergy] 预期风险等级：在「同时对该成分过敏」的画像下的判定结果
 */

/** @type {LabelCase[]} */
export const SAMPLE_CASES = [
  {
    id: 'peanut-cookie',
    emoji: '🍪',
    productName: '浓香花生酥饼干',
    netContent: '净含量 200 g（内含 10 包）',
    ingredientText:
      '配料：小麦粉、白砂糖、花生仁（12%）、植物油、鸡蛋、食用盐、乳粉、' +
      '食品添加剂（碳酸氢钠、INS 322 卵磷脂、INS 330 柠檬酸）、食用香精。' +
      '致敏物质提示：含有小麦、花生、蛋类、乳制品，可能含有坚果。',
    allergenDeclaration: '含有小麦、花生、蛋类、乳制品，可能含有坚果',
    nutritionPer100g: {
      energy: 2080,
      protein: 7.2,
      fat: 24.5,
      saturatedFat: 9.8,
      carbohydrate: 62.3,
      sugar: 28.5,
      sodium: 320
    },
    confidence: {
      energy: 0.95, protein: 0.93, fat: 0.94, saturatedFat: 0.86,
      carbohydrate: 0.94, sugar: 0.9, sodium: 0.93
    },
    note: '典型「配料表里有花生」的用例：花生在配料表第 3 位，包装也已强制标示致敏物质。对花生过敏的用户判为红色。',
    expectLevel: 'orange',
    expectLevelWithAllergy: 'red'
  },
  {
    id: 'sugar-drink',
    emoji: '🧃',
    productName: '蜜桃味果汁饮料',
    netContent: '净含量 500 mL',
    ingredientText:
      '配料：水、果葡糖浆、白砂糖、浓缩桃汁（5%）、食品添加剂（INS 330 柠檬酸、' +
      'INS 300 抗坏血酸、INS 955 三氯蔗糖）、食用香精、INS 202 山梨酸钾。',
    nutritionPer100g: {
      energy: 195,
      protein: 0,
      fat: 0,
      saturatedFat: 0,
      carbohydrate: 11.6,
      sugar: 11.4,
      sodium: 12
    },
    confidence: {
      energy: 0.96, protein: 0.94, fat: 0.94, saturatedFat: 0.8,
      carbohydrate: 0.95, sugar: 0.92, sodium: 0.95
    },
    note: '一瓶 500 mL 含糖约 57 g，对控糖用户是橙色用例：糖的来源是果葡糖浆+白砂糖。',
    expectLevel: 'orange'
  },
  {
    id: 'spinach-noodle',
    emoji: '🍜',
    productName: '菠菜挂面',
    netContent: '净含量 900 g',
    ingredientText: '配料：小麦粉、水、菠菜粉（2%）、食用盐。',
    nutritionPer100g: {
      energy: 1450,
      protein: 11.4,
      fat: 1.1,
      saturatedFat: 0.3,
      carbohydrate: 71.6,
      sugar: 2.1,
      sodium: 1250
    },
    confidence: {
      energy: 0.96, protein: 0.95, fat: 0.94, saturatedFat: 0.82,
      carbohydrate: 0.95, sugar: 0.88, sodium: 0.94
    },
    note: '挂面本身不甜，但每 100 g 钠 1250 mg，是「隐形盐」的典型黄色用例。',
    expectLevel: 'yellow'
  },
  {
    id: 'plain-milk',
    emoji: '🥛',
    productName: '纯牛奶（超高温灭菌乳）',
    netContent: '净含量 250 mL',
    ingredientText: '配料：生牛乳。',
    nutritionPer100g: {
      energy: 268,
      protein: 3.2,
      fat: 3.6,
      saturatedFat: 2.3,
      carbohydrate: 4.8,
      sugar: 4.8,
      sodium: 55
    },
    confidence: {
      energy: 0.97, protein: 0.96, fat: 0.96, saturatedFat: 0.9,
      carbohydrate: 0.95, sugar: 0.9, sodium: 0.95
    },
    note: '干净的绿色用例：配料表只有生牛乳。对乳制品过敏的用户会在规则层变成红色，属预期行为。',
    expectLevel: 'green',
    expectLevelWithAllergy: 'red'
  },
  {
    id: 'blurry-photo',
    emoji: '🌫️',
    productName: '',
    netContent: '—',
    ingredientText: '',
    allergenDeclaration: '',
    nutritionPer100g: {
      energy: null, protein: null, fat: null, saturatedFat: null,
      carbohydrate: null, sugar: null, sodium: null
    },
    confidence: {
      energy: 0.31, protein: 0.28, fat: 0.3, saturatedFat: 0.12,
      carbohydrate: 0.33, sugar: 0.18, sodium: 0.26
    },
    note: '灰色用例：图片模糊、字段置信度不足时，系统要求补拍而不是编一个答案。',
    expectLevel: 'gray'
  },
  {
    id: 'sausage',
    emoji: '🌭',
    productName: '台式风味香肠',
    netContent: '净含量 260 g',
    ingredientText:
      '配料：猪肉、鸡肉、水、大豆蛋白、白砂糖、食用盐、食品添加剂' +
      '（INS 250 亚硝酸钠、INS 451 三聚磷酸钠、INS 621 谷氨酸钠、INS 316 异抗坏血酸钠）、' +
      '香辛料。致敏物质提示：含有大豆。',
    allergenDeclaration: '含有大豆',
    nutritionPer100g: {
      energy: 1180,
      protein: 14.2,
      fat: 21.5,
      saturatedFat: 8.6,
      carbohydrate: 6.4,
      sugar: 3.8,
      sodium: 980
    },
    confidence: {
      energy: 0.93, protein: 0.92, fat: 0.91, saturatedFat: 0.78,
      carbohydrate: 0.9, sugar: 0.72, sodium: 0.9
    },
    note: '含大豆蛋白与亚硝酸钠，适合演示「INS 编码翻译」与添加剂说明。',
    expectLevel: null
  }
];

export const SAMPLE_BY_ID = new Map(SAMPLE_CASES.map((c) => [c.id, c]));
