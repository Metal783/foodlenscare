import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as backend from "./backend";
import { checkServerAddress, currentServerAddress, normalizeServerAddress, savedServerAddress, saveServerAddress } from "./serverAddress";
import { isMobileApp, removeMobileSession } from './mobile';

export default function ServerAddressSettings({ child = false, welcome = false }: { child?: boolean; welcome?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(savedServerAddress);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState("");
  const job = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current++; job.current?.abort(); }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const resetResult = () => { requestId.current++; job.current?.abort(); setBusy(false); setNotice(""); setError(""); setCandidate(""); };
  const check = async (save: boolean) => {
    if (busy) return;
    setError(""); setNotice(""); setBusy(true);
    const id = ++requestId.current;
    const controller = new AbortController(); job.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const origin = await checkServerAddress(value, controller.signal);
      if (id !== requestId.current) return;
      if (!save) setNotice("连接正常。");
      else if (origin === currentServerAddress()) { await saveServerAddress(origin); setNotice("已保存当前服务器地址。"); }
      else setCandidate(origin);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof DOMException && e.name === "AbortError" ? "连接超时，请确认设备在同一网络、后端已启动且防火墙已放行。" : e instanceof TypeError ? "无法连接，请检查网络、地址、端口和浏览器网络权限。" : e instanceof Error ? e.message : "连接失败，请重试。");
    } finally { window.clearTimeout(timer); if (id === requestId.current) setBusy(false); }
  };
  const switchServer = async () => {
    if (busy || !candidate) return;
    setBusy(true); setError("");
    try {
      const origin = normalizeServerAddress(candidate);
      // 只在当前后端结束会话，不把登录凭证、资料或语音发给新地址。
      if (isMobileApp()) {
        const previous = currentServerAddress();
        if (previous) {
          try { if (backend.snapshot().account) await backend.logout(); } catch { /* 旧电脑离线时仍可切换，旧会话按有效期失效。 */ }
          await removeMobileSession(previous);
        }
        await removeMobileSession(origin);
        await saveServerAddress(origin);
        window.location.reload();
      } else {
        if (backend.snapshot().account) await backend.logout();
        await saveServerAddress(origin);
        window.location.assign(`${origin}/`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); setBusy(false); }
  };
  const primary = child ? "child-primary" : "primary-button";
  const secondary = child ? "child-secondary" : "recognition-secondary";
  return <>
    <button className={welcome ? "text-[#003e1c] underline" : child ? "child-settings-row" : "settings-row"} type="button" onClick={() => { resetResult(); setValue(savedServerAddress()); setOpen(true); }}>
      {!welcome && <img alt="" width={22} height={22} src="/assets/f654c.svg" />}<span>服务器地址</span>{!welcome && <img alt="" width={16} height={16} src="/assets/170cb.svg" />}
    </button>
    {open && createPortal(<main className="settings-page" style={{ position: "fixed", inset: 0, zIndex: 100, overflowY: "auto", paddingBottom: 0 }}>
      <header className="child-back-header"><button aria-label="返回" disabled={busy && !!candidate} type="button" onClick={() => { resetResult(); setOpen(false); }}><img alt="" width={20} height={20} src="/assets/86194.svg" /></button><h1>服务器地址</h1></header>
      <div className={child ? "child-content" : "settings-content"}>
        <p>当前连接</p><p style={{ overflowWrap: "anywhere" }}>{currentServerAddress() || '尚未配置'}</p>
        <label className="flow-field">服务器地址<span className="input-shell"><input className="field-input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="http://192.168.1.10:5184" value={value} disabled={busy && !!candidate} onChange={e => { resetResult(); setValue(e.target.value); }} /></span></label>
        {candidate ? <>
          <h2>切换服务器？</h2><p style={{ overflowWrap: "anywhere" }}>{candidate}</p><p>切换后需在目标服务器登录。当前服务器上的资料和家庭关系保留，不会转移到另一台服务器。</p>
          <button className={primary} disabled={busy} type="button" onClick={() => void switchServer()}>{busy ? "连接中…" : "确认切换"}</button>
          <button className={secondary} disabled={busy} type="button" onClick={() => setCandidate("")}>取消</button>
        </> : <>
          <button className={secondary} disabled={busy} type="button" onClick={() => void check(false)}>{busy ? "检查中…" : "检查连接"}</button>
          <button className={primary} disabled={busy} type="button" onClick={() => void check(true)}>保存并连接</button>
          <button className={secondary} disabled={busy || !currentServerAddress()} type="button" onClick={async () => { resetResult(); try { await saveServerAddress(currentServerAddress()); setValue(currentServerAddress()); setNotice("已恢复当前服务器地址。"); } catch { setError("无法保存地址，请检查浏览器存储权限。"); } }}>恢复默认</button>
        </>}
        {notice && <p role="status">{notice}</p>}{error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </main>, document.body)}
  </>;
}
