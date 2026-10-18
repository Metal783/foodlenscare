import * as backend from "./backend"
import { useEffect, useState } from "react"
import BirthDateFields from './BirthDateFields'
import { birthDateIssue, profileAge } from './birthDate'

export type SessionKind = "signed-out" | "phone-demo" | "wechat-demo" | "guest-demo"
export type Role = "child" | "elder"

export type ElderDraft = {
  name: string
  phone: string
  phoneVerified: boolean
  age: string
  birthDate: string
  gender: "" | "女" | "男"
  weight: string
  diseases: string[]
  diseaseOther: string
  allergens: string[]
  allergenOther: string
  healthConsent: boolean
}

export type ChildDraft = {
  name: string
  birthDate: string
  age: string
  phone: string
  phoneVerified: boolean
  bindingCode: string
  relation: "" | "女儿" | "儿子" | "其他"
}

export const emptyElderDraft: ElderDraft = {
  name: "",
  phone: "",
  phoneVerified: false,
  age: "",
  birthDate: "",
  gender: "",
  weight: "",
  diseases: [],
  diseaseOther: "",
  allergens: [],
  allergenOther: "",
  healthConsent: false,
}

export const emptyChildDraft: ChildDraft = {
  name: "",
  birthDate: "",
  age: "",
  phone: "",
  phoneVerified: false,
  bindingCode: "",
  relation: "",
}

const assetPathPrefix = "assets"

export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}


function FormBack({
  onClick,
  icon = "2b37c.svg",
}: {
  onClick: () => void
  icon?: string
}) {
  return (
    <header className="flex h-20 items-center px-5">
      <button
        className="form-back"
        aria-label="返回"
        type="button"
        onClick={onClick}
      >
        <img alt="" className="h-5 w-5" src={`${assetPathPrefix}/${icon}`} />
      </button>
    </header>
  )
}

function FieldError({ children }: { children: string }) {
  return (
    <p className="field-error" role="alert">
      {children}
    </p>
  )
}

function PhoneVerification({
  phone,
  verified,
  guest,
  onPhoneChange,
  onVerified,
  label,
  helper,
}: {
  phone: string
  verified: boolean
  guest: boolean
  onPhoneChange: (phone: string) => void
  onVerified: () => void
  label: string
  helper: string
}) {
  const [requested, setRequested] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const valid = isValidPhone(phone)

  const [testCode, setTestCode] = useState("")
  const request = async () => {
    if (!valid) return setError("请输入有效的11位手机号码")
    try { const result = await backend.api("/auth/code", { method: "POST", body: { phone } }); setTestCode(result.testCode); setRequested(true); setCode(""); setError("") }
    catch (error) { setError((error as Error).message) }
  }
  const verify = async () => {
    if (guest) { if (!valid && phone) return setError("请输入有效手机号或留空"); onVerified(); return }
    try { await backend.changePhone(phone, code); onVerified(); setError("") }
    catch (error) { setError((error as Error).message) }
  }

  return (
    <div className="form-field">
      <label>{label}</label>
      <div className="profile-input-shell">
        <input
          inputMode="numeric"
          maxLength={11}
          placeholder={guest ? "游客可留空" : "请输入本人手机号码"}
          type="tel"
          value={phone}
          onChange={(event) => {
            setRequested(false)
            setCode("")
            setError("")
            onPhoneChange(event.target.value.replace(/\D/g, "").slice(0, 11))
          }}
        />
        {verified ? (
          <span className="verified-label">
            {guest ? "演示资料" : "已验证"}
          </span>
        ) : (
          <button type="button" onClick={guest ? verify : request}>
            {guest ? "演示继续" : "验证"}
          </button>
        )}
      </div>
      <p className="form-helper">
        {guest ? "游客演示，资料未提交至真实服务。" : helper}
      </p>
      {requested && !verified && (
        <div className="demo-code-box">
          <p role="status">本地测试验证码：{testCode}，未发送真实短信</p>
          <div className="profile-input-shell">
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="输入6位验证码"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <button type="button" onClick={verify}>
              确认验证
            </button>
          </div>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

export function IdentityPage({
  role,
  setRole,
  onBack,
  onContinue,
}: {
  role: Role
  setRole: (role: Role) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <main className="onboarding-page">
      <FormBack onClick={onBack} />
      <div className="identity-content">
        <section className="page-intro">
          <h1>请选择您的身份</h1>
          <p>为家人送去关怀，或照顾自己的每一餐。请选择最适合您的身份。</p>
        </section>
        <div
          className="flex flex-col gap-4 pt-6"
          role="radiogroup"
          aria-label="身份选择"
        >
          <RoleCard
            active={role === "child"}
            description={
              <>
                关心父母的饮食与健康，
                <br />
                让关怀陪伴家人的每一天。
              </>
            }
            icon="4deca.svg"
            title="我是子女"
            onClick={() => setRole("child")}
          />
          <RoleCard
            active={role === "elder"}
            description={
              <>
                记录自己的饮食与健康，
                <br />
                让每一餐吃得安心、放心。
              </>
            }
            icon="17d08.svg"
            title="我是老人"
            onClick={() => setRole("elder")}
          />
        </div>
        <div className="flex items-center gap-2 pt-5 text-base leading-[26px] text-[#596359]">
          <img
            alt=""
            className="h-5 w-5"
            src={`${assetPathPrefix}/d11d6.svg`}
          />
          <p>无论哪种身份，都有一份安心陪伴。</p>
        </div>
        <div className="flex flex-col gap-3 pt-[58px]">
          <button
            className="onboarding-primary"
            type="button"
            onClick={onContinue}
          >
            继续
          </button>
          <p className="text-center text-base leading-[26px] text-[#596359]">
            下一步：设置您的基础信息
          </p>
        </div>
      </div>
    </main>
  )
}

function RoleCard({
  active,
  description,
  icon,
  title,
  onClick,
}: {
  active: boolean
  description: React.ReactNode
  icon: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      aria-checked={active}
      className={`role-card ${active ? "role-card-active" : ""}`}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <span className="flex w-full items-center gap-3">
        <span className={`role-icon ${active ? "role-icon-active" : ""}`}>
          <span
            aria-hidden="true"
            className="h-[26px] w-[26px]"
            style={{
              backgroundColor: active ? "#fff" : "#003e1c",
              maskImage: `url(${assetPathPrefix}/${icon})`,
              maskPosition: "center",
              maskRepeat: "no-repeat",
              maskSize: "contain",
            }}
          />
        </span>
        <strong>{title}</strong>
        <span className={`role-radio ${active ? "role-radio-active" : ""}`}>
          {active && (
            <img
              alt=""
              className="h-4 w-4"
              src={`${assetPathPrefix}/2c139.svg`}
            />
          )}
        </span>
      </span>
      <span className="text-left text-lg leading-[27px] text-[#596359]">
        {description}
      </span>
    </button>
  )
}

function ChoiceGroup({
  label,
  options,
  selected,
  multiple = false,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  multiple?: boolean
  onChange: (value: string[]) => void
}) {
  const toggle = (option: string) => {
    if (!multiple) {
      onChange(selected.includes(option) ? [] : [option])
      return
    }
    if (option === "无") {
      onChange(selected.includes("无") ? [] : ["无"])
      return
    }
    const withoutNone = selected.filter((item) => item !== "无")
    onChange(
      withoutNone.includes(option)
        ? withoutNone.filter((item) => item !== option)
        : [...withoutNone, option],
    )
  }
  return (
    <fieldset className="form-field">
      <legend>{label}</legend>
      <div className={multiple ? "chip-list" : "segmented-options"}>
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              aria-pressed={active}
              className={
                multiple
                  ? `choice-chip ${active ? "choice-chip-active" : ""}`
                  : `segment ${active ? "segment-active" : ""}`
              }
              key={option}
              type="button"
              onClick={() => toggle(option)}
            >
              {!multiple && active && (
                <img
                  alt=""
                  className="mr-1 h-3.5 w-3.5"
                  src={`${assetPathPrefix}/5bcad.svg`}
                />
              )}
              {option}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function StageComplete({
  title,
  message,
  onClose,
}: {
  title: string
  message: string
  onClose: () => void
}) {
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-title"
      >
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        <h2 id="stage-title">{title}</h2>
        <p role="status">{message}</p>
        <button className="primary-button" type="button" onClick={onClose}>
          继续
        </button>
      </section>
    </div>
  )
}

export function ElderProfilePage({
  draft,
  setDraft,
  session,
  onBack,
  onComplete,
  onSkip,
}: {
  draft: ElderDraft
  setDraft: React.Dispatch<React.SetStateAction<ElderDraft>>
  session: SessionKind
  onBack: () => void
  onComplete: () => void
  onSkip: () => void
}) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const guest = session === "guest-demo"
  const hasHealth = draft.diseases.length > 0 || draft.allergens.length > 0

  const save = () => {
    const name = draft.name.trim()
    if (!name) return setError("请输入姓名或称呼")
    if (!guest && !draft.phoneVerified) return setError("请先验证手机号码")
    const birthdayError = birthDateIssue(draft.birthDate)
    if (birthdayError) return setError(birthdayError)
    if (
      draft.weight &&
      (!/^\d+(\.\d+)?$/.test(draft.weight) ||
        +draft.weight < 1 ||
        +draft.weight > 300)
    ) {
      return setError("请检查体重，体重应为1至300公斤之间的数字")
    }
    if (hasHealth && !draft.healthConsent) {
      return setError(
        "如需保存疾病或过敏原，请先明确同意保存健康资料；也可清空这些选项后继续",
      )
    }
    const next = { ...draft, name, age: profileAge(draft) }
    setDraft(next)
    setError("")
    setSaving(true)
    void backend.saveProfile("elder", next).then(() => {
      setSaving(false)
      onComplete()
    }).catch(error => { setSaving(false); setError(error.message) })
  }

  return (
    <main className="onboarding-page">
      <FormBack icon="aef2a.svg" onClick={onBack} />
      <div className="profile-content">
        <section className="page-intro">
          <h1>设置您的基础信息</h1>
          <p>让我们更好地认识您，陪伴日常健康。</p>
        </section>
        <section className="profile-card">
          <div className="card-heading">
            <h2>个人信息</h2>
            <span>姓名、手机号码必填</span>
          </div>
          <div className="form-field">
            <label htmlFor="elder-name">姓名 / 称呼</label>
            <input
              id="elder-name"
              className="profile-input"
              placeholder="请输入您的姓名或称呼"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </div>
          <PhoneVerification
            guest={guest}
            helper={
              draft.phoneVerified
                ? "已填入您的登录号码"
                : "未验证的号码需先完成本地测试验证。"
            }
            label="手机号码"
            phone={draft.phone}
            verified={draft.phoneVerified}
            onPhoneChange={(phone) =>
              setDraft((d) => ({ ...d, phone, phoneVerified: false }))
            }
            onVerified={() => setDraft((d) => ({ ...d, phoneVerified: true }))}
          />
          <BirthDateFields id="elder" birthDate={draft.birthDate} age={draft.age} onChange={value => setDraft(d => ({ ...d, ...value }))} />
          <ChoiceGroup
            label="性别（选填）"
            options={["女", "男"]}
            selected={draft.gender ? [draft.gender] : []}
            onChange={(value) =>
              setDraft((d) => ({
                ...d,
                gender: (value[0] || "") as ElderDraft["gender"],
              }))
            }
          />
          <div className="form-field">
            <label htmlFor="elder-weight">体重（选填）</label>
            <div className="profile-input-shell">
              <input
                id="elder-weight"
                inputMode="decimal"
                placeholder="请输入"
                value={draft.weight}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, weight: e.target.value }))
                }
              />
              <span>公斤</span>
            </div>
          </div>
          <ChoiceGroup
            label="基础疾病（可多选）"
            multiple
            options={["无", "高血压", "糖尿病", "高血脂", "冠心病", "其他"]}
            selected={draft.diseases}
            onChange={(diseases) => setDraft((d) => ({ ...d, diseases }))}
          />
          {draft.diseases.includes("其他") && (
            <input
              className="profile-input"
              aria-label="其他基础疾病"
              placeholder="请补充其他基础疾病"
              value={draft.diseaseOther}
              onChange={(e) =>
                setDraft((d) => ({ ...d, diseaseOther: e.target.value }))
              }
            />
          )}
          <ChoiceGroup
            label="过敏原（可多选）"
            multiple
            options={["无", "花生", "蟹黄", "牛奶", "鱼类", "其他"]}
            selected={draft.allergens}
            onChange={(allergens) => setDraft((d) => ({ ...d, allergens }))}
          />
          {draft.allergens.includes("其他") && (
            <input
              className="profile-input"
              aria-label="其他过敏原"
              placeholder="请补充其他过敏原"
              value={draft.allergenOther}
              onChange={(e) =>
                setDraft((d) => ({ ...d, allergenOther: e.target.value }))
              }
            />
          )}
        </section>
        <div className="privacy-card">
          <img
            alt=""
            className="h-5 w-5"
            src={`${assetPathPrefix}/5a351.svg`}
          />
          <div>
            <p>信息用于个人饮食照护，不会因完成录入自动向子女共享。</p>
            <label className="health-consent">
              <input
                type="checkbox"
                checked={draft.healthConsent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, healthConsent: e.target.checked }))
                }
              />
              我明确同意将所选健康资料保存为本机家庭服务数据
            </label>
          </div>
        </div>
        {error && <FieldError>{error}</FieldError>}
        {guest && (
          <p className="guest-note">游客演示，资料未提交至真实服务。</p>
        )}
      <button
        className="onboarding-primary"
        disabled={saving}
        type="button"
        onClick={save}
      >
        {saving ? "保存中…" : "完成设置，开始使用"}
      </button>
      <button className="skip-profile" disabled={saving} type="button" onClick={onSkip}>
        暂时跳过基础信息设置
      </button>
      <p className="form-footer-note">
        以后可在「我的设置」查看和修改，不用担心填错。
      </p>
      </div>
    </main>
  )
}

export function ChildProfilePage({
  draft,
  setDraft,
  session,
  onBack,
  onNeedLogin,
  onComplete,
}: {
  draft: ChildDraft
  setDraft: React.Dispatch<React.SetStateAction<ChildDraft>>
  session: SessionKind
  onBack: () => void
  onNeedLogin: () => void
  onComplete: (skipped?: boolean) => void
}) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState(false)
  const [complete, setComplete] = useState<"pending" | "skipped" | null>(null)
  const guest = session === "guest-demo"
  const hasBindingCode = Boolean(draft.bindingCode.trim())

  useEffect(() => {
    setError("")
  }, [draft.bindingCode, draft.relation])

  const validatePersonal = () => {
    if (!draft.name.trim()) return "请输入姓名或称呼"
    if (!guest && !draft.phoneVerified) return "请先验证本人手机号码"
    const birthdayError = birthDateIssue(draft.birthDate)
    if (birthdayError) return birthdayError
    return ""
  }

  const [candidate, setCandidate] = useState<any>(null)
  const savePersonal = async () => {
    const issue = validatePersonal()
    if (issue) return setError(issue)
    if (saving) return
    setSaving(true); setError('')
    const next = { ...draft, name: draft.name.trim(), age: profileAge(draft) }
    try { await backend.saveProfile('child', next); setDraft(next); onComplete(true) }
    catch (error) { setError((error as Error).message) }
    finally { setSaving(false) }
  }
  const reviewBinding = async () => {
    const issue = validatePersonal()
    if (issue) return setError(issue)
    if (!draft.relation) return setError("请选择与老人的关系")
    if (guest) { setReview(true); return }
    try { await backend.saveProfile("child", draft); const result = await backend.lookup(draft.bindingCode.trim()); if (result.role !== "elder") throw new Error("请输入老人端提供的绑定码"); setCandidate(result.member); setError(""); setReview(true) }
    catch (error) { setError((error as Error).message) }
  }
  const sendRequest = async () => {
    if (guest || saving) return
    setSaving(true)
    try { await backend.join(draft.bindingCode.trim(), draft.relation); setReview(false); setComplete("pending") }
    catch (error) { setError((error as Error).message); setReview(false) }
    finally { setSaving(false) }
  }

  return (
    <main className="onboarding-page">
      <FormBack icon="c0c28.svg" onClick={onBack} />
      <div className="profile-content">
        <section className="page-intro">
          <h1>设置您的基础信息</h1>
          <p>先认识您，再把关怀带给家人。</p>
        </section>
        <section className="profile-card">
          <div className="card-heading">
            <h2>我的个人信息</h2>
            <span>必填</span>
          </div>
          <div className="form-field">
            <label htmlFor="child-name">姓名 / 称呼</label>
            <input
              id="child-name"
              className="profile-input"
              placeholder="请输入您的姓名或称呼"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </div>
          <PhoneVerification
            guest={guest}
            helper={
              draft.phoneVerified
                ? "已填入您的登录号码"
                : "手机登录可带入已验证号码；未验证的号码需先验证。"
            }
            label="本人手机号码"
            phone={draft.phone}
            verified={draft.phoneVerified}
            onPhoneChange={(phone) =>
              setDraft((d) => ({ ...d, phone, phoneVerified: false }))
            }
            onVerified={() => setDraft((d) => ({ ...d, phoneVerified: true }))}
          />
          <BirthDateFields id="child" birthDate={draft.birthDate} age={draft.age} onChange={value => setDraft(d => ({ ...d, ...value }))} />
        </section>
        <section className="profile-card gap-3">
          <div className="card-heading">
            <h2>绑定老人（可选）</h2>
            <span className="status-pill">未绑定</span>
          </div>
          <div className="form-field">
            <label htmlFor="binding-code">老人绑定码</label>
            <input
              id="binding-code"
              className="profile-input uppercase"
              placeholder="请输入老人端提供的绑定码"
              maxLength={6}
              value={draft.bindingCode}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  bindingCode: e.target.value.replace(/\s/g, "").toUpperCase(),
                }))
              }
              onBlur={() =>
                setDraft((d) => ({ ...d, bindingCode: d.bindingCode.trim() }))
              }
            />
            <p className="form-helper">
              {hasBindingCode
                ? "提交申请后，需老人本人确认。"
                : "可向老人索取，也可以稍后再绑定。"}
            </p>
          </div>
          <ChoiceGroup
            label="我是老人的"
            options={["女儿", "儿子", "其他"]}
            selected={draft.relation ? [draft.relation] : []}
            onChange={(value) =>
              setDraft((d) => ({
                ...d,
                relation: (value[0] || "") as ChildDraft["relation"],
              }))
            }
          />
        </section>
        {error && <FieldError>{error}</FieldError>}
        {hasBindingCode && (
          <button
            className="onboarding-primary"
            type="button"
            onClick={reviewBinding}
          >
            下一步，核对老人信息
          </button>
        )}
        {!hasBindingCode && <button className="onboarding-primary" disabled={saving} type="button" onClick={() => void savePersonal()}>{saving ? '保存中…' : '完成设置，开始使用'}</button>}
      <button
        className="skip-profile"
        style={{ textDecoration: "underline", textUnderlineOffset: "4px" }}
        disabled={saving}
        type="button"
        onClick={() => setComplete("skipped")}
      >
        暂时跳过
      </button>
      </div>
      {review && (
        <div className="dialog-backdrop">
          <section
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <h2 id="review-title">核对老人信息</h2>
            <p>
              {candidate?.name || "请先登录查询"}
              <br />
              手机号：{candidate?.phone || "未查询"}
              <br />
              您的关系：{draft.relation}
            </p>
            <p className="text-sm">
              发送后仅创建待确认申请，不会立即绑定或开启资料共享。
            </p>
            {guest ? (
              <>
                <p className="field-error" role="alert">
                  游客需要先登录，当前不会创建申请。
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={onNeedLogin}
                >
                  前往登录
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                disabled={saving}
                type="button"
                onClick={sendRequest}
              >
                {saving ? "发送中…" : "发送绑定申请"}
              </button>
            )}
            <button
              className="dialog-cancel"
              type="button"
              onClick={() => setReview(false)}
            >
              返回修改
            </button>
          </section>
        </div>
      )}
      {complete && (
        <StageComplete
          title={
            complete === "pending"
              ? "申请已发出"
              : "已跳过基础信息设置"
          }
          message={
            complete === "pending"
              ? "申请已发出，等待老人确认。当前未绑定，也未获得任何共享权限。"
              : "已跳过基础信息设置，当前草稿未提交。现在可以进入子女端首页。"
          }
          onClose={() => onComplete(complete === "skipped")}
        />
      )}
    </main>
  )
}
