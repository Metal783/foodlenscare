import { addressKey as storageKey, isMobileApp, mobileRequest, persistMobileAddress } from './mobile';

export function normalizeServerAddress(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("请输入完整地址，例如 http://192.168.1.10:5184"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("地址仅填写 http:// 或 https://、主机和端口，不包含账号、路径或参数。");
  }
  return url.origin;
}

export function currentServerAddress() {
  if (!isMobileApp()) return window.location.origin;
  try { return normalizeServerAddress(localStorage.getItem(storageKey) || ''); } catch { return ''; }
}
export function savedServerAddress() {
  try { return normalizeServerAddress(localStorage.getItem(storageKey) || currentServerAddress()); }
  catch { return currentServerAddress(); }
}
export async function saveServerAddress(value: string) { const origin = normalizeServerAddress(value); await persistMobileAddress(origin); localStorage.setItem(storageKey, origin); }

export async function checkServerAddress(value: string, signal: AbortSignal) {
  const origin = normalizeServerAddress(value);
  if (isMobileApp()) {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host.startsWith('127.') || host === '[::1]') throw new Error('手机的localhost是手机自身，请填写电脑的Wi-Fi地址。');
    const info = await mobileRequest(origin, '/api/connection-info', { signal, publicOnly: true });
    if (info.service !== 'foodlenscare' || info.protocolVersion !== 1) throw new Error('此地址不是支持连接设置的食护家后端。');
    return origin;
  }
  if (window.location.protocol === "https:" && origin.startsWith("http:")) throw new Error("当前安全页面不能检查 HTTP 地址，请使用 HTTPS 后端。");
  const response = await fetch(`${origin}/api/connection-info`, { method: "GET", credentials: "omit", cache: "no-store", signal });
  if (!response.ok) throw new Error("服务器未响应食护家连接检查，请确认地址、端口和后端版本。");
  const info = await response.json();
  if (info.service !== "foodlenscare" || info.protocolVersion !== 1) throw new Error("此地址不是支持连接设置的食护家后端。");
  return origin;
}
