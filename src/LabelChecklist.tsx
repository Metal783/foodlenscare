import { useEffect, useMemo, useState } from 'react';
import { labelChecklist } from './labelCheckItems';
import useAssistantSpeech from './useAssistantSpeech';
import { analysisInput } from './analysisInput';

export default function LabelChecklist({ label }: { label: any }) {
  const checks = useMemo(() => labelChecklist(label), [label]);
  const signature = JSON.stringify(analysisInput(label)), [viewed, setViewed] = useState<string[]>([]), speech = useAssistantSpeech();
  useEffect(() => { setViewed([]); speech.stop(); }, [signature]);
  return <section className="recognition-card" aria-label="标签核对助手">
    <details onToggle={event => { if (!event.currentTarget.open) { setViewed([]); speech.stop(); } }}>
      <summary style={{ fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>查看标签核对清单</summary>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <p>根据本次识别整理，无需调用AI。勾选只表示本次已查看，不修改识别文字、营养数值或可信度；收起后清除勾选。</p>
        <p role="status">本次已查看 {viewed.length} / {checks.length} 项</p>
        {checks.map(item => <label key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
          <input type="checkbox" aria-label={`已查看：${item.title}`} checked={viewed.includes(item.id)} style={{ marginTop: 6, flexShrink: 0 }}
            onChange={event => setViewed(old => event.target.checked ? [...old.filter(id => id !== item.id), item.id] : old.filter(id => id !== item.id))} />
          <span><strong>{item.title}</strong><small style={{ display: 'block', marginTop: 4 }}>{item.needsCheck ? '需要核对 · ' : '已读到候选 · '}{item.note}</small></span>
        </label>)}
        <button type="button" className="recognition-secondary" style={{ fontSize: 18 }} onClick={() => speech.toggle('checklist', checks.map(item => `${item.title}：${item.note}`).join('。'))}>{speech.speaking ? '停止朗读' : '朗读核对清单'}</button>
        {speech.speechError && <p role="alert" className="field-error">{speech.speechError}</p>}
      </div>
    </details>
  </section>;
}
