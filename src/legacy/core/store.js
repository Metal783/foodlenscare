/**
 * 本地状态与本地存储
 *
 * 合规依据（方案第十章）：用户画像与记录数据默认本地存储，
 * 不进行与处理目的无关的信息收集；本模块不发起任何网络请求，
 * 也不写入 localStorage 之外的持久化位置。
 */

const KEY_PROFILE = 'flc.profile.v1';
const KEY_RECORDS = 'flc.records.v1';
const KEY_PREFS = 'flc.prefs.v1';
const KEY_RECOGNIZER = 'flc.recognizer.v1';

/** @typedef {'age60'|'age70'|'age80'} AgeGroupId */

/** @typedef {Object} Profile
 * @property {boolean} completed
 * @property {AgeGroupId|null} ageGroup
 * @property {string[]} concerns  关注方向：sugar / salt / fat
 * @property {string[]} allergens 过敏成分 id，可包含 'none'
 * @property {string[]} conditions 慢性病 id，可包含 'none'
 * @property {boolean} voiceOn
 * @property {string} name 本人填写的姓名或称呼
 * @property {number|null} age 具体年龄
 * @property {string} gender 性别，可留空
 * @property {number|null} weight 体重，可留空
 * @property {'elder'|'child'} role 当前展示身份，不决定服务端权限
 * @property {string} otherConditions 其他疾病，本人填写
 * @property {string} otherAllergens 其他过敏原，本人填写
 * @property {string} emergencyPhone 本人配置的求助号码
 */

/** @returns {Profile} */
export function emptyProfile() {
  return {
    completed: false,
    ageGroup: null,
    concerns: [],
    allergens: [],
    conditions: [],
    voiceOn: true,
    name: '', age: null, gender: '', weight: null, role: 'elder',
    otherConditions: '', otherAllergens: '', emergencyPhone: ''
  };
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function read(key, fallback) {
  try {
    return safeParse(window.localStorage.getItem(scopedKey(key)), fallback);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(scopedKey(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 游客沿用旧键，登录后按账号隔离，避免共用电脑看到另一位家人的画像。 */
function scopedKey(key) { return window.flcOwner && window.flcOwner !== 'guest' ? `${key}.${window.flcOwner}` : key; }

/* ------------------------------------------------------------------ 画像 */

export function loadProfile() {
  const saved = read(KEY_PROFILE, null);
  if (!saved || typeof saved !== 'object') return emptyProfile();
  return { ...emptyProfile(), ...saved };
}

export function saveProfile(profile) {
  return write(KEY_PROFILE, profile);
}

export function resetProfile() {
  try {
    window.localStorage.removeItem(scopedKey(KEY_PROFILE));
  } catch {
    /* 忽略：隐私模式下不可写 */
  }
  return emptyProfile();
}

/* ------------------------------------------------------------------ 偏好 */

export function loadPrefs() {
  return { textSize: 'large', showAdvanced: false, ...read(KEY_PREFS, {}) };
}

export function savePrefs(prefs) {
  return write(KEY_PREFS, prefs);
}

/* -------------------------------------------------------------- 识别通道 */

export function loadRecognizerChoice() {
  const saved = read(KEY_RECOGNIZER, null);
  return typeof saved === 'string' ? saved : 'auto';
}

export function saveRecognizerChoice(id) {
  return write(KEY_RECOGNIZER, id);
}

/* -------------------------------------------------------------- 当日记录 */

/** 本地日期 YYYY-MM-DD（不用 UTC，避免跨时区把「今天」算错） */
export function localDateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function loadRecords() {
  const list = read(KEY_RECORDS, []);
  return Array.isArray(list) ? list : [];
}

export function saveRecords(records) {
  return write(KEY_RECORDS, records);
}

/** 只保留最近 60 天的记录，避免本地存储无限增长 */
export function pruneRecords(records) {
  const keep = 60 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return records.filter((r) => now - new Date(r.at).getTime() <= keep);
}

export function addRecord(record) {
  const records = pruneRecords(loadRecords());
  const item = {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...record
  };
  records.push(item);
  if (!saveRecords(records)) throw new Error('记录无法保存，请检查浏览器的本地存储权限。');
  return item;
}

export function removeRecord(id) {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
  unlinkConsumption(new Set([id]));
  return records;
}

/**
 * 清空全部记录。
 *
 * 两个用途：
 *  1. 设置页里的「清空今天的记录」，让用户能自己把当天记录归零；
 *  2. 配合 URL 参数 ?reset=1，让同一套演示用例可以反复演示——
 *     否则第二次打开演示用例时，当日额度已经被上一次吃掉了，
 *     同一个商品会给出不同的结论，答辩现场很难解释。
 */
export function clearRecords() {
  unlinkConsumption(new Set(loadRecords().map(r => r.id)));
  saveRecords([]);
  return [];
}

/** 摄入撤销也标记对应识别记录待同步，避免下次从账号恢复已撤销的食用量。 */
function unlinkConsumption(ids) {
  if (!ids.size) return;
  const historyKey = `flc.history.v3.${window.flcOwner || 'guest'}`;
  try {
    const history = JSON.parse(window.localStorage.getItem(historyKey) || '[]');
    window.localStorage.setItem(historyKey, JSON.stringify(history.map(record => ids.has(record.consumptionRecordId)
      ? { ...record, consumptionRecordId: null, consumption: null, synced: false } : record)));
  } catch { /* 没有识别历史的旧版记录仍可独立撤销。 */ }
}

export function recordsOfToday(records = loadRecords()) {
  const today = localDateKey();
  return records.filter((r) => localDateKey(new Date(r.at)) === today);
}

/**
 * 当日已摄入量统计（只统计有营养数据的记录）。
 * @param {ReturnType<typeof loadRecords>} [records]
 * @returns {{sodium:number, sugar:number, saturatedFat:number, fat:number, count:number, unknown:Record<string,number>}} unknown 为已食用记录中各营养项的缺失数量
 */
export function todayTotals(records = loadRecords()) {
  const totals = { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0, count: 0, unknown: { sodium:0, sugar:0, saturatedFat:0, fat:0 } };
  for (const r of recordsOfToday(records)) {
    // 旧版扫描记录保留供查看，不作为已确认摄入；演示不计入真实摄入。
    if (r.consumptionConfirmed !== true || r.origin === 'demo') continue;
    if (!r.nutrients) continue;
    totals.count += 1;
    for (const key of ['sodium', 'sugar', 'saturatedFat', 'fat']) {
      const raw = r.nutrients[key];
      const v = raw == null || String(raw).trim() === '' ? NaN : Number(raw);
      if (Number.isFinite(v)) totals[key] += v;
      else totals.unknown[key]++;
    }
  }
  return totals;
}

/** 把营养数据按食用份量换算（每 100 g → 实际吃进去的量） */
export function scaleNutrients(per100g, grams) {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) return null;
  const out = {};
  for (const [key, value] of Object.entries(per100g || {})) {
    const v = value == null || String(value).trim() === '' ? NaN : Number(value);
    out[key] = Number.isFinite(v) ? Math.round(v * g) / 100 : null;  }
  return out;
}
