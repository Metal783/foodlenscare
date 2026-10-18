import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { RequestError } from './requestSignal';

export const isMobileApp = () => Capacitor.isNativePlatform();
export const addressKey = 'foodlenscare.connection.address.v1';
const secureSession = registerPlugin<{
  get(options: { origin: string }): Promise<{ value: string }>;
  set(options: { origin: string; value: string }): Promise<void>;
  remove(options: { origin: string }): Promise<void>;
}>('SecureSession');

export async function initializeMobile() {
  if (!isMobileApp()) return;
  const saved = await Preferences.get({ key: addressKey });
  if (saved.value) localStorage.setItem(addressKey, saved.value);
}
export async function persistMobileAddress(value: string) {
  if (isMobileApp()) await Preferences.set({ key: addressKey, value });
}
export const getMobileSession = (origin: string) => secureSession.get({ origin });
export const setMobileSession = (origin: string, value: string) => secureSession.set({ origin, value });
export const removeMobileSession = (origin: string) => secureSession.remove({ origin });

export async function mobileRequest(origin: string, path: string, options: { method?: string; body?: any; signal?: AbortSignal; publicOnly?: boolean; timeoutMs?: number } = {}) {
  if (options.signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-FLC-Native-Client': 'android-v1' };
  if (!options.publicOnly) {
    let value = '';
    try { value = (await getMobileSession(origin)).value; }
    catch { await removeMobileSession(origin); }
    if (value) headers.Authorization = `Bearer ${value}`;
  }
  const request = CapacitorHttp.request({ url: origin + path, method: options.method || 'GET', headers, data: options.body, responseType: 'json', connectTimeout: 10000, readTimeout: options.timeoutMs || 15000, disableRedirects: true });
  let abort: (() => void) | undefined;
  try {
    const response = options.signal ? await Promise.race([request, new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException('请求已取消', 'AbortError'));
      options.signal!.addEventListener('abort', abort, { once: true });
      if (options.signal!.aborted) abort();
    })]) : await request;
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.status < 200 || response.status >= 300 || payload?.error) throw new RequestError(payload?.error || '服务器未能完成操作，请重试。', response.status);
    return payload;
  } finally { if (abort) options.signal?.removeEventListener('abort', abort); }
}
