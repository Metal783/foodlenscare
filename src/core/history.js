/** 识别历史独立于摄入记录：看过不等于吃过，照片放 IndexedDB 而不是临时 URL。 */
import { localDateKey, loadRecords, saveRecords } from './store.js';
import { api, currentAccount, ownerKey } from './service.js';

/** @typedef {Object} HistoryRecord
 * @property {string} id 稳定的识别编号
 * @property {string} at 识别时间
 * @property {Object} label 完整标签及核对状态
 * @property {Object} assessment 当时的提醒快照
 * @property {Object} profileSnapshot 当时本人填写的饮食设置
 * @property {string} meal 餐次，由本人选择；初始为未选择
 * @property {string|null} consumptionRecordId 已食用关联编号
 * @property {boolean} synced 是否成功保存到本人账号
 */
const key = () => `flc.history.v3.${ownerKey()}`;
let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持照片保存。')); return; }
    const request = indexedDB.open('foodcare-v3-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('照片存储无法打开，请检查浏览器权限。'));
  });
  return database;
}
async function media(mode, id, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('photos');
    const request = mode === 'get' ? store.get(id) : mode === 'delete' ? store.delete(id) : store.put(value, id);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(new Error('照片保存失败，请检查可用空间。'));
  });
}
export function loadHistory() {
  try { const value = JSON.parse(window.localStorage.getItem(key()) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveList(items) { window.localStorage.setItem(key(), JSON.stringify(items)); }
export function getHistory(id) { return loadHistory().find(r => r.id === id); }
export async function getPhoto(id) { return media('get', `${ownerKey()}:${id}`); }
export async function saveRecognition(result, profile, signal) {
  if (result.photo.origin === 'demo') return null;
  const owner = ownerKey();
  const id = `scan_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  const record = { id, at: new Date().toISOString(), label: structuredClone(result.photo.label),
    assessment: structuredClone(result.assessment), profileSnapshot: structuredClone(profile), meal: '未选择',
    consumptionRecordId: null, synced: false, origin: result.photo.origin, photoSaved: false };
  await media('put', `${owner}:${id}`, result.photo.file);
  if (signal?.aborted || owner !== ownerKey()) {
    await media('delete', `${owner}:${id}`);
    throw new DOMException('读取已取消', 'AbortError');
  }
  record.photoSaved = true;
  saveList([...loadHistory(), record]);
  result.historyId = id;
  return record;
}
export function updateHistory(id, patch) {
  const list = loadHistory(); const index = list.findIndex(r => r.id === id);
  if (index < 0) return;
  list[index] = { ...list[index], ...structuredClone(patch), synced: false };
  saveList(list);
  return list[index];
}
export async function deleteHistory(id) {
  if (currentAccount()) await api(`/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await media('delete', `${ownerKey()}:${id}`);
  saveList(loadHistory().filter(r => r.id !== id));
}
export function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('照片或录音无法读取。')); reader.readAsDataURL(blob);
  });
}
let syncing;
export function syncHistory() {
  if (!syncing) syncing = performSync().finally(() => { syncing = null; });
  return syncing;
}
async function performSync() {
  if (!currentAccount()) return { uploaded: 0 };
  const owner = ownerKey();
  let uploaded = 0;
  for (const record of loadHistory().filter(r => !r.synced)) {
    const photo = await getPhoto(record.id);
    if (owner !== ownerKey()) throw new Error('账号已切换，请重新同步。');
    await api('/records', { method: 'POST', body: { record: { ...record, photoDataUrl: photo ? await blobDataUrl(photo) : null } } });
    const fresh = loadHistory(); const target = fresh.find(r => r.id === record.id);
    if (owner !== ownerKey()) throw new Error('账号已切换，请重新同步。');
    if (target && JSON.stringify({ ...target, synced: false }) === JSON.stringify({ ...record, synced: false })) target.synced = true;
    saveList(fresh); uploaded++;
  }
  const remote = (await api('/records')).records;
  if (owner !== ownerKey()) throw new Error('账号已切换，请重新同步。');
  const local = loadHistory();
  const revokedConsumption = new Set();
  for (const record of remote) {
    const index = local.findIndex(l => l.id === record.id);
    // 本机未同步的修改优先保留；已同步的元数据仍需检查照片是否真实存在。
    if (index >= 0 && !local[index].synced) continue;
    const { photoDataUrl, ...metadata } = record;
    if (index >= 0 && local[index].consumptionRecordId && !metadata.consumptionRecordId) revokedConsumption.add(local[index].consumptionRecordId);
    if (photoDataUrl && !await media('get', `${owner}:${record.id}`)) {
      const blob = await (await fetch(photoDataUrl)).blob();
      await media('put', `${owner}:${record.id}`, blob);
    }
    if (index >= 0) local[index] = { ...metadata, synced: true };
    else local.push({ ...metadata, synced: true });
  }
  if (owner !== ownerKey()) throw new Error('账号已切换，请重新同步。');
  saveList(local);
  const consumed = loadRecords().filter(record => !revokedConsumption.has(record.id));
  for (const record of remote) if (record.consumption && !consumed.some(r => r.id === record.consumption.id)) consumed.push(record.consumption);
  saveRecords(consumed);
  return { uploaded };
}
export function historyStats(records = loadHistory(), now = new Date()) {
  const today = localDateKey(now);
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 7);
  const week = records.filter(r => new Date(r.at) >= monday && new Date(r.at) < sunday);
  const dates = new Set(records.map(r => localDateKey(new Date(r.at))));
  let streak = 0; const cursor = new Date(now);
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(localDateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { today: records.filter(r => localDateKey(new Date(r.at)) === today).length,
    week: week.length, attention: week.filter(needsAttention).length, streak,
    weekLabel: `${monday.getMonth() + 1}月${monday.getDate()}日—${new Date(sunday.getTime() - 86400000).getDate()}日` };
}
export function needsAttention(record) { return ['red', 'orange', 'yellow', 'gray'].includes(record.assessment?.level); }
