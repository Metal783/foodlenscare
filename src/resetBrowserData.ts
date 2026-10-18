import { clearLocalRecords } from "./photoStore";

const resetKey = "foodlenscare.v4.browserReset";
function clearPersonalKeys(storage: Storage) {
  for (const key of Object.keys(storage)) {
    if (key.startsWith("foodlenscare.v4.") || /^flc\.(profile|records|prefs|recognizer)\.v1(?:\.|$)/.test(key) || key.startsWith("flc.history.v3.")) storage.removeItem(key);
  }
}

// 服务数据被本人清空后，各浏览器在下次连接时清理当前站点的旧缓存。
export async function resetBrowserData(resetId?: string) {
  if (!resetId) return;
  if (localStorage.getItem(resetKey) !== resetId) {
    await clearLocalRecords();
    clearPersonalKeys(localStorage);
    localStorage.setItem(resetKey, resetId);
  }
  if (sessionStorage.getItem(resetKey) !== resetId) {
    clearPersonalKeys(sessionStorage);
    sessionStorage.setItem(resetKey, resetId);
  }
}
