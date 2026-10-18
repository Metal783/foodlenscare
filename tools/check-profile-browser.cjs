/** Isolated elder/child onboarding, birthday and profile-entry regression. */
process.env.DEEPSEEK_API_KEY = '';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const selectBirthday = require('./select-birthday.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');

(async () => {
  const { ageFromBirthDate } = await import('../src/birthDate.ts');
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-profile-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('startup timeout')), 15000);
      server.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const elderContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const childContext = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const request = async (context, url, body, method = 'POST') => {
      const response = await context.request.fetch(origin + '/api' + url, { method, data: body });
      assert(response.ok(), url); return response.json();
    };
    const errors = [];
    const pages = [];
    for (const [context, role, phone, birthday] of [[elderContext, 'elder', '13800660001', '1958-10-17'], [childContext, 'child', '13800660002', '1996-10-18']]) {
      await context.route('https://static.figma.com/font/**', route => route.abort());
      const code = await request(context, '/auth/code', { phone });
      await request(context, '/auth/login', { phone, code: code.testCode });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(origin);
      await page.getByRole('radio', { name: role === 'elder' ? /我是老人/ : /我是子女/ }).click();
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await page.locator(`#${role}-name`).fill(role === 'elder' ? '老人初始' : '子女初始');
      await selectBirthday(page, `${role}-birth-date`, birthday);
      assert.equal(await page.locator(`#${role}-age`).inputValue(), ageFromBirthDate(birthday));
      assert(await page.locator(`#${role}-age`).evaluate(e => e.readOnly));
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 932 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.getByRole('button', { name: '完成设置，开始使用', exact: true }).click();
      await page.getByRole('button', { name: role === 'elder' ? '我的设置' : '我的', exact: true }).click();
      const saved = (await request(context, '/me', undefined, 'GET')).user.profile;
      assert.equal(saved.birthDate, birthday); assert.equal(saved.age, ageFromBirthDate(birthday));
      console.log('PASS ' + role + '首次填写出生日期、只读年龄、无绑定也可保存资料、三种宽度');
    }
    const [elder, child] = pages;
    assert.equal(await elder.locator('.profile-settings-card button').count(), 1);
    await elder.locator('.profile-settings-icon').click();
    assert(await elder.getByRole('heading', { name: '我的设置', exact: true }).isVisible());
    assert.equal(await elder.locator('.profile-tags i').count(), 0);
    await elder.getByRole('button', { name: '修改个人信息', exact: true }).click();
    assert.equal(await elder.getByRole('button', { name: '花生', exact: true }).count(), 0);
    assert.equal(await elder.getByRole('button', { name: '高血压', exact: true }).count(), 0);
    assert.equal(await elder.getByText('体重（选填）', { exact: true }).count(), 0);
    await elder.getByLabel('姓名／称呼', { exact: true }).fill('顶部改名');
    await selectBirthday(elder, 'elder-edit-birth-date', '1957-10-17');
    await elder.getByRole('button', { name: '保存修改', exact: true }).click();
    await elder.locator('.profile-settings-card').getByText('顶部改名', { exact: true }).waitFor();
    await elder.getByRole('button', { name: /健康资料/ }).click();
    assert.equal(await elder.getByLabel('姓名／称呼', { exact: true }).inputValue(), '顶部改名');
    assert.equal(await elder.locator('#elder-edit-birth-date').getAttribute('value'), '1957-10-17');
    await elder.getByRole('button', { name: '牛奶', exact: true }).click();
    await elder.getByRole('button', { name: '高血压', exact: true }).click();
    await elder.getByRole('checkbox').check();
    await elder.getByLabel('姓名／称呼', { exact: true }).fill('底部改名');
    await selectBirthday(elder, 'elder-edit-birth-date', '1956-10-18');
    await elder.getByRole('button', { name: '保存修改', exact: true }).click();
    await elder.locator('.profile-settings-card').getByText('底部改名', { exact: true }).waitFor();
    await elder.getByRole('button', { name: '修改个人信息', exact: true }).click();
    assert.equal(await elder.locator('#elder-edit-birth-date').getAttribute('value'), '1956-10-18');
    assert.equal(await elder.locator('#elder-edit-age').inputValue(), ageFromBirthDate('1956-10-18'));
    await elder.getByLabel('姓名／称呼', { exact: true }).fill('只改姓名');
    await elder.getByRole('button', { name: '保存修改', exact: true }).click();
    await elder.getByRole('heading', { name: '我的设置', exact: true }).waitFor();
    let saved = (await request(elderContext, '/me', undefined, 'GET')).user.profile;
    assert.deepEqual(saved.allergens, ['牛奶']); assert.deepEqual(saved.diseases, ['高血压']);
    assert.equal(saved.birthDate, '1956-10-18'); assert.equal(saved.name, '只改姓名');
    assert.equal(await child.locator('.child-profile-summary button').count(), 1);
    await child.getByRole('button', { name: '修改个人信息', exact: true }).click();
    await child.getByLabel('姓名／称呼', { exact: true }).fill('子女独立资料');
    await selectBirthday(child, 'child-edit-birth-date', '1995-02-28');
    assert(await child.locator('#child-edit-age').evaluate(e => e.readOnly));
    await child.getByRole('button', { name: '保存修改', exact: true }).click();
    await child.locator('.child-profile-summary').getByText('子女独立资料', { exact: true }).waitFor();
    saved = (await request(childContext, '/me', undefined, 'GET')).user.profile;
    assert.equal(saved.birthDate, '1995-02-28');
    assert.equal((await request(elderContext, '/me', undefined, 'GET')).user.profile.birthDate, '1956-10-18');
    console.log('PASS 顶部仅箭头、基本编辑无健康项、底部完整档案、双向同步、个人修改不覆盖过敏原、子女资料独立');

    for (const [page, role] of [[elder, 'elder'], [child, 'child']]) {
      await page.reload();
      await page.getByRole('button', { name: role === 'elder' ? '我的设置' : '我的', exact: true }).click();
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 932 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.setViewportSize({ width: 430, height: 932 });
      await page.screenshot({ path: path.join(root, '_qa', role + '-资料入口.png'), fullPage: true });
      await page.getByRole('button', { name: '修改个人信息', exact: true }).click();
      for (const width of [320, 430, 1280]) {
        await page.setViewportSize({ width, height: 932 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.setViewportSize({ width: 430, height: 932 });
      await page.screenshot({ path: path.join(root, '_qa', role + '-出生日期编辑.png'), fullPage: true });
      await page.locator(`#${role}-edit-birth-date`).click();
      const picker = page.getByRole('dialog', { name: '选择出生日期', exact: true });
      assert.equal(await picker.getByRole('option', { name: '2999年', exact: true }).count(), 0);
      await picker.getByRole('button', { name: '取消', exact: true }).click();
    }
    const legacyContext = await browser.newContext();
    await legacyContext.route('https://static.figma.com/font/**', route => route.abort());
    const legacyCode = await request(legacyContext, '/auth/code', { phone: '13800660003' });
    await request(legacyContext, '/auth/login', { phone: '13800660003', code: legacyCode.testCode });
    await request(legacyContext, '/me', { role: 'elder', profile: { name: '原有年龄', age: '68', completed: true } }, 'PATCH');
    const legacy = await legacyContext.newPage();
    await legacy.goto(origin);
    await legacy.getByRole('button', { name: '我的设置', exact: true }).click();
    await legacy.getByRole('button', { name: '修改个人信息', exact: true }).click();
    assert.equal(await legacy.locator('#elder-edit-birth-date').getAttribute('value'), '');
    assert.equal(await legacy.locator('#elder-edit-age').inputValue(), '未设置');
    await legacy.getByLabel('姓名／称呼', { exact: true }).fill('保留原年龄');
    await legacy.getByRole('button', { name: '保存修改', exact: true }).click();
    await legacy.getByRole('heading', { name: '我的设置', exact: true }).waitFor();
    const oldProfile = (await request(legacyContext, '/me', undefined, 'GET')).user.profile;
    assert.equal(oldProfile.age, '68'); assert.equal(oldProfile.birthDate, '');

    const guestContext = await browser.newContext();
    await guestContext.route('https://static.figma.com/font/**', route => route.abort());
    const guest = await guestContext.newPage();
    await guest.goto(origin);
    await guest.getByRole('button', { name: '暂时跳过', exact: true }).click();
    await guest.getByRole('button', { name: '继续', exact: true }).click();
    await guest.locator('#elder-name').fill('游客生日');
    await selectBirthday(guest, 'elder-birth-date', '1960-01-01');
    await guest.getByRole('button', { name: '完成设置，开始使用', exact: true }).click();
    await guest.getByRole('button', { name: '我的设置', exact: true }).click();
    await guest.reload();
    await guest.getByRole('button', { name: '暂时跳过', exact: true }).click();
    await guest.getByRole('button', { name: '继续', exact: true }).click();
    assert.equal(await guest.locator('#elder-birth-date').getAttribute('value'), '1960-01-01');
    assert.equal(await guest.locator('#elder-age').inputValue(), ageFromBirthDate('1960-01-01'));
    console.log('PASS 旧资料只保留年龄不反推生日、游客出生日期与年龄在当前会话恢复');
    assert.deepEqual(errors, []);
    console.log('PASS 刷新持久化、两端设置/编辑三种宽度、出生日期不提供将来日期、无脚本错误');
  } finally {
    await browser?.close();
    const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
