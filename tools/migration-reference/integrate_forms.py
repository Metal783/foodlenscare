from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

p=ROOT/'src/Onboarding.tsx'
s=p.read_text(encoding='utf-8')
s='import * as backend from "./backend"\n'+s
start=s.index('  const request = () => {',s.index('function PhoneVerification'))
end=s.index('\n  return (',start)
s=s[:start]+'''  const [testCode, setTestCode] = useState("")
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
''' + s[end:]
s=s.replace('演示验证码：123456，未发送真实短信', '本地测试验证码：{testCode}，未发送真实短信')
start=s.index('  const reviewBinding = () => {',s.index('export function ChildProfilePage'))
end=s.index('\n  return (',start)
s=s[:start]+'''  const [candidate, setCandidate] = useState<any>(null)
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
''' + s[end:]
s=s.replace('演示老人：王阿姨', '{candidate?.name || "请先登录查询"}').replace('手机尾号：2096', '手机号：{candidate?.phone || "未查询"}').replace('当前为演示查询，不会查找或绑定真实人物。', '提交申请后，需老人本人确认。')
# 完成提示必须在服务端保存成功后展示。
s=s.replace('const saveOnly = () => {', 'const saveOnly = async () => {')
start=s.index('    window.setTimeout(() => {',s.index('  const saveOnly'))
end=s.index('\n  }',start)
s=s[:start]+'''    try { await backend.saveProfile("child", draft); setComplete("saved") }
    catch (error) { setError((error as Error).message) }
    finally { setSaving(false) }''' + s[end:]
# 老人原有完整校验保留，只替换模拟等待。
start=s.index('    window.setTimeout(() => {',s.index('export function ElderProfilePage'))
end=s.index('    }, 600)',start)+len('    }, 600)')
old=s[start:end]
success=old.replace('    window.setTimeout(() => {','').replace('    }, 600)','')
s=s[:start]+'''    void backend.saveProfile("elder", draft).then(() => {'''+success+'''    }).catch(error => { setSaving(false); setError(error.message) })'''+s[end:]
p.write_text(s,encoding='utf-8')

p=ROOT/'src/ElderProfileEdit.tsx'
s=p.read_text(encoding='utf-8')
s='import * as backend from "./backend";\n'+s
s=s.replace('onSave: (draft: ElderDraft) => boolean;', 'onSave: (draft: ElderDraft) => Promise<boolean>;').replace('const save = () => {', 'const save = async () => {')
s=s.replace('window.setTimeout(() => {\n      if (onSave({ ...draft, name }))', 'if (await onSave({ ...draft, name }))').replace('    }, 500);','')
start=s.index('  const verifyPhone = () => {')
end=s.index('\n  return (',start)
s=s[:start]+'''  const [testCode, setTestCode] = useState("");
  const verifyPhone = async () => {
    if (!/^1[3-9]\\d{9}$/.test(newPhone)) return setError("请输入有效的11位手机号");
    try {
      if (session === "guest-demo") { setDraft(current => ({ ...current, phone: newPhone, phoneVerified: false })); setPhoneOpen(false); return; }
      if (!codeRequested) { const response = await backend.api("/auth/code", { method: "POST", body: { phone: newPhone } }); setTestCode(response.testCode); setCodeRequested(true); setError(""); return; }
      await backend.changePhone(newPhone, code);
      setDraft(current => ({ ...current, phone: newPhone, phoneVerified: true })); setPhoneOpen(false); setCodeRequested(false); setCode(""); setError("");
    } catch (error) { setError((error as Error).message); }
  };
''' + s[end:]
s=s.replace('演示验证码：123456，未发送真实短信', '本地测试验证码：{testCode}，未发送真实短信').replace('演示验证','本地测试验证').replace('本地演示数据','本机家庭服务数据')
p.write_text(s,encoding='utf-8')

p=ROOT/'src/ElderSettings.tsx'
s=p.read_text(encoding='utf-8')
s='import * as backend from "./backend";\n'+s
s=s.replace('=> boolean;', '=> Promise<boolean>;')
start=s.index('  const lookup = () => {',s.index('function AddFamilyPage'))
end=s.index('  const fromRequest',start)
s=s[:start]+'''  const lookup = async () => {
    try {
      const value = query.trim().toUpperCase();
      const result = await backend.lookup(value);
      if (result.role !== "child") throw new Error("请输入子女端提供的绑定码。");
      const request = await backend.join(value, relation);
      onCandidate({ id: request.id, requestId: request.id, name: result.member.name, relation, maskedPhone: result.member.phone, primary: !preferences.members.length, demo: false });
    } catch (error) { setMessage((error as Error).message); }
  };
''' + s[end:]
s=s.replace('id: `request-${request.id}`,','id: request.id,').replace('primary: false,\n      demo: true,','primary: !preferences.members.length,\n      demo: false,')
s=s.replace('演示绑定码。把此码告诉子女，收到申请后由您确认。','绑定码24小时有效、仅可使用一次。把此码告诉子女，申请由您确认。').replace('尚未发出绑定请求，下一步仅核对身份。演示可使用 CHILD8。','输入家人提供的有效绑定码；下一步创建申请并核对身份。').replace('家人绑定码或手机号','家人绑定码').replace('输入或粘贴绑定码／手机号','输入或粘贴绑定码')
s=s.replace('await navigator.clipboard.writeText(preferences.bindingCode);', 'await navigator.clipboard.writeText(preferences.bindingCode || await backend.invite());')
s=s.replace('const confirm = () => {','const confirm = async () => {').replace('window.setTimeout(() => {\n      const members', 'try {\n      const members').replace('if (save({ ...preferences, members, grants, requests }))', 'if (await save({ ...preferences, members, grants, requests }))').replace('    }, 500);','    } finally { setSaving(false); }')
s=s.replace('const reject = () => {','const reject = async () => {').replace('if (save({ ...preferences, requests }))','if (await save({ ...preferences, requests }))')
start=s.index('  const [corrections, setCorrections]',s.index('function GuardPage'))
end=s.index('  const sharingOn',start)
s=s[:start]+'''  const service = backend.useBackend();
  const corrections: RelationshipCorrection[] = service.families.filter(f => f.amElder && f.requested_relation).map(f => ({ id: f.id, memberId: f.id, applicantName: f.member.name, currentRelation: f.relation, requestedRelation: f.requested_relation!, status: "pending" }));
''' + s[end:]
start=s.index('  const resolveCorrection = (')
end=s.index('  const toggleSharing',start)
s=s[:start]+'''  const resolveCorrection = async (correction: RelationshipCorrection, accepted: boolean) => {
    try { await backend.patchFamily(correction.memberId, { ...(accepted ? { relation: correction.requestedRelation } : {}), resolve_relation: true }); setMemberInfo(null); setNotice(accepted ? "关系更正已确认。" : "已保留原关系。"); }
    catch (error) { setNotice((error as Error).message); }
  };
''' + s[end:]
s=s.replace('onSave={(grants) => {\n        if (save(', 'onSave={async (grants) => {\n        if (await save(').replace('onClick={() => {\n              if (save(', 'onClick={async () => {\n              if (await save(')
s=s.replace('onClick={() => {\n              if (savePreferences(', 'onClick={async () => {\n              if (await savePreferences(').replace('onSave={(fontSize) => {\n        if (savePreferences(', 'onSave={async (fontSize) => {\n        if (await savePreferences(')
s=s.replace('本地演示授权已更新。','家庭服务授权已更新。').replace('位演示家人','位家人').replace('版本 1.0.0','版本 4.0.0')
# 新前端没有生成子女绑定码入口，老人仍可通过自己的邀请和申请列表完成绑定。
p.write_text(s,encoding='utf-8')

p=ROOT/'src/ElderHome.tsx'
s=p.read_text(encoding='utf-8').replace('onClick={() => setNotice("家人绑定与联系人功能将在后续阶段接入。")}', 'onClick={onOpenSettings}')
s=s.replace('当前为演示联系人，未提供可拨打的完整号码','联系人号码未完善，请在子女守护中核对。')
p.write_text(s,encoding='utf-8')
p=ROOT/'src/recognition.ts'
p.write_text(p.read_text(encoding='utf-8').replace('recognizeDemoCase("oatmeal")','recognizeDemoCase("spinach-noodle")'),encoding='utf-8')
print('资料验证、家人绑定和授权保存已接入。')
