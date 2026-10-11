import { useSyncExternalStore } from "react";
import { emptyElderDraft, emptyChildDraft, type ElderDraft, type ChildDraft } from "./Onboarding";
import { saveLocalRecord, getLocalRecord } from "./photoStore";

export type Account = { id: string; phone: string; name: string; role: "elder" | "child"; profile: any; prefs: any };
export type Family = { id: string; elder: string; child: string; status: string; relation: string; records_allowed: number; profile_allowed: number; is_primary: number; amElder: boolean; updated: string; requested_relation?: string; member: Account & { age?: number } };
export type Message = { id: string; sender: string; recipient: string; audioDataUrl: string; duration: number; note: string; sentAt: string; deliveredAt: string | null; playedAt: string | null };
export type Snapshot = { account: Account | null; connected: boolean; ready: boolean; guest: boolean; families: Family[]; ownRecords: any[]; sharedRecords: any[]; sharedProfile: any; selectedId: string; messages: Message[]; syncedAt: string; error: string; notice: string; revision: number; inviteStatus: "idle" | "loading" | "ready" | "error"; inviteError: string };
let state: Snapshot = { account: null, connected: false, ready: false, guest: false, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, selectedId: "", messages: [], syncedAt: "", error: "", notice: "", revision: 0, inviteStatus: "idle", inviteError: "" };
const listeners = new Set<() => void>();
let refreshJob: Promise<void> | null = null;
let epoch = 0;
const receivedStates = new Map<string, string>();
function emit(patch: Partial<Snapshot> = {}) { state = { ...state, ...patch, revision: state.revision + 1 }; listeners.forEach(fn => fn()); }
export function snapshot() { return state; }
export function useBackend() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, snapshot); }
export function report(error: unknown) { emit({ error: error instanceof Error ? error.message : String(error) }); }
export function clearNotice() { emit({ error: "", notice: "" }); }
export function selectedFamily() { return state.families.find(f => !f.amElder && f.status === "bound" && f.member.id === state.selectedId) || null; }
export async function api(path: string, options: { method?: string; body?: any; signal?: AbortSignal } = {}) {
  const response = await fetch(`/api${path}`, { method: options.method || "GET", credentials: "same-origin", cache: "no-store", signal: options.signal || AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const payload = await response.json().catch(() => ({ error: "家庭服务未连接，请使用启动第四版.cmd打开。" }));
  if (!response.ok || payload.error) throw new Error(payload.error || "操作失败，请重试。");
  return payload;
}
export function localKey(kind: string) { return `foodlenscare.v4.${state.account?.id || "guest"}.${kind}`; }
export function localRead<T>(kind: string, fallback: T): T { try { return JSON.parse((state.guest ? sessionStorage : localStorage).getItem(localKey(kind)) || "null") ?? fallback; } catch { return fallback; } }
export function localWrite(kind: string, value: any) { (state.guest ? sessionStorage : localStorage).setItem(localKey(kind), JSON.stringify(value)); }
export async function connect() {
  try { await api("/status"); const { user } = await api("/me"); emit({ account: user, connected: true, ready: true }); if (user) await refresh(); }
  catch { emit({ ready: true, connected: false }); }
}
export async function login(phone: string, code: string) {
  const { user } = await api("/auth/login", { method: "POST", body: { phone, code } });
  epoch++; receivedStates.clear(); emit({ account: user, guest: false, error: "", families: [], ownRecords: [], sharedRecords: [], messages: [], selectedId: "" }); await refresh(); return user as Account;
}
export async function guestMode() {
  if (state.account) await api("/auth/logout", { method: "POST", body: {} });
  epoch++; receivedStates.clear(); emit({ account: null, guest: true, families: [], sharedRecords: [], sharedProfile: null, ownRecords: [], messages: [], selectedId: "", error: "" });
  const owner = guestStorageOwner();
  const records = await Promise.all(localRead<any[]>("records", []).map(async record => (await getLocalRecord(owner,record.id)) || record));
  emit({ ownRecords: records });
}
function guestStorageOwner() { let value=sessionStorage.getItem("foodlenscare.v4.guestOwner"); if(!value) { value=crypto.randomUUID(); sessionStorage.setItem("foodlenscare.v4.guestOwner",value); } return `guest-${value}`; }
export async function logout() { if (state.account) await api("/auth/logout", { method: "POST", body: {} }); epoch++; receivedStates.clear(); emit({ account: null, guest: false, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, messages: [], selectedId: "", syncedAt: "", error: "", notice: "", inviteStatus: "idle", inviteError: "" }); }
export async function saveProfile(role: "elder" | "child", draft: ElderDraft | ChildDraft) {
  if (!state.account) { localWrite(`${role}Profile`, draft); return; }
  if (draft.phone !== state.account.phone) throw new Error("请先在手机号验证窗口完成新号码验证。");
  const profile = { ...state.account.profile, ...draft, completed: true, role };
  const { user } = await api("/me", { method: "PATCH", body: { role, profile } }); emit({ account: user });
}
export async function changePhone(phone: string, code: string) { const { user } = await api("/auth/change-phone", { method: "POST", body: { phone, code } }); emit({ account: user }); }
export async function savePrefs(patch: any) { if (!state.account) { localWrite("prefs", { ...localRead("prefs", {}), ...patch }); emit(); return; } const { user } = await api("/me", { method: "PATCH", body: { prefs: { ...state.account.prefs, ...patch } } }); emit({ account: user }); }
export function elderProfile(profile = state.account?.profile, phone = state.account?.phone || ""): ElderDraft {
  const conditionNames: Record<string, string> = { hypertension: "高血压", diabetes: "糖尿病", hyperlipidemia: "高血脂", coronary: "冠心病", none: "无" };
  const allergenNames: Record<string, string> = { peanut: "花生", nut: "坚果", milk: "牛奶", egg: "鸡蛋", soy: "大豆", gluten: "小麦", fish: "鱼类", crustacean: "虾蟹", none: "无" };
  const p = profile || {};
  return { ...emptyElderDraft, ...p, phone, phoneVerified: !!state.account && phone === state.account.phone, age: p.age == null ? "" : String(p.age), weight: p.weight == null ? "" : String(p.weight), diseases: p.diseases || (p.conditions || []).map((s: string) => conditionNames[s] || s), allergens: (p.allergens || []).map((s: string) => allergenNames[s] || s), diseaseOther: p.diseaseOther || p.otherConditions || "", allergenOther: p.allergenOther || p.otherAllergens || "", healthConsent: !!p.healthConsent };
}
export function childProfile(): ChildDraft { return { ...emptyChildDraft, ...(state.account?.profile || localRead("childProfile", {})), phone: state.account?.phone || "", phoneVerified: !!state.account }; }
let inviteJob: { owner: string; task: Promise<string> } | null = null;
export async function invite(force = false): Promise<string> {
  if (!state.account) throw new Error("请先登录后生成家人绑定码。");
  const owner = state.account.id, role = state.account.role;
  if (inviteJob?.owner === owner) return inviteJob.task;
  emit({ inviteStatus: "loading", inviteError: "" });
  const task = (async () => {
    try {
      let data = force ? null : await api("/family/invite");
      if (!data?.code) data = await api("/family/invite", { method: "POST", body: { role } });
      if (state.account?.id !== owner || state.account.role !== role) return "";
      localWrite("invite", { code: data.code, expiresAt: data.expiresAt, familyCount: state.families.length });
      emit({ inviteStatus: "ready" }); return data.code as string;
    } catch (error) {
      if (state.account?.id === owner) emit({ inviteStatus: "error", inviteError: error instanceof Error ? error.message : "生成失败，请重试。" });
      throw error;
    }
  })();
  const job = { owner, task }; inviteJob = job;
  try { return await task; } finally { if (inviteJob === job) inviteJob = null; }
}
export function bindingExpiresAt() { return Number(localRead<any>("invite", null)?.expiresAt || 0); }
export function bindingCode() { const saved = localRead<any>("invite", null); return state.account && saved?.expiresAt > Date.now() && saved.familyCount === state.families.length ? saved.code : ""; }
export async function lookup(code: string) { return api(`/family/lookup?code=${encodeURIComponent(code)}`); }
export async function join(code: string, relation: string) { const data = await api("/family/join", { method: "POST", body: { code, relation } }); await refresh(); return data; }
export async function patchFamily(id: string, patch: any) { await api(`/family/${id}`, { method: "PATCH", body: patch }); await refresh(); }
export async function removeFamily(id: string) {
  const family = state.families.find(f => f.id === id);
  await api(`/family/${id}`, { method: "DELETE" }); epoch++;
  emit({ families: state.families.filter(f => f.id !== id), selectedId: state.selectedId === family?.member.id ? "" : state.selectedId, sharedRecords: [], sharedProfile: null, messages: state.messages.filter(m => m.sender !== family?.member.id && m.recipient !== family?.member.id), syncedAt: "" });
  await refresh();
}
export async function requestRelation(id: string, relation: string) { await api(`/family/${id}/relation-request`, { method: "POST", body: { relation } }); await refresh(); }
export async function chooseFamily(id: string) { epoch++; emit({ selectedId: id, sharedRecords: [], sharedProfile: null, syncedAt: "" }); await refresh(); }
export async function putRecord(record: any) {
  const owner = state.account?.id;
  if (owner) { await api("/records", { method: "POST", body: { record } }); if (owner !== state.account?.id) return; emit({ ownRecords: [record, ...state.ownRecords.filter(r => r.id !== record.id)] }); }
  else {
    await saveLocalRecord(guestStorageOwner(),record);
    const records = [record, ...state.ownRecords.filter(r => r.id !== record.id)];
    localWrite("records", records.map(({photoDataUrl,...metadata})=>metadata)); emit({ ownRecords: records });
  }
}
export async function sendVoice(audioDataUrl: string, duration: number, recipient: string) { await api("/voices", { method: "POST", body: { recipient, audioDataUrl, duration, note: "" } }); await refresh(); }
export async function played(id: string) { await api(`/voices/${id}/receipt`, { method: "POST", body: { played: true } }); await refresh(); }
export async function refresh() {
  if (!state.account) return;
  if (refreshJob) { await refreshJob; if (!state.account) return; }
  const owner = state.account.id, generation = epoch;
  const current = () => state.account?.id === owner && epoch === generation;
  refreshJob = (async () => {
    try {
      const [{ user }, { families, syncedAt }] = await Promise.all([api("/me"), api("/family")]);
      if (!current()) return;
      if (!user) { epoch++; emit({ account: null, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, messages: [], selectedId: "", error: "登录已失效，请重新登录。" }); return; }
      const linked = families.filter((f: Family) => !f.amElder && f.status === "bound");
      const selected = linked.find((f: Family) => f.member.id === state.selectedId) || linked[0];
      // 每次先清除撤回权限的数据，再发查询；失败不保留旧共享快照。
      const sameSelection = selected?.member.id === state.selectedId;
      emit({ account: user, families, selectedId: selected?.member.id || "", sharedRecords: sameSelection && selected?.records_allowed ? state.sharedRecords : [], sharedProfile: sameSelection && selected?.profile_allowed ? state.sharedProfile : null, syncedAt });
      const jobs = await Promise.allSettled([api("/records"), selected?.records_allowed ? api(`/records?elder=${selected.member.id}`) : Promise.resolve(null), api("/voices")]);
      if (!current()) return;
      const own = jobs[0].status === "fulfilled" ? jobs[0].value.records : [];
      const shared = jobs[1].status === "fulfilled" ? jobs[1].value : null;
      const messages: Message[] = jobs[2].status === "fulfilled" ? jobs[2].value.messages : [];
      for (const message of messages) {
        if (!current()) return;
        if (message.recipient === owner && !message.deliveredAt) { const receipt = await api(`/voices/${message.id}/receipt`, { method: "POST", body: { played: false } }); Object.assign(message, receipt.message); }
        if (message.sender === owner) {
          const previous = receivedStates.get(message.id), next = message.playedAt ? "played" : message.deliveredAt ? "delivered" : "sent";
          const prefs = user.prefs.childNotifications || { delivery: true, playback: true };
          if (previous && previous !== next && ((next === "played" && prefs.playback) || (next === "delivered" && prefs.delivery))) {
            const notice = next === "played" ? "家人已播放您的关怀语音。" : "家人已收到您的关怀语音。";
            emit({ notice });
            if ("Notification" in window && Notification.permission === "granted") { try { new Notification("食护家关怀语音", { body: notice, tag: message.id + next }); } catch { /* 浏览器通知不可用时保留应用内提醒。 */ } }
          }
          receivedStates.set(message.id, next);
        }
      }
      if (current()) emit({ ownRecords: own, sharedRecords: shared?.records || [], sharedProfile: shared?.profile || null, messages });
    } catch (error) { if (current()) emit({ sharedRecords: [], sharedProfile: null, messages: [], families: [], error: error instanceof Error ? error.message : "同步失败" }); }
  })();
  try { await refreshJob; } finally { refreshJob = null; }
}
if (typeof window !== "undefined") { window.setInterval(() => { if (state.account) void refresh(); }, 5000); }

export function mask(phone: string) { return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : phone || "未提供号码"; }
export function dateKey(value: string | Date = new Date()) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function timeText(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
export function weekStats(records: any[]) { const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1)); const week = records.filter(r => new Date(r.at || r.recognizedAt) >= monday); return { today: records.filter(r => dateKey(r.at || r.recognizedAt) === dateKey()).length, week: week.length, attention: week.filter(r => (r.assessment?.level || "gray") !== "green").length, label: `${monday.getMonth() + 1}月${monday.getDate()}日起` }; }
