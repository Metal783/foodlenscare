/** 安卓桥接路径模拟回归：使用真实隔离后端，不代表安卓真机验收。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
(async () => {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-mobile-shell-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'pipe' });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('startup timeout')), 15000);
      server.stdout.on('data', chunk => { text += chunk; const found = text.match(/127\.0\.0\.1:(\d+)/); if (found) { clearTimeout(timer); resolve(found[1]); } });
    });
    const shell = `http://127.0.0.1:${port}`, backend = `http://localhost:${port}`;
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const preferences = new Map(), sessions = new Map(), requests = [];
    await context.exposeBinding('nativeBridge', async (_, plugin, method, options = {}) => {
      if (plugin === 'Preferences') {
        if (method === 'set') { preferences.set(options.key, options.value); return; }
        return { value: preferences.get(options.key) || null };
      }
      if (plugin === 'SecureSession') {
        if (method === 'set') { sessions.set(options.origin, options.value); return; }
        if (method === 'remove') { sessions.delete(options.origin); return; }
        return { value: sessions.get(options.origin) || '' };
      }
      if (plugin === 'CapacitorHttp') {
        requests.push(options);
        const response = await context.request.fetch(options.url, { method: options.method, data: options.data, headers: options.headers, maxRedirects: 0 });
        return { status: response.status(), headers: response.headers(), data: await response.json() };
      }
      return {};
    });
    await context.addInitScript(() => {
      window.androidBridge = {};
      const methods = names => names.map(name => ({ name, rtype: 'promise' }));
      window.Capacitor = {
        PluginHeaders: [
          { name: 'Preferences', methods: methods(['get', 'set']) },
          { name: 'SecureSession', methods: methods(['get', 'set', 'remove']) },
          { name: 'CapacitorHttp', methods: methods(['request']) },
          { name: 'App', methods: [...methods(['removeListener', 'minimizeApp']), { name: 'addListener', rtype: 'callback' }] },
        ],
        nativePromise: (plugin, method, options) => plugin === 'CapacitorHttp' ? window.nativeComputerRequest(options) : window.nativeBridge(plugin, method, options),
        nativeCallback: (_, method, __, callback) => { if (method === 'addListener') window.testBackButton = callback; return '1'; },
      };
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(shell);
    await page.getByRole('button', { name: '服务器地址', exact: true }).click();
    await page.getByRole('textbox', { name: '服务器地址', exact: true }).fill(backend);
    await page.getByRole('button', { name: '检查连接', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /手机自身/);
    const computer = `http://192.168.50.2:${port}`;
    // 桥接测试把测试电脑地址映射到真实隔离后端。
    await context.exposeBinding('nativeComputerRequest', async (_, options) => {
      requests.push(options);
      const response = await context.request.fetch(options.url.replace(computer, backend), { method: options.method, data: options.data, headers: options.headers, maxRedirects: 0 });
      return { status: response.status(), data: await response.json() };
    });
    await page.getByRole('textbox', { name: '服务器地址', exact: true }).fill(computer);
    await page.getByRole('button', { name: '保存并连接', exact: true }).click();
    await page.getByRole('button', { name: '确认切换', exact: true }).click();
    await page.getByRole('button', { name: '手机号登录', exact: true }).waitFor();
    assert.equal(await page.url(), shell + '/');
    assert.equal(preferences.get('foodlenscare.connection.address.v1'), computer);
    await page.getByRole('button', { name: '手机号登录', exact: true }).click();
    await page.getByPlaceholder('请输入11位手机号').fill('13800360001');
    await page.getByRole('button', { name: '获取验证码', exact: true }).click();
    const codeNotice = page.getByText(/本地测试验证码：\d{6}/); await codeNotice.waitFor();
    const code = (await codeNotice.innerText()).match(/验证码：(\d{6})/)[1];
    await page.getByRole('textbox', { name: '验证码', exact: true }).fill(code);
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('radio', { name: /我是老人/ }).waitFor(); assert(sessions.get(computer));
    await page.reload(); await page.getByRole('radio', { name: /我是老人/ }).waitFor();
    assert(requests.some(request => request.headers.Authorization));
    assert(requests.filter(request => request.url.endsWith('/api/connection-info')).every(request => !request.headers.Authorization));
    assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length)), 0);
    assert.deepEqual(errors, []);
    console.log('PASS Android bridge path: rejects phone localhost, persists address, keeps bundled page, native login/session restore, token scope, public check without token, no service worker');
  } finally {
    if (browser) await browser.close(); const ended = new Promise(resolve => server.once('exit', resolve)); server.kill(); await ended;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
