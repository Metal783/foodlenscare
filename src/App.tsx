import * as backend from "./backend"
import { useEffect, useMemo, useState } from "react"
import {
  ChildProfilePage,
  ElderProfilePage,
  IdentityPage,
  emptyChildDraft,
  emptyElderDraft,
  type ChildDraft,
  type ElderDraft,
  type Role,
  type SessionKind,
} from "./Onboarding"
import ElderHome from "./ElderHome"
import FoodRecognition, { type RecognitionStage } from "./FoodRecognition"
import HealthRecords from "./HealthRecords"
import CareVoicePage from "./CareVoicePage"
import { useVoicePlayer } from "./voice"
import ElderSettings from "./ElderSettings"
import {
  familyMembersFor,
  sharingLabel,
  useElderPreferences,
} from "./preferences"
import ElderProfileEdit from "./ElderProfileEdit"
import ChildApp from "./ChildApp"

type View =
  | "welcome"
  | "phone"
  | "wechat"
  | "identity"
  | "elder-profile"
  | "child-profile"
  | "child-home"
  | "elder-home"
  | "recognition"
  | "health-records"
  | "care-voice"
  | "elder-settings"
  | "elder-edit"
type Session = SessionKind
type LegalKind = "用户协议" | "隐私政策"

const assetPathPrefix = "/assets"

function LegalDialog({
  kind,
  onClose,
}: {
  kind: LegalKind
  onClose: () => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="legal-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="legal-title">{kind}</h2>
        <p>{kind === "隐私政策" ? "游客资料仅保存在当前浏览器；登录后的本人资料、照片、记录和语音保存到本机家庭服务。老人确认绑定并单独授权后，子女才可读取对应范围，授权可随时撤回。" : "本版本供本机和可信局域网使用。验证码为本地测试，未接入短信或微信。食品标签识别需核对实物，饮食参考不替代医疗建议；求助入口需本人确认后拨号。"}</p>
        <button className="primary-button" type="button" onClick={onClose}>
          我知道了
        </button>
      </section>
    </div>
  )
}

function BrandLogo({ welcome = false }: { welcome?: boolean }) {
  return (
    <img
      alt="食护家"
      className={welcome ? "h-[88px] w-[88px]" : "h-[72px] w-[72px]"}
      src={`${assetPathPrefix}/${welcome ? "b6ebe.svg" : "9628f.svg"}`}
    />
  )
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-20 shrink-0 items-center gap-3 px-5">
      <button
        aria-label="返回欢迎页"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5ebe2] bg-white"
        type="button"
        onClick={onBack}
      >
        <img
          alt=""
          className="h-[22px] w-[22px]"
          src={`${assetPathPrefix}/7e864.svg`}
        />
      </button>
      <h1 className="font-inter-bold text-[22px] text-[#003e1c]">{title}</h1>
    </header>
  )
}

function WelcomePage({
  navigate,
  onGuest,
  openLegal,
}: {
  navigate: (view: View) => void
  onGuest: () => void
  openLegal: (kind: LegalKind) => void
}) {
  return (
    <main className="welcome-page">
      <img
        alt=""
        className="pointer-events-none absolute left-1/2 top-[100px] h-[242px] w-[242px] -translate-x-1/2"
        src={`${assetPathPrefix}/c1581.svg`}
      />
      <section className="relative flex w-full flex-col items-center gap-4">
        <BrandLogo welcome />
        <div className="flex flex-col items-center gap-0.5 text-[#003e1c]">
          <h1 className="font-brand-semibold text-[30px] leading-[38px]">
            食护家
          </h1>
          <p className="font-brand-medium text-base leading-[22px]">
            Foodlenscare
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col items-center gap-1 pt-[26px]">
        <div className="relative h-[82px] w-[280px]">
          <p className="font-brand-italic absolute inset-x-0 top-0 text-center text-[60px] leading-[72px] text-[#003e1c]">
            welcome
          </p>
          <img
            alt=""
            className="absolute left-10 top-[69px] h-[11px] w-[204px]"
            src={`${assetPathPrefix}/ee4c0.svg`}
          />
        </div>
        <p className="text-center text-lg leading-7 text-[#596359]">
          每一餐安心，每一天有伴。
        </p>
      </section>

      <section
        aria-label="登录方式"
        className="flex w-full justify-center gap-6 pt-11"
      >
        <button
          className="login-choice"
          type="button"
          onClick={() => navigate("wechat")}
        >
          <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#003e1c] bg-[#003e1c]">
            <img
              alt=""
              className="h-[34px] w-[38px]"
              src={`${assetPathPrefix}/3300f.svg`}
            />
          </span>
          <span>微信登录</span>
        </button>
        <button
          className="login-choice"
          type="button"
          onClick={() => navigate("phone")}
        >
          <img
            alt=""
            className="h-[76px] w-[76px]"
            src={`${assetPathPrefix}/4cd62.svg`}
          />
          <span>手机号登录</span>
        </button>
      </section>

      <div className="flex w-full justify-center pt-[34px]">
        <button
          className="h-12 w-[150px] text-lg text-[#596359]"
          type="button"
          onClick={onGuest}
        >
          暂时跳过
        </button>
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-[3px] pt-[68px] text-center text-sm leading-[22px]">
        <p className="text-[#596359]">登录即表示您同意</p>
        <p className="text-[#003e1c]">
          <button
            className="legal-link"
            type="button"
            onClick={() => openLegal("用户协议")}
          >
            《用户协议》
          </button>
          与
          <button
            className="legal-link"
            type="button"
            onClick={() => openLegal("隐私政策")}
          >
            《隐私政策》
          </button>
        </p>
      </div>
    </main>
  )
}

type PhoneDraft = {
  phone: string
  code: string
  agreed: boolean
  requestedPhone: string
  codeExpiresAt: number | null
  retryAt: number | null
}

function PhonePage({
  draft,
  setDraft,
  onBack,
  openLegal,
  onSuccess,
}: {
  draft: PhoneDraft
  setDraft: React.Dispatch<React.SetStateAction<PhoneDraft>>
  onBack: () => void
  openLegal: (kind: LegalKind) => void
  onSuccess: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [phoneError, setPhoneError] = useState("")
  const [codeError, setCodeError] = useState("")
  const [notice, setNotice] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const phoneValid = /^1[3-9]\d{9}$/.test(draft.phone)
  const secondsLeft = draft.retryAt
    ? Math.max(0, Math.ceil((draft.retryAt - now) / 1000))
    : 0
  const hasCurrentCode =
    draft.requestedPhone === draft.phone && draft.codeExpiresAt !== null
  const canSubmit =
    phoneValid &&
    draft.code.length === 6 &&
    draft.agreed &&
    hasCurrentCode &&
    !submitting

  useEffect(() => {
    if (!draft.retryAt || draft.retryAt <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [draft.retryAt])

  const validatePhone = () => {
    if (!draft.phone) {
      setPhoneError("请输入手机号码")
      return false
    }
    if (!phoneValid) {
      setPhoneError("请输入有效的11位手机号码")
      return false
    }
    setPhoneError("")
    return true
  }

  const updatePhone = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 11)
    setPhoneError("")
    setCodeError("")
    setNotice("")
    setDraft((current) => ({
      ...current,
      phone: next,
      ...(next !== current.phone
        ? { code: "", requestedPhone: "", codeExpiresAt: null, retryAt: null }
        : {}),
    }))
  }

  const requestCode = async () => {
    if (secondsLeft > 0 || submitting || !validatePhone()) return
    setSubmitting(true)
    try {
      const result = await backend.api("/auth/code", { method: "POST", body: { phone: draft.phone } })
      const timestamp = Date.now()
      setNow(timestamp)
      setDraft(current => ({ ...current, code: "", requestedPhone: current.phone, codeExpiresAt: timestamp + result.expiresIn * 1000, retryAt: timestamp + 60000 }))
      setCodeError("")
      setNotice(`本地测试验证码：${result.testCode}，未发送真实短信`)
    } catch (error) { setCodeError((error as Error).message) }
    finally { setSubmitting(false) }
  }
  const submit = async () => {
    if (submitting || !validatePhone()) return
    if (!draft.agreed) return setCodeError("请先同意用户协议与隐私政策")
    if (!hasCurrentCode || draft.codeExpiresAt! <= Date.now()) return setCodeError("请重新获取验证码")
    setSubmitting(true)
    try { await backend.login(draft.phone, draft.code); onSuccess() }
    catch (error) { setCodeError((error as Error).message) }
    finally { setSubmitting(false) }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7faf5]">
      <BackHeader title="手机号登录" onBack={onBack} />
      <div className="mx-auto flex min-h-[740px] w-full flex-col gap-5 px-5 pb-8 pt-2">
        <section className="flex flex-col items-center gap-2 py-3">
          <BrandLogo />
          <p className="font-brand-semibold text-[28px] text-[#003e1c]">
            食护家 Foodlenscare
          </p>
          <p className="text-center text-base leading-6 text-[#596359]">
            每一餐安心，每一天有伴。
          </p>
        </section>
        <h2 className="font-inter-bold text-[26px] leading-[1.5] text-[#191d1a]">
          用手机号登录
        </h2>
        <p className="text-base leading-6 text-[#596359]">
          输入手机号码，页面将显示本地测试验证码。
        </p>

        <label className="flex flex-col gap-2 text-lg leading-[1.5] text-[#191d1a]">
          手机号码
          <span className="input-shell">
            <input
              aria-describedby={phoneError ? "phone-error" : undefined}
              aria-invalid={Boolean(phoneError)}
              autoComplete="tel"
              className="field-input"
              inputMode="numeric"
              maxLength={11}
              placeholder="请输入11位手机号"
              type="tel"
              value={draft.phone}
              onBlur={validatePhone}
              onChange={(event) => updatePhone(event.target.value)}
            />
            <span className="shrink-0 text-base text-[#003e1c]">+86</span>
          </span>
          {phoneError && (
            <span className="field-error" id="phone-error" role="alert">
              {phoneError}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2 text-lg leading-[1.5] text-[#191d1a]">
          本地测试验证码
          <span className="input-shell">
            <input
              aria-describedby={codeError ? "code-error" : undefined}
              aria-invalid={Boolean(codeError)}
              autoComplete="one-time-code"
              className="field-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="输入验证码"
              value={draft.code}
              onChange={(event) => {
                setCodeError("")
                setDraft((current) => ({
                  ...current,
                  code: event.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }}
            />
            <button
              className="shrink-0 text-base text-[#003e1c] disabled:text-[#8a958b]"
              disabled={!phoneValid || secondsLeft > 0}
              type="button"
              onClick={requestCode}
            >
              {secondsLeft > 0 ? `${secondsLeft}秒后重试` : "获取验证码"}
            </button>
          </span>
          {codeError && (
            <span className="field-error" id="code-error" role="alert">
              {codeError}
            </span>
          )}
          {notice && (
            <span className="field-notice" role="status">
              {notice}
            </span>
          )}
        </label>

        <div className="flex items-start gap-2.5">
          <button
            aria-checked={draft.agreed}
            aria-label="我已阅读并同意"
            className={`agreement-box ${
              draft.agreed ? "agreement-box-checked" : ""
            }`}
            role="checkbox"
            type="button"
            onClick={() =>
              setDraft((current) => ({ ...current, agreed: !current.agreed }))
            }
          >
            {draft.agreed ? "✓" : ""}
          </button>
          <div className="flex flex-1 flex-col gap-[3px] text-[15px] leading-[1.5]">
            <button
              className="w-fit text-left text-[#191d1a]"
              type="button"
              onClick={() =>
                setDraft((current) => ({ ...current, agreed: !current.agreed }))
              }
            >
              我已阅读并同意
            </button>
            <p className="text-[#003e1c]">
              <button
                className="legal-link"
                type="button"
                onClick={() => openLegal("用户协议")}
              >
                《用户协议》
              </button>
              与
              <button
                className="legal-link"
                type="button"
                onClick={() => openLegal("隐私政策")}
              >
                《隐私政策》
              </button>
            </p>
          </div>
        </div>

        <button
          className="submit-button"
          disabled={!canSubmit}
          type="button"
          onClick={submit}
        >
          {submitting ? "登录中…" : "登录"}
        </button>
        <p className="text-center text-sm leading-6 text-[#596359]">
          填写号码、验证码并勾选同意后可登录
        </p>
        <div className="flex items-start gap-2.5 rounded-xl bg-[#e9f5e8] p-3.5">
          <img
            alt=""
            className="h-5 w-5 shrink-0"
            src={`${assetPathPrefix}/b1192.svg`}
          />
          <p className="text-sm leading-6 text-[#596359]">
            验证码仅用于验证您的身份，请勿告诉他人。
          </p>
        </div>
      </div>
    </main>
  )
}

function WechatPage({
  onBack,
  onSuccess,
  openLegal,
}: {
  onBack: () => void
  onSuccess: () => void
  openLegal: (kind: LegalKind) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const continueLogin = () => {
    if (submitting) return
    setSubmitting(true)
    window.setTimeout(onSuccess, 650)
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7faf5]">
      <BackHeader title="微信登录" onBack={onBack} />
      <div className="flex min-h-[740px] flex-col gap-5 px-5 pb-8 pt-2">
        <section className="flex flex-col items-center gap-3 py-5">
          <BrandLogo />
          <p className="font-brand-semibold text-[30px] text-[#003e1c]">
            食护家
          </p>
          <p className="text-center text-base leading-6 text-[#003e1c]">
            Foodlenscare
          </p>
        </section>
        <h2 className="font-inter-bold text-[26px] leading-[1.5] text-[#191d1a]">
          确认微信登录
        </h2>
        <p className="-mt-2 text-sm text-[#596359]" role="note">
          当前为演示登录，未连接微信。
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => setConfirming(true)}
        >
          确认登录
        </button>
        <button className="secondary-button" type="button" onClick={onBack}>
          取消返回
        </button>
      </div>

      {confirming && (
        <div className="dialog-backdrop">
          <section
            aria-labelledby="wechat-confirm-title"
            aria-modal="true"
            className="dialog-card"
            role="dialog"
          >
            <h2 id="wechat-confirm-title">演示登录确认</h2>
            <p>
              当前为演示登录，未连接微信，也不会获取真实微信身份、手机号或授权。
            </p>
            <p className="text-sm text-[#003e1c]">
              继续即表示您主动同意
              <button
                className="legal-link"
                type="button"
                onClick={() => openLegal("用户协议")}
              >
                《用户协议》
              </button>
              与
              <button
                className="legal-link"
                type="button"
                onClick={() => openLegal("隐私政策")}
              >
                《隐私政策》
              </button>
            </p>
            <button
              className="primary-button"
              disabled={submitting}
              type="button"
              onClick={continueLogin}
            >
              {submitting ? "处理中…" : "同意并继续"}
            </button>
            <button
              className="dialog-cancel"
              disabled={submitting}
              type="button"
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          </section>
        </div>
      )}
    </main>
  )
}

const initialDraft: PhoneDraft = {
  phone: "",
  code: "",
  agreed: false,
  requestedPhone: "",
  codeExpiresAt: null,
  retryAt: null,
}

export default function App() {
  const data = backend.useBackend()
  const [view, setView] = useState<View>("welcome")
  const [draft, setDraft] = useState<PhoneDraft>(initialDraft)
  const [legal, setLegal] = useState<LegalKind | null>(null)
  const [session, setSession] = useState<Session>("signed-out")
  const [role, setRole] = useState<Role>("elder")
  const [elderDraft, setElderDraft] = useState<ElderDraft>(emptyElderDraft)
  const [childDraft, setChildDraft] = useState<ChildDraft>(emptyChildDraft)
  const [recognitionStage, setRecognitionStage] = useState<RecognitionStage>("camera")
  const [requestedVoiceId, setRequestedVoiceId] = useState<string | null>(null)
  const savedProfile = JSON.stringify(data.account?.profile || {})
  useEffect(() => {
    if (!data.account || ["identity", "elder-profile", "child-profile", "elder-edit", "recognition"].includes(view)) return
    if (data.account.role === "elder") setElderDraft(backend.elderProfile())
    else if (view !== "child-home") setChildDraft(backend.childProfile())
  }, [savedProfile, data.account?.phone, view])
  const voicePlayer = useVoicePlayer(session)
  const { preferences, save: savePreferences } = useElderPreferences(session, elderDraft.phone)
  const familyMembers = familyMembersFor(session, preferences)
  const contactMember = familyMembers.find(m => m.primary) || familyMembers[0]
  const contact = contactMember ? { relation: contactMember.relation, name: contactMember.name, maskedPhone: contactMember.maskedPhone, fullPhone: contactMember.fullPhone } : null
  const sharing = sharingLabel(familyMembers, preferences.grants)
  const navigate = (next: View) => { window.history.pushState({ foodlensView: next }, ""); setView(next); window.scrollTo(0, 0) }
  const enter = () => {
    const account = backend.snapshot().account
    setSession(account ? "phone-demo" : "guest-demo")
    setElderDraft(account ? backend.elderProfile() : backend.localRead("elderProfile", emptyElderDraft))
    setChildDraft(account ? backend.childProfile() : backend.localRead("childProfile", emptyChildDraft))
    setRole(account?.role || "elder")
    navigate(account?.profile.completed ? account.role === "elder" ? "elder-home" : "child-home" : "identity")
  }
  useEffect(() => {
    window.history.replaceState({ foodlensView: "welcome" }, "")
    void backend.connect().then(() => { if (backend.snapshot().account) enter() })
    const pop = (event: PopStateEvent) => {
      const next = event.state?.foodlensView || "welcome"
      if (!backend.snapshot().account && !backend.snapshot().guest && !["welcome", "phone", "wechat"].includes(next)) { setView("welcome"); return }
      setView(next); setLegal(null)
    }
    window.addEventListener("popstate", pop)
    return () => window.removeEventListener("popstate", pop)
  }, [])
  const saveElder = async (next: ElderDraft) => { try { await backend.saveProfile("elder", next); setElderDraft(next); return true } catch (error) { backend.report(error); return false } }
  const saveChild = async (next: ChildDraft) => { try { await backend.saveProfile("child", next); setChildDraft(next); return true } catch (error) { backend.report(error); return false } }
  const completeElder = async () => { if (await saveElder(elderDraft)) navigate("elder-home") }
  const completeChild = async (skipped = false) => { if (skipped || await saveChild(childDraft)) navigate("child-home") }
  const exitAccount = async () => {
    voicePlayer.pause(); window.speechSynthesis?.cancel();
    await backend.logout();
    setSession("signed-out"); setRole("elder"); setDraft(initialDraft); setElderDraft(emptyElderDraft); setChildDraft(emptyChildDraft); setLegal(null);
    window.history.replaceState({ foodlensView: "welcome" }, ""); setView("welcome"); window.scrollTo(0, 0);
  }
  const beginScan = () => { setRecognitionStage("camera"); navigate("recognition") }
  let page
  if (view === "phone") page = <PhonePage draft={draft} setDraft={setDraft} openLegal={setLegal} onBack={() => navigate("welcome")} onSuccess={enter} />
  else if (view === "wechat") page = <WechatPage openLegal={setLegal} onBack={() => navigate("welcome")} onSuccess={() => { backend.report(new Error("微信登录尚未配置，请使用手机号本地测试登录。")); navigate("welcome") }} />
  else if (view === "identity") page = <IdentityPage role={role} setRole={setRole} onBack={() => navigate("welcome")} onContinue={async () => {
    if (data.account) { try { await backend.api("/me", { method: "PATCH", body: { role } }); await backend.refresh(); setElderDraft(backend.elderProfile()); setChildDraft(backend.childProfile()); navigate(role === "elder" ? "elder-profile" : "child-profile") } catch (error) { backend.report(error) } }
    else navigate(role === "elder" ? "elder-profile" : "child-profile")
  }} />
  else if (view === "elder-profile") page = <ElderProfilePage draft={elderDraft} setDraft={setElderDraft} session={session} onBack={() => navigate("identity")} onSkip={() => navigate("elder-home")} onComplete={completeElder} />
  else if (view === "child-profile") page = <ChildProfilePage draft={childDraft} setDraft={setChildDraft} session={session} onBack={() => navigate("identity")} onNeedLogin={() => navigate("welcome")} onComplete={completeChild} />
  else if (view === "child-home") page = <ChildApp child={childDraft} elder={elderDraft} preferences={preferences} session={session} onUpdateChild={saveChild} onLogout={exitAccount} />
  else if (view === "elder-home") page = <ElderHome session={session} contact={contact} onOpenCamera={beginScan} onOpenRecords={() => navigate("health-records")} onOpenVoice={id => { setRequestedVoiceId(id); navigate("care-voice") }} voicePlayer={voicePlayer} onOpenSettings={() => navigate("elder-settings")} />
  else if (view === "recognition") page = <FoodRecognition elder={elderDraft} session={session} setStage={setRecognitionStage} stage={recognitionStage} speechEnabled={preferences.speechEnabled} onStopFamilyAudio={voicePlayer.pause} onUpdateElder={saveElder} onHome={() => navigate("elder-home")} />
  else if (view === "health-records") page = <HealthRecords contact={contact} elder={elderDraft} session={session} onHome={() => navigate("elder-home")} onRecognize={beginScan} onSettings={() => navigate("elder-settings")} sharingStatus={sharing} />
  else if (view === "care-voice") page = <CareVoicePage player={voicePlayer} requestedId={requestedVoiceId} session={session} onBack={() => { voicePlayer.pause(); navigate("elder-home") }} />
  else if (view === "elder-settings") page = <ElderSettings elder={elderDraft} preferences={preferences} savePreferences={savePreferences} session={session} onHome={() => navigate("elder-home")} onRecords={() => navigate("health-records")} onEdit={() => navigate("elder-edit")} onLogin={() => navigate("phone")} onLogout={exitAccount} />
  else if (view === "elder-edit") page = <ElderProfileEdit initial={elderDraft} session={session} onBack={() => navigate("elder-settings")} onSave={saveElder} />
  else page = <WelcomePage navigate={navigate} openLegal={setLegal} onGuest={async () => { try { await backend.guestMode(); enter() } catch (error) { backend.report(error) } }} />
  return <>{page}{legal && <LegalDialog kind={legal} onClose={() => setLegal(null)} />}{data.error && <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true"><h2>{data.error ? "操作提示" : "关怀通知"}</h2><p role="status">{data.error || data.notice}</p><button className="primary-button" type="button" onClick={backend.clearNotice}>知道了</button></section></div>}</>
}
