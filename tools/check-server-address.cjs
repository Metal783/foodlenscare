/** 双端服务器地址设置回归；使用临时数据库，不动正式用户数据。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-address-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temporary, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'pipe' });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('服务启动超时')), 15000);
      server.stdout.on('data', chunk => { output += chunk; const match = output.match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      server.once('error', reject);
    });
    const origin = `http://127.0.0.1:${port}`, target = `http://localhost:${port}`;
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const errors = [];
    for (const [index, role] of ['elder', 'child'].entries()) {
      const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
      const post = async (route, data, method = 'POST') => {
        const response = await context.request.fetch(origin + '/api' + route, { method, data }); assert(response.ok()); return response.json();
      };
      const phone = '1380033000' + (index + 1);
      const { testCode } = await post('/auth/code', { phone });
      await post('/auth/login', { phone, code: testCode });
      await post('/me', { role, profile: { name: '地址隔离测试', phone, completed: true } }, 'PATCH');
      await post('/records', { record: { id: 'preserved-' + role } });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      const checks = [];
      page.on('request', request => { if (request.url().endsWith('/api/connection-info')) checks.push(request); });
      const open = async () => {
        await page.getByRole('button', { name: index ? '我的' : '我的设置', exact: true }).click();
        await page.getByRole('button', { name: '账号与安全', exact: true }).click();
        await page.getByRole('button', { name: '服务器地址', exact: true }).click();
      };
      await page.goto(origin); await open();
      const field = page.getByRole('textbox', { name: '服务器地址', exact: true });
      for (const bad of ['192.168.1.10:5184', 'javascript:alert(1)', 'http://user:pass@localhost:5184', origin + '/api', origin + '/?x=1']) {
        await field.fill(bad); await page.getByRole('button', { name: '检查连接', exact: true }).click();
        await page.getByRole('alert').waitFor();
      }
      assert.equal(checks.length, 0, '无效地址不发送请求');
      await field.fill(origin);
      await page.getByRole('button', { name: '检查连接', exact: true }).click(); await page.getByText('连接正常。', { exact: true }).waitFor();
      await page.getByRole('button', { name: '保存并连接', exact: true }).click(); await page.getByText('已保存当前服务器地址。', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('foodlenscare.connection.address.v1')), origin);
      await page.reload(); await open(); assert.equal(await field.inputValue(), origin);
      await page.route('**/api/connection-info', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ service: 'other' }) }));
      await page.getByRole('button', { name: '检查连接', exact: true }).click(); await page.getByRole('alert').waitFor();
      await page.unroute('**/api/connection-info');
      await field.fill('http://127.0.0.1:1'); await page.getByRole('button', { name: '检查连接', exact: true }).click(); await page.getByRole('alert').waitFor();
      await page.getByRole('button', { name: '恢复默认', exact: true }).click(); assert.equal(await field.inputValue(), origin);
      await field.fill(target);
      await page.getByRole('button', { name: '保存并连接', exact: true }).click(); await page.getByRole('heading', { name: '切换服务器？', exact: true }).waitFor();
      await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(await page.url(), origin + '/');
      await page.getByRole('button', { name: '保存并连接', exact: true }).click(); await page.getByRole('heading', { name: '切换服务器？', exact: true }).waitFor();
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 932 });
        assert(await page.locator('.settings-page').last().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
        await page.locator('.settings-page').last().evaluate(el => { el.scrollTop = 0; });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(root, '_qa', `服务器地址-${role}-${width}.png`) });
      }
      for (const request of checks) assert(!(await request.allHeaders()).cookie, '连接检查不发送Cookie');
      await page.getByRole('button', { name: '确认切换', exact: true }).click(); await page.waitForURL(target + '/');
      await page.getByRole('button', { name: '手机号登录', exact: true }).waitFor();
      assert.equal((await (await context.request.get(origin + '/api/me')).json()).user, null);
      assert.equal((await (await context.request.get(target + '/api/me')).json()).user, null);
      await page.getByRole('button', { name: '服务器地址', exact: true }).click();
      const publicResponse = await context.request.get(target + '/api/connection-info', { headers: { Origin: 'https://unrelated.example' } });
      assert.equal(publicResponse.headers()['access-control-allow-origin'], '*');
      assert.deepEqual(Object.keys(await publicResponse.json()).sort(), ['protocolVersion', 'service', 'version']);
      const denied = await context.request.post(target + '/api/auth/code', { data: { phone }, headers: { Origin: 'https://unrelated.example' } });
      assert.equal(denied.status(), 403);
      console.log('PASS ' + role + ' 校验/检查/保存/恢复/刷新/取消/切换/无凭证探测/欢迎页恢复入口/三种宽度');
      await context.close();
    }
    assert.deepEqual(errors, []); console.log('PASS 业务跨源限制保留，无页面异常');
  } finally {
    if (browser) await browser.close();
    const ended = new Promise(resolve => server.once('exit', resolve)); server.kill(); await ended;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
