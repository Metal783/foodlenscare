import * as backend from "./backend"
import { toFrontRecord } from "./records"
import { useRecorder, blobDataUrl } from "./recorder"
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import SharedHelp from "./SharedHelp"
import AccountExit from "./AccountExit"
import type { ChildNotificationPreferences } from "./childNotifications"
import {
  isValidPhone,
  type ChildDraft,
  type ElderDraft,
  type SessionKind,
} from "./Onboarding"
import type {
  BindingRequest,
  ElderPreferences,
  ShareGrant,
} from "./preferences"

const assets = "/assets"

type ChildPage = "home" | "records" | "detail" | "voice" | "voice-history" | "settings" | "edit-profile" | "family" | "add-family" | "help"

type LinkedElder = {
  status: "none" | "pending" | "accepted"
  request: BindingRequest | null
  memberId: string | null
  grant: ShareGrant | null
}

type FoodItem = {
  id: string

  name: string
  time: string
  image: string
  status: "注意成分" | "适量食用"
  note: string
}

const ChildContext = createContext<{ selectedRecord: string; selectRecord: (id: string) => void; openFamily: () => void }>({ selectedRecord: "", selectRecord: () => {}, openFamily: () => {} })
function selectedElder() { const family = backend.selectedFamily(); return family?.member.name || "家人" }
function sharedLabel() { const f = backend.selectedFamily(); return !f ? "尚未绑定家人" : [f.records_allowed ? "食物记录已共享" : "食物记录未授权", f.profile_allowed ? "饮食设置已共享" : "饮食设置未授权"].join(" · ") }
const waveform = [
  10, 18, 14, 28, 38, 22, 32, 48, 26, 18, 34, 44, 30, 20, 40, 32, 18, 26, 36,
  22, 14, 24, 12,
]

function Icon({
  name,
  size = 22,
  alt = "",
}: {
  name: string
  size?: number
  alt?: string
}) {
  return <img alt={alt} height={size} src={`${assets}/${name}`} width={size} />
}

function Brand() {
  return (
    <header className="child-brand">
      <Icon name="34f9d.svg" size={30} />
      <span>食护家 Foodlenscare</span>
    </header>
  )
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="child-back-header">
      <button aria-label="返回" type="button" onClick={onBack}>
        <Icon name="86194.svg" size={20} />
      </button>
      <h1>{title}</h1>
    </header>
  )
}

function FamilyStrip({ onClick }: { onClick?: () => void }) {
  const data = backend.useBackend()
  const family = backend.selectedFamily()
  const content = (
    <>
      <span className="child-small-avatar">{selectedElder().slice(-1)}</span>
      <span className="min-w-0 flex-1 text-left">
        <strong className="block text-base">{family?.member.name || "尚未绑定家人"}</strong>
        <small className="block text-xs text-[#003e1c]">
          {sharedLabel()}
        </small>
      </span>
      {onClick && <Icon name="14634.svg" size={18} />}
    </>
  )
  return onClick ? (
    <button className="child-family-strip" type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="child-family-strip">{content}</div>
  )
}

function BottomNav({
  active,
  go,
}: {
  active: "home" | "records" | "family" | "settings"
  go: (page: ChildPage) => void
}) {
  const items = [
    {
      key: "home",
      label: "首页",
      icon: active === "home" ? "b1c04.svg" : "58a79.svg",
    },
    {
      key: "records",
      label: "记录",
      icon: active === "records" ? "96746.svg" : "f26ab.svg",
    },
    {
      key: "family",
      label: "家人",
      icon: active === "family" ? "89a9e.svg" : "d46dd.svg",
    },
    {
      key: "settings",
      label: "我的",
      icon: active === "settings" ? "9b15a.svg" : "e441e.svg",
    },
  ] as const
  return (
    <nav aria-label="子女端主导航" className="child-bottom-nav">
      {items.map((item) => (
        <button
          className={active === item.key ? "active" : ""}
          key={item.key}
          type="button"
          onClick={() => go(item.key)}
        >
          <Icon name={item.icon} size={22} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function FamilyDialog({ onClose }: { onClose: () => void }) {
  const data = backend.useBackend()
  const bound = data.families.filter(f => !f.amElder && f.status === "bound")
  return (
    <div
      className="child-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="family-dialog-title"
        aria-modal="true"
        className="child-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="family-dialog-title">选择要关心的家人</h2>
        <p className="text-[#596359]">已绑定{bound.length}位家人</p>
        {bound.map(f => <div className="child-selected-family" key={f.id} role="button" tabIndex={0} onClick={() => { void backend.chooseFamily(f.member.id); onClose() }} onKeyDown={event => { if (event.key === "Enter") { void backend.chooseFamily(f.member.id); onClose() } }}>
          <div className="flex items-center gap-3"><span className="child-avatar">{f.member.name.slice(-1)}</span><div><strong className="block text-xl">{f.member.name}</strong><span className="text-sm text-[#596359]">{f.member.age ? `${f.member.age}岁 · ` : ""}尾号{f.member.phone.slice(-4)}</span></div></div>
          <p>{data.selectedId === f.member.id ? "✓ 当前已选" : "点击选择"}</p><p className="text-[15px]">{f.records_allowed ? "食物记录已授权" : "食物记录未授权"} · {f.profile_allowed ? "饮食设置已授权" : "饮食设置未授权"}</p>
        </div>)}
        {!bound.length && <p>暂无已绑定老人，请在家人管理中添加。</p>}
        <button className="child-primary" type="button" onClick={onClose}>
          完成
        </button>
      </section>
    </div>
  )
}

function Home({
  childName,
  go,
  openFamily,
}: {
  childName: string
  go: (page: ChildPage) => void
  openFamily: () => void
}) {
  const data = backend.useBackend()
  const family = backend.selectedFamily()
  const stats = backend.weekStats(data.sharedRecords)
  return (
    <>
      <Brand />
      <div className="child-content">
        <section>
          <h1 className="child-page-title">{childName || "我"}，{new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好"}</h1>
          <p className="child-subtitle">一份关怀，陪家人好好吃每一餐。</p>
        </section>
        <section className="child-card">
          <div className="flex items-center gap-3">
            <span className="child-avatar">{selectedElder().slice(-1)}</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl">{family?.member.name || "尚未绑定家人"}</h2>
              <p className="mt-1 text-[13px] text-[#596359]">
                {[family?.member.age && `${family.member.age}岁`, family && backend.mask(family.member.phone)].filter(Boolean).join(" · ") || "绑定后由老人授权共享"}
              </p>
            </div>
            <button
              className="flex items-center gap-0.5 text-[13px] text-[#003e1c]"
              type="button"
              onClick={openFamily}
            >
              切换 <Icon name="340d1.svg" size={14} />
            </button>
          </div>
          <div className="child-sharing">
            <Icon name="9a411.svg" size={16} />
            <span>{sharedLabel()} · {data.syncedAt ? `${backend.timeText(data.syncedAt)}同步` : "尚未同步"}</span>
          </div>
        </section>
        <section className="child-voice-entry">
          <div className="flex items-center gap-3">
            <span className="child-voice-circle">
              <Icon name="ea417.svg" size={24} />
            </span>
            <div>
              <h2>让{selectedElder()}听见你的关心</h2>
              <p>说一句“妈妈，记得吃早餐”。</p>
            </div>
          </div>
          <button type="button" onClick={() => go("voice")}>
            <Icon name="6defc.svg" size={18} /> 发送语音
          </button>
        </section>
        <section className="child-card">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">食物识别概览</h2>
            <span className="text-sm text-[#003e1c]">{stats.label}</span>
          </div>
          <div className="child-stats">
            {[
              [family?.records_allowed ? String(stats.today) : "—", "今日已识别"],
              [family?.records_allowed ? String(stats.week) : "—", "本周已识别"],
              [family?.records_allowed ? String(stats.attention) : "—", "本周需留意"],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <a className="child-secondary" href={backend.selectedFamily() ? `tel:${backend.selectedFamily()!.member.phone}` : undefined}>
          <Icon name="de89b.svg" size={22} /> 联系{selectedElder()}
        </a>
      </div>
      <BottomNav active="home" go={go} />
    </>
  )
}

function FoodCard({ food, onOpen }: { food: FoodItem; onOpen: () => void }) {
  return (
    <article className="child-food-card">
      <div className="flex items-center gap-3">
        <img
          alt={food.name}
          className="h-[72px] w-[72px] shrink-0 rounded-[10px] object-cover"
          src={food.image}
        />
        <div className="min-w-0 flex-1">
          <h3>{food.name}</h3>
          <p>
            {food.time}
          </p>
          <button type="button" onClick={onOpen}>
            查看详情 <Icon name="50852.svg" size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={food.status === "注意成分" ? "warning" : "safe"}>
          {food.status}
        </span>
        <p className="text-[13px] text-[#596359]">{food.note}</p>
      </div>
    </article>
  )
}

function DateDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (date: string) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [chosen, setChosen] = useState(backend.dateKey())
  const offset = (month.getDay() || 7) - 1
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const days = [...Array.from({length: offset}, () => null), ...Array.from({length: count}, (_, i) => i + 1)]
  return <div className="child-modal-backdrop" role="presentation" onMouseDown={onClose}><section aria-labelledby="date-dialog-title" aria-modal="true" className="child-modal child-date-modal" role="dialog" onMouseDown={event => event.stopPropagation()}>
    <h2 id="date-dialog-title">选择记录日期</h2><div className="flex gap-2"><span className="child-chip muted">近7天</span><span className="child-chip selected">✓ 自定义</span></div>
    <strong className="block text-center text-xl"><span role="button" tabIndex={0} aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1,1))}>‹</span>　{month.getFullYear()}年{month.getMonth()+1}月　<span role="button" tabIndex={0} aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</span></strong>
    <div className="child-calendar">{["一","二","三","四","五","六","日"].map(day => <span className="weekday" key={day}>{day}</span>)}{days.map((day,i) => <button className={day && backend.dateKey(new Date(month.getFullYear(),month.getMonth(),day)) === chosen ? "selected" : ""} disabled={!day} key={i} type="button" onClick={() => day && setChosen(backend.dateKey(new Date(month.getFullYear(),month.getMonth(),day)))}>{day}</button>)}</div>
    <p className="text-base text-[#003e1c]">已选择：{chosen}</p><p className="text-sm text-[#596359]">查看所选日期的真实识别记录。</p><div className="grid grid-cols-2 gap-3"><button className="child-secondary" type="button" onClick={() => setChosen(backend.dateKey())}>重置</button><button className="child-primary" type="button" onClick={() => { onChoose(chosen); onClose() }}>确定</button></div>
  </section></div>
}

function Records({
  go,
  openFamily,
}: {
  go: (page: ChildPage) => void
  openFamily: () => void
}) {
  const data = backend.useBackend()
  const { selectRecord } = useContext(ChildContext)
  const [dateOpen, setDateOpen] = useState(false)
  const [date, setDate] = useState("")
  const [attentionOnly, setAttentionOnly] = useState(false)
  const oldest = new Date(); oldest.setHours(0,0,0,0); oldest.setDate(oldest.getDate()-6)
  const records = data.sharedRecords.filter(record => date ? backend.dateKey(record.at) === date : new Date(record.at) >= oldest).filter(record => !attentionOnly || record.assessment?.level !== "green")
  const groups = new Map<string, any[]>()
  records.sort((a,b) => new Date(b.at).getTime()-new Date(a.at).getTime()).forEach(record => { const key = backend.dateKey(record.at); groups.set(key, [...(groups.get(key)||[]), record]) })
  return (
    <>
      <Brand />
      <div className="child-content">
        <section>
          <h1 className="child-page-title">{selectedElder()}的食物记录</h1>
          <p className="child-subtitle">看见每一餐，关心日常饮食。</p>
        </section>
        <FamilyStrip onClick={openFamily} />
        <div className="child-filters">
          <button
            className={!attentionOnly && !date ? "active" : ""}
            type="button"
            onClick={() => { setAttentionOnly(false); setDate("") }}
          >
            最近7天
          </button>
          <button className={date ? "active" : ""} type="button" onClick={() => setDateOpen(true)}>
            选择日期
          </button>
          <button
            className={attentionOnly ? "active" : ""}
            type="button"
            onClick={() => setAttentionOnly((value) => !value)}
          >
            需留意
          </button>
        </div>
        {[...groups].map(([key, items]) => <div className="child-record-group" key={key}><h2>{key === backend.dateKey() ? "今天 · " : ""}{key}<span>{items.length}条记录</span></h2>{items.map(record => { const front = toFrontRecord(record); return <FoodCard food={{ id:record.id, name:front.foodName, image:front.photo, time:new Date(record.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}), status:front.attention ? "注意成分" : "适量食用", note:front.referenceNote || "请核对包装" }} key={record.id} onOpen={() => { selectRecord(record.id); go("detail") }} /> })}</div>)}
        {!records.length && <div className="child-record-group"><h2>{backend.selectedFamily()?.records_allowed ? "当前条件下没有记录" : "食物记录尚未授权"}</h2><p>绑定后由老人单独授权；记录来自家庭服务。</p></div>}
      </div>
      <BottomNav active="records" go={go} />
      {dateOpen && <DateDialog onClose={() => setDateOpen(false)} onChoose={setDate} />}
    </>
  )
}

function Detail({
  elder,
  go,
}: {
  elder: ElderDraft
  go: (page: ChildPage) => void
}) {
  const data = backend.useBackend()
  const { selectedRecord } = useContext(ChildContext)
  const record = data.sharedRecords.find(r => r.id === selectedRecord)
  const front = record ? toFrontRecord(record) : null
  const diseases = data.sharedProfile ? elder.diseases.join("、") || "未填写" : "未授权"
  const allergens = data.sharedProfile ? elder.allergens.join("、") || "未填写" : "未授权"
  if (!record || !front) return <><BackHeader title="识别记录详情" onBack={() => go("records")} /><div className="child-content"><section className="child-card"><h2>当前记录不可访问</h2><p>请返回列表；老人可能已撤回共享或删除记录。</p></section></div></>
  return (
    <>
      <BackHeader title="识别记录详情" onBack={() => go("records")} />
      <div className="child-content child-detail">
        <section className="child-photo-card">
          <img alt={front.foodName} src={front.photo} />
          <div className="flex items-center justify-between">
            <h1>{front.foodName}</h1>
            <span className={front.attention ? "warning" : "safe"}>{front.reference}</span>
          </div>
          <p>{selectedElder()}拍摄 · {backend.timeText(record.at)}</p>
        </section>
        <section className="child-card">
          <h2 className="text-xl">包装成分识别</h2>
          <div className="child-example-note">
            <Icon name="4a800.svg" size={18} />
            <span>
              {record.label?.ingredientsConfirmed ? "当时已人工核对配料，请仍以实物为准。" : "OCR读取结果尚未核对，请对照实物包装。"}
            </span>
          </div>
          {[
            ["配料", record.label?.ingredientText || "未读清"],
            ["过敏原声明", record.label?.allergenDeclaration || "未识别，不代表不含"],
            ["净含量", record.label?.netContent || "未读清"],
          ].map(([label, value]) => (
            <div className="child-field-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
        <section className="child-card">
          <h2 className="text-xl">适量提示</h2>
          <p>
            {record.assessment?.advice || "请核对包装与食用份量。"}
          </p>
          <small>糖、钠等营养数据请以包装营养表为准。</small>
        </section>
        <section className="child-card">
          <h2 className="flex items-center gap-2 text-lg">
            <Icon name="b1192.svg" size={20} />
            结合{selectedElder()}的已有设置
          </h2>
          <p>基础疾病：{diseases}</p>
          <p>过敏原：{allergens}</p>
          {(record.assessment?.diseaseReminders || []).map((item: any) => <p key={item.condition}><strong>{item.title}</strong><br />{item.message}</p>)}
          <hr />
          <p>
            {data.sharedProfile ? record.assessment?.headline || "请核对包装" : "饮食设置未授权，不能查看个性化判断依据。"}
          </p>
          <p>
            {allergens}
            ：未读取到的成分仍需核对包装，不代表没有交叉接触风险。
          </p>
        </section>
        <div className="child-sharing">
          <Icon name="59b9d.svg" size={18} />
          <span>
            识别结果仅供参考，请核对包装。照片识别不是诊断，也不能判断血压或血糖。
          </span>
        </div>
        <button
          className="child-primary"
          type="button"
          onClick={() => go("voice")}
        >
          <Icon name="1c1bd.svg" size={22} />
          发送语音提醒{selectedElder()}
        </button>
        <a className="child-secondary" href={backend.selectedFamily() ? `tel:${backend.selectedFamily()!.member.phone}` : undefined}>
          <Icon name="de89b.svg" size={22} />
          联系{selectedElder()}
        </a>
      </div>
    </>
  )
}

function maskedPhone(phone: string): string {
  return /^1\d{10}$/.test(phone)
    ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}`
    : phone || "未填写手机号"
}

function notificationPermissionLabel(): string {
  if (!("Notification" in window)) return "当前浏览器不支持系统通知"
  if (Notification.permission === "granted") return "系统通知已允许"
  if (Notification.permission === "denied")
    return "系统通知未授权，可在系统设置中更改"
  return "系统通知尚未授权"
}

function SettingsToggle({
  checked,
  label,
  onClick,
}: {
  checked: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`child-settings-toggle ${checked ? "on" : ""}`}
      role="switch"
      type="button"
      onClick={onClick}
    >
      <span />
    </button>
  )
}

function SettingsPage({
  child,
  elder,
  linked,
  notifications,
  go,
  onToggleNotification,
  onRequestPermission,
  onLogout,
}: {
  child: ChildDraft
  elder: ElderDraft
  linked: LinkedElder
  notifications: ChildNotificationPreferences
  go: (page: ChildPage) => void
  onToggleNotification: (field: keyof ChildNotificationPreferences) => void
  onRequestPermission: () => void
  onLogout: () => Promise<void>
}) {
  const accepted = linked.status === "accepted"
  const relation = accepted ? linked.request?.relation || "家人" : ""
  const grantLabels = [
    linked.grant?.foodRecords && "食物记录",
    linked.grant?.dietProfile && "饮食设置",
  ].filter(Boolean)
  const elderName = elder.name.trim() || "已绑定老人"

  return (
    <>
      <Brand />
      <div className="child-content child-settings-content">
        <h1 className="child-page-title">我的设置</h1>
        <button
          className="child-card child-profile-summary"
          type="button"
          onClick={() => go("edit-profile")}
        >
          <span className="child-settings-avatar">
            {(child.name.trim() || "我").slice(-1)}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <strong>
              {relation ? `${relation} · ` : ""}
              {child.name.trim() || "未填写称呼"}
            </strong>
            <small>{maskedPhone(child.phone)}</small>
          </span>
          <Icon name="3ffb6.svg" size={16} />
          <span className="child-profile-tags">
            <em>子女端</em>
            {accepted && <em>已绑定家人</em>}
          </span>
        </button>

        {accepted && (
          <button
            className="child-family-strip"
            type="button"
            onClick={() => go("family")}
          >
            <span className="child-small-avatar">{elderName.slice(-1)}</span>
            <span className="min-w-0 flex-1 text-left">
              <strong className="block text-base">{elderName}</strong>
              <small className="block text-xs text-[#003e1c]">
                {grantLabels.length
                  ? `${grantLabels.join("与")}已共享`
                  : "已绑定 · 未授权共享"}
              </small>
            </span>
          </button>
        )}

        <section className="child-card child-settings-card">
          <h2>我的资料与家人</h2>
          <button
            className="child-settings-row"
            type="button"
            onClick={() => go("edit-profile")}
          >
            <Icon name="9b15a.svg" size={22} />
            <span>
              基础信息
              <small>查看和修改自己的姓名、手机号码</small>
            </span>
            <Icon name="3ffb6.svg" size={16} />
          </button>
          <hr />
          <button
            className="child-settings-row"
            type="button"
            onClick={() => go("family")}
          >
            <Icon name="89a9e.svg" size={22} />
            <span>
              家人管理
              <small>
                {linked.status === "accepted"
                  ? grantLabels.length
                    ? `已绑定家人 · ${grantLabels.join("、")}已共享`
                    : "已绑定家人 · 未授权共享"
                  : linked.status === "pending"
                    ? "绑定申请待老人确认"
                    : "尚未绑定家人"}
              </small>
            </span>
            <Icon name="3ffb6.svg" size={16} />
          </button>
        </section>

        <section className="child-card child-settings-card">
          <h2>语音通知</h2>
          <div className="child-settings-row">
            <Icon name="de36d.svg" size={22} />
            <span>
              语音送达通知
              <small>家人实际接收后显示应用内提醒</small>
            </span>
            <SettingsToggle
              checked={notifications.delivery}
              label="语音送达通知"
              onClick={() => onToggleNotification("delivery")}
            />
          </div>
          <hr />
          <div className="child-settings-row">
            <Icon name="47e38.svg" size={22} />
            <span>
              语音播放通知
              <small>老人实际开始播放后显示应用内提醒</small>
            </span>
            <SettingsToggle
              checked={notifications.playback}
              label="语音播放通知"
              onClick={() => onToggleNotification("playback")}
            />
          </div>
          <hr />
          <div className="child-system-notice">
            <span>
              <strong>系统通知</strong>
              <small>当前使用应用内通知，页面需保持运行</small>
            </span>
            {"Notification" in window &&
              Notification.permission === "default" && (
                <button type="button" onClick={onRequestPermission}>
                  了解并允许
                </button>
              )}
          </div>
          <p className="child-settings-helper">
            应用内开关与系统通知权限相互独立；未授权时只在应用内提示。
          </p>
        </section>

        <section className="child-card child-settings-card">
          <h2>帮助</h2>
          <button
            className="child-settings-row"
            type="button"
            onClick={() => go("help")}
          >
            <Icon name="32ee1.svg" size={22} />
            <span>帮助与使用指南</span>
            <Icon name="3ffb6.svg" size={16} />
          </button>
        </section>
        <AccountExit child onLogout={onLogout} />
        <p className="child-settings-version">
          食护家 Foodlenscare · 子女端 · 版本 4.0.0
        </p>
      </div>
      <BottomNav active="settings" go={go} />
    </>
  )
}

function PhoneChangeDialog({
  currentPhone,
  onCancel,
  onVerified,
}: {
  currentPhone: string
  onCancel: () => void
  onVerified: (phone: string) => void
}) {
  const [phone, setPhone] = useState("")
  const [requested, setRequested] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const valid = isValidPhone(phone)

  const [testCode, setTestCode] = useState("")
  const request = async () => {
    if (!valid || phone === currentPhone) return setError("请填写有效的新号码")
    try { const result = await backend.api("/auth/code", { method: "POST", body: { phone } }); setTestCode(result.testCode); setRequested(true); setCode(""); setError("") }
    catch (error) { setError((error as Error).message) }
  }
  const verify = async () => { try { await backend.changePhone(phone, code); onVerified(phone) } catch (error) { setError((error as Error).message) } }

  return (
    <div className="child-modal-backdrop" onMouseDown={onCancel}>
      <section
        aria-labelledby="phone-change-title"
        aria-modal="true"
        className="child-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="phone-change-title">验证新手机号码</h2>
        <p className="text-[#596359]">
          验证成功前仍保留当前号码 {maskedPhone(currentPhone)}。
        </p>
        <label className="child-edit-field">
          新手机号码
          <input
            inputMode="numeric"
            maxLength={11}
            placeholder="输入11位手机号码"
            type="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
              setRequested(false)
              setError("")
            }}
          />
        </label>
        {!requested ? (
          <button className="child-primary" type="button" onClick={request}>
            获取本地测试验证码
          </button>
        ) : (
          <>
            <div className="child-demo-code" role="status">
              本地测试验证码：{testCode}。未发送真实短信。
            </div>
            <label className="child-edit-field">
              验证码
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="输入6位验证码"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </label>
            <button className="child-primary" type="button" onClick={verify}>
              确认验证新号码
            </button>
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="child-secondary" type="button" onClick={onCancel}>
          取消，保留原号码
        </button>
      </section>
    </div>
  )
}

function RelationCorrectionDialog({
  current,
  pending,
  onCancel,
  onSubmit,
}: {
  current: string
  pending: string
  onCancel: () => void
  onSubmit: (relation: string) => void
}) {
  const [relation, setRelation] = useState(current || "女儿")
  return (
    <div className="child-modal-backdrop" onMouseDown={onCancel}>
      <section
        aria-labelledby="relation-title"
        aria-modal="true"
        className="child-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="relation-title">申请更正关系</h2>
        <p className="text-[#596359]">
          关系属于双方绑定信息。提交后需老人确认，当前关系不会立即改变。
        </p>
        {pending && (
          <div className="child-demo-code">已有“{pending}”更正申请待确认。</div>
        )}
        <div className="child-relation-options" role="radiogroup">
          {["女儿", "儿子", "其他"].map((item) => (
            <button
              aria-checked={relation === item}
              className={relation === item ? "selected" : ""}
              key={item}
              role="radio"
              type="button"
              onClick={() => setRelation(item)}
            >
              {relation === item && "✓ "}
              {item}
            </button>
          ))}
        </div>
        <button
          className="child-primary"
          disabled={relation === current}
          type="button"
          onClick={() => onSubmit(relation)}
        >
          发起关系更正
        </button>
        <button className="child-secondary" type="button" onClick={onCancel}>
          取消
        </button>
      </section>
    </div>
  )
}

function EditProfilePage({
  child,
  linked,
  go,
  onSave,
}: {
  child: ChildDraft
  linked: LinkedElder
  go: (page: ChildPage) => void
  onSave: (next: ChildDraft) => Promise<boolean>
}) {
  const [name, setName] = useState(child.name)
  const [phone, setPhone] = useState(child.phone)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [relationOpen, setRelationOpen] = useState(false)
  const data = backend.useBackend()
  const pendingRelation = data.families.find(f => f.id === linked.memberId)?.requested_relation || ""
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const relation =
    linked.status === "accepted" ? linked.request?.relation || "" : ""
  const dirty = name !== child.name || phone !== child.phone

  const back = () => {
    if (dirty && !window.confirm("存在未保存修改，确定放弃并返回吗？")) return
    go("settings")
  }

  const save = async () => {
    if (!name.trim()) {
      setError("姓名／称呼不能为空")
      return
    }
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const next = {
        ...child,
        name: name.trim(),
        phone,
        phoneVerified: phone ? true : child.phoneVerified,
      }
      if (await onSave(next)) go("settings")
      else {
        setSaving(false)
        setError("保存失败，请重试。输入内容已保留。")
      }
    } finally { setSaving(false) }
  }

  const requestRelation = async (requestedRelation: string) => {
    if (!linked.memberId) return
    try { await backend.requestRelation(linked.memberId, requestedRelation); setRelationOpen(false) }
    catch (error) { setError((error as Error).message) }
  }

  return (
    <>
      <BackHeader title="我的基础信息" onBack={back} />
      <div className="child-content child-edit-content">
        <section className="child-card child-edit-summary">
          <span className="child-avatar">
            {(name.trim() || "我").slice(-1)}
          </span>
          <span>
            <strong>
              {relation ? `${relation} · ` : ""}
              {name.trim() || "未填写称呼"}
            </strong>
            <small>{maskedPhone(phone)}</small>
          </span>
        </section>
        <section className="child-card child-edit-card">
          <h2>我的个人信息</h2>
          <label className="child-edit-field">
            姓名／称呼
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError("")
              }}
            />
          </label>
          <label className="child-edit-field">
            手机号码
            <span className="child-readonly-field">
              {maskedPhone(phone)}
              <button type="button" aria-label="修改手机号" onClick={() => setPhoneOpen(true)}>
                修改
              </button>
            </span>
          </label>
          <p className="child-settings-helper">
            更换手机号需验证新号码；验证成功前不会替换原号码。
          </p>
          {linked.status === "accepted" && (
            <label className="child-edit-field">
              与家人的关系
              <span className="child-readonly-field">
                {relation || "已绑定家人"}
                <button type="button" aria-label={pendingRelation ? "查看申请" : "申请更正"} onClick={() => setRelationOpen(true)}>
                  {pendingRelation ? "查看申请" : "申请更正"}
                </button>
              </span>
              {pendingRelation && (
                <small>“{pendingRelation}”更正申请待老人确认</small>
              )}
            </label>
          )}
        </section>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="child-primary"
          disabled={saving}
          type="button"
          onClick={save}
        >
          {saving ? "保存中…" : "保存修改"}
        </button>
      </div>
      <BottomNav active="settings" go={go} />
      {phoneOpen && (
        <PhoneChangeDialog
          currentPhone={phone}
          onCancel={() => setPhoneOpen(false)}
          onVerified={(nextPhone) => {
            setPhone(nextPhone)
            setPhoneOpen(false)
          }}
        />
      )}
      {relationOpen && (
        <RelationCorrectionDialog
          current={relation}
          pending={pendingRelation}
          onCancel={() => setRelationOpen(false)}
          onSubmit={requestRelation}
        />
      )}
    </>
  )
}

function FamilyPage({
  child,
  elder,
  linked,
  go,
}: {
  child: ChildDraft
  elder: ElderDraft
  linked: LinkedElder
  go: (page: ChildPage) => void
}) {
  const service = backend.useBackend()
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState("")
  const { openFamily } = useContext(ChildContext)
  const grantLabels = [
    linked.grant?.foodRecords && "食物记录",
    linked.grant?.dietProfile && "饮食设置",
  ].filter(Boolean)
  const elderName = elder.name.trim() || "已绑定老人"
  return (
    <>
      <Brand />
      <div className="child-content child-family-content">
        <section>
          <h1 className="child-page-title">家人管理</h1>
          <p className="child-subtitle">
            {child.name.trim() || "我"}，与家人一起守护。
          </p>
        </section>
        {linked.status === "accepted" ? (
          <section className="child-card child-bound-family">
            <div className="flex items-center justify-between">
              <h2>已绑定家人</h2>
              <span role="button" tabIndex={0} onClick={openFamily}>{service.families.filter(f => !f.amElder && f.status === "bound").length}位 · 切换</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="child-avatar">{elderName.slice(-1)}</span>
              <span>
                <strong>{elderName}</strong>
                <small>
                  {[elder.age && `${elder.age}岁`, maskedPhone(elder.phone)]
                    .filter(Boolean)
                    .join(" · ") || "老人资料未完善"}
                </small>
              </span>
            </div>
            <div className="child-profile-tags">
              <em>已绑定</em>
              <em>
                {grantLabels.length
                  ? `已授权：${grantLabels.join("、")}`
                  : "未授权共享"}
              </em>
            </div>
            {elder.phone && (
              <a className="child-secondary" href={`tel:${elder.phone}`}>
                <Icon name="de89b.svg" size={22} />
                联系家人
              </a>
            )}
            <button className="child-secondary" type="button" onClick={() => setRemoveConfirm(true)}>解除绑定</button>
          </section>
        ) : linked.status === "pending" ? (
          <section className="child-card child-family-empty">
            <h2>绑定申请待确认</h2>
            <p>
              绑定码 {linked.request?.lookupCode} 的申请已发出，需老人本人确认。
            </p>
            <p>确认绑定不代表自动共享；老人授权后才会显示对应资料。</p>
          </section>
        ) : (
          <section className="child-card child-family-empty">
            <h2>尚未绑定家人</h2>
            <p>添加老人并由本人确认后，才能联系或查看明确授权的资料。</p>
          </section>
        )}
        {true && (
          <section className="child-card">
            <button
              className="child-primary"
              type="button"
              onClick={() => go("add-family")}
            >
              <Icon name="2401c.svg" size={22} />
              添加家人
            </button>
          </section>
        )}
      </div>
      <BottomNav active="family" go={go} />
      {removeConfirm && <div className="child-modal-backdrop"><section className="child-modal" role="dialog" aria-modal="true" aria-label="解除绑定确认"><h2>解除与{elderName}的绑定？</h2><p>解除后停止查看此人的共享资料和关怀语音；老人本人保存的记录保留。</p>{removeError && <p role="alert">{removeError}</p>}<button className="child-primary" disabled={removing} type="button" onClick={async () => { if (!linked.memberId) return; setRemoving(true); try { await backend.removeFamily(linked.memberId); setRemoveConfirm(false); go("family"); } catch (error) { setRemoveError((error as Error).message); } finally { setRemoving(false); } }}>确认解除绑定</button><button className="child-secondary" disabled={removing} type="button" onClick={() => setRemoveConfirm(false)}>取消</button></section></div>}
    </>
  )
}

function AddFamilyPage({
  child,
  go,
  onRequest,
}: {
  child: ChildDraft
  go: (page: ChildPage) => void
  onRequest: (request: BindingRequest) => boolean
}) {
  const [code, setCode] = useState("")
  const [relation, setRelation] = useState<BindingRequest["relation"]>("女儿")
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const submit = async () => {
    if (sending) return
    setSending(true)
    try { const info = await backend.lookup(code.trim()); if (info.role !== "elder") throw new Error("请输入老人端绑定码。"); if (!window.confirm(`向${info.member.name}（${info.member.phone}）发送绑定申请？`)) return; await backend.join(code.trim(), relation); go("family") }
    catch (error) { setError((error as Error).message) }
    finally { setSending(false) }
  }

  return (
    <>
      <BackHeader title="添加家人" onBack={() => go("family")} />
      <div className="child-content child-add-family">
        <section>
          <h1 className="child-page-title">输入老人绑定码</h1>
          <p className="child-subtitle">向家人获取老人端的绑定码。</p>
        </section>
        <section className="child-card">
          <label className="child-edit-field">
            老人绑定码
            <span className="child-code-field">
              <input
                maxLength={6}
                placeholder="输入老人绑定码"
                value={code}
                onChange={(event) => {
                  setCode(
                    event.target.value
                      .replace(/\s/g, "")
                      .toUpperCase()
                      .slice(0, 6),
                  )
                  setError("")
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    setCode((await navigator.clipboard.readText()).slice(0, 6))
                  } catch {
                    setError("粘贴失败，请手动输入")
                  }
                }}
              >
                <Icon name="8ac8b.svg" size={18} />
                粘贴
              </button>
            </span>
            <small>请使用老人端提供的码，而非你的绑定码。</small>
          </label>
          <div className="child-edit-field">
            你是老人的
            <div className="child-relation-options" role="radiogroup">
              {(["女儿", "儿子", "其他"] as const).map((item) => (
                <button
                  aria-checked={relation === item}
                  className={relation === item ? "selected" : ""}
                  key={item}
                  role="radio"
                  type="button"
                  onClick={() => setRelation(item)}
                >
                  {relation === item && "✓ "}
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="child-primary"
          disabled={sending || code.trim().length !== 6}
          type="button"
          onClick={submit}
        >
          下一步：发送绑定申请
        </button>
        <p className="child-subtitle">
          申请需老人本人确认。确认绑定后仍由老人单独授权共享范围。
        </p>
        <div className="child-sharing">
          <Icon name="f654c.svg" size={20} />
          <span>老人确认绑定并授权后，才可查看对应记录。</span>
        </div>
      </div>
      <BottomNav active="family" go={go} />
    </>
  )
}

function RecentVoices({ onHistory }: { onHistory: () => void }) {
  const data = backend.useBackend()
  const messages = data.messages.filter(m => m.sender === data.account?.id && (!data.selectedId || m.recipient === data.selectedId))
  return <section className="child-card"><div className="flex items-center justify-between"><h2 className="text-xl">最近发送</h2><button className="text-sm text-[#003e1c]" type="button" onClick={onHistory}>发给{selectedElder()}</button></div>{messages.slice(0,2).map(m => <div className="child-voice-row" key={m.id}><p>{m.note || "关怀语音"}</p><div><span role="button" tabIndex={0} onClick={() => void new Audio(m.audioDataUrl).play()}>▷ {backend.timeText(m.sentAt)} · {Math.round(m.duration)}秒</span><b className={m.playedAt ? "" : "pending"}>{m.playedAt ? "已送达 · 已播放" : m.deliveredAt ? "已送达 · 待播放" : "已发送 · 待送达"}</b></div></div>)}{!messages.length && <p>还没有发送语音。</p>}</section>
}

function Voice({
  go,
  onDelivered,
  senderName,
  senderRelation,
}: {
  go: (page: ChildPage) => void
  onDelivered: () => void
  senderName: string
  senderRelation: string
}) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const recording = useRecorder()
  const fileInput = useRef<HTMLInputElement>(null)
  const action = () => {
    if (recording.status === "recording") recording.stop()
    else if (!isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) fileInput.current?.click()
    else void recording.start()
  }
  const play = recording.play
  const send = async () => {
    if (sending) return
    setSending(true)
    try { if (recording.status !== "ready" || !recording.blob.current) throw new Error("请先录制或选择录音。"); const family = backend.selectedFamily(); if (!family) throw new Error("请先绑定家人。"); await backend.sendVoice(await blobDataUrl(recording.blob.current), recording.seconds, family.member.id); setSent(true) }
    catch (error) { setError((error as Error).message) }
    finally { setSending(false) }
  }
  return (
    <>
      <BackHeader title="发送语音" onBack={() => go("home")} />
      <div className="child-content">
        <section>
          <h1 className="child-page-title">把关心，说给{selectedElder()}听</h1>
          <p className="child-subtitle">
            发送者：{senderRelation} · {senderName}
          </p>
        </section>
        <FamilyStrip />
        <section className="child-card child-recorder">
          <span className="child-chip selected">{recording.status === "recording" ? "正在录音" : recording.status === "ready" ? "录制完成 · 待发送" : "准备录音"}</span>
          <span className="child-record-icon" role="button" tabIndex={0} aria-label={recording.status === "recording" ? "停止录音" : "开始录音"} onClick={action} onKeyDown={event => { if (event.key === "Enter") action() }}>
            <Icon name="1d576.svg" size={32} />
          </span>
          <strong className="child-timer">{String(Math.floor(recording.seconds / 60)).padStart(2,"0")}:{String(Math.floor(recording.seconds % 60)).padStart(2,"0")}</strong>
          <div className="child-waveform" aria-label="18秒语音波形">
            {waveform.map((height, index) => (
              <i key={index} style={{ height }} />
            ))}
          </div>
          <p>
            {recording.status === "ready" ? "录音已准备，试听后再发送。" : "点击麦克风或开始录音，最长2分钟。"}
            <br />
            {selectedElder()}会在「关怀语音」中收到。
          </p>
          <div className="grid w-full grid-cols-2 gap-3">
            <button className="child-secondary" type="button" disabled={recording.status !== "ready"} onClick={play}>
              <Icon name="b05f0.svg" size={22} />
              试听
            </button>
            <button className="child-secondary" type="button" onClick={action}>
              <Icon name="4cfe2.svg" size={22} />
              {recording.status === "recording" ? "停止录音" : recording.status === "ready" ? "重新录制" : "开始录音"}
            </button>
          </div>
        </section>
        <button
          className="child-primary"
          type="button"
          disabled={sending}
          onClick={send}
        >
          <Icon name="daaa4.svg" size={22} />
          发送给{selectedElder()}
        </button>
        <input hidden ref={fileInput} type="file" accept="audio/webm,audio/mp4,audio/ogg,audio/wav" onChange={event => { const file = event.target.files?.[0]; if (file) void recording.loadFile(file); event.target.value = "" }} />
        {(error || recording.error) && <p className="field-error" role="alert">{error || recording.error}</p>}
        <RecentVoices onHistory={() => go("voice-history")} />
      </div>
      {sent && (
        <div className="child-modal-backdrop">
          <section
            aria-labelledby="sent-title"
            aria-modal="true"
            className="child-modal"
            role="dialog"
          >
            <h2 id="sent-title">关怀语音已发送</h2>
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="child-success-icon">
                <Icon name="12977.svg" size={38} />
              </span>
              <strong className="text-[22px]">已发送给{selectedElder()}</strong>
              <span className="text-lg">本次录音：{Math.round(recording.seconds)}秒</span>
              <span className="text-lg text-[#003e1c]">已发送 · 待家人接收</span>
            </div>
            <button
              className="child-secondary"
              type="button"
              onClick={() => {
                setSent(false)
                go("home")
              }}
            >
              完成
            </button>
          </section>
        </div>
      )}
    </>
  )
}

function VoiceHistory({ go }: { go: (page: ChildPage) => void }) {
  const data = backend.useBackend()
  return <><BackHeader title="语音历史" onBack={() => go("voice")} /><div className="child-content">{data.messages.filter(m => m.sender === data.account?.id && m.recipient === data.selectedId).map(m => <section className="child-card" key={m.id}><h2>{backend.timeText(m.sentAt)}</h2><h3 className="text-lg">收件人：{selectedElder()}</h3><p>{m.note || "关怀语音"}</p><div className="child-voice-row"><span role="button" tabIndex={0} onClick={() => void new Audio(m.audioDataUrl).play()}>▷ {Math.round(m.duration)}秒 · 试听</span><b>{m.playedAt ? "已送达 · 已播放" : m.deliveredAt ? "已送达 · 待播放" : "已发送 · 待送达"}</b></div></section>)}{!data.messages.some(m => m.sender === data.account?.id) && <section className="child-card"><p>暂无发送记录。</p></section>}</div></>
}

export default function ChildApp({ child, elder: unusedElder, session, preferences, onUpdateChild, onLogout }: { child: ChildDraft; elder: ElderDraft; session: SessionKind; preferences: ElderPreferences; onUpdateChild: (next: ChildDraft) => Promise<boolean>; onLogout: () => Promise<void> }) {
  const data = backend.useBackend()
  const [page, setPage] = useState<ChildPage>("home")
  const [familyOpen, setFamilyOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState("")
  const f = backend.selectedFamily()
  const pending = data.families.find(item => !item.amElder && item.status === "pending")
  const linked: LinkedElder = { status: f ? "accepted" : pending ? "pending" : "none", memberId: f?.id || null, grant: f ? { memberId:f.id, foodRecords:!!f.records_allowed, dietProfile:!!f.profile_allowed } : null, request: f || pending ? { id:(f||pending)!.id, applicantName:(f||pending)!.member.name, relation:(f||pending)!.relation, maskedPhone:backend.mask((f||pending)!.member.phone), lookupCode:"", status:f ? "accepted" : "pending" } : null }
  const elder = backend.elderProfile(data.sharedProfile || { name:f?.member.name || "", age:f?.member.age },f?.member.phone || "")
  const notifications: ChildNotificationPreferences = data.account?.prefs.childNotifications || backend.localRead("childNotifications",{delivery:true,playback:true})
  const go = (next: ChildPage) => { setPage(next); window.scrollTo(0,0) }
  const toggle = async (field: keyof ChildNotificationPreferences) => { try { await backend.savePrefs({childNotifications:{...notifications,[field]:!notifications[field]}}) } catch (error) { backend.report(error) } }
  return <ChildContext.Provider value={{selectedRecord,selectRecord:setSelectedRecord,openFamily:() => setFamilyOpen(true)}}><main className="child-app">
    {page === "home" && <Home childName={child.name} go={go} openFamily={() => setFamilyOpen(true)} />}
    {page === "records" && <Records go={go} openFamily={() => setFamilyOpen(true)} />}
    {page === "detail" && <Detail elder={elder} go={go} />}
    {page === "voice" && <Voice go={go} senderName={child.name || "我"} senderRelation={f?.relation || child.relation || "子女"} onDelivered={() => {}} />}
    {page === "voice-history" && <VoiceHistory go={go} />}
    {page === "settings" && <SettingsPage child={child} elder={elder} linked={linked} notifications={notifications} go={go} onToggleNotification={toggle} onRequestPermission={() => setPermissionOpen(true)} onLogout={onLogout} />}
    {page === "edit-profile" && <EditProfilePage child={child} linked={linked} go={go} onSave={onUpdateChild} />}
    {page === "family" && <FamilyPage child={child} elder={elder} linked={linked} go={go} />}
    {page === "add-family" && <AddFamilyPage child={child} go={go} onRequest={() => false} />}
    {page === "help" && <SharedHelp onBack={() => go("settings")} />}
    {familyOpen && <FamilyDialog onClose={() => setFamilyOpen(false)} />}
    {data.notice && <button className="child-in-app-notice" type="button" onClick={backend.clearNotice}>{data.notice}　×</button>}
    {permissionOpen && <div className="child-modal-backdrop" onMouseDown={() => setPermissionOpen(false)}><section aria-labelledby="notification-permission-title" aria-modal="true" className="child-modal" role="dialog" onMouseDown={event => event.stopPropagation()}><h2 id="notification-permission-title">允许系统通知？</h2><p className="text-[#596359]">仅在服务端确认家人接收或实际播放、对应应用开关开启时提示。应用需保持运行，未接入后台推送。</p><button className="child-primary" type="button" onClick={async () => { if ("Notification" in window) await Notification.requestPermission(); setPermissionOpen(false); }}>主动允许系统通知</button><button className="child-secondary" type="button" onClick={() => setPermissionOpen(false)}>暂不允许</button></section></div>}
  </main></ChildContext.Provider>
}
