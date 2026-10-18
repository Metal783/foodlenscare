import { useEffect, useRef, useState } from 'react';
import { api, snapshot } from './backend';
import { analysisSections, type NutritionInsight } from './analysisCopy';
import { analysisInput } from './analysisInput';

export const ANALYSIS_CONSENT = 'deepseek-v1';
export type AIAnalysis = { provider: string; model: string; generatedAt: string; summary: string; considerations: string[]; uncertainties: string[]; recommendation?: 'not_recommended' | 'caution' | 'moderate' | 'unknown'; safetyOverride?: boolean; formatVersion?: number; nutritionAnalysis?: NutritionInsight[] };
const titles = { not_recommended: '不建议食用', caution: '建议谨慎食用', moderate: '可考虑适量食用', unknown: '暂无法判断是否适合食用' };

export function analysisStyle(recommendation?: AIAnalysis['recommendation']) {
  return recommendation === 'not_recommended' ? { background: '#fff0f0', color: '#8c1f1f', border: '1px solid #e7b4b4' } : recommendation === 'caution' ? { background: '#fff5e5', color: '#73470f' } : undefined;
}

export function AnalysisText({ analysis }: { analysis?: AIAnalysis }) {
  if (!analysis) return null;
  const sections = analysisSections(analysis);
  const headingStyle = { marginTop: 16, marginBottom: 6, fontWeight: 700 };
  return <div>
    <h3>{analysis.recommendation ? titles[analysis.recommendation] : '食用建议'}</h3>
    {(sections.reason || analysis.formatVersion === 2) && <div><h4 style={headingStyle}>关键原因</h4><p className="result-large">{sections.reason || '本次未提供可用的关键原因。'}</p></div>}
    {analysis.formatVersion === 2 && <div><h4 style={headingStyle}>具体建议</h4>{sections.suggestions.length ? sections.suggestions.map((text, index) => <p key={index}>{text}</p>) : <p>本次未生成进一步建议。</p>}</div>}
    {sections.nutrition.length > 0 && <div><h4 style={headingStyle}>相关营养分析</h4>{sections.nutrition.map(item => <div key={item.nutrient}>
      <p>{item.basis}含{item.label} {item.value} {item.unit}</p><p>{item.explanation}</p>
    </div>)}</div>}
    {sections.missing.length > 0 && <div><h4 style={headingStyle}>信息不足说明</h4>{sections.missing.map((text, index) => <p key={index}>{text}</p>)}</div>}
  </div>;
}

export default function SmartAnalysis({ record, onAnalysis, onBusy }: { record: any; onAnalysis: (value: AIAnalysis) => void; onBusy: (value: boolean) => void }) {
  const [message, setMessage] = useState('正在结合您的身体状况分析…');
  const [phase, setPhase] = useState<'loading' | 'busy' | 'done' | 'error' | 'off'>('loading');
  const [retryAt, setRetryAt] = useState(0);
  const [retryWait, setRetryWait] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const owner = useRef(snapshot().account?.id);
  const localBlock = record.assessment?.level === 'red';
  const allergyReason = String(record.assessment?.headline || '存在本人过敏原线索。')
    .replace('识别文字疑似含有您过敏的', '配料中存在您的过敏原线索：')
    .replace(/，请先别吃并核对包装[。]?/, '。');

  const start = async (token: number, signal: AbortSignal) => {
    if (record.origin === 'demo' || !owner.current) {
      setPhase('off'); setMessage(record.origin === 'demo' ? '演示图片不进行在线分析。' : '登录老人账号后可使用智能分析。'); return;
    }
    let timeout: number | undefined;
    try {
      onBusy(true);
      if (snapshot().account?.prefs.smartAnalysisConsent !== ANALYSIS_CONSENT) {
        setPhase('off'); setMessage('自动智能分析尚未开启。'); return;
      }
      timeout = window.setTimeout(() => controller.current?.abort(), 60000);
      const availability = await api('/analysis/status', { signal, timeoutMs: 15000 });
      if (signal.aborted || generation.current !== token) return;
      if (!availability.configured) { setPhase('error'); setMessage('智能分析服务尚未配置。'); return; }
      setPhase('busy'); setMessage('正在结合您的身体状况分析…');
      setRetryAt(Date.now() + 10000);
      let analysis: AIAnalysis;
        ({ analysis } = await api('/analysis', { method: 'POST', signal, timeoutMs: 60000, body: {
          consent: true, automatic: true,
          label: analysisInput(record.label),
        } }));
      if (signal.aborted || generation.current !== token || snapshot().account?.id !== owner.current) return;
      // A model answer must not override a detected personal allergen.
      if (localBlock && analysis.recommendation !== 'not_recommended') analysis = { ...analysis, recommendation: 'not_recommended', safetyOverride: true, formatVersion: 2, summary: allergyReason, considerations: ['请选择不含您已填写过敏原的同类食品。'], nutritionAnalysis: [], uncertainties: [] };
      onAnalysis(analysis); setPhase('done'); setMessage('');
    } catch (error) {
      if (generation.current !== token) return;
      setPhase('error'); setMessage(signal.aborted || (error as Error).name === 'TimeoutError' ? '分析等待超时，您可以重试。' : (error as Error).message);
    } finally { window.clearTimeout(timeout); if (generation.current === token) onBusy(false); }
  };

  const retry = () => {
    controller.current?.abort();
    setPhase('loading'); setMessage('正在连接分析服务…');
    const next = new AbortController(); controller.current = next;
    const token = ++generation.current;
    void start(token, next.signal);
  };
  useEffect(() => {
    if (record.aiAnalysis) { setPhase('done'); setMessage(''); }
    else retry();
    return () => { generation.current++; controller.current?.abort(); onBusy(false); };
  }, []);
  useEffect(() => {
    const update = () => setRetryWait(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (phase !== 'error' || retryAt <= Date.now()) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [phase, retryAt]);

  const recommendation = localBlock ? 'not_recommended' : record.aiAnalysis?.recommendation || 'unknown';
  return <section className="recognition-card" aria-label="食用建议" aria-busy={phase === 'busy' || phase === 'loading'} style={analysisStyle(recommendation)}>
    {record.aiAnalysis ? <AnalysisText analysis={record.aiAnalysis} /> : <>
      <h3>{localBlock ? titles.not_recommended : phase === 'busy' || phase === 'loading' ? '正在分析食用建议' : phase === 'error' ? '智能分析暂未完成' : '智能食用建议'}</h3>
      {localBlock && <p className="result-large">{allergyReason}</p>}
    </>}
    {message && <p role="status">{message}</p>}
    {phase === 'error' && <button className="recognition-secondary" type="button" disabled={retryWait > 0} onClick={retry}>{retryWait > 0 ? `重试分析（${retryWait}秒）` : '重试分析'}</button>}
    <small>饮食建议仅供参考，不替代医疗诊断。</small>
  </section>;
}
