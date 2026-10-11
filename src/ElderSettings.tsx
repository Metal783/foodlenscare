import ElderBottomNav from "./ElderBottomNav";
import * as backend from "./backend";
import { useEffect, useRef, useState } from "react";
import AccountExit from "./AccountExit";
import type { ElderDraft, SessionKind } from "./Onboarding";
import {
  familyMembersFor,
  type ElderFontSize,
  type ElderPreferences,
  type FamilyMember,
  type ShareGrant,
  type BindingRequest,
} from "./preferences";
import SharedHelp from "./SharedHelp";

type SettingsPage = "main" | "guard" | "add-family" | "bind-family" | "help";
type Notice = "edit" | "add" | null;

const assetPathPrefix = "/assets";
const fontLabels: Record<ElderFontSize, string> = {
  small: "小字",
  standard: "标准",
  large: "大字",
};

function maskedPhone(phone: string): string {
  return phone.length === 11
    ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}`
    : "";
}

function Toggle({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`settings-toggle ${checked ? "on" : ""}`}
      role="switch"
      type="button"
      onClick={onClick}
    >
      <span />
    </button>
  );
}


function FontDialog({
  current,
  onCancel,
  onSave,
}: {
  current: ElderFontSize;
  onCancel: () => void;
  onSave: (size: ElderFontSize) => void;
}) {
  const [pending, setPending] = useState(current);
  const preview = { small: 19, standard: 22, large: 24 }[pending];
  return (
    <div className="home-modal-backdrop" onMouseDown={onCancel}>
      <section
        aria-modal="true"
        className="font-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>选择字体大小</h2>
        <p>当前使用：{fontLabels[current]}</p>
        <div className="font-options" role="radiogroup">
          {(["small", "standard", "large"] as ElderFontSize[]).map((size) => (
            <button
              aria-checked={pending === size}
              className={pending === size ? "selected" : ""}
              key={size}
              role="radio"
              type="button"
              onClick={() => setPending(size)}
            >
              {pending === size && "✓ "}
              {fontLabels[size]}
            </button>
          ))}
        </div>
        <div className="font-preview">
          <span>{fontLabels[pending]}预览</span>
          <strong style={{ fontSize: preview }}>每一餐安心，<br />每一天有伴。</strong>
          <p style={{ fontSize: Math.max(15, preview - 6) }}>原味燕麦片 · 适量食用</p>
        </div>
        <p>选择字号时，预览文字会随之调整。确认后应用到老人端页面。</p>
        <button className="primary-button" type="button" onClick={() => onSave(pending)}>
          确认使用{fontLabels[pending]}
        </button>
        <button className="home-dialog-cancel" type="button" onClick={onCancel}>取消</button>
      </section>
    </div>
  );
}

function AuthorizationDialog({
  members,
  grants,
  onCancel,
  onSave,
}: {
  members: FamilyMember[];
  grants: ShareGrant[];
  onCancel: () => void;
  onSave: (grants: ShareGrant[]) => void;
}) {
  const [pending, setPending] = useState<ShareGrant[]>(
    grants.length
      ? grants
      : members.map((member) => ({
          memberId: member.id,
          foodRecords: false,
          dietProfile: false,
        })),
  );
  const update = (
    memberId: string,
    field: "foodRecords" | "dietProfile",
    checked: boolean,
  ) =>
    setPending((current) =>
      current.map((grant) =>
        grant.memberId === memberId ? { ...grant, [field]: checked } : grant,
      ),
    );
  return (
    <div className="home-modal-backdrop" onMouseDown={onCancel}>
      <section className="font-dialog share-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <h2>选择共享家人和范围</h2>
        <p>仅共享您选择的家人和资料范围，可随时撤销。</p>
        {members.map((member) => {
          const grant = pending.find((item) => item.memberId === member.id)!;
          return (
            <fieldset className="share-member" key={member.id}>
              <legend>{member.relation} · {member.name}</legend>
              <label><input type="checkbox" checked={grant.foodRecords} onChange={(e) => update(member.id, "foodRecords", e.target.checked)} />食物识别记录</label>
              <label><input type="checkbox" checked={grant.dietProfile} onChange={(e) => update(member.id, "dietProfile", e.target.checked)} />饮食相关资料</label>
            </fieldset>
          );
        })}
        <button className="primary-button" type="button" onClick={() => onSave(pending)}>确认授权</button>
        <button className="home-dialog-cancel" type="button" onClick={onCancel}>取消</button>
      </section>
    </div>
  );
}

type BindingCandidate = FamilyMember & { requestId?: string };
type RelationshipCorrection = {
  id: string;
  memberId: string;
  applicantName: string;
  currentRelation: string;
  requestedRelation: string;
  status: "pending" | "accepted" | "rejected";
};

function AddFamilyPage({
  preferences,
  save,
  onBack,
  onCandidate,
  onLogin,
}: {
  preferences: ElderPreferences;
  save: (next: ElderPreferences) => Promise<boolean>;
  onBack: () => void;
  onCandidate: (candidate: BindingCandidate) => void;
  onLogin: () => void;
}) {
  const service = backend.useBackend();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((backend.bindingExpiresAt() - now) / 1000));
  const code = remaining ? preferences.bindingCode : "";
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState("女儿");
  const [message, setMessage] = useState("");
  const requests = preferences.requests.filter((item) => item.status === "pending");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code || await backend.invite(true));
      setMessage("绑定码已复制。");
    } catch {
      setMessage("复制失败，请长按绑定码手动复制。");
    }
  };
  const lookup = async () => {
    try {
      const value = query.trim().toUpperCase();
      const result = await backend.lookup(value);
      if (result.role !== "child") throw new Error("请输入子女端提供的绑定码。");
      const request = await backend.join(value, relation);
      onCandidate({ id: request.id, requestId: request.id, name: result.member.name, relation, maskedPhone: result.member.phone, primary: !preferences.members.length, demo: false });
    } catch (error) { setMessage((error as Error).message); }
  };
  const fromRequest = (request: BindingRequest) =>
    onCandidate({
      id: request.id,
      name: request.applicantName,
      relation: request.relation,
      maskedPhone: request.maskedPhone,
      primary: !preferences.members.length,
      demo: false,
      requestId: request.id,
    });
  return (
    <main className="flow-page">
      <header className="recognition-header">
        <button aria-label="返回子女守护" type="button" onClick={onBack}><img alt="" src={`${assetPathPrefix}/7e864.svg`} /></button>
        <h1>添加家人</h1>
      </header>
      <div className="flow-content">
        <h2>和家人连在一起</h2>
        <p className="flow-lead">先找到家人，再核对身份。绑定后，是否共享资料由您决定。</p>
        <section className="flow-card binding-code-card">
          <h3>我的绑定码</h3>
          <strong>{!service.account ? "请先登录" : service.inviteStatus === "loading" ? "正在生成…" : code || "绑定码已过期或尚未生成"}</strong>
          <p>{code ? `剩余${Math.floor(remaining / 60)}分${String(remaining % 60).padStart(2, "0")}秒。` : ""}绑定码随机生成，5分钟有效、仅可使用一次。把此码告诉子女，申请由您确认。</p>
          {service.inviteError && <p role="alert">{service.inviteError}</p>}
          {!service.account ? <button className="recognition-secondary" type="button" onClick={onLogin}>登录后生成绑定码</button> : <><button className="recognition-secondary" disabled={service.inviteStatus === "loading" || !code} type="button" onClick={() => void copy()}>复制绑定码</button><button className="recognition-secondary" disabled={service.inviteStatus === "loading"} type="button" onClick={async () => { try { await backend.invite(true); setNow(Date.now()); setMessage("已生成新绑定码，旧码失效。"); } catch (error) { setMessage((error as Error).message); } }}>重新生成绑定码</button></>}
        </section>
        <section className="flow-card">
          <h3>填写家人的信息</h3>
          <label className="flow-field">家人绑定码
            <div><input value={query} placeholder="输入或粘贴绑定码" onChange={(e) => setQuery(e.target.value)} /><button type="button" onClick={async () => {
              try { setQuery(await navigator.clipboard.readText()); }
              catch { setMessage("粘贴失败，请手动输入。"); }
            }}>粘贴</button></div>
          </label>
          <p>家人与您的关系</p>
          <div className="font-options">
            {["女儿", "儿子", "其他"].map((item) => <button className={relation === item ? "selected" : ""} key={item} type="button" onClick={() => setRelation(item)}>{relation === item && "✓ "}{item}</button>)}
          </div>
          <p className="flow-helper">输入家人提供的有效绑定码；下一步创建申请并核对身份。</p>
        </section>
        <button className="recognition-primary" type="button" onClick={lookup}>下一步，确认家人身份</button>
        <section className="flow-card">
          <h3>收到的绑定申请</h3>
          {requests.length ? requests.map((request) => (
            <button className="request-row" key={request.id} type="button" onClick={() => fromRequest(request)}>
              <span><strong>{request.relation} · {request.applicantName}</strong><small>{request.maskedPhone}</small></span><em>待确认</em>
            </button>
          )) : <p className="flow-empty">暂无待确认申请</p>}
        </section>
        {message && <button className="settings-notice" type="button" onClick={() => setMessage("")}>{message}　×</button>}
        <div className="recognition-tip"><img alt="" src={`${assetPathPrefix}/b1192.svg`} /><p>不会默认共享所有资料。知道绑定码不代表已经绑定或获得授权。</p></div>
      </div>
    </main>
  );
}

function BindFamilyPage({
  candidate,
  preferences,
  save,
  onBack,
  onDone,
}: {
  candidate: BindingCandidate;
  preferences: ElderPreferences;
  save: (next: ElderPreferences) => Promise<boolean>;
  onBack: () => void;
  onDone: () => void;
}) {
  const [food, setFood] = useState(false);
  const [diet, setDiet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const confirm = async () => {
    setSaving(true);
    try {
      const members = preferences.members.some((item) => item.id === candidate.id)
        ? preferences.members
        : [...preferences.members, candidate];
      const grants = food || diet
        ? [...preferences.grants.filter((item) => item.memberId !== candidate.id), { memberId: candidate.id, foodRecords: food, dietProfile: diet }]
        : preferences.grants.filter((item) => item.memberId !== candidate.id);
      const requests = preferences.requests.map((request) =>
        request.id === candidate.requestId ? { ...request, status: "accepted" as const } : request,
      );
      if (await save({ ...preferences, members, grants, requests })) onDone();
      else {
        setSaving(false);
        setMessage("保存失败，请重试。");
      }
    } finally { setSaving(false); }
  };
  const reject = async () => {
    if (!window.confirm("确认拒绝此次申请？拒绝后不会建立绑定或授权。")) return;
    const requests = preferences.requests.map((request) =>
      request.id === candidate.requestId ? { ...request, status: "rejected" as const } : request,
    );
    if (await save({ ...preferences, requests })) onDone();
  };
  return (
    <main className="flow-page">
      <header className="recognition-header"><button aria-label="返回添加家人" type="button" onClick={onBack}><img alt="" src={`${assetPathPrefix}/7e864.svg`} /></button><h1>核对家人身份</h1></header>
      <div className="flow-content">
        <h2>是您的{candidate.relation}{candidate.name}吗？</h2>
        <p className="flow-lead">请当面或通过电话确认，认准姓名和手机尾号。</p>
        <section className="flow-card candidate-card"><h3>待确认的家人</h3><div><span>{candidate.name.slice(-1)}</span><p><strong>{candidate.relation} · {candidate.name}</strong><small>{candidate.maskedPhone}</small></p></div><em>正在核对绑定关系 · 尚未确认</em></section>
        <section className="flow-card"><h3>第一步：确认绑定</h3><p>绑定后可互相联系、收发关怀语音。绑定不等于共享授权。</p><p>确认前仍可拒绝此次申请。</p></section>
        <section className="flow-card"><h3>第二步：单独选择共享范围</h3><p className="flow-helper">以下默认关闭，不会自动共享。</p>
          <div className="permission-row"><span>食物识别记录<small>食品照片、识别时间及饮食参考提示</small></span><Toggle checked={food} label="授权食物识别记录" onClick={() => setFood(!food)} /></div>
          <div className="permission-row"><span>饮食相关资料<small>疾病、过敏原及饮食设置等敏感资料</small></span><Toggle checked={diet} label="授权饮食相关资料" onClick={() => setDiet(!diet)} /></div>
          <div className="permission-row"><span>健康测量等其他记录<small>不包含在此次共享中</small></span><em>未授权</em></div>
        </section>
        <div className="recognition-tip"><img alt="" src={`${assetPathPrefix}/b1192.svg`} /><p>确认后只共享您选择的范围。未选择时仅绑定。</p></div>
        {message && <p className="field-error">{message}</p>}
        <button className="recognition-primary" disabled={saving} type="button" onClick={confirm}>{saving ? "保存中…" : "确认绑定及所选授权"}</button>
        <button className="recognition-secondary" disabled={saving} type="button" onClick={reject}>拒绝此次申请</button>
      </div>
    </main>
  );
}

function GuardPage({
  members,
  preferences,
  save,
  onBack,
  onAdd,
}: {
  members: FamilyMember[];
  preferences: ElderPreferences;
  save: (next: ElderPreferences) => Promise<boolean>;
  onBack: () => void;
  onAdd: () => void;
}) {
  const [notice, setNotice] = useState("");
  const [memberInfo, setMemberInfo] = useState<FamilyMember | null>(null);
  const [authorization, setAuthorization] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<FamilyMember | null>(null);
  const [changing, setChanging] = useState(false);
  const service = backend.useBackend();
  const corrections: RelationshipCorrection[] = service.families.filter(f => f.amElder && f.requested_relation).map(f => ({ id: f.id, memberId: f.id, applicantName: f.member.name, currentRelation: f.relation, requestedRelation: f.requested_relation!, status: "pending" }));
  const sharingOn = preferences.grants.some((grant) => grant.foodRecords || grant.dietProfile);
  const memberGrant = memberInfo
    ? preferences.grants.find((item) => item.memberId === memberInfo.id)
    : null;
  const memberScopes = [
    memberGrant?.foodRecords && "食物识别记录",
    memberGrant?.dietProfile && "饮食相关资料",
  ].filter(Boolean);
  const pendingCorrection = memberInfo
    ? corrections.find(
        (item) =>
          item.memberId === memberInfo.id && item.status === "pending",
      )
    : null;
  const resolveCorrection = async (correction: RelationshipCorrection, accepted: boolean) => {
    try { await backend.patchFamily(correction.memberId, { ...(accepted ? { relation: correction.requestedRelation } : {}), resolve_relation: true }); setMemberInfo(null); setNotice(accepted ? "关系更正已确认。" : "已保留原关系。"); }
    catch (error) { setNotice((error as Error).message); }
  };
  const toggleSharing = () => {
    if (!members.length) return setNotice("请先添加家人，当前不能开启共享。");
    if (sharingOn) setCloseConfirm(true);
    else setAuthorization(true);
  };
  return (
    <main className="guard-page">
      <header className="records-brand">食护家 Foodlenscare</header>
      <div className="guard-content">
        <button className="guard-back" type="button" onClick={onBack}>
          <img alt="" src={`${assetPathPrefix}/489d9.svg`} />我的设置
        </button>
        <h1>子女守护</h1>
        <section className="settings-card family-list">
          <div className="family-heading">
            <h2>我的家人</h2>
            <button type="button" onClick={onAdd}>＋ 添加家人</button>
          </div>
          {members.length ? members.map((member) => {
            const grant = preferences.grants.find((item) => item.memberId === member.id);
            const scopes = [grant?.foodRecords && "食物记录", grant?.dietProfile && "饮食资料"].filter(Boolean);
            return (
              <button className="family-row" key={member.id} type="button" onClick={() => setMemberInfo(member)}>
                <span className={member.primary ? "primary" : ""}><img alt="" src={`${assetPathPrefix}/3a0fd.svg`} /></span>
                <span><strong>{member.relation} · {member.name}</strong><small>{member.maskedPhone}</small><small>{scopes.length ? `已授权：${scopes.join("、")}` : "未授权共享"}</small></span>
                <em>{member.primary ? "主要联系人" : "已绑定"}</em>
              </button>
            );
          }) : <div className="family-empty"><strong>尚未绑定家人</strong><p>添加家人后，仍需由您单独授权共享范围。</p></div>}
        </section>
        <section className="settings-card share-switch-row">
          <div><h2>与家人共享记录</h2>{sharingOn && <button type="button" onClick={() => setAuthorization(true)}>管理范围</button>}</div>
          <Toggle checked={sharingOn} label="与家人共享记录" onClick={toggleSharing} />
        </section>
        {notice && <button className="settings-notice" type="button" onClick={() => setNotice("")}>{notice}　×</button>}
      </div>
      {authorization && <AuthorizationDialog members={members} grants={preferences.grants} onCancel={() => setAuthorization(false)} onSave={async (grants) => {
        if (await save({ ...preferences, grants })) {
          setAuthorization(false);
          setNotice("家庭服务授权已更新。");
        } else setNotice("授权保存失败，请重试。");
      }} />}
      {closeConfirm && (
        <div className="home-modal-backdrop">
          <section className="font-dialog" role="dialog" aria-modal="true">
            <h2>关闭共享记录？</h2>
            <p>关闭后，已授权家人将无法继续查看或获得这些资料的更新，绑定关系仍保留。</p>
            <button className="primary-button" type="button" onClick={async () => {
              if (await save({ ...preferences, grants: [] })) {
                setCloseConfirm(false);
                setNotice("共享授权已撤销，家人绑定仍保留。");
              }
            }}>确认关闭</button>
            <button className="home-dialog-cancel" type="button" onClick={() => setCloseConfirm(false)}>取消</button>
          </section>
        </div>
      )}
      {memberInfo && (
        <div className="home-modal-backdrop" onMouseDown={() => setMemberInfo(null)}>
          <section className="font-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2>{memberInfo.relation} · {memberInfo.name}</h2>
            <p>{memberInfo.maskedPhone}<br />{memberInfo.primary ? "主要联系人" : "已绑定家人"}<br />授权范围：{memberScopes.length ? memberScopes.join("、") : "未授权"}</p>
            <p>首页呼叫家人使用当前主要联系人。</p>
            <button className="primary-button" disabled={changing || memberInfo.primary} type="button" onClick={async () => { setChanging(true); try { await backend.patchFamily(memberInfo.id, { is_primary: true }); setMemberInfo(null); setNotice("主要联系人已更新，呼叫家人将联系此人。"); } catch (error) { setNotice((error as Error).message); } finally { setChanging(false); } }}>{memberInfo.primary ? "当前主要联系人" : "设为主要联系人"}</button>
            <button className="home-dialog-cancel" disabled={changing} type="button" onClick={() => { setRemoveConfirm(memberInfo); setMemberInfo(null); }}>解除绑定</button>
            {pendingCorrection && (
              <div className="settings-correction">
                <strong>关系更正待确认</strong>
                <p>
                  {pendingCorrection.applicantName}申请将关系由“
                  {pendingCorrection.currentRelation}”更正为“
                  {pendingCorrection.requestedRelation}”。
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => resolveCorrection(pendingCorrection, true)}
                >
                  确认更正
                </button>
                <button
                  className="home-dialog-cancel"
                  type="button"
                  onClick={() => resolveCorrection(pendingCorrection, false)}
                >
                  保持原关系
                </button>
              </div>
            )}
            <button className="primary-button" type="button" onClick={() => setMemberInfo(null)}>关闭</button>
          </section>
        </div>
      )}
      {removeConfirm && <div className="home-modal-backdrop"><section className="font-dialog" role="dialog" aria-modal="true" aria-label="解除绑定确认"><h2>解除与{removeConfirm.name}的绑定？</h2><p>解除后停止共享资料和关怀语音。本人已保存记录保留；如果解除的是主要联系人，将由剩余家人接任，可在设置中调整。</p><button className="primary-button" disabled={changing} type="button" onClick={async () => { setChanging(true); try { await backend.removeFamily(removeConfirm.id); setRemoveConfirm(null); setNotice("已解除绑定。"); } catch (error) { setNotice((error as Error).message); } finally { setChanging(false); } }}>确认解除绑定</button><button className="home-dialog-cancel" disabled={changing} type="button" onClick={() => setRemoveConfirm(null)}>取消</button></section></div>}
    </main>
  );
}

export default function ElderSettings({
  elder,
  session,
  preferences,
  savePreferences,
  onHome,
  onRecords,
  onEdit,
  onLogin,
  onLogout,
}: {
  elder: ElderDraft;
  session: SessionKind;
  preferences: ElderPreferences;
  savePreferences: (next: ElderPreferences) => Promise<boolean>;
  onHome: () => void;
  onRecords: () => void;
  onEdit: () => void;
  onLogin: () => void;
  onLogout: () => Promise<void>;
}) {
  const [page, setPage] = useState<SettingsPage>("main");
  const [fontDialog, setFontDialog] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [feedback, setFeedback] = useState("");
  const settingsScroll = useRef(0);
  const [candidate, setCandidate] = useState<BindingCandidate | null>(null);
  const members = familyMembersFor(session, preferences);
  const profileParts = [elder.age && `${elder.age}岁`, maskedPhone(elder.phone)].filter(Boolean);
  const tags = [...elder.diseases, ...elder.allergens].filter((item) => item !== "无");

  if (page === "add-family") {
    return (
      <AddFamilyPage
        preferences={preferences}
        save={savePreferences}
        onLogin={onLogin}
        onBack={() => setPage("guard")}
        onCandidate={(next) => {
          setCandidate(next);
          setPage("bind-family");
        }}
      />
    );
  }
  if (page === "bind-family" && candidate) {
    return (
      <BindFamilyPage
        candidate={candidate}
        preferences={preferences}
        save={savePreferences}
        onBack={() => setPage("add-family")}
        onDone={() => {
          setCandidate(null);
          setPage("guard");
        }}
      />
    );
  }
  if (page === "guard") {
    return <GuardPage members={members} preferences={preferences} save={savePreferences} onAdd={() => setPage("add-family")} onBack={() => {
      setPage("main");
      window.setTimeout(() => window.scrollTo(0, settingsScroll.current), 0);
    }} />;
  }
  if (page === "help") {
    return <SharedHelp onBack={() => setPage("main")} />;
  }

  const pendingMessage = {
    edit: "老人资料编辑页面将在后续阶段接入，当前资料不会被重置。",
    add: "添加家人页面将在后续阶段接入。",
  };
  return (
    <main className="settings-page">
      <header className="records-brand">食护家 Foodlenscare</header>
      <div className="settings-content">
        <h1>我的设置</h1>
        <button className="settings-card profile-settings-card" type="button" onClick={onEdit}>
          <span className="profile-settings-icon"><img alt="" src={`${assetPathPrefix}/17eaf.svg`} /></span>
          <span><strong>{elder.name || "未填写称呼"}</strong><small>{profileParts.join(" · ") || "尚未填写年龄和手机号"}</small></span>
          <img alt="" src={`${assetPathPrefix}/6c0ad.svg`} />
          <span className="profile-tags">{tags.length ? tags.map((tag) => <em key={tag}>{tag}</em>) : <em>尚未填写饮食关注</em>}<i>编辑资料</i></span>
        </button>
        <section className="settings-card">
          <h2>看得清，听得懂</h2>
          <button className="settings-row" type="button" onClick={() => setFontDialog(true)}>
            <img alt="" src={`${assetPathPrefix}/8f419.svg`} /><span>字体大小</span><small>{fontLabels[preferences.fontSize]}</small><img alt="" src={`${assetPathPrefix}/170cb.svg`} />
          </button>
          <div className="settings-row">
            <img alt="" src={`${assetPathPrefix}/6eeac.svg`} />
            <span>语音播报<small>自动朗读食品识别结果</small></span>
            <Toggle checked={preferences.speechEnabled} label="自动朗读食品识别结果" onClick={async () => {
              if (await savePreferences({ ...preferences, speechEnabled: !preferences.speechEnabled })) {
                if (preferences.speechEnabled) window.speechSynthesis?.cancel();
                setFeedback(`语音播报已${preferences.speechEnabled ? "关闭" : "开启"}`);
              } else setFeedback("偏好保存失败，请重试。");
            }} />
          </div>
        </section>
        <section className="settings-card">
          <h2>基础信息</h2>
          <button className="settings-row" type="button" onClick={onEdit}>
            <img alt="" src={`${assetPathPrefix}/4a790.svg`} /><span>基础信息<small>查看并修改姓名、手机号码等信息</small></span><img alt="" src={`${assetPathPrefix}/170cb.svg`} />
          </button>
        </section>
        <button className="settings-card guardian-settings-entry" type="button" onClick={() => {
          settingsScroll.current = window.scrollY;
          setPage("guard");
          window.scrollTo(0, 0);
        }}>
          <img alt="" src={`${assetPathPrefix}/cd514.svg`} /><span><strong>子女守护</strong><small>{members.length ? `已绑定${members.length}位家人 · 联系与共享` : "尚未绑定家人 · 联系与共享"}</small></span><img alt="" src={`${assetPathPrefix}/6c0ad.svg`} />
        </button>
        <section className="settings-card">
          <h2>帮助</h2>
          <button className="settings-row" type="button" onClick={() => setPage("help")}><img alt="" src={`${assetPathPrefix}/b5a08.svg`} /><span>帮助与使用指南</span><img alt="" src={`${assetPathPrefix}/170cb.svg`} /></button>
        </section>
        {feedback && <button className="settings-notice" type="button" onClick={() => setFeedback("")}>{feedback}　×</button>}
        <AccountExit onLogout={onLogout} />
        <p className="settings-version">食护家 Foodlenscare · 版本 4.0.0</p>
      </div>
      <ElderBottomNav active="settings" onHome={onHome} onRecords={onRecords} />
      {fontDialog && <FontDialog current={preferences.fontSize} onCancel={() => setFontDialog(false)} onSave={async (fontSize) => {
        if (await savePreferences({ ...preferences, fontSize })) {
          setFontDialog(false);
          setFeedback(`已使用${fontLabels[fontSize]}`);
        } else setFeedback("字号保存失败，请重试。");
      }} />}
      {notice && (
        <div className="dialog-backdrop">
          <section className="dialog-card" role="dialog" aria-modal="true">
            <h2>编辑资料</h2>
            <p>{pendingMessage[notice]}</p>
            <button className="primary-button" type="button" onClick={() => setNotice(null)}>我知道了</button>
          </section>
        </div>
      )}
    </main>
  );
}
