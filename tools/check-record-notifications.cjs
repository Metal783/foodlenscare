/** Disposable accounts/database; system notification delivery is mocked, not a real push test. */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-record-notifications-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', String(port), '--database', path.join(temporary, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(origin + '/api/status'); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const child = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const elder = await browser.newContext();
    const second = await browser.newContext();
    const stranger = await browser.newContext();
    async function api(context, url, data, method = 'POST') {
      const response = await context.request.fetch(origin + '/api' + url, { method, data });
      assert.ok(response.ok(), `${url}: ${await response.text()}`);
      return response.json();
    }
    async function account(context, phone, role) {
      const { testCode } = await api(context, '/auth/code', { phone });
      await api(context, '/auth/login', { phone, code: testCode });
      return (await api(context, '/me', { role, profile: { name: '隔离通知测试', completed: true } }, 'PATCH')).user;
    }
    const childUser = await account(child, '13800180121', 'child');
    const elderUser = await account(elder, '13800180122', 'elder');
    const secondUser = await account(second, '13800180123', 'elder');
    await account(stranger, '13800180124', 'child');
    async function bind(context) {
      const invite = await api(context, '/family/invite', { role: 'elder' });
      const family = await api(child, '/family/join', { code: invite.code, relation: '女儿' });
      await api(context, '/family/' + family.id, { status: 'bound', records_allowed: true, profile_allowed: false }, 'PATCH');
      return family.id;
    }
    const family = await bind(elder);
    const secondFamily = await bind(second);
    async function save(context, id) { await api(context, '/records', { record: { id, productName: '隔离测试食品', profileSnapshot: { secret: 'not-for-notifications' } } }); }
    await save(elder, 'historical-record');
    const initial = await api(child, '/record-notifications', undefined, 'GET');
    assert.equal(initial.elders.length, 2);
    assert.equal(JSON.stringify(initial).includes('secret'), false);
    assert.deepEqual(Object.keys(initial.elders[0]).sort(), ['elder', 'recordIds']);
    assert.deepEqual((await api(stranger, '/record-notifications', undefined, 'GET')).elders, []);
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(origin + '/api/record-notifications')).status(), 401);
    console.log('PASS authenticated metadata endpoint, all authorized elders, no health/photo/food payload or stranger access');
    await child.addInitScript(() => {
      let permission = sessionStorage.getItem('testNotificationPermission') || 'default';
      window.__notices = [];
      window.__permissionRequests = 0;
      class TestNotification {
        static get permission() { return permission; }
        static async requestPermission() { window.__permissionRequests++; permission = 'granted'; sessionStorage.setItem('testNotificationPermission', permission); return permission; }
        constructor(title, options) { window.__notices.push({ title, ...options }); }
      }
      window.Notification = TestNotification;
      window.__setPermission = value => { permission = value; sessionStorage.setItem('testNotificationPermission', value); window.dispatchEvent(new Event('focus')); };
      navigator.serviceWorker.getRegistration = async () => ({ active: true, showNotification: async (title, options) => { window.__notices.push({ title, ...options }); } });
    });
    const page = await child.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('button', { name: '我的', exact: true }).click();
    assert.equal(await page.getByRole('switch', { name: /语音送达通知|语音播放通知/ }).count(), 0);
    const toggle = () => page.getByRole('switch', { name: '允许通知', exact: true });
    const checked = value => page.waitForFunction(value => {
      const button = document.querySelector('[role="switch"][aria-label="允许通知"]');
      return button?.getAttribute('aria-checked') === String(value) && !button.disabled;
    }, value);
    assert.equal(await toggle().getAttribute('aria-checked'), 'false');
    assert.equal(await page.getByRole('region', { name: '通知设置' }).locator('small,p,h2').count(), 0);
    await toggle().click();
    await checked(true);
    assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
    const count = () => page.evaluate(() => window.__notices.length);
    const sync = () => page.waitForResponse(response => response.url().endsWith('/api/record-notifications') && response.ok());
    await sync();
    assert.equal(await count(), 0);
    await save(elder, 'new-record');
    await page.waitForFunction(() => window.__notices.length === 1, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__notices[0].body), '家人刚刚识别了食品');
    await save(elder, 'new-record');
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 1);
    await save(second, 'second-new-record');
    await page.waitForFunction(() => window.__notices.length === 2, { timeout: 15000 });
    console.log('PASS single allow switch and permission request, no helper text/history spam, deduplication, non-selected elder notifications');
    await toggle().click(); await checked(false);
    assert.equal((await api(child, '/me', undefined, 'GET')).user.prefs.recordNotificationsEnabled, false);
    await page.reload();
    await page.getByRole('button', { name: '我的', exact: true }).click();
    await checked(false);
    // Reload resets the mock delivery array, but keeps permission and the account preference.
    await save(second, 'switch-off-record');
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 0);
    await toggle().click(); await checked(true);
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 0);
    await save(second, 'switch-on-record');
    await page.waitForFunction(() => window.__notices.length === 1);
    console.log('PASS opt-out persists across reload and stops delivery; opt-in reuses OS permission without replaying records');
    await api(elder, '/family/' + family, { records_allowed: false }, 'PATCH');
    await sync();
    await save(elder, 'revoked-record');
    assert.ok(!(await api(child, '/record-notifications', undefined, 'GET')).elders.some(item => item.elder === elderUser.id));
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 1);
    await api(elder, '/family/' + family, { records_allowed: true }, 'PATCH');
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 1);
    await page.evaluate(() => window.__setPermission('denied'));
    await checked(false);
    await toggle().click(); await checked(false);
    await page.getByText('通知权限未允许，请在浏览器或系统设置中开启。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '知道了', exact: true }).click();
    await save(second, 'permission-denied-record');
    await sync(); await page.waitForTimeout(300);
    assert.equal(await count(), 1);
    await api(second, '/family/' + secondFamily, {}, 'DELETE');
    assert.ok(!(await api(child, '/record-notifications', undefined, 'GET')).elders.some(item => item.elder === secondUser.id));
    console.log('PASS sharing revocation, re-grant baseline, OS permission denial and unbinding');
    await page.evaluate(() => window.__setPermission('granted'));
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '_qa', 'record-notification-settings.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await api(child, '/auth/logout', {});
    assert.equal((await child.request.get(origin + '/api/record-notifications')).status(), 401);
    console.log('PASS responsive settings, no script errors, logout protection; tested account ' + childUser.id);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
