from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
p = ROOT/'src/App.tsx'
s = p.read_text(encoding='utf-8')
s = 'import * as backend from "./backend"\n' + s
start = s.index('  const requestCode = () => {', s.index('function PhonePage'))
end = s.index('\n  return (', start)
s = s[:start] + '''  const requestCode = async () => {
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
''' + s[end:]
s = s.replace('<p>此处为概念产品演示，完整协议／政策页面将在后续接入。</p>', '<p>{kind === "隐私政策" ? "游客资料仅保存在当前浏览器；登录后的本人资料、照片、记录和语音保存到本机家庭服务。老人确认绑定并单独授权后，子女才可读取对应范围，授权可随时撤回。" : "本版本供本机和可信局域网使用。验证码为本地测试，未接入短信或微信。食品标签识别需核对实物，饮食参考不替代医疗建议；求助入口需本人确认后拨号。"}</p>')
s = s[:s.index('export default function App()')] + '''export default function App() {
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
  const completeChild = async () => { if (await saveChild(childDraft)) navigate("child-home") }
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
  else if (view === "child-home") page = <ChildApp child={childDraft} elder={elderDraft} preferences={preferences} session={session} onUpdateChild={saveChild} />
  else if (view === "elder-home") page = <ElderHome session={session} contact={contact} onOpenCamera={beginScan} onOpenRecords={() => navigate("health-records")} onOpenVoice={id => { setRequestedVoiceId(id); navigate("care-voice") }} voicePlayer={voicePlayer} onOpenSettings={() => navigate("elder-settings")} />
  else if (view === "recognition") page = <FoodRecognition elder={elderDraft} session={session} setStage={setRecognitionStage} stage={recognitionStage} speechEnabled={preferences.speechEnabled} onStopFamilyAudio={voicePlayer.pause} onUpdateElder={saveElder} onHome={() => navigate("elder-home")} />
  else if (view === "health-records") page = <HealthRecords contact={contact} elder={elderDraft} session={session} onHome={() => navigate("elder-home")} onRecognize={beginScan} onSettings={() => navigate("elder-settings")} sharingStatus={sharing} />
  else if (view === "care-voice") page = <CareVoicePage player={voicePlayer} requestedId={requestedVoiceId} session={session} onBack={() => { voicePlayer.pause(); navigate("elder-home") }} />
  else if (view === "elder-settings") page = <ElderSettings elder={elderDraft} preferences={preferences} savePreferences={savePreferences} session={session} onHome={() => navigate("elder-home")} onRecords={() => navigate("health-records")} onEdit={() => navigate("elder-edit")} />
  else if (view === "elder-edit") page = <ElderProfileEdit initial={elderDraft} session={session} onBack={() => navigate("elder-settings")} onSave={saveElder} />
  else page = <WelcomePage navigate={navigate} openLegal={setLegal} onGuest={async () => { try { await backend.guestMode(); enter() } catch (error) { backend.report(error) } }} />
  return <>{page}{legal && <LegalDialog kind={legal} onClose={() => setLegal(null)} />}{(data.error || data.notice) && <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true"><h2>{data.error ? "操作提示" : "关怀通知"}</h2><p role="status">{data.error || data.notice}</p><button className="primary-button" type="button" onClick={backend.clearNotice}>知道了</button></section></div>}</>
}
'''
p.write_text(s, encoding='utf-8')
print('登录、身份与双方页面入口已接入。')
