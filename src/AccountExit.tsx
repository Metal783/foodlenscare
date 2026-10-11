import { useState } from "react";

export default function AccountExit({ onLogout, child = false }: { onLogout: () => Promise<void>; child?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await onLogout(); } catch (e) { setError(e instanceof Error ? e.message : "退出失败，请重试。"); setBusy(false); }
  };
  return <>
    <button className={child ? "child-secondary" : "recognition-secondary"} type="button" onClick={() => setOpen(true)}>退出登录</button>
    {open && <div className={child ? "child-modal-backdrop" : "home-modal-backdrop"}><section className={child ? "child-modal" : "font-dialog"} role="dialog" aria-modal="true" aria-label="退出登录确认"><h2>退出当前账号？</h2><p>退出后返回登录方式选择页，本人资料和已保存记录仍保留。</p>{error && <p role="alert">{error}</p>}<button className={child ? "child-primary" : "primary-button"} disabled={busy} type="button" onClick={() => void confirm()}>{busy ? "退出中…" : "确认退出"}</button><button className={child ? "child-secondary" : "home-dialog-cancel"} disabled={busy} type="button" onClick={() => setOpen(false)}>取消</button></section></div>}
  </>;
}
