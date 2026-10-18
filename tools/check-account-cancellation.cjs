/** 使用临时服务、隔离账号检查注销页面与真实10秒等待。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-cancellation-ui-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temporary, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'pipe' });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('服务启动超时')), 15000);
      server.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); } });
      server.once('error', reject);
    });
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const errors = [];
    const contexts = [];
    const call = async (context, route, body, method = 'POST') => {
      const response = await context.request.fetch(origin + '/api' + route, { method, data: body });
      assert(response.ok(), route + ' ' + response.status()); return response.json();
    };
    for (const [role, phone] of [['elder', '13800320001'], ['child', '13800320002']]) {
      const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
      contexts.push(context);
      const { testCode } = await call(context, '/auth/code', { phone });
      await call(context, '/auth/login', { phone, code: testCode });
      await call(context, '/me', { role, profile: { name: '注销隔离测试', phone, completed: true } }, 'PATCH');
    }
    const invitation = await call(contexts[0], '/family/invite', {});
    const relation = await call(contexts[1], '/family/join', { code: invitation.code, relation: '女儿' });
    await call(contexts[0], '/family/' + relation.id, { status: 'bound', records_allowed: true }, 'PATCH');
    for (const [index, role] of ['elder', 'child'].entries()) {
      const page = await contexts[index].newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      if (!index) {
        await page.getByRole('button', { name: '我的设置', exact: true }).click();
        await page.getByRole('button', { name: /子女守护/ }).click();
        await page.getByRole('button', { name: '＋ 添加家人', exact: true }).click();
        await page.getByRole('heading', { name: '收到的绑定申请', exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.getByPlaceholder('输入或粘贴绑定码').count(), 0);
        await page.screenshot({ path: path.join(root, '_qa', '第四版截图', '23-老人仅生成邀请码与确认申请.png'), fullPage: true });
        await page.goto(origin);
      }
      await page.getByRole('button', { name: index ? '我的' : '我的设置', exact: true }).click();
      await page.getByRole('button', { name: '账号与安全', exact: true }).click();
      await page.getByRole('button', { name: '注销账号', exact: true }).click();
      await page.getByRole('button', { name: /下一步（\d+s）/ }).waitFor();
      assert(!(await page.getByRole('button', { name: /下一步/ }).isEnabled()));
      await page.getByRole('button', { name: '《食护家账号注销协议》', exact: true }).click();
      await page.getByRole('heading', { name: '账号注销协议', exact: true }).waitFor();
      await page.getByRole('button', { name: '返回注销须知', exact: true }).click();
      await page.getByRole('button', { name: '下一步', exact: true }).waitFor({ timeout: 15000 });
      assert(!(await page.getByRole('button', { name: '下一步', exact: true }).isEnabled()), '10秒后仍需勾选协议');
      await page.getByRole('checkbox', { name: '我已阅读并同意' }).check();
      assert(await page.getByRole('button', { name: '下一步', exact: true }).isEnabled());
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 932 });
        assert(await page.locator('.settings-page').last().evaluate(el => el.scrollWidth <= el.clientWidth + 1), '无横向溢出');
        await page.locator('.settings-page').last().evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: path.join(root, '_qa', `注销须知-${role}-${width}.png`) });
      }
      await page.getByRole('button', { name: '下一步', exact: true }).click();
      await page.getByRole('button', { name: '暂不注销', exact: true }).click();
      await page.getByRole('button', { name: '下一步', exact: true }).click();
      await page.getByRole('button', { name: '确认注销账号', exact: true }).click();
      await page.getByRole('button', { name: '手机号登录', exact: true }).waitFor();
      assert((await (await contexts[index].request.get(origin + '/api/me')).json()).user === null);
      console.log('PASS ' + role + ' 设置入口、真实10秒、协议门槛、最终确认、注销返回欢迎页、三种宽度');
    }
    assert.deepEqual(errors, []);
    console.log('PASS 无页面脚本异常；双端隔离账号注销完成');
  } finally {
    if (browser) await browser.close();
    const ended = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await ended;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
