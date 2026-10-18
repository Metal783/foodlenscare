import { useEffect, useRef, useState } from 'react';
import { api, snapshot, useBackend } from './backend';
import AssistantModal from './AssistantModal';
import useAssistantSpeech from './useAssistantSpeech';

type DaySummary = { date: string; count: number; readable: number };
type Summary = {
  days: number; periodStart: string; periodEnd: string; recordCount: number; dayCount: number;
  nameCount: number; readableCount: number; unreadableCount: number; undatedCount: number;
  sampleCount: number; sampleLimit: number;
  clues: { key: string; label: string; count: number }[];
  nutritionCoverage: Record<string, number>;
  dayBreakdown: DaySummary[];
};
type Result = { answer: string; observations: string[]; suggestions: string[]; questions: string[] };

const RANGES = [3, 7, 14];
const nutrientLabels: Record<string, string> = { energy: '能量', protein: '蛋白质', fat: '脂肪', carbohydrate: '碳水化合物', sugar: '糖', sodium: '钠' };

function DietDialog({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryAt, setRetryAt] = useState(0), [wait, setWait] = useState(0);
  const controller = useRef<AbortController | null>(null), generation = useRef(0), pending = useRef(false);
  const resultRef = useRef<HTMLElement>(null);
  const speech = useAssistantSpeech();

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [result]);

  const load = async () => {
    speech.stop(); setNotice(''); setError('');
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    const token = ++generation.current; pending.current = false;
    setBusy(false); setLoading(true); setSummary(null); setResult(null); setConsent(false);
    try {
      const response = await api(`/record-insights?elder=${encodeURIComponent(owner)}&days=${days}`, { signal: task.signal, timeoutMs: 20000 });
      if (!task.signal.aborted && generation.current === token) setSummary(response.summary);
    } catch (failure) {
      if (!task.signal.aborted && generation.current === token) setError((failure as Error).message);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { generation.current++; controller.current?.abort(); speech.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, owner]);

  useEffect(() => {
    const update = () => setWait(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update(); if (retryAt <= Date.now()) return;
    const timer = window.setInterval(update, 250); return () => window.clearInterval(timer);
  }, [retryAt]);

  const generate = async () => {
    if (pending.current || busy || !consent || !summary || summary.recordCount === 0 || wait) return;
    const actor = snapshot().account?.id, token = ++generation.current;
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    speech.stop(); pending.current = true; setBusy(true); setError(''); setNotice(''); setResult(null);
    try {
      const response = await api('/record-insights', { method: 'POST', signal: task.signal, timeoutMs: 60000,
        body: { elder: owner, mode: 'diet', days, consent: true } });
      if (task.signal.aborted || token !== generation.current || actor !== snapshot().account?.id) return;
      setSummary(response.summary); setResult(response.result); setRetryAt(Date.now() + 5000);
    } catch (failure) {
      if (!task.signal.aborted && token === generation.current) {
        if ((failure as any).status === 409) { await load(); setError('记录已变化，摘要已刷新，请重新生成。'); }
        else if ((failure as any).status === 429) { setRetryAt(Date.now() + 5000); setError((failure as Error).message); }
        else setError((failure as Error).name === 'TimeoutError' ? '整理等待超时，请稍后重试。' : (failure as Error).message);
      }
    } finally {
      if (token === generation.current) { pending.current = false; setBusy(false); }
    }
  };

  const cancel = () => {
    generation.current++; controller.current?.abort(); pending.current = false;
    setBusy(false); setRetryAt(Date.now() + 5000); setError('');
    setNotice('已取消本次等待，摘要仍可查看；已提交的AI请求可能仍在处理。');
  };

  const copy = async () => {
    if (!result) return;
    const text = [result.answer, ...result.observations, ...result.suggestions, ...result.questions].filter(Boolean).join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(text); setNotice('已复制分析小结。');
    } catch { setNotice('当前浏览器不能自动复制，请手动选择文字。'); }
  };

  const speechText = result ? [result.answer, ...result.observations, ...result.suggestions, ...result.questions].join('。') : '';
  const maxDay = Math.max(1, ...(summary?.dayBreakdown.map(day => day.count) || [1]));

  return <AssistantModal title="饮食观察分析" onClose={onClose}>
    <p>只根据老人已保存的识别记录整理。识别不等于实际食用，没有记录的天数也不代表没有吃。</p>
    <div role="group" aria-label="分析范围" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {RANGES.map(value => <button key={value} type="button" aria-pressed={days === value}
        className={days === value ? 'child-chip selected' : 'child-chip'}
        disabled={busy}
        onClick={() => { setDays(value); setResult(null); setConsent(false); setNotice(''); }}>近{value}天</button>)}
    </div>
    {loading && <p role="status">正在读取记录摘要…</p>}
    {summary && <section className="recognition-card" aria-label="记录摘要" style={{ padding: 16 }}>
      <p>{summary.periodStart} 至 {summary.periodEnd}（上海日期）</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 12 }}>
        <p><strong>{summary.recordCount}</strong> 条识别记录</p>
        <p><strong>{summary.dayCount}</strong> 天有记录</p>
        <p><strong>{summary.readableCount}</strong> 条配料可读</p>
        <p><strong>{summary.unreadableCount}</strong> 条待补拍</p>
      </div>
      <div aria-label="每日记录分布" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {summary.dayBreakdown.map(day => <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <span>{day.date.slice(5)}</span>
          <span style={{ height: 8, background: '#e9f5e8', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round(day.count / maxDay * 100)}%`, background: '#5aa469' }} />
          </span>
          <span style={{ textAlign: 'right', color: '#596359' }}>{day.count ? `${day.count}条` : '无记录'}</span>
        </div>)}
      </div>
      {summary.clues.map(item => <p key={item.key} style={{ marginTop: 8 }}>{item.label}：{item.count} 条标签出现</p>)}
      {summary.undatedCount > 0 && <p style={{ marginTop: 8 }}>另有{summary.undatedCount}条历史记录缺少有效日期，未计入本次范围。</p>}
      <details style={{ marginTop: 12 }}><summary>营养字段可读情况</summary>
        {Object.entries(summary.nutritionCoverage).map(([key, count]) => <p key={key}>{nutrientLabels[key] || key}：{count} 条标签有可用候选</p>)}
      </details>
      <small style={{ display: 'block', marginTop: 12 }}>统计覆盖范围内全部已保存记录，AI最多参考{summary.sampleLimit}条可读标签示例；本次{summary.sampleCount}条。配料出现不等于营养含量高，识别过也不等于吃过。</small>
    </section>}
    {!loading && !summary && <button className="recognition-secondary" type="button" onClick={() => void load()}>重试读取摘要</button>}
    {summary?.recordCount === 0 && <p role="status">这段时间没有已保存的识别记录，暂不能生成分析。可以先请老人补拍包装，或换一个时间范围。</p>}
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15 }}>
      <input type="checkbox" checked={consent} disabled={busy || !summary || summary.recordCount === 0} onChange={event => setConsent(event.target.checked)} />
      <span>同意将这段时间的食品记录摘要发送至DeepSeek，不包含疾病、过敏档案、照片或语音。</span>
    </label>
    <button className="primary-button" type="button"
      disabled={loading || busy || !consent || !summary || summary.recordCount === 0 || wait > 0}
      onClick={() => void generate()}>{busy ? '正在整理…' : wait > 0 ? `请稍候（${wait}秒）` : `生成${days}天饮食分析`}</button>
    {busy && <button className="recognition-secondary" type="button" onClick={cancel}>取消本次等待</button>}
    {result && <section ref={resultRef} className="recognition-card" aria-label="饮食分析结果" style={{ padding: 16 }}>
      <h3>总体观察</h3>
      <p style={{ fontSize: 18 }}>{result.answer}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button className="recognition-secondary" type="button" style={{ fontSize: 17 }}
          onClick={() => speech.toggle('diet', speechText)}>{speech.speaking === 'diet' ? '停止朗读' : '朗读分析'}</button>
        <button className="recognition-secondary" type="button" style={{ fontSize: 17 }} onClick={() => void copy()}>复制小结</button>
      </div>
      {result.observations.length > 0 && <><h3 style={{ marginTop: 14 }}>看到了什么</h3><ul style={{ marginTop: 6, paddingLeft: 20, listStyle: 'disc' }}>{result.observations.map(line => <li key={line} style={{ marginTop: 6 }}>{line}</li>)}</ul></>}
      {result.suggestions.length > 0 && <><h3 style={{ marginTop: 14 }}>家人可以做什么</h3><ul style={{ marginTop: 6, paddingLeft: 20, listStyle: 'disc' }}>{result.suggestions.map(line => <li key={line} style={{ marginTop: 6 }}>{line}</li>)}</ul></>}
      {result.questions.length > 0 && <><h3 style={{ marginTop: 14 }}>可以问问老人</h3><ul style={{ marginTop: 6, paddingLeft: 20, listStyle: 'disc' }}>{result.questions.map(line => <li key={line} style={{ marginTop: 6 }}>{line}</li>)}</ul></>}
      <small style={{ display: 'block', marginTop: 12 }}>这是根据识别记录整理的参考，不是诊断，也不代表实际吃过的食物；如有健康问题请咨询医生。</small>
    </section>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {speech.speechError && <p className="field-error" role="alert">{speech.speechError}</p>}
  </AssistantModal>;
}

export default function DietAnalysis({ elderId }: { elderId?: string }) {
  const data = useBackend();
  const [open, setOpen] = useState(false);
  const family = data.families.find(item => !item.amElder && item.status === 'bound' && item.member.id === elderId);
  const allowed = !!elderId && !!family?.records_allowed && !!family.member.familyAiAllowed;
  useEffect(() => { setOpen(false); }, [elderId]);
  if (data.account?.role !== 'child') return null;
  const reason = !elderId ? '请先绑定家人。' : !family?.records_allowed ? '请先由老人共享食物记录。' : '请先由老人在“我的设置”开启“允许家人AI整理记录”。';
  return <>
    <section className="child-card" aria-label="饮食观察分析">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 className="text-xl">饮食观察分析</h2>
        <span className="text-sm text-[#003e1c]">3 / 7 / 14 天</span>
      </div>
      <p style={{ marginTop: 8, fontSize: 15, color: '#596359' }}>根据老人保存的识别记录，整理这段时间的饮食线索、记录空缺和家里可以做的小事。</p>
      <button className="child-secondary" style={{ marginTop: 12 }} type="button" disabled={!allowed} onClick={() => setOpen(true)}>生成饮食分析</button>
      {!allowed && <p style={{ marginTop: 8, fontSize: 14, color: '#596359' }}>{reason}</p>}
    </section>
    {open && allowed && elderId && <DietDialog owner={elderId} onClose={() => setOpen(false)} />}
  </>;
}
