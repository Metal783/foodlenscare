import { useEffect, useRef, useState } from "react";
import type { SessionKind } from "./Onboarding";
import type { VoicePlayer } from "./voice";
import ElderBottomNav from "./ElderBottomNav";

type ModalKind = "contact" | "emergency" | null;

export type FamilyContact = {
  relation: string;
  name: string;
  maskedPhone: string;
  fullPhone?: string;
  example?: boolean;
};

const assetPathPrefix = "assets";

function CallDialog({
  contact,
  processing,
  message,
  onCancel,
  onConfirm,
}: {
  contact: FamilyContact;
  processing: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);


  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <section
      aria-describedby="call-description"
      aria-labelledby="call-title"
      aria-modal="true"
      className="home-dialog"
      role="dialog"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 id="call-title">给{contact.relation}{contact.name}打电话？</h2>
      <div className="contact-row">
        <div className="contact-avatar">{contact.name.slice(-1)}</div>
        <div>
          <strong>{contact.relation} · {contact.name}</strong>
          <span>{contact.maskedPhone}</span>
          {contact.example && <small>演示联系人，未写入当前账号</small>}
        </div>
      </div>
      <p id="call-description">将打开系统电话，请确认拨打。<br />当前尚未拨打。</p>
      {message && <p className="home-dialog-message" role="status">{message}</p>}
      <button className="home-dialog-confirm" disabled={processing} type="button" onClick={onConfirm}>
        {processing ? "处理中…" : "确认呼叫"}
      </button>
      <button ref={cancelRef} className="home-dialog-cancel" disabled={processing} type="button" onClick={onCancel}>取消</button>
    </section>
  );
}

function EmergencyDialog({
  processing,
  message,
  onCancel,
  onConfirm,
}: {
  processing: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <section
      aria-describedby="emergency-description"
      aria-labelledby="emergency-title"
      aria-modal="true"
      className="home-dialog"
      role="dialog"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 id="emergency-title">是否拨打急救电话120？</h2>
      <div className="emergency-description" id="emergency-description">
        将打开系统电话拨打120，请确认。<br />当前尚未拨打。
      </div>
      {message && <p className="home-dialog-message" role="status">{message}</p>}
      <button className="home-dialog-confirm emergency-confirm" disabled={processing} type="button" onClick={onConfirm}>
        {processing ? "处理中…" : "确认拨打120"}
      </button>
      <button ref={cancelRef} className="home-dialog-cancel" disabled={processing} type="button" onClick={onCancel}>取消</button>
    </section>
  );
}

export default function ElderHome({
  session,
  contact = null,
  onOpenCamera,
  onOpenRecords,
  onOpenVoice,
  voicePlayer,
  onOpenSettings,
}: {
  session: SessionKind;
  contact?: FamilyContact | null;
  onOpenCamera: () => void;
  onOpenRecords: () => void;
  onOpenVoice: (voiceId: string) => void;
  voicePlayer: VoicePlayer;
  onOpenSettings: () => void;
}) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [processing, setProcessing] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [notice, setNotice] = useState(
    session === "guest-demo" ? "当前为游客演示，不会自动登录、绑定家人或开启共享。" : "",
  );
  const homeVoice =
    voicePlayer.voices.find((voice) => voice.id === voicePlayer.currentId) ||
    voicePlayer.voices[0] ||
    null;
  const homeVoicePlaying =
    Boolean(homeVoice) &&
    voicePlayer.currentId === homeVoice?.id &&
    voicePlayer.isPlaying;

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (window.history.state?.homeModal) window.history.back();
        else setModal(null);
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>(".home-dialog button:not(:disabled)"),
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const closeOnBack = () => setModal(null);
    window.addEventListener("keydown", handleDialogKeys);
    window.addEventListener("popstate", closeOnBack);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      window.removeEventListener("popstate", closeOnBack);
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, [modal]);

  const openModal = (kind: Exclude<ModalKind, null>) => {
    if (modal) return;
    setProcessing(false);
    setDialogMessage("");
    window.history.pushState({ foodlensView: "elder-home", homeModal: kind }, "");
    setModal(kind);
  };

  const closeModal = () => {
    if (processing) return;
    if (window.history.state?.homeModal) window.history.back();
    else setModal(null);
    setDialogMessage("");
  };

  const tryDial = (number: string, fallback: string) => {
    const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isPhone) {
      setDialogMessage(fallback);
      setProcessing(false);
      return;
    }
    setProcessing(true);
    window.setTimeout(() => {
      window.location.href = `tel:${number}`;
      setProcessing(false);
    }, 120);
  };

  const callContact = () => {
    if (!contact?.fullPhone || !/^1[3-9]\d{9}$/.test(contact.fullPhone)) {
      setDialogMessage("联系人号码未完善，请在子女守护中核对。");
      return;
    }
    tryDial(contact.fullPhone, "无法打开系统电话，请使用手机电话手动拨打联系人号码");
  };

  return (
    <main className="elder-home">
      <div className="elder-home-content">
        {notice && (
          <button aria-label="关闭提示" className="home-notice" type="button" onClick={() => setNotice("")}>
            <span role="status">{notice}</span><span aria-hidden="true">×</span>
          </button>
        )}

        <section className="home-card voice-card" aria-labelledby="voice-title">
          {homeVoice ? (
            <div className="voice-home-row">
              <img alt="" className="h-10 w-10" src={`${assetPathPrefix}/1adbb.svg`} />
              <button
                className="voice-home-copy"
                type="button"
                onClick={() => onOpenVoice(homeVoice.id)}
              >
                <strong id="voice-title">
                  {homeVoice.demo ? "演示关怀语音" : `${homeVoice.relation}发来关怀语音`}
                </strong>
                <span>
                  {homeVoice.relation} · {homeVoice.sender} · {Math.round(homeVoice.duration)}秒
                </span>
              </button>
              <button
                aria-label={homeVoicePlaying ? "暂停关怀语音" : "播放关怀语音"}
                className="voice-home-play"
                disabled={voicePlayer.loading}
                type="button"
                onClick={() => voicePlayer.toggle(homeVoice.id)}
              >
                {homeVoicePlaying ? "Ⅱ" : "▶"}
              </button>
            </div>
          ) : (
            <div className="voice-empty">
              <img alt="" className="h-10 w-10" src={`${assetPathPrefix}/1adbb.svg`} />
              <p id="voice-title">暂无家人语音</p>
            </div>
          )}
          {voicePlayer.error && <p className="voice-home-error" role="alert">{voicePlayer.error}</p>}
        </section>

        <section className="home-card scan-card">
          <button
            aria-label="拍照识别食品标签"
            className="scan-target"
            type="button"
            onClick={onOpenCamera}
          >
            <img alt="" className="scan-icon" src={`${assetPathPrefix}/8ef77.svg`} />
            <strong>对准食品背面标签</strong>
            <i className="corner corner-tl" /><i className="corner corner-tr" />
            <i className="corner corner-bl" /><i className="corner corner-br" />
          </button>
        </section>

        <section className="home-card guardian-card">
          <div className="guardian-title">
            <img alt="" className="h-12 w-12" src={`${assetPathPrefix}/e47d4.svg`} />
            <h2>子女连线协同守护</h2>
          </div>
          <div className="guardian-actions">
            {contact ? (
              <button className="family-action" type="button" onClick={() => openModal("contact")}>
                <img alt="" className="h-6 w-6" src={`${assetPathPrefix}/98d25.svg`} />
                <strong>呼叫{contact.relation}</strong>
                <span>
                  {contact.example
                    ? `演示联系人 · ${contact.name}`
                    : `${contact.name} (直拨电话)`}
                </span>
              </button>
            ) : (
              <button
                className="family-action"
                type="button"
                onClick={onOpenSettings}
              >
                <img alt="" className="h-6 w-6" src={`${assetPathPrefix}/98d25.svg`} />
                <strong>添加家人</strong>
                <span>尚未绑定联系人</span>
              </button>
            )}
            <button className="emergency-action" type="button" onClick={() => openModal("emergency")}>
              <img alt="" className="h-6 w-6" src={`${assetPathPrefix}/fab47.svg`} />
              <strong>紧急求助</strong>
              <span>拨打120急救电话</span>
            </button>
          </div>
        </section>
      </div>

      <ElderBottomNav active="home" onHome={onOpenCamera} onRecords={onOpenRecords} onSettings={onOpenSettings} />

      {modal && (
        <div className="home-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          {modal === "contact" && contact ? (
            <CallDialog
              contact={contact}
              message={dialogMessage}
              processing={processing}
              onCancel={closeModal}
              onConfirm={callContact}
            />
          ) : (
            <EmergencyDialog
              message={dialogMessage}
              processing={processing}
              onCancel={closeModal}
              onConfirm={() => tryDial("120", "无法打开系统电话，请使用手机电话手动拨打120")}
            />
          )}
        </div>
      )}
    </main>
  );
}
