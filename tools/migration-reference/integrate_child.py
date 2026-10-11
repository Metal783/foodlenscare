from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=ROOT/'src/ChildApp.tsx'
s=p.read_text(encoding='utf-8')
s=s.replace('import { useEffect, useMemo, useState }', 'import { createContext, useContext, useEffect, useMemo, useRef, useState }')
s='import * as backend from "./backend"\nimport { toFrontRecord } from "./records"\nimport { useRecorder, blobDataUrl } from "./recorder"\n'+s
s=s.replace('title: string onBack:', 'title: string; onBack:').replace('food: FoodItem onOpen:', 'food: FoodItem; onOpen:')
start=s.index('const foods: FoodItem[] = [')
end=s.index('const waveform',start)
s=s[:start]+'''const ChildContext = createContext<{ selectedRecord: string; selectRecord: (id: string) => void; openFamily: () => void }>({ selectedRecord: "", selectRecord: () => {}, openFamily: () => {} })
function selectedElder() { const family = backend.selectedFamily(); return family?.member.name || "家人" }
function sharedLabel() { const f = backend.selectedFamily(); return !f ? "尚未绑定家人" : [f.records_allowed ? "食物记录已共享" : "食物记录未授权", f.profile_allowed ? "饮食设置已共享" : "饮食设置未授权"].join(" · ") }
''' + s[end:]
s=s.replace('type FoodItem = {', 'type FoodItem = {\n  id: string\n')
start=s.index('  const content = (',s.index('function FamilyStrip'))
s=s[:start]+'''  const data = backend.useBackend()
  const family = backend.selectedFamily()
''' + s[start:]
s=s.replace('<span className="child-small-avatar">李</span>', '<span className="child-small-avatar">{selectedElder().slice(-1)}</span>').replace('<strong className="block text-base">妈妈 · 李阿姨</strong>', '<strong className="block text-base">{family?.member.name || "尚未绑定家人"}</strong>').replace('食物与饮食设置已共享 · 女儿小敏','{sharedLabel()}')
start=s.index('  return (',s.index('function FamilyDialog'))
s=s[:start]+'''  const data = backend.useBackend()
  const bound = data.families.filter(f => !f.amElder && f.status === "bound")
''' + s[start:]
s=s.replace('已绑定1位家人','已绑定{bound.length}位家人')
start=s.index('        <div className="child-selected-family">',s.index('function FamilyDialog'))
end=s.index('        <button className="child-primary"',start)
s=s[:start]+'''        {bound.map(f => <div className="child-selected-family" key={f.id} role="button" tabIndex={0} onClick={() => { void backend.chooseFamily(f.member.id); onClose() }} onKeyDown={event => { if (event.key === "Enter") { void backend.chooseFamily(f.member.id); onClose() } }}>
          <div className="flex items-center gap-3"><span className="child-avatar">{f.member.name.slice(-1)}</span><div><strong className="block text-xl">{f.member.name}</strong><span className="text-sm text-[#596359]">{f.member.age ? `${f.member.age}岁 · ` : ""}尾号{f.member.phone.slice(-4)}</span></div></div>
          <p>{data.selectedId === f.member.id ? "✓ 当前已选" : "点击选择"}</p><p className="text-[15px]">{f.records_allowed ? "食物记录已授权" : "食物记录未授权"} · {f.profile_allowed ? "饮食设置已授权" : "饮食设置未授权"}</p>
        </div>)}
        {!bound.length && <p>暂无已绑定老人，请在家人管理中添加。</p>}
''' + s[end:]
start=s.index('  return (',s.index('function Home('))
s=s[:start]+'''  const data = backend.useBackend()
  const family = backend.selectedFamily()
  const stats = backend.weekStats(data.sharedRecords)
''' + s[start:]
s=s.replace('{childName || "小敏"}，早上好', '{childName || "我"}，{new Date().getHours() < 12 ? "早上好" : new Date().getHours() < 18 ? "下午好" : "晚上好"}')
s=s.replace('<span className="child-avatar">李</span>', '<span className="child-avatar">{selectedElder().slice(-1)}</span>').replace('<h2 className="text-xl">妈妈 · 李阿姨</h2>', '<h2 className="text-xl">{family?.member.name || "尚未绑定家人"}</h2>').replace('68岁 · 138 **** 2096','{[family?.member.age && `${family.member.age}岁`, family && backend.mask(family.member.phone)].filter(Boolean).join(" · ") || "绑定后由老人授权共享"}')
s=s.replace('食物记录已共享 · 今天 08:36 同步','{sharedLabel()} · {data.syncedAt ? `${backend.timeText(data.syncedAt)}同步` : "尚未同步"}').replace('10月5日—11日','{stats.label}')
s=s.replace('["2", "今日已识别"],\n              ["12", "本周已识别"],\n              ["2", "本周需留意"],', '[family?.records_allowed ? String(stats.today) : "—", "今日已识别"],\n              [family?.records_allowed ? String(stats.week) : "—", "本周已识别"],\n              [family?.records_allowed ? String(stats.attention) : "—", "本周需留意"],')
# 所有联系链接都使用当前选择家人的真实号码。
s=s.replace('href="tel:13800002096"', 'href={backend.selectedFamily() ? `tel:${backend.selectedFamily()!.member.phone}` : undefined}').replace('联系妈妈','联系{selectedElder()}')
s=s.replace('src={`${assets}/${food.image}`}', 'src={food.image}')
start=s.index('function DateDialog(')
end=s.index('function Records(',start)
s=s[:start]+'''function DateDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (date: string) => void }) {
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

''' + s[end:]
start=s.index('  const [dateOpen',s.index('function Records'))
end=s.index('  return (',start)
s=s[:start]+'''  const data = backend.useBackend()
  const { selectRecord } = useContext(ChildContext)
  const [dateOpen, setDateOpen] = useState(false)
  const [date, setDate] = useState("")
  const [attentionOnly, setAttentionOnly] = useState(false)
  const oldest = new Date(); oldest.setHours(0,0,0,0); oldest.setDate(oldest.getDate()-6)
  const records = data.sharedRecords.filter(record => date ? backend.dateKey(record.at) === date : new Date(record.at) >= oldest).filter(record => !attentionOnly || record.assessment?.level !== "green")
  const groups = new Map<string, any[]>()
  records.sort((a,b) => new Date(b.at).getTime()-new Date(a.at).getTime()).forEach(record => { const key = backend.dateKey(record.at); groups.set(key, [...(groups.get(key)||[]), record]) })
''' + s[end:]
s=s.replace('onClick={() => setAttentionOnly(false)}', 'onClick={() => { setAttentionOnly(false); setDate("") }}')
start=s.index('        <div className="child-record-group">',s.index('function Records'))
end=s.index('      </div>\n      <BottomNav',start)
s=s[:start]+'''        {[...groups].map(([key, items]) => <div className="child-record-group" key={key}><h2>{key === backend.dateKey() ? "今天 · " : ""}{key}<span>{items.length}条记录</span></h2>{items.map(record => { const front = toFrontRecord(record); return <FoodCard food={{ id:record.id, name:front.foodName, image:front.photo, time:new Date(record.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}), meal:record.meal || "未标注餐次", status:front.attention ? "注意成分" : "适量食用", note:front.referenceNote || "请核对包装" }} key={record.id} onOpen={() => { selectRecord(record.id); go("detail") }} /> })}</div>)}
        {!records.length && <div className="child-record-group"><h2>{backend.selectedFamily()?.records_allowed ? "当前条件下没有记录" : "食物记录尚未授权"}</h2><p>绑定后由老人单独授权；记录来自家庭服务。</p></div>}
''' + s[end:]
s=s.replace('<DateDialog onClose={() => setDateOpen(false)} />', '<DateDialog onClose={() => setDateOpen(false)} onChoose={setDate} />')
start=s.index('  const diseases =',s.index('function Detail'))
end=s.index('  return (',start)
s=s[:start]+'''  const data = backend.useBackend()
  const { selectedRecord } = useContext(ChildContext)
  const record = data.sharedRecords.find(r => r.id === selectedRecord)
  const front = record ? toFrontRecord(record) : null
  const diseases = data.sharedProfile ? elder.diseases.join("、") || "未填写" : "未授权"
  const allergens = data.sharedProfile ? elder.allergens.join("、") || "未填写" : "未授权"
  if (!record || !front) return <><BackHeader title="识别记录详情" onBack={() => go("records")} /><div className="child-content"><section className="child-card"><h2>当前记录不可访问</h2><p>请返回列表；老人可能已撤回共享或删除记录。</p></section></div></>
''' + s[end:]
s=s.replace('<img alt="一杯高钙纯牛奶" src={`${assets}/c29ff.png`} />','<img alt={front.foodName} src={front.photo} />').replace('<h1>高钙纯牛奶</h1>','<h1>{front.foodName}</h1>').replace('<span className="warning">注意成分</span>', '<span className={front.attention ? "warning" : "safe"}>{front.reference}</span>').replace('妈妈拍摄 · 10月10日 08:35 · 早餐','{selectedElder()}拍摄 · {backend.timeText(record.at)} · {record.meal || "未标注餐次"}')
s=s.replace('以下为示例识别内容，尚未核对包装，不代表该产品实际配方。','{record.label?.ingredientsConfirmed ? "当时已人工核对配料，请仍以实物为准。" : "OCR读取结果尚未核对，请对照实物包装。"}')
s=s.replace('["配料（示例）", "生牛乳"],\n            ["过敏原提示（示例）", "乳及乳制品"],\n            ["净含量（示例）", "250毫升 / 盒"],','["配料", record.label?.ingredientText || "未读清"],\n            ["过敏原声明", record.label?.allergenDeclaration || "未识别，不代表不含"],\n            ["净含量", record.label?.netContent || "未读清"],')
s=s.replace('结合妈妈平时的饮食习惯安排份量，搭配谷物与蔬菜。不以“高钙”或“纯牛奶”字样判断是否适合她。','{record.assessment?.advice || "请核对包装与食用份量。"}').replace('关注血糖、低盐饮食：请核对包装的糖与钠含量，结合妈妈已有的饮食方案安排份量。','{data.sharedProfile ? record.assessment?.headline || "请核对包装" : "饮食设置未授权，不能查看个性化判断依据。"}').replace('过敏提醒：示例配料未列出这些成分，不代表不含或无交叉接触风险，请核对完整过敏原声明。','：未读取到的成分仍需核对包装，不代表没有交叉接触风险。')
# 个人资料保存与手机号实际验证。
s=s.replace('onSave: (next: ChildDraft) => boolean', 'onSave: (next: ChildDraft) => Promise<boolean>')
start=s.index('  const [pendingRelation',s.index('function EditProfilePage'))
end=s.index('  const [error',start)
s=s[:start]+'''  const data = backend.useBackend()
  const pendingRelation = data.families.find(f => f.id === linked.memberId)?.requested_relation || ""
''' + s[end:]
s=s.replace('  const save = () => {', '  const save = async () => {')
s=s.replace('window.setTimeout(() => {\n      const next', 'try {\n      const next').replace('if (onSave(next))', 'if (await onSave(next))').replace('    }, 500)', '    } finally { setSaving(false) }')
start=s.index('  const requestRelation = (requestedRelation:')
end=s.index('\n  return (',start)
s=s[:start]+'''  const requestRelation = async (requestedRelation: string) => {
    if (!linked.memberId) return
    try { await backend.requestRelation(linked.memberId, requestedRelation); setRelationOpen(false) }
    catch (error) { setError((error as Error).message) }
  }
''' + s[end:]
start=s.index('  const request = () => {',s.index('function PhoneChangeDialog'))
end=s.index('\n  return (',start)
s=s[:start]+'''  const [testCode, setTestCode] = useState("")
  const request = async () => {
    if (!valid || phone === currentPhone) return setError("请填写有效的新号码")
    try { const result = await backend.api("/auth/code", { method: "POST", body: { phone } }); setTestCode(result.testCode); setRequested(true); setCode(""); setError("") }
    catch (error) { setError((error as Error).message) }
  }
  const verify = async () => { try { await backend.changePhone(phone, code); onVerified(phone) } catch (error) { setError((error as Error).message) } }
''' + s[end:]
s=s.replace('获取演示验证码','获取本地测试验证码').replace('演示验证码：{DEMO_CODE}', '本地测试验证码：{testCode}').replace('版本 1.0.0','版本 4.0.0').replace('发送成功后显示应用内提醒','家人实际接收后显示应用内提醒')
start=s.index('  const submit = () => {',s.index('function AddFamilyPage'))
end=s.index('\n  return (',start)
s=s[:start]+'''  const [sending, setSending] = useState(false)
  const submit = async () => {
    if (sending) return
    setSending(true)
    try { const info = await backend.lookup(code.trim()); if (info.role !== "elder") throw new Error("请输入老人端绑定码。"); if (!window.confirm(`向${info.member.name}（${info.member.phone}）发送绑定申请？`)) return; await backend.join(code.trim(), relation); go("family") }
    catch (error) { setError((error as Error).message) }
    finally { setSending(false) }
  }
''' + s[end:]
s=s.replace('disabled={code.trim().length !== 6}', 'disabled={sending || code.trim().length !== 6}')
# 最近语音与历史复用原卡片。
start=s.index('function RecentVoices(')
end=s.index('function Voice(',start)
s=s[:start]+'''function RecentVoices({ onHistory }: { onHistory: () => void }) {
  const data = backend.useBackend()
  const messages = data.messages.filter(m => m.sender === data.account?.id && (!data.selectedId || m.recipient === data.selectedId))
  return <section className="child-card"><div className="flex items-center justify-between"><h2 className="text-xl">最近发送</h2><button className="text-sm text-[#003e1c]" type="button" onClick={onHistory}>发给{selectedElder()}</button></div>{messages.slice(0,2).map(m => <div className="child-voice-row" key={m.id}><p>{m.note || "关怀语音"}</p><div><span role="button" tabIndex={0} onClick={() => void new Audio(m.audioDataUrl).play()}>▷ {backend.timeText(m.sentAt)} · {Math.round(m.duration)}秒</span><b className={m.playedAt ? "" : "pending"}>{m.playedAt ? "已送达 · 已播放" : m.deliveredAt ? "已送达 · 待播放" : "已发送 · 待送达"}</b></div></div>)}{!messages.length && <p>还没有发送语音。</p>}</section>
}

''' + s[end:]
start=s.index('  const [sent, setSent]',s.index('function Voice('))
end=s.index('  return (',start)
s=s[:start]+'''  const [sent, setSent] = useState(false)
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
''' + s[end:]
s=s.replace('<span className="child-chip selected">录制完成 · 待发送</span>', '<span className="child-chip selected">{recording.status === "recording" ? "正在录音" : recording.status === "ready" ? "录制完成 · 待发送" : "准备录音"}</span>')
s=s.replace('<span className="child-record-icon">','<span className="child-record-icon" role="button" tabIndex={0} aria-label={recording.status === "recording" ? "停止录音" : "开始录音"} onClick={action} onKeyDown={event => { if (event.key === "Enter") action() }}>').replace('<strong className="child-timer">00:18</strong>', '<strong className="child-timer">{String(Math.floor(recording.seconds / 60)).padStart(2,"0")}:{String(Math.floor(recording.seconds % 60)).padStart(2,"0")}</strong>')
s=s.replace('录音已保存，试听后再发送。', '{recording.status === "ready" ? "录音已准备，试听后再发送。" : "点击麦克风或开始录音，最长2分钟。"}').replace('妈妈会在「关怀语音」中收到。','{selectedElder()}会在「关怀语音」中收到。')
s=s.replace('<button className="child-secondary" type="button" onClick={play}>','<button className="child-secondary" type="button" disabled={recording.status !== "ready"} onClick={play}>')
s=s.replace('<button className="child-secondary" type="button">\n              <Icon name="4cfe2.svg" size={22} />\n              重新录制','<button className="child-secondary" type="button" onClick={action}>\n              <Icon name="4cfe2.svg" size={22} />\n              {recording.status === "recording" ? "停止录音" : recording.status === "ready" ? "重新录制" : "开始录音"}')
s=s.replace('          onClick={() => {\n            onDelivered()\n            setSent(true)\n          }}','          disabled={sending}\n          onClick={send}')
s=s.replace('        <RecentVoices onHistory={() => go("voice-history")} />','        <input hidden ref={fileInput} type="file" accept="audio/webm,audio/mp4,audio/ogg,audio/wav" onChange={event => { const file = event.target.files?.[0]; if (file) void recording.loadFile(file); event.target.value = "" }} />\n        {(error || recording.error) && <p className="field-error" role="alert">{error || recording.error}</p>}\n        <RecentVoices onHistory={() => go("voice-history")} />')
s=s.replace('关怀语音已送达','关怀语音已发送').replace('已发送给妈妈 · 李阿姨','已发送给{selectedElder()}').replace('本次新录音：18秒','本次录音：{Math.round(recording.seconds)}秒').replace('<span className="text-lg text-[#003e1c]">已送达 · 待播放</span>','<span className="text-lg text-[#003e1c]">已发送 · 待家人接收</span>')
start=s.index('function VoiceHistory(')
end=s.index('export default function ChildApp',start)
s=s[:start]+'''function VoiceHistory({ go }: { go: (page: ChildPage) => void }) {
  const data = backend.useBackend()
  return <><BackHeader title="语音历史" onBack={() => go("voice")} /><div className="child-content">{data.messages.filter(m => m.sender === data.account?.id && m.recipient === data.selectedId).map(m => <section className="child-card" key={m.id}><h2>{backend.timeText(m.sentAt)}</h2><h3 className="text-lg">收件人：{selectedElder()}</h3><p>{m.note || "关怀语音"}</p><div className="child-voice-row"><span role="button" tabIndex={0} onClick={() => void new Audio(m.audioDataUrl).play()}>▷ {Math.round(m.duration)}秒 · 试听</span><b>{m.playedAt ? "已送达 · 已播放" : m.deliveredAt ? "已送达 · 待播放" : "已发送 · 待送达"}</b></div></section>)}{!data.messages.some(m => m.sender === data.account?.id) && <section className="child-card"><p>暂无发送记录。</p></section>}</div></>
}

''' + s[end:]
s=s[:s.index('export default function ChildApp')]+'''export default function ChildApp({ child, elder: unusedElder, session, preferences, onUpdateChild }: { child: ChildDraft; elder: ElderDraft; session: SessionKind; preferences: ElderPreferences; onUpdateChild: (next: ChildDraft) => Promise<boolean> }) {
  const data = backend.useBackend()
  const [page, setPage] = useState<ChildPage>("home")
  const [familyOpen, setFamilyOpen] = useState(false)
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
    {page === "settings" && <SettingsPage child={child} elder={elder} linked={linked} notifications={notifications} go={go} onToggleNotification={toggle} onRequestPermission={async () => { if (!("Notification" in window)) return; const result = await Notification.requestPermission(); backend.report(new Error(result === "granted" ? "已允许浏览器通知；应用需保持运行，未接入后台推送。" : "将继续使用应用内通知。")) }} />}
    {page === "edit-profile" && <EditProfilePage child={child} linked={linked} go={go} onSave={onUpdateChild} />}
    {page === "family" && <FamilyPage child={child} elder={elder} linked={linked} go={go} />}
    {page === "add-family" && <AddFamilyPage child={child} go={go} onRequest={() => false} />}
    {page === "help" && <SharedHelp onBack={() => go("settings")} />}
    {familyOpen && <FamilyDialog onClose={() => setFamilyOpen(false)} />}
  </main></ChildContext.Provider>
}
'''
# 家人管理保留单张家人卡样式，点击切换已绑定老人；添加按钮也用于多家人。
start=s.index('  const grantLabels =',s.index('function FamilyPage'))
s=s[:start]+'''  const service = backend.useBackend()
  const { openFamily } = useContext(ChildContext)
''' +s[start:]
s=s.replace('<span>1位</span>', '<span role="button" tabIndex={0} onClick={openFamily}>{service.families.filter(f => !f.amElder && f.status === "bound").length}位 · 切换</span>')
s=s.replace('{linked.status === "none" && (','{true && (')
p.write_text(s,encoding='utf-8')
# 修正原始包的类型分隔符，界面无变化。
p=ROOT/'src/App.tsx'; p.write_text(p.read_text(encoding='utf-8').replace('title: string onBack:', 'title: string; onBack:'),encoding='utf-8')
print('子女概览、记录详情、日期筛选、多人选择和真实语音已接入。')
