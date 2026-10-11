import { recognizePhoto, recognizeDemoCase } from "./legacy/recognize/index.js";
import { evaluate, matchAllergens } from "./legacy/core/rules.js";
import { snapshot, dateKey } from "./backend";
import type { ElderDraft } from "./Onboarding";
import { diseaseReminders } from "./diseaseReminders";

export function ruleProfile(elder: ElderDraft) {
  const allergens: Record<string, string> = { "花生": "peanut", "坚果": "nut", "牛奶": "milk", "乳制品": "milk", "鸡蛋": "egg", "大豆": "soy", "小麦": "gluten", "鱼类": "fish", "虾蟹": "crustacean", "蟹黄": "crustacean", "无": "none" };
  const conditions: Record<string, string> = { "高血压": "hypertension", "糖尿病": "diabetes", "高血脂": "hyperlipidemia", "冠心病": "coronary", "无": "none" };
  return { allergens: [...new Set(elder.allergens.map(s => allergens[s]).filter(Boolean))], conditions: elder.diseases.map(s => conditions[s]).filter(Boolean), concerns: [], ageGroup: Number(elder.age) >= 80 ? "age80" : Number(elder.age) >= 70 ? "age70" : "age60", voiceOn: false };
}
export function assess(label: any, elder: ElderDraft) {
  const consumed: any = { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0, unknown: { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0 } };
  for (const record of snapshot().ownRecords) {
    const c = record.consumption;
    if (!c?.consumptionConfirmed || dateKey(c.at) !== dateKey()) continue;
    for (const key of ["sodium", "sugar", "saturatedFat", "fat"]) { if (c.nutrients?.[key] == null) consumed.unknown[key]++; else consumed[key] += c.nutrients[key]; }
  }
  const profile = ruleProfile(elder);
  const assessment = (evaluate as any)({ label, profile, consumedToday: consumed, servingGrams: Number(label.servingGrams) || 100 });
  return { ...assessment, diseaseReminders: diseaseReminders(label, profile.conditions) };
}
export async function preparePhoto(dataUrl: string, signal: AbortSignal) {
  const blob = await (await fetch(dataUrl, { signal })).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const compressed = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("照片压缩失败，请重试。")), "image/jpeg", .88));
  return { blob: compressed, photoDataUrl: canvas.toDataURL("image/jpeg", .88) };
}
export async function runRecognition(photo: string, elder: ElderDraft, signal: AbortSignal, onProgress: (text: string) => void, demo: boolean) {
  const prepared = await preparePhoto(photo, signal);
  const outcome = demo ? await recognizeDemoCase("spinach-noodle") : await (recognizePhoto as any)({ file: prepared.blob, signal, onProgress: (progress: any) => onProgress(progress.text) });
  if (signal.aborted) throw new DOMException("识别已取消", "AbortError");
  const label: any = outcome.label;
  return { id: crypto.randomUUID(), at: new Date().toISOString(), productName: label.productName || "未读清标签", label, assessment: assess(label, elder), photoDataUrl: prepared.photoDataUrl, profileSnapshot: { ...ruleProfile(elder), name: elder.name, diseases: elder.diseases, allergens: elder.allergens }, origin: demo ? "demo" : "album", meal: "", quality: outcome.quality };
}
export function detectedAllergens(label: any) { return (matchAllergens(label) as any[]).map((hit: any) => hit.short || hit.allergen?.short || hit.allergenId); }
