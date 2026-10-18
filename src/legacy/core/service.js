/** 第三版服务接口：业务数据不进入浏览器缓存，权限由服务端再次校验。 */
let account = null;
let serverInfo = null;

export async function api(path, options = {}) {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') throw new Error('家庭同步和登录需要通过“启动第三版.cmd”打开。');
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...options,
    signal: options.signal || AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const payload = await response.json().catch(() => ({ error: '未连接第三版家庭服务，请使用“启动第三版.cmd”。' }));
  if (!response.ok) throw new Error(payload.error || '操作没有完成，请重试。');
  return payload;
}

export async function connect() {
  try {
    serverInfo = await api('/status');
    account = (await api('/me')).user;
  } catch { account = null; }
  setOwner();
  return { account, serverInfo };
}
export function currentAccount() { return account; }
export function status() { return serverInfo; }
function setOwner() { if (typeof window !== 'undefined') window.flcOwner = account?.id || 'guest'; }
export async function login(phone, code) {
  account = (await api('/auth/login', { method: 'POST', body: { phone, code } })).user;
  setOwner(); return account;
}
export async function logout() {
  await api('/auth/logout', { method: 'POST', body: {} });
  account = null; setOwner();
}
export async function updateAccount(patch) {
  account = (await api('/me', { method: 'PATCH', body: patch })).user;
  return account;
}
export function ownerKey() { return currentAccount()?.id || 'guest'; }

/** 只在接收端实际取得消息后确认送达；试听自己的录音不产生回执。 */
export async function receivedMessages() {
  if (!account) return [];
  const { messages } = await api('/voices');
  for (const message of messages.filter(m => m.recipient === account.id && !m.deliveredAt)) {
    const receipt = await api(`/voices/${message.id}/receipt`, { method: 'POST', body: { played: false } });
    Object.assign(message, receipt.message);
  }
  return messages;
}
