export type NutritionInsight = { nutrient: string; label: string; condition: string; value: number; unit: string; basis: string; explanation: string };
type AnalysisCopy = { summary?: string; considerations?: string[]; uncertainties?: string[]; formatVersion?: number; nutritionAnalysis?: NutritionInsight[] };
const keyOf = (text: string) => text.normalize('NFKC').replace(/[^\p{L}\p{N}.%/+−-]/gu, '');
const headings = new Set(['不建议食用', '建议谨慎食用', '可考虑适量食用', '暂无法判断是否适合食用']);

export function analysisSummary(analysis: AnalysisCopy): string {
  // Display the primary explanation only; retain full provider output in the record.
  const sources = [analysis.summary || '', ...(analysis.considerations || []), ...(analysis.uncertainties || [])];
  for (const source of sources) {
    const seen = new Set<string>();
    const sentences = (source.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || []).map(text => text.trim()).filter(text => {
      const key = keyOf(text);
      if (!key || headings.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (sentences.length) return sentences.join('');
  }
  return '';
}

export function analysisSections(analysis: AnalysisCopy) {
  const seen = new Set<string>();
  const clean = (source: string) => (source.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || []).map(text => text.trim()).filter(text => {
    const key = keyOf(text);
    if (!key || headings.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('');
  const reason = clean(analysisSummary(analysis));
  if (analysis.formatVersion !== 2) return { reason, suggestions: [], nutrition: [], missing: [] };
  const suggestions = (analysis.considerations || []).map(clean).filter(Boolean);
  const nutrition = (analysis.nutritionAnalysis || []).filter(item => Number.isFinite(item.value)).map(item => ({ ...item, explanation: clean(item.explanation) })).filter(item => item.explanation);
  const missing = (analysis.uncertainties || []).map(clean).filter(Boolean);
  return { reason, suggestions, nutrition, missing };
}

export function analysisSpeech(analysis: AnalysisCopy & { recommendation?: string }) {
  const sections = analysisSections(analysis);
  const title = { not_recommended: '不建议食用', caution: '建议谨慎食用', moderate: '可考虑适量食用', unknown: '暂无法判断是否适合食用' }[analysis.recommendation || ''];
  return [title, sections.reason,
    ...(sections.suggestions.length ? ['具体建议', ...sections.suggestions] : []),
    ...(sections.nutrition.length ? ['相关营养分析', ...sections.nutrition.map(item => `${item.basis}${item.label}${item.value}${item.unit}。${item.explanation}`)] : []),
    ...(sections.missing.length ? ['信息不足说明', ...sections.missing] : []),
  ].filter(Boolean).join('。');
}
