import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as backend from "./backend";
import ServerAddressSettings from "./ServerAddressSettings";
import LegalDialog from "./LegalDialog";

const terms = [
  ["1. 由本人申请注销", "请确认当前账号为您本人使用，您已了解并自愿申请注销。注销只能作用于当前登录账号，不能代替家人注销。"],
  ["2. 提前保存需要的信息", "注销后，当前账号的个人资料、疾病与过敏信息、偏好设置、已保存识别记录及照片将从应用业务数据库中删除，无法通过再次登录恢复。请提前自行留存需要的信息。"],
  ["3. 家庭关联与共享终止", "注销时将自动解除当前账号的全部家庭绑定和待确认申请，撤销相关健康信息共享，绑定码失效。家人的账号及其本人保存的识别记录保留；注销主要联系人时，剩余已绑定家人可接任。"],
  ["4. 关怀语音与登录失效", "当前账号发送或接收的关怀语音及其回执将从应用业务数据库中删除，家人也无法再通过本应用访问这些语音。当前账号的全部登录会话同时失效。"],
  ["5. 注销后重新使用", "注销完成后返回欢迎页。之后使用相同手机号登录将创建新账号，原资料、识别记录、语音与家庭关系不会恢复，需要重新填写资料和申请绑定。"],
  ["6. 数据处理范围", "本功能清理当前服务的业务数据库和当前浏览器中本账号的偏好缓存，不会删除家人自行下载或截图保存的内容，也不会自动清理服务运行者另行保存的历史备份。历史备份应由服务运行者按其数据管理规则处理。"],
];

export default function AccountSecurity({ child = false, onLogout }: { child?: boolean; onLogout: () => Promise<void> }) {
  const account = backend.useBackend().account;
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [page, setPage] = useState<"closed" | "security" | "notice" | "agreement" | "confirm">("closed");
  const [token, setToken] = useState("");
  const [remaining, setRemaining] = useState(10);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deadline = useRef(0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const opened = page !== "closed";
  useEffect(() => {
    if (!opened) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [opened]);
  useEffect(() => {
    if (!token || page === "closed") return;
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
    update(); const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [token, page]);
  const openNotice = async () => {
    const current = ++generation.current;
    setPage("notice"); setToken(""); setAgreed(false); setRemaining(10); setError(""); setBusy(true);
    try {
      const result = await backend.api("/account/cancellation", { method: "POST", body: {} });
      if (generation.current !== current) return;
      deadline.current = performance.now() + result.waitSeconds * 1000; setToken(result.token);
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "无法开始注销，请重试。"); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const cancel = async () => {
    if (!token || remaining > 0 || !agreed || busy) return;
    setBusy(true); setError("");
    try { await backend.cancelAccount(token); await onLogout(); }
    catch (e) { setError(e instanceof Error ? e.message : "注销失败，请重试。"); setBusy(false); }
  };
  const primary = child ? "child-primary" : "primary-button";
  const secondary = child ? "child-secondary" : "recognition-secondary";
  if (page === "closed") return <button className={child ? "child-settings-row" : "settings-row"} type="button" onClick={() => { setPage("security"); setError(""); }}>
    <img alt="" width={22} height={22} src="/assets/f654c.svg" /><span>账号与安全</span><img alt="" width={16} height={16} src={child ? "/assets/3ffb6.svg" : "/assets/170cb.svg"} />
  </button>;
  const back = () => {
    if (busy && page === "confirm") return;
    if (page === "agreement" || page === "confirm") setPage("notice");
    else { generation.current++; setBusy(false); setToken(""); setError(""); setPage(page === "notice" ? "security" : "closed"); }
  };
  return createPortal(<main className="settings-page" style={{ position: "fixed", inset: 0, zIndex: 80, overflowY: "auto", paddingBottom: 0 }}>
    <header className="child-back-header">
      <button aria-label="返回" disabled={busy && page === "confirm"} type="button" onClick={back}><img alt="" width={20} height={20} src="/assets/86194.svg" /></button>
      <h1>{page === "security" ? "账号与安全" : page === "agreement" ? "账号注销协议" : page === "confirm" ? "确认注销账号" : "注销确认须知"}</h1>
    </header>
    <div className={child ? "child-content" : "settings-content"} style={{ paddingBottom: 36 }}>
      {page === "security" && <section className={child ? "child-card child-settings-card" : "settings-card"}>
        <ServerAddressSettings child={child} />
        <button className={child ? "child-settings-row" : "settings-row"} type="button" onClick={() => setPrivacyOpen(true)}><span>隐私政策</span><img alt="" width={16} height={16} src="/assets/170cb.svg" /></button>
        <button className={child ? "child-settings-row" : "settings-row"} disabled={!account} type="button" onClick={() => void openNotice()}><span>注销账号</span><img alt="" width={16} height={16} src="/assets/170cb.svg" /></button>
        {!account && <p>请先登录后管理账号。</p>}
      </section>}
      {(page === "notice" || page === "agreement") && <>
        <h2 style={{ fontSize: 24, lineHeight: 1.5 }}>{page === "notice" ? "开始注销前请确认以下内容" : "食护家账号注销协议"}</h2>
        <p>注销后无法恢复，请仔细阅读并确认。</p>
        {terms.map(([title, content]) => <section key={title} style={{ padding: "16px 0", borderBottom: "1px solid #dde5dd" }}><h3 style={{ fontSize: 20, lineHeight: 1.5 }}>{title}</h3><p style={{ marginTop: 12, lineHeight: 1.75 }}>{content}</p></section>)}
        {page === "agreement" ? <button className={secondary} type="button" onClick={() => setPage("notice")}>返回注销须知</button> : <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "20px 0", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />我已阅读并同意</label>
            <button className="text-[#003e1c] underline" type="button" onClick={() => setPage("agreement")}>《食护家账号注销协议》</button>
          </div>
          <button className={primary} disabled={!token || remaining > 0 || !agreed || busy} type="button" onClick={() => { setError(""); setPage("confirm"); }}>{busy ? "加载中…" : remaining > 0 ? `下一步（${remaining}s）` : "下一步"}</button>
          {!token && !busy && <button className={secondary} type="button" onClick={() => void openNotice()}>重新加载</button>}
        </>}
      </>}
      {page === "confirm" && <>
        <h2>确定注销当前账号？</h2><p>账号 {backend.mask(account?.phone || "")} 的资料、识别记录和相关语音将被删除，家庭关系解除，全部登录失效。此操作无法恢复。</p>
        <button className={primary} disabled={busy || !token || remaining > 0 || !agreed} type="button" onClick={() => void cancel()}>{busy ? "注销中…" : "确认注销账号"}</button>
        <button className={secondary} disabled={busy} type="button" onClick={() => setPage("notice")}>暂不注销</button>
      </>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    {privacyOpen && <LegalDialog kind="隐私政策" onClose={() => setPrivacyOpen(false)} />}
  </main>, document.body);
}
