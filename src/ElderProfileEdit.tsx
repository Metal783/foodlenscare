import * as backend from "./backend";
import { useMemo, useState } from "react";
import type { ElderDraft, SessionKind } from "./Onboarding";
import BirthDateFields from './BirthDateFields';
import { birthDateIssue, profileAge } from './birthDate';

const assetPathPrefix = "assets";
const diseaseOptions = ["无", "高血压", "糖尿病", "高血脂", "冠心病", "其他"];
const allergenOptions = ["无", "花生", "坚果", "牛奶", "鸡蛋", "大豆", "小麦", "鱼类", "虾蟹", "蟹黄", "其他"];

function toggleMulti(current: string[], option: string): string[] {
  if (option === "无") return current.includes("无") ? [] : ["无"];
  const withoutNone = current.filter((item) => item !== "无");
  return withoutNone.includes(option)
    ? withoutNone.filter((item) => item !== option)
    : [...withoutNone, option];
}

function Chips({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="edit-chips">
      {options.map((option) => (
        <button
          aria-pressed={selected.includes(option)}
          className={selected.includes(option) ? "selected" : ""}
          key={option}
          type="button"
          onClick={() => onChange(toggleMulti(selected, option))}
        >
          {selected.includes(option) && "✓ "}{option}
        </button>
      ))}
    </div>
  );
}

export default function ElderProfileEdit({
  initial,
  session,
  onBack,
  onSave,
  mode = 'health',
}: {
  initial: ElderDraft;
  session: SessionKind;
  onBack: () => void;
  onSave: (draft: ElderDraft) => Promise<boolean>;
  mode?: 'basic' | 'health';
}) {
  const [draft, setDraft] = useState<ElderDraft>({ ...initial });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState("");
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const leave = () => {
    if (dirty && !window.confirm("有未保存修改，是否放弃？")) return;
    onBack();
  };
  const save = async () => {
    const name = draft.name.trim();
    if (saving) return;
    if (!name) return setError("姓名或称呼不能为空");
    const birthdayError = birthDateIssue(draft.birthDate);
    if (birthdayError) return setError(birthdayError);
    if (mode === 'health' && draft.weight && (!/^\d+(\.\d+)?$/.test(draft.weight) || +draft.weight < 1 || +draft.weight > 300)) {
      return setError("体重应为1至300公斤之间的数字");
    }
    const hasHealth = draft.diseases.length > 0 || draft.allergens.length > 0;
    if (mode === 'health' && hasHealth && !draft.healthConsent) return setError("保存健康相关资料前，请先明确同意用途说明");
    setSaving(true);
    const current = backend.snapshot().account ? backend.elderProfile() : backend.elderProfile(backend.localRead('elderProfile', initial), draft.phone);
    const personal = { name, phone: draft.phone, phoneVerified: draft.phoneVerified, birthDate: draft.birthDate, age: profileAge(draft) };
    const changes = mode === 'basic' ? personal : { ...personal, gender: draft.gender, weight: draft.weight, diseases: draft.diseases, diseaseOther: draft.diseaseOther, allergens: draft.allergens, allergenOther: draft.allergenOther, healthConsent: draft.healthConsent };
    if (await onSave({ ...current, ...changes })) onBack();
      else {
        setSaving(false);
        setError("保存失败，请重试");
      }

  };
  const [testCode, setTestCode] = useState("");
  const verifyPhone = async () => {
    if (!/^1[3-9]\d{9}$/.test(newPhone)) return setError("请输入有效的11位手机号");
    try {
      if (session === "guest-demo") { setDraft(current => ({ ...current, phone: newPhone, phoneVerified: false })); setPhoneOpen(false); return; }
      if (!codeRequested) { const response = await backend.api("/auth/code", { method: "POST", body: { phone: newPhone } }); setTestCode(response.testCode); setCodeRequested(true); setError(""); return; }
      await backend.changePhone(newPhone, code);
      setDraft(current => ({ ...current, phone: newPhone, phoneVerified: true })); setPhoneOpen(false); setCodeRequested(false); setCode(""); setError("");
    } catch (error) { setError((error as Error).message); }
  };

  return (
    <main className="flow-page">
      <header className="recognition-header"><button aria-label="返回来源页" type="button" onClick={leave}><img alt="" src={`${assetPathPrefix}/7e864.svg`} /></button><h1>{mode === 'basic' ? '编辑个人信息' : '编辑健康资料'}</h1></header>
      <div className="flow-content edit-profile-content">
        <h2>{mode === 'basic' ? '个人信息' : '健康资料'}</h2>
        <p className="flow-lead">保存后更新当前资料，不会改写历史食品识别快照。</p>
        <section className="flow-card edit-fields">
          <h3>个人信息</h3>
          <label>姓名／称呼<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></label>
          <label>手机号码<div className="profile-input-shell"><span>{draft.phone ? draft.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1 **** $2") : "未填写"}</span><button aria-label="修改手机号" type="button" onClick={() => setPhoneOpen(true)}>修改</button></div></label>
          <p className="flow-helper">更换手机号需完成本地测试验证。</p>
          <BirthDateFields id="elder-edit" birthDate={draft.birthDate} age={draft.age} onChange={value => setDraft(d => ({ ...d, ...value }))} />
        </section>
        {mode === 'health' && <>
        <section className="flow-card edit-fields">
          <h3>身体情况</h3>
          <fieldset><legend>性别（选填）</legend><div className="font-options">{["女", "男"].map((item) => <button className={draft.gender === item ? "selected" : ""} key={item} type="button" onClick={() => setDraft((d) => ({ ...d, gender: d.gender === item ? "" : item as ElderDraft["gender"] }))}>{draft.gender === item && "✓ "}{item}</button>)}</div></fieldset>
          <label>体重（选填）<div className="profile-input-shell"><input inputMode="decimal" value={draft.weight} onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))} /><span>公斤</span></div></label>
        </section>
        <section className="flow-card"><h3>基础疾病（可多选）</h3><Chips options={diseaseOptions} selected={draft.diseases} onChange={(diseases) => setDraft((d) => ({ ...d, diseases }))} />{draft.diseases.includes("其他") && <input className="profile-input" placeholder="补充其他基础疾病" value={draft.diseaseOther} onChange={(e) => setDraft((d) => ({ ...d, diseaseOther: e.target.value }))} />}<p className="flow-helper">本人填写，不是照片检测结果。选“无”将取消具体疾病项。</p></section>
        <section className="flow-card"><h3>过敏原（可多选）</h3><Chips options={allergenOptions} selected={draft.allergens} onChange={(allergens) => setDraft((d) => ({ ...d, allergens }))} />{draft.allergens.includes("其他") && <input className="profile-input" placeholder="补充其他过敏原" value={draft.allergenOther} onChange={(e) => setDraft((d) => ({ ...d, allergenOther: e.target.value }))} />}<p className="flow-helper">保留已有选项；“无”与具体过敏原互斥。</p></section>
        <div className="recognition-tip"><img alt="" src={`${assetPathPrefix}/b1192.svg`} /><div><p>资料用于您的饮食参考。修改资料不会新增共享授权。</p>{!initial.healthConsent && <label className="health-consent"><input type="checkbox" checked={draft.healthConsent} onChange={(e) => setDraft((d) => ({ ...d, healthConsent: e.target.checked }))} />我同意将健康相关资料保存为本机家庭服务数据</label>}</div></div>
        </>}
        {session === "guest-demo" && <p className="guest-note">游客修改仅保留在当前会话，不提交真实服务。</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="recognition-primary" disabled={saving} type="button" onClick={save}>{saving ? "保存中…" : "保存修改"}</button>
        <p className="form-footer-note">未保存的修改不会生效</p>
      </div>
      {phoneOpen && (
        <div className="home-modal-backdrop" onMouseDown={() => setPhoneOpen(false)}>
          <section className="font-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2>验证新手机号</h2>
            <input className="profile-input" inputMode="numeric" maxLength={11} placeholder="输入11位手机号" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            {codeRequested && <><p>本地测试验证码：{testCode}，未发送真实短信</p><input className="profile-input" inputMode="numeric" maxLength={6} placeholder="输入验证码" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></>}
            <button className="primary-button" type="button" onClick={verifyPhone}>{codeRequested ? "确认验证" : "获取本地测试验证码"}</button>
            <button className="home-dialog-cancel" type="button" onClick={() => setPhoneOpen(false)}>取消</button>
          </section>
        </div>
      )}
    </main>
  );
}
