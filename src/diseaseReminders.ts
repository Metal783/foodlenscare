export type DiseaseReminder = { condition: string; title: string; message: string };

// 只展示本人资料关联的关注项和标签证据；未核对的OCR数值不用于摄入计算。
export function diseaseReminders(label: any, conditions: string[]): DiseaseReminder[] {
  const evidence = (key: string, name: string, unit: string) => {
    const candidate = label.nutritionCandidates?.[key];
    const value = label.nutritionConfirmed ? label.nutritionPer100g?.[key] : candidate?.value;
    const reliable = label.nutritionConfirmed || (candidate && !candidate.conflict && candidate.confidence >= .7 && label.servingUnit);
    if (reliable && typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return `${label.nutritionConfirmed ? "已核对" : "OCR候选，尚未核对"}：${label.servingLabel || "每100克/毫升"}${name}${value}${unit}。`;
    }
    return `${name}含量未确认，不能按零${name}处理。`;
  };
  const result: DiseaseReminder[] = [];
  if (conditions.includes("diabetes")) {
    const hit = String(label.ingredientText || "").match(/白砂糖|绵白糖|蔗糖|果葡糖浆|葡萄糖浆|麦芽糖浆|蜂蜜/);
    result.push({ condition: "diabetes", title: "糖尿病 · 糖份与碳水提醒", message: `${hit ? `识别配料疑似含「${hit[0]}」，请核对包装。` : "请核对配料中的糖类及营养表。"}${evidence("sugar", "糖", "克")}${evidence("carbohydrate", "碳水化合物", "克")}本次没有填写实际食用份量，不能据此计算摄入量或判断血糖变化。` });
  }
  if (conditions.includes("hypertension")) result.push({ condition: "hypertension", title: "高血压 · 钠含量提醒", message: `${evidence("sodium", "钠", "毫克")}请核对营养表口径和实际食用份量；本次不判断血压变化。` });
  if (conditions.includes("hyperlipidemia")) result.push({ condition: "hyperlipidemia", title: "高血脂 · 脂肪提醒", message: `${evidence("fat", "脂肪", "克")}${evidence("saturatedFat", "饱和脂肪", "克")}请结合完整包装和实际份量核对。` });
  if (conditions.includes("coronary")) result.push({ condition: "coronary", title: "冠心病 · 饮食信息提醒", message: "请核对包装中的钠和脂肪信息，并遵循本人已有的饮食安排；标签识别不能判断病情或替代医生建议。" });
  return result;
}
