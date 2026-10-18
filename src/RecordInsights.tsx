import { useEffect, useMemo, useRef, useState } from 'react';
import { api, snapshot, useBackend } from './backend';
import AssistantModal from './AssistantModal';
import useAssistantSpeech from './useAssistantSpeech';

type Mode = 'review' | 'care';
type Summary = { periodStart: string; periodEnd: string; recordCount: number; dayCount: number; nameCount: number; readableCount: number; unreadableCount: number; undatedCount: number; sampleCount: number; sampleLimit: number; clues: { key: string; label: string; count: number }[]; nutritionCoverage: Record<string, number> };
type Result = { answer: string; details: string[]; generatedAt: string };
const labels: Record<string, string> = { energy: '能量', protein: '蛋白质', fat: '脂肪', carbohydrate: '碳水化合物', sugar: '糖', sodium: '钠' };

function InsightsDialog({ owner, mode, signature, onClose, onUseDraft }: { owner: string; mode: Mode; signature: string; onClose: () => void; onUseDraft?: (text: string) => void }) {
  const controller = useRef<AbortController | null>(null), pending = useRef(false), text = useRef<HTMLTextAreaElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null), [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [consent, setConsent] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [tone, setTone] = useState('gentle');
  const [draft, setDraft] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [retryAt, setRetryAt] = useState(0), [wait, setWait] = useState(0);
  const generation = useRef(0);
  const speech = useAssistantSpeech();
  const load = async () => {
    speech.stop(); setNotice('');
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    const token = ++generation.current; pending.current = false; setBusy(false); setLoading(true); setSummary(null); setResult(null); setDraft(''); setConfirmed(false); setError('');
    try {
      const response = await api(`/record-insights?elder=${encodeURIComponent(owner)}`, { signal: task.signal });
      if (!task.signal.aborted && generation.current === token) setSummary(response.summary);
    } catch (failure) { if (!task.signal.aborted && generation.current === token) setError((failure as Error).message); }
    finally { if (generation.current === token) setLoading(false); }
  };
  useEffect(() => {
    setConsent(false); void load();
    return () => { generation.current++; controller.current?.abort(); speech.stop(); };
  }, [owner, signature]);
  useEffect(() => {
    const update = () => setWait(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update(); if (retryAt <= Date.now()) return;
    const timer = window.setInterval(update, 250); return () => window.clearInterval(timer);
  }, [retryAt]);
  const generate = async () => {
    if (pending.current || busy || !consent || !summary || wait) return;
    const actor = snapshot().account?.id, token = ++generation.current;
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    speech.stop(); pending.current = true; setBusy(true); setError(''); setNotice(''); setResult(null); setDraft(''); setConfirmed(false);
    try {
      const response = await api('/record-insights', { method: 'POST', signal: task.signal, timeoutMs: 60000, body: { elder: owner, mode, tone, consent: true } });
      if (task.signal.aborted || token !== generation.current || actor !== snapshot().account?.id) return;
      setSummary(response.summary); setResult(response.result); setDraft(mode === 'care' ? response.result.answer : ''); setConfirmed(false); setRetryAt(Date.now() + 5000);
    } catch (failure) {
      if (!task.signal.aborted && token === generation.current) {
        if ((failure as any).status === 409) { await load(); setError('记录已变化，摘要已刷新，请重新生成。'); }
        else { setError((failure as Error).name === 'TimeoutError' ? '整理等待超时，请稍后重试。' : (failure as Error).message); }
        if ((failure as any).status === 429) setRetryAt(Date.now() + 5000);
      }
    } finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  };
  const cancel = () => {
    generation.current++; controller.current?.abort(); pending.current = false;
    setBusy(false); setRetryAt(Date.now() + 5000); setError('');
    setNotice('已取消本次等待，记录摘要仍可查看。已提交的AI请求可能仍在处理。');
  };
  const copy = async () => {
    if (!confirmed || !draft.trim()) return;
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(draft.trim()); setNotice('已复制您核对后的草稿。'); }
    catch { text.current?.focus(); text.current?.select(); setNotice('请选中草稿文字手动复制。'); }
  };
  const title = mode === 'care' ? '关怀草稿' : '近7天识别回顾';
  return <AssistantModal title={title} onClose={onClose}>
    <p>仅整理已保存的识别记录，不能代表实际吃过的食物或摄入量。</p>
    {loading && <p role="status">正在读取记录摘要…</p>}
    {summary && <section className="recognition-card" aria-label="记录摘要" style={{ padding: 16 }}>
      <p>{summary.periodStart} 至 {summary.periodEnd}（上海日期）</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 12 }}>
        <p><strong>{summary.recordCount}</strong> 条识别记录</p><p><strong>{summary.dayCount}</strong> 天有记录</p>
        <p><strong>{summary.readableCount}</strong> 条配料可读</p><p><strong>{summary.unreadableCount}</strong> 条配料待补拍</p>
      </div>
      {summary.clues.map(item => <p key={item.key} style={{ marginTop: 8 }}>{item.label}：{item.count} 条标签出现</p>)}
      {summary.undatedCount > 0 && <p style={{ marginTop: 8 }}>另有{summary.undatedCount}条历史记录缺少有效日期，未纳入近7天统计。</p>}
      <details style={{ marginTop: 12 }}><summary>营养字段可读情况</summary>{Object.entries(summary.nutritionCoverage).map(([key, count]) => <p key={key}>{labels[key] || key}：{count} 条标签有可用候选</p>)}</details>
      <small style={{ display: 'block', marginTop: 12 }}>统计覆盖上述记录，AI最多参考{summary.sampleLimit}条可读标签示例；本次{summary.sampleCount}条。配料出现不等于营养含量高或超标。</small>
    </section>}
    {!loading && !summary && <button className="recognition-secondary" type="button" onClick={() => void load()}>重试读取摘要</button>}
    {summary?.recordCount === 0 && <p>{mode === 'care' ? '暂无近7天记录，仅生成不引用食品事实的通用问候。' : '暂无近7天已保存记录，请保存识别结果后再生成回顾。'}</p>}
    {mode === 'care' && <label className="flow-field">草稿语气<select className="field-input" aria-label="草稿语气" value={tone} disabled={busy} onChange={event => { speech.stop(); setNotice(''); setTone(event.target.value); setResult(null); setDraft(''); setConfirmed(false); }}><option value="gentle">温和提醒</option><option value="warm">亲切问候</option><option value="brief">简短鼓励</option></select></label>}
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15 }}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>同意将必要的食品记录摘要发送至DeepSeek，不包含疾病、过敏档案、照片或语音。</span></label>
    <button className="primary-button" type="button" disabled={loading || busy || !consent || !summary || (mode === 'review' && summary.recordCount === 0) || wait > 0} onClick={() => void generate()}>{busy ? '正在整理…' : wait > 0 ? `请稍候（${wait}秒）` : mode === 'care' ? '生成关怀草稿' : '生成识别回顾'}</button>
    {busy && <button className="recognition-secondary" type="button" onClick={cancel}>取消本次等待</button>}
    {result && <section className="recognition-card" style={{ padding: 16 }} aria-label={mode === 'care' ? '可编辑关怀草稿' : 'AI识别回顾'}>
      {mode === 'care' ? <>
        <label className="flow-field">核对并编辑草稿<textarea ref={text} aria-label="核对并编辑草稿" className="field-input" rows={5} maxLength={500} value={draft} onChange={event => { speech.stop(); setNotice(''); setDraft(event.target.value); setConfirmed(false); }} style={{ width: '100%', minHeight: 140, resize: 'vertical' }} /></label>
        <p>这段文字只是录音参考，尚未发送给家人。</p>
      </> : <p style={{ fontSize: 18 }}>{result.answer}</p>}
      {result.details.length > 0 && <details style={{ marginTop: 12 }}><summary>展开说明</summary>{result.details.map((line, index) => <p key={index} style={{ marginTop: 8 }}>{line}</p>)}</details>}
      <button className="recognition-secondary" type="button" style={{ fontSize: 18, marginTop: 12 }} onClick={() => speech.toggle('result', mode === 'care' ? draft : [result.answer, ...result.details].join('。'))}>{speech.speaking ? '停止朗读' : `朗读${mode === 'care' ? '草稿' : '回顾'}`}</button>
      {mode === 'care' && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>我已核对草稿，作为录音参考</span></label>
        <button className="recognition-secondary" type="button" style={{ fontSize: 18 }} disabled={!confirmed || !draft.trim()} onClick={() => void copy()}>复制已核对草稿</button>
        {onUseDraft && <button className="primary-button" type="button" disabled={!confirmed || !draft.trim()} onClick={() => { onUseDraft(draft.trim()); onClose(); }}>带着草稿录音</button>}
      </div>}
    </section>}
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{speech.speechError && <p role="alert" className="field-error">{speech.speechError}</p>}
  </AssistantModal>;
}

export default function RecordInsights({ elderId, onUseDraft }: { elderId?: string; onUseDraft?: (text: string) => void }) {
  const data = useBackend(), [mode, setMode] = useState<Mode | null>(null);
  const child = data.account?.role === 'child', owner = child ? elderId || '' : data.account?.id || '';
  const family = data.families.find(item => !item.amElder && item.status === 'bound' && item.member.id === owner);
  const allowed = !!data.account && (!child || !!family?.records_allowed && !!family.member.familyAiAllowed);
  const rows = child ? data.sharedRecords : data.ownRecords;
  const signature = useMemo(() => JSON.stringify(rows.map(row => [row.id, row.at, row.productName, row.label?.ingredientText, row.label?.nutritionPer100g, row.label?.nutritionPerServing, row.label?.confidence])), [rows]);
  useEffect(() => { if (!allowed) setMode(null); }, [allowed, owner]);
  if (!data.account) return null;
  return <section className={child ? 'child-card' : 'recognition-card'} aria-label="识别记录助手" style={{ display: 'grid', gap: 12 }}>
    <h2 style={{ fontSize: 20, fontWeight: 700 }}>识别记录助手</h2>
    <button className="recognition-secondary" type="button" style={{ fontSize: 18 }} disabled={!allowed} onClick={() => setMode('review')}>查看近7天识别回顾</button>
    {child && <button className="recognition-secondary" type="button" style={{ fontSize: 18 }} disabled={!allowed} onClick={() => setMode('care')}>起草关怀留言</button>}
    {!allowed && <p>{!family?.records_allowed ? '请先绑定家人，并由老人授权食物记录。' : '请先由老人在“我的设置”开启“允许家人AI整理记录”。'}</p>}
    {mode && allowed && <InsightsDialog key={`${data.account.id}:${owner}:${mode}`} owner={owner} mode={mode} signature={signature} onClose={() => setMode(null)} onUseDraft={onUseDraft} />}
  </section>;
}
