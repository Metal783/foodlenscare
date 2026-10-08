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
 */

/** @returns {Profile} */
export function emptyProfile() {
  return {
    completed: false,
    ageGroup: null,
    concerns: [],
    allergens: [],
    conditions: [],
    voiceOn: true
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
    return safeParse(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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
    window.localStorage.removeItem(KEY_PROFILE);
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
  saveRecords(records);
  return item;
}

export function removeRecord(id) {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
  return records;
}

export function recordsOfToday(records = loadRecords()) {
  const today = localDateKey();
  return records.filter((r) => localDateKey(new Date(r.at)) === today);
}

/**
 * 当日已摄入量统计（只统计有营养数据的记录）。
 * @param {ReturnType<typeof loadRecords>} [records]
 * @returns {{sodium:number, sugar:number, saturatedFat:number, fat:number, count:number}}
 */
export function todayTotals(records = loadRecords()) {
  const totals = { sodium: 0, sugar: 0, saturatedFat: 0, fat: 0, count: 0 };
  for (const r of recordsOfToday(records)) {
    if (!r.nutrients) continue;
    totals.count += 1;
    for (const key of ['sodium', 'sugar', 'saturatedFat', 'fat']) {
      const v = Number(r.nutrients[key]);
      if (Number.isFinite(v)) totals[key] += v;
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
    const v = Number(value);
    out[key] = Number.isFinite(v) ? Math.round(v * g) / 100 : null;  }
  return out;
}
