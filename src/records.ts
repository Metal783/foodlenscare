import type { SessionKind } from "./Onboarding";
import { snapshot } from "./backend";
import { detectedAllergens } from "./recognition";
import { analysisSummary } from "./analysisCopy";
import { recordNeedsAttention } from './recordStatus';
export type RecognitionRecord = { id: string; account: string; foodName: string; recognizedAt: string; photo: string; ingredients: string[]; allergens?: string[]; netContent?: string | null; meal?: string; reference: string; referenceNote?: string; attention?: boolean; demoRecognition: boolean; healthSnapshot?: { diseases: string[]; allergens: string[] }; raw?: any };
export function recordAccount(_session: SessionKind, _phone: string) { return snapshot().account?.id || "guest"; }
export function toFrontRecord(record: any): RecognitionRecord {
  const titles: Record<string, string> = { not_recommended: '不建议食用', caution: '建议谨慎食用', moderate: '可考虑适量食用', unknown: '暂无法判断是否适合食用' };
  const analysis = record.aiAnalysis;
  return { id: record.id, account: snapshot().account?.id || "guest", foodName: record.productName || record.label?.productName || "未读清标签", recognizedAt: record.at, photo: record.photoDataUrl || "/assets/dd0c1.png", ingredients: record.label?.ingredientText ? [record.label.ingredientText] : [], allergens: record.label?.allergenDeclaration ? [record.label.allergenDeclaration] : detectedAllergens(record.label || {}), netContent: record.label?.netContent, meal: record.meal,
    reference: titles[analysis?.recommendation] || record.assessment?.headline || "待核对",
    referenceNote: analysis ? analysisSummary(analysis) : record.assessment?.advice || '该记录未保存智能分析。',
    attention: recordNeedsAttention(record),
    demoRecognition: record.origin === "demo", healthSnapshot: record.profileSnapshot?.diseases ? { diseases: record.profileSnapshot.diseases, allergens: record.profileSnapshot.allergens || [] } : undefined, raw: record };
}
export function readRecognitionRecords(_session: SessionKind, _phone: string) { return snapshot().ownRecords.filter(r => r.origin !== "demo").map(toFrontRecord).sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime()); }
