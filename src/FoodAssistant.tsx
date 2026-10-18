import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, elderProfile, snapshot, useBackend } from './backend';
import { analysisInput } from './analysisInput';
import { runRecognition } from './recognition';
import { isMobileApp } from './mobile';
import { mobilePhoto } from './mobileCamera';
import useAssistantSpeech from './useAssistantSpeech';

type Mode = 'ask' | 'claims' | 'compare' | 'shopping' | 'pairing';
type ComparisonRow = { nutrient: string; label: string; unit: string; first: number | null; second: number | null; firstBasis: string; secondBasis: string; comparable: boolean; note: string };
type Answer = { answer: string; details: string[]; followUps: string[]; safetyNotes: string[]; taskNotes?: string[]; comparison: ComparisonRow[]; conversationId: string; turnsRemaining: number };
const titles: Record<Mode, string> = { ask: '食品追问', claims: '包装说法解读', compare: '两款食品对比', shopping: '选购替代思路', pairing: '日常搭配建议' };
const defaultQuestions: Record<Mode, string> = {
  ask: '为什么这样建议？', claims: '', compare: '请帮我比较这两款食品，说明差异和还需核对的信息。',
  shopping: '围绕这款食品，下次选同类食品时应该先核对什么？有哪些可考虑的替代类别？',
  pairing: '如果把这款食品作为日常饮食的一部分，可以考虑哪些简单搭配？还需核对什么？',
};
const starters: Partial<Record<Mode, string[]>> = {
  ask: ['哪些配料需要我留意？', '还需要补拍哪些标签信息？', '这份营养表应该怎么看？'],
  claims: ['如何核对包装上的“无蔗糖”说法？', '如何理解包装上的“低脂”说法？', '如何核对包装上的“高钙”说法？'],
  shopping: ['下次选同类食品，先比较哪些标签信息？', '我想选准备起来简单的同类食品，需要核对什么？'],
  pairing: ['我想把它作为加餐，有哪些搭配思路？', '搭配时还需要核对哪些配料和过敏原？'],
};

function AssistantDialog({ record, mode, onClose }: { record: any; mode: Mode; onClose: () => void }) {
  const data = useBackend(), heading = useId();
  const box = useRef<HTMLElement>(null), files = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null), running = useRef(false);
  const taskKind = useRef<'ocr' | 'ai'>('ai');
  const input = useRef<HTMLTextAreaElement>(null), speech = useAssistantSpeech();
  const [question, setQuestion] = useState(defaultQuestions[mode]);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const [secondId, setSecondId] = useState(''), [second, setSecond] = useState<any>(null);
  const [conversation, setConversation] = useState(''), [turns, setTurns] = useState<{ question: string; result: Answer }[]>([]);
  const [error, setError] = useState(''), [waitUntil, setWaitUntil] = useState(0), [remainingWait, setRemainingWait] = useState(0);
  const [notice, setNotice] = useState('');
  const scope = JSON.stringify([data.account?.id, data.account?.profile]);
  const previousScope = useRef(scope);
  const records = data.ownRecords.filter(item => item.id !== record.id && item.origin !== 'demo' && item.label?.ingredientText);
  const latest = turns[turns.length - 1]?.result;
  const restart = () => { setConversation(''); setTurns([]); setError(''); setNotice(''); speech.stop(); };
  const fillQuestion = (value: string) => { setQuestion(value); input.current?.focus(); };
  const cancel = () => {
    const requesting = taskKind.current === 'ai';
    controller.current?.abort(); controller.current = null; running.current = false;
    setBusy(false); setProgress(''); setError('');
    if (requesting) { restart(); setWaitUntil(Date.now() + 5000); }
    setNotice(requesting ? '已取消本次等待，问题已保留；下次发送将开始新一轮问答。已提交的AI请求可能仍在处理。' : '已取消读取标签，请重新拍摄或选择图片。');
  };

  useEffect(() => {
    const focused = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; box.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !box.current) return;
      const nodes = Array.from(box.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type=file]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === box.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      controller.current?.abort(); document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown, true);
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
    };
  }, []);
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope; controller.current?.abort(); running.current = false;
      setBusy(false); setConsent(false); restart(); setError('饮食资料已变化，请重新提问。');
    }
  }, [scope]);
  useEffect(() => {
    const update = () => setRemainingWait(Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)));
    update(); if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(update, 250); return () => window.clearInterval(timer);
  }, [waitUntil]);

  const recognizeSecond = async (source: string) => {
    if (running.current) return;
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    taskKind.current = 'ocr'; speech.stop(); running.current = true; setBusy(true); setError(''); setNotice(''); setProgress('正在读取另一款食品标签…');
    try {
      const result = await runRecognition(source, elderProfile(), task.signal, text => { if (!task.signal.aborted) setProgress(text); }, false);
      if (task.signal.aborted) return;
      if (!result.label?.ingredientText) throw new Error('没有读清另一款的配料表，请换清晰的标签照片。');
      setSecond(result); setSecondId(''); restart();
    } catch (failure) { if (!task.signal.aborted) setError((failure as Error).message); }
    finally { if (controller.current === task) { running.current = false; setBusy(false); setProgress(''); } }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) { setError('请选择小于20MB的食品标签图片。'); return; }
    const url = URL.createObjectURL(file);
    try { await recognizeSecond(url); } finally { URL.revokeObjectURL(url); }
  };
  const takePhoto = async () => {
    if (!isMobileApp()) { camera.current?.click(); return; }
    try { const photo = await mobilePhoto(false); if (box.current?.isConnected) await recognizeSecond(photo); }
    catch (failure) { if (box.current?.isConnected) setError((failure as Error).message); }
  };
  const send = async () => {
    if (running.current || remainingWait || !question.trim() || !consent || latest?.turnsRemaining === 0) return;
    if (mode === 'compare' && !secondId && !second) { setError('请先选择历史食品，或拍摄/上传另一款标签。'); return; }
    controller.current?.abort(); const task = new AbortController(); controller.current = task;
    taskKind.current = 'ai'; speech.stop(); running.current = true; setBusy(true); setError(''); setNotice(''); setProgress('正在结合标签和本人资料回答…');
    const asked = question.trim(), owner = snapshot().account?.id, currentScope = scope;
    try {
      const { result } = await api('/food-assistant', { method: 'POST', signal: task.signal, timeoutMs: 60000,
        body: { mode, question: asked, consent: true, label: analysisInput(record.label), conversationId: conversation,
          localAllergyWarning: record.assessment?.level === 'red',
          ...(mode === 'compare' ? secondId ? { secondRecordId: secondId } : { secondLabel: analysisInput(second.label) } : {}),
        } });
      if (task.signal.aborted || owner !== snapshot().account?.id || currentScope !== previousScope.current) return;
      setConversation(result.conversationId); setTurns(old => [...old, { question: asked, result }]); setQuestion(''); setWaitUntil(Date.now() + 5000);
    } catch (failure) {
      if (!task.signal.aborted) {
        if ((failure as any).status === 409) { setConversation(''); setTurns([]); }
        if ((failure as any).status === 429) setWaitUntil(Date.now() + 5000);
        setError((failure as Error).name === 'TimeoutError' ? '等待超时，您可以重试。' : (failure as Error).message);
      }
    } finally { if (controller.current === task) { running.current = false; setBusy(false); setProgress(''); } }
  };
  return createPortal(<div className="dialog-backdrop" style={{ zIndex: 110, padding: 12 }}>
    <section className="dialog-card" ref={box} role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1}
      style={{ width: 'min(100%, 640px)', maxHeight: 'calc(100dvh - 24px)', overflow: 'hidden', padding: 20, overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><h2 id={heading}>{titles[mode]}</h2><button className="legal-link" type="button" disabled={busy} onClick={restart}>重新开始</button></div>
      <div style={{ overflowY: 'auto', minHeight: 0, display: 'grid', gap: 16, paddingRight: 4 }}>
        <p>当前食品：{record.productName || record.label?.productName || '本次识别食品'}</p>
        {mode === 'shopping' && <p>生成下次选购的核对方向与替代类别。可以补充口味、准备方式等偏好，不提供实时商品、品牌或价格。</p>}
        {mode === 'pairing' && <p>可以补充正餐、加餐等场景及口味偏好。这里只提供搭配思路，不是完整餐单或营养处方。</p>}
        {mode === 'compare' && <div style={{ display: 'grid', gap: 10 }}>
          <label className="flow-field">选择另一款已保存食品<select aria-label="选择另一款已保存食品" className="field-input" value={secondId} disabled={busy} onChange={event => { setSecondId(event.target.value); setSecond(null); restart(); }}>
            <option value="">请选择，或拍摄/上传标签</option>{records.map(item => <option key={item.id} value={item.id}>{item.productName || item.label?.productName || '未命名食品'} · {new Date(item.at).toLocaleDateString('zh-CN')}</option>)}
          </select></label>
          <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" disabled={busy} onClick={() => void takePhoto()}>拍摄另一款标签</button>
          <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" disabled={busy} onClick={() => files.current?.click()}>上传另一款标签照片</button>
          <input hidden ref={files} type="file" accept="image/*" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          {second && <p role="status">另一款：{second.productName}（已识别，未保存）</p>}
          <p>不同计量口径会先核对；无法换算或缺失的项目不比较高低。食品类别不一定相同。</p>
        </div>}
        {turns.map((turn, index) => <section className="recognition-card" key={index} style={{ padding: 16 }} aria-label={`第${index + 1}次回答`}>
          {!!turn.result.safetyNotes?.length && <div role="note" aria-label="本人过敏提醒" style={{ color: '#8b2222', marginBottom: 12 }}>{turn.result.safetyNotes.map((line, i) => <p key={i}>{line}</p>)}</div>}
          <p><strong>您的问题：</strong>{turn.question}</p><p style={{ fontSize: 18, color: '#191d1a', marginTop: 12 }}>{turn.result.answer}</p>
          {!!turn.result.taskNotes?.length && <div role="note" aria-label="使用说明">{turn.result.taskNotes.map(line => <p key={line} style={{ marginTop: 8 }}>{line}</p>)}</div>}
          {!!turn.result.details.length && <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', color: '#003e1c' }}>展开说明</summary>{turn.result.details.map((line, i) => <p key={i} style={{ marginTop: 8 }}>{line}</p>)}</details>}
          {!!turn.result.comparison.length && <table aria-label="两款食品营养对比" style={{ width: '100%', tableLayout: 'fixed', marginTop: 16, borderCollapse: 'collapse' }}>
            <thead><tr><th scope="col">项目</th><th scope="col">当前食品</th><th scope="col">另一款食品</th></tr></thead>
            <tbody>{turn.result.comparison.map(row => <tr key={row.nutrient} style={{ borderTop: '1px solid #dce5db' }}><th scope="row" style={{ fontWeight: 400 }}>{row.label}<small style={{ display: 'block' }}>{row.comparable ? '同口径候选' : '不可比较高低'}</small></th>
              <td style={{ padding: '10px 4px', textAlign: 'center' }}>{row.first == null ? '未识别' : `${row.first} ${row.unit}`}<small style={{ display: 'block' }}>{row.firstBasis}</small></td>
              <td style={{ padding: '10px 4px', textAlign: 'center' }}>{row.second == null ? '未识别' : `${row.second} ${row.unit}`}<small style={{ display: 'block' }}>{row.secondBasis}</small></td></tr>)}</tbody>
          </table>}
          {!!turn.result.comparison.length && <div role="note" aria-label="对比说明">{Array.from(new Set(turn.result.comparison.map(row => row.note))).map(line => <p key={line} style={{ marginTop: 8 }}>{line}</p>)}</div>}
          <button className="recognition-secondary" style={{ fontSize: 18, marginTop: 12 }} type="button" onClick={() => speech.toggle(String(index), Array.from(new Set([...(turn.result.safetyNotes || []), turn.result.answer, ...turn.result.details, ...(turn.result.taskNotes || [])])).join('。'))}>{speech.speaking === String(index) ? '停止朗读' : '朗读回答'}</button>
        </section>)}
        {!turns.length && starters[mode] && <div role="group" aria-label="常用食品问题" style={{ display: 'grid', gap: 8 }}><p>点选问题后可修改，核对后再发送。{mode === 'claims' ? '包装说法仅在实际标签上出现时使用。' : ''}</p>{starters[mode]?.map(value => <button className="recognition-secondary" type="button" key={value} disabled={busy} style={{ fontSize: 17 }} onClick={() => fillQuestion(value)}>{value}</button>)}</div>}
        {latest && latest.turnsRemaining > 0 && latest.followUps.map(text => <button className="recognition-secondary" style={{ fontSize: 17 }} key={text} type="button" disabled={busy} onClick={() => fillQuestion(text)}>{text}</button>)}
        {latest?.turnsRemaining === 0 ? <p role="status">本轮追问已结束，可点击“重新开始”。</p> : <>
          <label className="flow-field">{mode === 'claims' ? '包装上的具体说法或您的追问' : '想了解什么？'}<textarea ref={input} aria-label={mode === 'claims' ? '包装说法或追问' : '食品问题'} className="field-input" rows={3} maxLength={500} value={question} disabled={busy} placeholder={mode === 'claims' ? '例如：包装写“无蔗糖”，是什么意思？' : '围绕当前食品提问'} onChange={event => setQuestion(event.target.value)} style={{ width: '100%', resize: 'vertical', minHeight: 96 }} /></label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.6 }}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} /><span>同意将本次问题、食品标签和本人饮食资料发送至DeepSeek。照片在本机识别，不发送给AI。</span></label>
          <button className="primary-button" type="button" disabled={busy || !consent || !question.trim() || remainingWait > 0} onClick={() => void send()}>{busy ? '处理中…' : remainingWait > 0 ? `请稍候（${remainingWait}秒）` : mode === 'compare' ? '开始对比 / 继续追问' : '发送问题'}</button>
        </>}
        {busy && <button className="recognition-secondary" type="button" onClick={cancel}>取消本次等待</button>}
        {progress && <p role="status">{progress}</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" className="field-error">{error}</p>}{speech.speechError && <p role="alert" className="field-error">{speech.speechError}</p>}
        <small>仅供食品信息参考。对话临时保留，关闭后不写入识别历史；保存食品不代表实际食用。</small>
      </div>
      <button className="secondary-button" type="button" onClick={onClose} style={{ flexShrink: 0 }}>关闭食品助手</button>
    </section>
  </div>, document.body);
}

export default function FoodAssistant({ record }: { record: any }) {
  const data = useBackend();
  const [mode, setMode] = useState<Mode | null>(null);
  if (data.account?.role !== 'elder' || record.origin === 'demo' || !record.label?.ingredientText) return null;
  return <section className="recognition-card" aria-label="食品助手">
    <h3>还想了解这款食品？</h3>
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" onClick={() => setMode('ask')}>为什么这样建议</button>
      <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" onClick={() => setMode('claims')}>解释包装说法</button>
      <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" onClick={() => setMode('compare')}>和另一款比较</button>
      <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" onClick={() => setMode('shopping')}>选购替代思路</button>
      <button className="recognition-secondary" style={{ fontSize: 18 }} type="button" onClick={() => setMode('pairing')}>日常搭配建议</button>
    </div>
    {mode && <AssistantDialog key={`${record.id}:${mode}`} record={record} mode={mode} onClose={() => setMode(null)} />}
  </section>;
}
