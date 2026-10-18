/** Privacy text/navigation checks against a disposable local service; no live AI. */
process.env.DEEPSEEK_API_KEY = '';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-privacy-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('startup timeout')), 15000);
      server.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    // Exercise the documented font fallback without depending on an external CDN.
    await context.route('https://static.figma.com/font/**', route => route.abort());
    const page = await context.newPage(), errors = [], external = [], mutations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(origin) && /^https?:/.test(request.url())) external.push(request.url());
      if (request.method() !== 'GET' && request.url().startsWith(origin + '/api/')) mutations.push(request.url());
    });
    await page.goto(origin);
    const policyButton = page.getByRole('button', { name: '《隐私政策》', exact: true });
    const dialog = page.getByRole('dialog', { name: '食护家隐私政策', exact: true });
    const inViewport = async locator => {
      const bounds = await locator.boundingBox();
      return bounds && bounds.y >= 0 && bounds.x >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1 && bounds.x + bounds.width <= page.viewportSize().width + 1;
    };
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
      await policyButton.click();
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('heading', { level: 3 }).count(), 11);
      const text = await dialog.innerText();
      for (const required of ['食品护家', '2026年10月17日', '敏感个人信息', 'DeepSeek API', '不发送食品照片', '记录和饮食资料授权', '数据库也未实现全库加密', '当前没有一键导出全部资料', '当前不设置邮箱或应用内客服入口']) assert(text.includes(required), required);
      assert(!text.includes('网易') && !text.includes('music.163'));
      assert.equal(await dialog.getByRole('link', { name: '《DeepSeek 隐私政策》' }).getAttribute('href'), 'https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html');
      const content = dialog.getByLabel('协议正文', { exact: true });
      assert(await content.evaluate(e => e.scrollHeight > e.clientHeight));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const bounds = await dialog.boundingBox();
      assert(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1);
      const close = dialog.getByRole('button', { name: '我知道了', exact: true });
      assert(await inViewport(close));
      await content.evaluate(e => { e.scrollTop = e.scrollHeight; });
      assert(await inViewport(close));
      if (width === 430) {
        await content.evaluate(e => { e.scrollTop = 0; });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(root, '_qa', '隐私政策-手机版宽度.png') });
      }
      await close.click();
      assert(await policyButton.evaluate(e => document.activeElement === e));
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    }
    await policyButton.click();
    await page.keyboard.press('Tab');
    assert(await dialog.getByLabel('协议正文', { exact: true }).evaluate(e => document.activeElement === e));
    await page.keyboard.press('Shift+Tab');
    assert(await dialog.getByRole('button', { name: '我知道了', exact: true }).evaluate(e => document.activeElement === e));
    await page.keyboard.press('Tab');
    assert(await dialog.getByLabel('协议正文', { exact: true }).evaluate(e => document.activeElement === e));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const termsButton = page.getByRole('button', { name: '《服务条款》', exact: true });
    const terms = page.getByRole('dialog', { name: '食护家服务条款', exact: true });
    assert.equal(await page.getByRole('button', { name: '《用户协议》', exact: true }).count(), 0);
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
      await termsButton.click();
      await terms.getByText(/当前服务用于本机及可信局域网测试/).waitFor();
      assert.equal(await terms.getByRole('heading', { level: 3 }).count(), 12);
      const text = await terms.innerText();
      for (const required of ['食品护家', '不是医疗机构', '绑定不等于默认开放全部资料', '向用户自动扣款', '不代表免除维护方依法应承担的责任']) assert(text.includes(required), required);
      assert(!text.includes('网易') && !text.includes('music.163'));
      const content = terms.getByLabel('协议正文', { exact: true });
      assert(await content.evaluate(e => e.scrollHeight > e.clientHeight));
      assert(await inViewport(terms.getByRole('button', { name: '我知道了', exact: true })));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await content.evaluate(e => { e.scrollTop = e.scrollHeight; });
      assert(await inViewport(terms.getByRole('button', { name: '我知道了', exact: true })));
      if (width === 430) {
        await content.evaluate(e => { e.scrollTop = 0; });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(root, '_qa', '服务条款-欢迎页入口.png') });
      }
      await terms.getByRole('button', { name: '我知道了', exact: true }).click();
      assert(await termsButton.evaluate(e => document.activeElement === e));
    }
    await page.getByRole('button', { name: '手机号登录', exact: true }).click();
    await termsButton.click();
    await terms.waitFor(); await page.keyboard.press('Escape');
    await policyButton.click();
    await dialog.waitFor(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('checkbox').isChecked(), false, '阅读政策不能自动勾选同意');
    await page.getByPlaceholder('请输入11位手机号').fill('13800640003');
    assert(await page.getByRole('button', { name: '登录', exact: true }).isDisabled(), '未同意和未填验证码不能登录');
    assert(!(await page.locator('body').innerText()).includes('用户协议'));
    await page.getByRole('button', { name: '返回欢迎页', exact: true }).click();
    await page.getByRole('button', { name: '微信登录', exact: true }).click();
    await page.getByRole('button', { name: '确认登录', exact: true }).click();
    const wechat = page.getByRole('dialog', { name: '演示登录确认', exact: true });
    await wechat.getByRole('button', { name: '《服务条款》', exact: true }).click();
    await terms.waitFor(); await page.keyboard.press('Escape');
    assert(await wechat.isVisible(), '阅读服务条款后返回原微信确认框');
    await wechat.getByRole('button', { name: '《隐私政策》', exact: true }).click();
    await dialog.waitFor(); await page.keyboard.press('Escape');
    assert(await wechat.isVisible());
    assert.equal(mutations.length, 0, '阅读政策不能修改权限或创建账号');
    console.log('PASS 欢迎/手机号/微信入口名称与正文、服务条款12节及隐私11节、三种尺寸、滚动关闭焦点、阅读不等于同意授权');

    const post = async (url, data, method = 'POST') => {
      const response = await context.request.fetch(origin + '/api' + url, { method, data });
      assert(response.ok(), url); return response.json();
    };
    for (const role of ['elder', 'child']) {
      const phone = role === 'elder' ? '13800640001' : '13800640002';
      const code = await post('/auth/code', { phone });
      await post('/auth/login', { phone, code: code.testCode });
      await post('/me', { role, profile: { name: '隐私隔离测试', phone, completed: true, healthConsent: true } }, 'PATCH');
      await page.goto(origin);
      await page.getByRole('button', { name: role === 'elder' ? '我的设置' : '我的', exact: true }).click();
      await page.getByRole('button', { name: '账号与安全', exact: true }).click();
      const settingsLink = page.getByRole('button', { name: '隐私政策', exact: true });
      await settingsLink.click();
      await dialog.waitFor();
      assert(await dialog.evaluate(e => getComputedStyle(e.parentElement).zIndex === '100'));
      assert.equal(await dialog.getByRole('heading', { level: 3 }).count(), 11);
      await page.keyboard.press('Escape');
      assert(await settingsLink.evaluate(e => document.activeElement === e));
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', '关闭政策后仍锁定下层设置页');
      const me = await post('/me', undefined, 'GET');
      assert(!me.user.prefs.smartAnalysisConsent);
      await page.getByRole('button', { name: '返回', exact: true }).click();
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await post('/auth/logout', {});
      console.log('PASS ' + role + '账号与安全入口、层级、关闭返回、授权未改变');
    }
    assert(external.every(url => url.startsWith('https://static.figma.com/font/')), '除已披露字体外，阅读政策不能自动访问第三方: ' + external.join(', '));
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser?.close();
    const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
