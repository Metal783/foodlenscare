/** The same attention rule drives both accounts' cards, filters and statistics. */
export function recordNeedsAttention(record: any): boolean {
  if (record.assessment?.level === 'red') return true;
  const recommendation = record.aiAnalysis?.recommendation;
  return recommendation ? recommendation !== 'moderate' : record.assessment?.level !== 'green';
}
