/** Wheel interactions in a disposable guest page; no production data or live API. */
process.env.DEEPSEEK_API_KEY = '';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const selectBirthday = require('./select-birthday.cjs');

(async () => {
  const { ageFromBirthDate, calendarDate, birthdayLimits, birthdayParts } = await import('../src/birthDate.ts');
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-wheel-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('startup timeout')), 15000);
      server.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
    await context.route('https://static.figma.com/font/**', route => route.abort());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.url()); });
    await page.goto(origin);
    await page.getByRole('button', { name: '暂时跳过', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    const trigger = page.locator('#elder-birth-date'), age = page.locator('#elder-age');
    const picker = page.getByRole('dialog', { name: '选择出生日期', exact: true });
    const column = label => picker.getByRole('listbox', { name: label, exact: true });
    const choose = (label, number) => column(label).getByRole('option', { name: number + label, exact: true }).click();
    assert.equal(await age.inputValue(), '未设置');
    assert.equal(await page.getByText('年龄（自动计算）', { exact: true }).count(), 0);
    await selectBirthday(page, 'elder-birth-date', '1998-11-07');
    assert.equal(await trigger.getAttribute('value'), '1998-11-07');
    assert.equal(await age.inputValue(), ageFromBirthDate('1998-11-07'));
    await trigger.click();
    assert.equal(await column('年').getByRole('option', { selected: true }).innerText(), '1998年');
    assert.equal(await column('月').getByRole('option', { selected: true }).innerText(), '11月');
    assert.equal(await column('日').getByRole('option', { selected: true }).innerText(), '7日');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await choose('年', 2000); await choose('月', 2); await choose('日', 29);
    assert.equal(await trigger.getAttribute('value'), '1998-11-07', '调整滚轮不提前提交');
    await picker.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await trigger.getAttribute('value'), '1998-11-07');
    assert(await trigger.evaluate(e => document.activeElement === e));
    await selectBirthday(page, 'elder-birth-date', '2000-02-29');
    await trigger.click(); await choose('年', 2025);
    assert.equal(await column('日').getByRole('option', { name: '29日', exact: true }).count(), 0);
    assert.equal(await column('日').getByRole('option', { selected: true }).innerText(), '28日');
    await picker.getByRole('button', { name: '确定', exact: true }).click();
    assert.equal(await trigger.getAttribute('value'), '2025-02-28');
    await selectBirthday(page, 'elder-birth-date', '2000-01-31');
    await trigger.click(); await choose('月', 4);
    assert.equal(await column('日').getByRole('option', { selected: true }).innerText(), '30日');
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('value'), '2000-01-31');
    console.log('PASS 三列年/月/日、恢复已选日期、确认/取消/Escape、闰年和平月联动、未设置年龄');

    await trigger.click();
    await column('年').focus(); await page.keyboard.press('End');
    await column('月').focus(); await page.keyboard.press('End');
    await column('日').focus(); await page.keyboard.press('End');
    await picker.getByRole('button', { name: '确定', exact: true }).click();
    assert.equal(await trigger.getAttribute('value'), calendarDate(), '最大日期不能晚于今天');
    await trigger.click();
    await column('年').focus(); await page.keyboard.press('Home');
    await column('月').focus(); await page.keyboard.press('Home');
    await column('日').focus(); await page.keyboard.press('Home');
    await picker.getByRole('button', { name: '确定', exact: true }).click();
    assert.equal(await trigger.getAttribute('value'), birthdayLimits().min);
    assert.equal(await age.inputValue(), '120');
    await selectBirthday(page, 'elder-birth-date', '2000-02-29');
    await trigger.click();
    await picker.getByRole('button', { name: '确定', exact: true }).evaluate(button => {
      const year = document.querySelector('[role="listbox"][aria-label="年"]');
      const options = Array.from(year.querySelectorAll('[role="option"]'));
      year.scrollTop = options.findIndex(option => option.textContent === '1999年') * 44;
      button.click();
    });
    assert.equal(await trigger.getAttribute('value'), '1999-02-28', '未等滚动防抖完成就确认也取可见值');
    await trigger.click();
    await column('年').evaluate(element => {
      const options = Array.from(element.querySelectorAll('[role="option"]'));
      element.scrollTop = options.findIndex(option => option.textContent === '1998年') * 44;
    });
    await page.waitForFunction(() => document.querySelector('[role="listbox"][aria-label="年"] [aria-selected="true"]')?.textContent === '1998年');
    // A real wheel event must update the centered month rather than only button clicks.
    await column('月').hover(); await page.mouse.wheel(0, 88);
    await page.waitForFunction(() => {
      const column = document.querySelector('[role="listbox"][aria-label="月"]');
      return column.scrollTop > 44 && Math.abs(column.scrollTop / 44 - Math.round(column.scrollTop / 44)) < .05;
    });
    await picker.getByRole('button', { name: '确定', exact: true }).click();
    assert((await trigger.getAttribute('value')).startsWith('1998-'));
    await selectBirthday(page, 'elder-birth-date', '');
    assert.equal(await trigger.getAttribute('value'), ''); assert.equal(await age.inputValue(), '未设置');
    console.log('PASS 键盘、鼠标滚动与吸附、立即确认读可见值、0至120岁范围、将来日期限制、清除');

    for (const [width, height] of [[320, 568], [430, 932], [1280, 800], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await trigger.click();
      const bounds = await picker.boundingBox();
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const selected = birthdayParts(calendarDate());
      assert.equal(await column('年').getByRole('option', { selected: true }).innerText(), selected.year + '年');
      await picker.getByRole('button', { name: '取消', exact: true }).click();
    }
    await page.setViewportSize({ width: 430, height: 932 });
    await selectBirthday(page, 'elder-birth-date', '1998-11-07');
    await trigger.click(); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '_qa', '出生日期-三列滚轮.png') });
    await page.locator('.flc-date-backdrop').click({ position: { x: 5, y: 5 } });
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('value'), '1998-11-07');
    assert.equal(writes.length, 0); assert.deepEqual(errors, []);
    console.log('PASS 四种视口含横屏、遮罩取消、焦点与滚动锁、无API写入及脚本异常');
  } finally {
    await browser?.close();
    const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
