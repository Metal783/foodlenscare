import { useState } from 'react';
import { savePrefs, useBackend } from './backend';
import AssistantModal from './AssistantModal';

export const FAMILY_AI_CONSENT = 'family-assistant-v1';
export default function FamilyAIConsent() {
  const data = useBackend();
  const [open, setOpen] = useState(false), [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (data.account?.role !== 'elder') return null;
  const enabled = data.account.prefs.familyAssistantConsent === FAMILY_AI_CONSENT;
  const save = async (allowed: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await savePrefs({ familyAssistantConsent: allowed ? FAMILY_AI_CONSENT : '' }); setOpen(false); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <div className="settings-row">
      <img alt="" src="assets/b1192.svg" /><span>允许家人AI整理记录</span>
      <button className={`settings-toggle ${enabled ? 'on' : ''}`} type="button" role="switch" aria-label="允许家人AI整理记录" aria-checked={enabled} disabled={busy}
        onClick={() => { if (enabled) void save(false); else { setAgreed(false); setError(''); setOpen(true); } }}><span /></button>
    </div>
    {error && !open && <p className="field-error" role="alert">{error}</p>}
    {open && <AssistantModal title="家人AI整理授权" onClose={() => { if (!busy) setOpen(false); }}>
      <p>允许已绑定且获准查看食物记录的家人，主动将必要的食品记录摘要发送至DeepSeek，生成识别回顾或关怀草稿。</p>
      <p>不发送疾病、过敏档案、照片或语音。本授权适用于所有已获食物记录权限的家人，可随时关闭；关闭后停止后续调用，已发送到第三方的数据不能自动撤回。</p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={agreed} disabled={busy} onChange={event => setAgreed(event.target.checked)} /><span>我同意家人按上述范围使用AI整理记录</span></label>
      <button className="primary-button" disabled={!agreed || busy} type="button" onClick={() => void save(true)}>{busy ? '保存中…' : '同意并开启家人AI整理'}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </AssistantModal>}
  </>;
}
