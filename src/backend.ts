import { useSyncExternalStore } from "react";
import { emptyElderDraft, emptyChildDraft, type ElderDraft, type ChildDraft } from "./Onboarding";
import { saveLocalRecord, getLocalRecord, deleteLocalRecord } from "./photoStore";
import { resetBrowserData } from "./resetBrowserData";
import { currentServerAddress } from './serverAddress';
import { isMobileApp, mobileRequest, removeMobileSession, setMobileSession } from './mobile';
import { birthDateIssue, profileAge } from './birthDate';
import { RecordNotificationTracker, showRecordNotification } from './recordNotifications';
import { RequestError, requestSignal } from './requestSignal';
import { recordNeedsAttention } from './recordStatus';

export type Account = { id: string; phone: string; name: string; role: "elder" | "child"; profile: any; prefs: any; familyAiAllowed?: boolean };
export type Family = { id: string; elder: string; child: string; status: string; relation: string; records_allowed: number; profile_allowed: number; is_primary: number; amElder: boolean; updated: string; requested_relation?: string; member: Account & { age?: number | string } };
export type Message = { id: string; sender: string; recipient: string; audioDataUrl: string; duration: number; note: string; sentAt: string; deliveredAt: string | null; playedAt: string | null };
export type Snapshot = { account: Account | null; connected: boolean; ready: boolean; guest: boolean; families: Family[]; ownRecords: any[]; sharedRecords: any[]; sharedProfile: any; selectedId: string; messages: Message[]; syncedAt: string; error: string; notice: string; revision: number; inviteStatus: "idle" | "loading" | "ready" | "error"; inviteError: string };
let state: Snapshot = { account: null, connected: false, ready: false, guest: false, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, selectedId: "", messages: [], syncedAt: "", error: "", notice: "", revision: 0, inviteStatus: "idle", inviteError: "" };
const listeners = new Set<() => void>();
let refreshJob: Promise<void> | null = null;
let refreshOwner = '', refreshEpoch = -1;
let epoch = 0;
const recordNotifications = new RecordNotificationTracker();
const recordCache = new Map<string, { version: string; records: any[] }>();
const mediaCache = new Map<string, string>();
let mediaBytes = 0;
let previewAudio: HTMLAudioElement | null = null;
function clearPrivateCaches() { recordCache.clear(); mediaCache.clear(); mediaBytes = 0; previewAudio?.pause(); previewAudio = null; }
function clearSession(error = '') {
  epoch++; recordNotifications.clear(); clearPrivateCaches();
  emit({ account: null, guest: false, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, messages: [], selectedId: '', syncedAt: '', error, notice: '', inviteStatus: 'idle', inviteError: '' });
}
function emit(patch: Partial<Snapshot> = {}) { state = { ...state, ...patch, revision: state.revision + 1 }; listeners.forEach(fn => fn()); }
export function snapshot() { return state; }
export function useBackend() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, snapshot); }
export function report(error: unknown) { emit({ error: error instanceof Error ? error.message : String(error) }); }
export function clearNotice() { emit({ error: "", notice: "" }); }
export function selectedFamily() { return state.families.find(f => !f.amElder && f.status === "bound" && f.member.id === state.selectedId) || null; }
export async function api(path: string, options: { method?: string; body?: any; signal?: AbortSignal; timeoutMs?: number } = {}) {
  const owner = state.account?.id, generation = epoch;
  const deadline = requestSignal(options.signal, options.timeoutMs || 15000);
  try {
  if (isMobileApp()) {
    const origin = currentServerAddress();
    if (!origin) throw new Error('请先在欢迎页的服务器地址中填写电脑地址。');
    const payload = await mobileRequest(origin, `/api${path}`, { ...options, signal: deadline.signal });
    if (origin !== currentServerAddress()) throw new Error('服务器地址已更改，请重新操作。');
    if (path === '/auth/login' && payload.sessionToken) { await setMobileSession(origin, payload.sessionToken); delete payload.sessionToken; }
    if (path === '/auth/logout' || path === '/account' && options.method === 'DELETE' || path === '/me' && !payload.user) await removeMobileSession(origin);
    return payload;
  }
  const response = await fetch(`/api${path}`, { method: options.method || "GET", credentials: "same-origin", cache: "no-store", signal: deadline.signal, headers: { "Content-Type": "application/json" }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const payload = await response.json().catch(() => ({ error: "家庭服务未连接，请使用启动完善版.cmd打开。" }));
  if (!response.ok || payload.error) throw new RequestError(payload.error || "操作失败，请重试。", response.status);
  return payload;
  } catch (error) {
    if (error instanceof RequestError && error.status === 401 && !['/auth/login', '/auth/code', '/auth/change-phone'].includes(path) && owner && state.account?.id === owner && epoch === generation) {
      clearSession('登录已失效，请重新登录。');
      if (isMobileApp()) void removeMobileSession(currentServerAddress()).catch(() => {});
    }
    throw error;
  } finally { deadline.dispose(); }
}
export function localKey(kind: string) { const scope = isMobileApp() ? `${encodeURIComponent(currentServerAddress())}.` : ''; return `foodlenscare.v4.${scope}${state.account?.id || "guest"}.${kind}`; }
export function localRead<T>(kind: string, fallback: T): T { try { return JSON.parse((state.guest ? sessionStorage : localStorage).getItem(localKey(kind)) || "null") ?? fallback; } catch { return fallback; } }
export function localWrite(kind: string, value: any) { (state.guest ? sessionStorage : localStorage).setItem(localKey(kind), JSON.stringify(value)); }
export async function connect() {
  try { const status = await api("/status"); await resetBrowserData(status.browserReset); const { user } = await api("/me"); emit({ account: user, connected: true, ready: true }); if (user) await refresh(); }
  catch { emit({ ready: true, connected: false }); }
}
export async function login(phone: string, code: string) {
  const { user } = await api("/auth/login", { method: "POST", body: { phone, code } });
  epoch++; recordNotifications.clear(); clearPrivateCaches(); emit({ account: user, guest: false, error: "", families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, messages: [], selectedId: "" }); await refresh(); return user as Account;
}
export async function guestMode() {
  if (state.account) await api("/auth/logout", { method: "POST", body: {} });
  epoch++; recordNotifications.clear(); clearPrivateCaches(); emit({ account: null, guest: true, families: [], sharedRecords: [], sharedProfile: null, ownRecords: [], messages: [], selectedId: "", error: "" });
  const owner = guestStorageOwner();
  const records = await Promise.all(localRead<any[]>("records", []).map(async record => (await getLocalRecord(owner,record.id)) || record));
  emit({ ownRecords: records });
}
function guestStorageOwner() { let value=sessionStorage.getItem("foodlenscare.v4.guestOwner"); if(!value) { value=crypto.randomUUID(); sessionStorage.setItem("foodlenscare.v4.guestOwner",value); } return `guest-${value}`; }
export async function logout() {
  try { if (state.account) await api('/auth/logout', { method: 'POST', body: {} }); }
  catch (error) { if (!(error instanceof RequestError && error.status === 401)) throw error; }
  clearSession();
}
export async function cancelAccount(token: string) {
  const owner = state.account?.id;
  const cachePrefix = localKey('');
  await api("/account", { method: "DELETE", body: { token, agreed: true } });
  if (owner) {
    for (const storage of [localStorage, sessionStorage]) {
      try { for (const key of Object.keys(storage)) if (key.startsWith(cachePrefix)) storage.removeItem(key); } catch { /* 服务端注销已完成。 */ }
    }
  }
  epoch++; recordNotifications.clear(); clearPrivateCaches();
  emit({ account: null, guest: false, families: [], ownRecords: [], sharedRecords: [], sharedProfile: null, messages: [], selectedId: "", syncedAt: "", error: "", notice: "", inviteStatus: "idle", inviteError: "" });
}
export async function saveProfile(role: "elder" | "child", draft: ElderDraft | ChildDraft) {
  const issue = birthDateIssue(draft.birthDate);
  if (issue) throw new Error(issue);
  draft = { ...draft, age: profileAge(draft) };
  if (!state.account) { localWrite(`${role}Profile`, draft); return; }
  if (draft.phone !== state.account.phone) throw new Error("请先在手机号验证窗口完成新号码验证。");
  const profile = { ...state.account.profile, ...draft, completed: true, role };
  const { user } = await api("/me", { method: "PATCH", body: { role, profile } }); emit({ account: user });
}
export async function changePhone(phone: string, code: string) { const { user } = await api("/auth/change-phone", { method: "POST", body: { phone, code } }); emit({ account: user }); }
export async function savePrefs(patch: any) {
  if (!state.account) { localWrite("prefs", { ...localRead("prefs", {}), ...patch }); emit(); return; }
  const owner = state.account.id;
  const { user } = await api("/me", { method: "PATCH", body: { prefs: { ...state.account.prefs, ...patch } } });
  if (state.account?.id !== owner) return;
  // An older poll must not restore a notification preference after it is saved.
  if ('recordNotificationsEnabled' in patch || 'familyAssistantConsent' in patch) epoch++;
  emit({ account: user });
}
export function elderProfile(profile = state.account?.profile, phone = state.account?.phone || ""): ElderDraft {
  const conditionNames: Record<string, string> = { hypertension: "高血压", diabetes: "糖尿病", hyperlipidemia: "高血脂", coronary: "冠心病", none: "无" };
  const allergenNames: Record<string, string> = { peanut: "花生", nut: "坚果", milk: "牛奶", egg: "鸡蛋", soy: "大豆", gluten: "小麦", fish: "鱼类", crustacean: "虾蟹", none: "无" };
  const p = profile || {};
  return { ...emptyElderDraft, ...p, birthDate: p.birthDate || '', phone, phoneVerified: !!state.account && phone === state.account.phone, age: profileAge(p), weight: p.weight == null ? "" : String(p.weight), diseases: p.diseases || (p.conditions || []).map((s: string) => conditionNames[s] || s), allergens: (p.allergens || []).map((s: string) => allergenNames[s] || s), diseaseOther: p.diseaseOther || p.otherConditions || "", allergenOther: p.allergenOther || p.otherAllergens || "", healthConsent: !!p.healthConsent };
}
export function childProfile(): ChildDraft { const p = state.account?.profile || localRead<Partial<ChildDraft>>('childProfile', {}); return { ...emptyChildDraft, ...p, birthDate: p.birthDate || '', age: profileAge(p), phone: state.account?.phone || p.phone || '', phoneVerified: !!state.account }; }
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
export async function patchFamily(id: string, patch: any) { await api(`/family/${id}`, { method: "PATCH", body: patch }); epoch++; await refresh(); }
export async function removeFamily(id: string) {
  const family = state.families.find(f => f.id === id);
  await api(`/family/${id}`, { method: "DELETE" }); epoch++; clearPrivateCaches();
  emit({ families: state.families.filter(f => f.id !== id), selectedId: state.selectedId === family?.member.id ? "" : state.selectedId, sharedRecords: [], sharedProfile: null, messages: state.messages.filter(m => m.sender !== family?.member.id && m.recipient !== family?.member.id), syncedAt: "" });
  await refresh();
}
export async function requestRelation(id: string, relation: string) { await api(`/family/${id}/relation-request`, { method: "POST", body: { relation } }); await refresh(); }
export async function chooseFamily(id: string) { epoch++; clearPrivateCaches(); emit({ selectedId: id, sharedRecords: [], sharedProfile: null, syncedAt: "" }); await refresh(); }
export async function putRecord(record: any) {
  const owner = state.account?.id;
  if (owner) { await api("/records", { method: "POST", body: { record } }); if (owner !== state.account?.id) return; emit({ ownRecords: [record, ...state.ownRecords.filter(r => r.id !== record.id)] }); }
  else {
    if (!state.guest) throw new Error('请重新登录后保存，本次结果尚未写入账号。');
    await saveLocalRecord(guestStorageOwner(),record);
    const records = [record, ...state.ownRecords.filter(r => r.id !== record.id)];
    localWrite("records", records.map(({photoDataUrl,...metadata})=>metadata)); emit({ ownRecords: records });
  }
}
export async function deleteRecord(id: string) {
  if (!state.ownRecords.some(record => record.id === id)) throw new Error('只能删除本人的识别记录。');
  const owner = state.account?.id;
  const guestOwner = owner ? '' : guestStorageOwner();
  if (owner) await api(`/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
  else await deleteLocalRecord(guestOwner, id);
  if (state.account?.id !== owner || !owner && guestStorageOwner() !== guestOwner) return;
  const records = state.ownRecords.filter(record => record.id !== id);
  if (!owner) localWrite('records', records.map(({ photoDataUrl, ...metadata }) => metadata));
  // Discard any refresh started before deletion so it cannot restore the old row.
  epoch++;
  emit({ ownRecords: records });
}
export async function sendVoice(audioDataUrl: string, duration: number, recipient: string) { await api("/voices", { method: "POST", body: { recipient, audioDataUrl, duration, note: "" } }); epoch++; await refresh(); }
export async function played(id: string) { await api(`/voices/${id}/receipt`, { method: "POST", body: { played: true, metadata: true } }); epoch++; await refresh(); }
function mediaScope() { return `${currentServerAddress()}/${state.account?.id || ''}/${JSON.stringify(state.families.map(f => [f.id, f.status, f.records_allowed, f.profile_allowed]))}`; }
export async function loadPrivateMedia(source: string): Promise<string> {
  if (!source.startsWith('/api/')) return source;
  if (!state.account) throw new Error('请先登录后读取照片或语音。');
  const scope = mediaScope(), key = `${scope}/${source}`;
  const cached = mediaCache.get(key);
  if (cached) return cached;
  const payload = await api(source.slice(4));
  if (scope !== mediaScope() || !state.account) throw new Error('共享权限或账号已更改。');
  const value = String(payload.photoDataUrl || payload.audioDataUrl || '');
  if (value.length < 16 * 1024 * 1024) {
    while (mediaCache.size && (mediaCache.size >= 32 || mediaBytes + value.length > 16 * 1024 * 1024)) {
      const first = mediaCache.keys().next().value!; mediaBytes -= mediaCache.get(first)!.length; mediaCache.delete(first);
    }
    mediaCache.set(key, value); mediaBytes += value.length;
  }
  return value;
}
export async function previewVoice(message: Message) {
  try { const source = await loadPrivateMedia(message.audioDataUrl); previewAudio?.pause(); previewAudio = new Audio(source); await previewAudio.play(); }
  catch (error) { report(error); }
}
async function syncRecords(elder: string, current: () => boolean): Promise<any[]> {
  const key = `${mediaScope()}/${elder}`;
  const previous = recordCache.get(key);
  let offset: number | null = 0, version = '';
  const records: any[] = [];
  do {
    const page = await api(`/records?elder=${encodeURIComponent(elder)}&compact=1&limit=50&offset=${offset}${offset === 0 && previous ? `&ifVersion=${encodeURIComponent(previous.version)}` : ''}`);
    if (!current()) return [];
    if (page.unchanged && previous) return previous.records;
    if (version && page.version !== version) throw new Error('记录正在更新，请稍候重新同步。');
    version = page.version; records.push(...page.records); offset = page.nextOffset;
  } while (offset !== null);
  recordCache.set(key, { version, records });
  return records;
}
export async function refresh() {
  if (!state.account) return;
  if (refreshJob) {
    const sameGeneration = refreshOwner === state.account.id && refreshEpoch === epoch;
    await refreshJob;
    if (sameGeneration || !state.account) return;
    return refresh();
  }
  const owner = state.account.id, generation = epoch;
  refreshOwner = owner; refreshEpoch = generation;
  const current = () => state.account?.id === owner && epoch === generation;
  refreshJob = (async () => {
    try {
      const [{ user }, { families, syncedAt }] = await Promise.all([api("/me"), api("/family")]);
      if (!current()) return;
      if (!user) { clearSession('登录已失效，请重新登录。'); return; }
      const linked = families.filter((f: Family) => !f.amElder && f.status === "bound");
      const selected = linked.find((f: Family) => f.member.id === state.selectedId) || linked[0];
      // 每次先清除撤回权限的数据，再发查询；失败不保留旧共享快照。
      const sameSelection = selected?.member.id === state.selectedId;
      if (JSON.stringify(families.map((f: Family) => [f.id, f.status, f.records_allowed, f.profile_allowed])) !== JSON.stringify(state.families.map(f => [f.id, f.status, f.records_allowed, f.profile_allowed]))) clearPrivateCaches();
      emit({ account: user, families, selectedId: selected?.member.id || "", sharedRecords: sameSelection && selected?.records_allowed ? state.sharedRecords : [], sharedProfile: sameSelection && selected?.profile_allowed ? state.sharedProfile : null, syncedAt });
      const jobs = await Promise.allSettled([syncRecords(owner, current), selected?.records_allowed ? syncRecords(selected.member.id, current) : Promise.resolve([]), api('/voices?metadata=1'), user.role === "child" ? api("/record-notifications") : Promise.resolve(null), selected?.profile_allowed ? api(`/shared-profile?elder=${selected.member.id}`) : Promise.resolve(null)]);
      if (!current()) return;
      const own = jobs[0].status === "fulfilled" ? jobs[0].value : [];
      const shared = jobs[1].status === "fulfilled" ? jobs[1].value : null;
      const messages: Message[] = jobs[2].status === "fulfilled" ? jobs[2].value.messages : [];
      for (const message of messages) {
        if (!current()) return;
        if (message.recipient === owner && !message.deliveredAt) { const receipt = await api(`/voices/${message.id}/receipt`, { method: "POST", body: { played: false, metadata: true } }); Object.assign(message, receipt.message); }
      }
      if (current() && jobs[3].status === "fulfilled" && jobs[3].value) {
        const changed = recordNotifications.update(jobs[3].value.elders);
        if (changed.length) await showRecordNotification(() => current() && state.account?.prefs.recordNotificationsEnabled !== false && changed.some(id => state.families.some(f => !f.amElder && f.status === "bound" && !!f.records_allowed && f.member.id === id)));
      }
      if (current()) emit({ ownRecords: own, sharedRecords: shared || [], sharedProfile: jobs[4].status === 'fulfilled' ? jobs[4].value?.profile || null : null, messages });
    } catch (error) { if (current()) emit({ sharedRecords: [], sharedProfile: null, messages: [], families: [], error: error instanceof Error ? error.message : "同步失败" }); }
  })();
  try { await refreshJob; } finally { refreshJob = null; }
}
if (typeof window !== "undefined") {
  window.setInterval(() => { if (state.account && !document.hidden) void refresh(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.account) void refresh(); });
}

export function mask(phone: string) { return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : phone || "未提供号码"; }
export function dateKey(value: string | Date = new Date()) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function timeText(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
export function weekStats(records: any[]) { const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1)); const week = records.filter(r => new Date(r.at || r.recognizedAt) >= monday); return { today: records.filter(r => dateKey(r.at || r.recognizedAt) === dateKey()).length, week: week.length, attention: week.filter(recordNeedsAttention).length, label: `${monday.getMonth() + 1}月${monday.getDate()}日起` }; }
