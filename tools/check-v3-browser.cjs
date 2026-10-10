/** 两个隔离浏览器账号验证页面、照片持久化、共享撤回及语音播放回执。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const screenshots = path.join(root, '_qa', '第三版截图');
fs.mkdirSync(screenshots, { recursive: true });
let checks = 0;
function pass(label) { console.log('PASS ' + label); checks++; }
async function goto(page, route) { await page.evaluate(route => window.FoodLensCare.ctx.navigate(route), route); }
async function openDetails(page, selector) {
  const details = page.locator(selector).first();
  await details.waitFor({ state: 'attached' });
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').first().click();
}
async function shot(page, filename) {
  await page.evaluate(() => { document.getElementById('toast').hidden = true; document.activeElement?.blur(); });
  await page.screenshot({ path: path.join(screenshots, filename), fullPage: true });
}
async function checkWidth(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + '横向溢出');
  pass(label + '无横向溢出');
}
async function signIn(page, phone, name, role) {
  await page.goto(origin);
  await page.waitForFunction(() => window.FoodLensCare);
  await page.getByRole('button', { name: '手机号登录', exact: true }).click();
  await page.locator('#login-agree').check();
  await page.locator('#login-phone').fill(phone);
  await page.getByRole('button', { name: '获取测试验证码', exact: true }).click();
  await page.waitForFunction(() => /本地测试验证码：\d{6}/.test(document.getElementById('view').textContent));
  const code = (await page.locator('#view').textContent()).match(/本地测试验证码：(\d{6})/)[1];
  await page.locator('#login-code').fill(code);
  await page.getByRole('button', { name: '手机号测试登录', exact: true }).click();
  await page.waitForFunction(() => location.hash.includes('identity'));
  await page.getByRole('button', { name: role === 'child' ? /我是子女/ : /我是老人/ }).click();
  if (role === 'elder') await shot(page, '13-身份选择.png');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.waitForFunction(() => location.hash.includes('profile'));
  await page.locator('#profile-name').fill(name);
  if (role === 'elder') { await page.locator('#profile-age').fill('68'); await page.locator('#profile-weight').fill('58'); }
  if (role === 'elder') {
    await page.getByRole('button', { name: '女', exact: true }).click();
    await page.getByRole('checkbox', { name: '高血压', exact: true }).check();
    await page.getByRole('checkbox', { name: '糖尿病', exact: true }).check();
    await page.getByRole('checkbox', { name: '花生', exact: true }).check();
  }
  if (role === 'elder') await shot(page, '14-首次个人资料.png');
  await page.getByRole('button', { name: '完成设置，开始使用', exact: true }).click();
  await page.waitForFunction(() => location.hash === '#/home');
  if (role === 'elder') {
    const profile = await page.evaluate(() => window.FoodLensCare.state.profile);
    assert.equal(profile.gender, '女'); assert.deepEqual(profile.conditions.sort(), ['diabetes', 'hypertension']); assert.deepEqual(profile.allergens, ['peanut']);
    pass('分段性别与多选标签实际保存');
  }
  pass(role + '测试登录、身份和基础资料保存');
}
let origin;
(async () => {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'foodcare-browser-'));
  const service = spawn('python', ['-X', 'utf8', path.join(root, 'tools/family_server.py'), '--port', String(port), '--database', path.join(temp, 'family.sqlite3')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(origin + '/api/status')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const errors = [];
    async function newContext(options = {}) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], ...options });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      return { context, page };
    }
    const guest = await newContext();
    await guest.page.goto(origin); await guest.page.waitForFunction(() => window.FoodLensCare);
    await shot(guest.page, '01-欢迎登录.png');
    await checkWidth(guest.page, '欢迎登录');
    await guest.page.getByRole('button', { name: '暂时跳过', exact: true }).click();
    await guest.page.getByRole('button', { name: /我是老人/ }).click();
    await guest.page.getByRole('button', { name: '继续', exact: true }).click();
    await guest.page.locator('#profile-name').fill('游客');
    await guest.page.getByRole('button', { name: '完成设置，开始使用', exact: true }).click();
    assert.equal(await guest.page.evaluate(() => window.FoodLensCare.state.account), null); pass('游客流程无需账号');

    const elder = await newContext(); const child = await newContext();
    await signIn(elder.page, '13800002096', '妈妈 · 测试', 'elder');
    await signIn(child.page, '13800006628', '女儿 · 测试', 'child');
    await goto(elder.page, 'family');
    await elder.page.getByRole('button', { name: '生成我的邀请绑定码', exact: true }).click();
    await elder.page.waitForFunction(() => /[A-F0-9]{8}/.test(document.querySelector('.invite-code').textContent));
    const invite = (await elder.page.locator('.invite-code').textContent()).match(/[A-F0-9]{8}/)[0];
    await goto(child.page, 'family');
    await child.page.locator('#family-code').fill(invite);
    await child.page.getByRole('button', { name: '提交绑定申请', exact: true }).click();
    await child.page.getByText('等待老人确认', { exact: true }).waitFor();
    await goto(elder.page, 'family');
    await elder.page.getByRole('button', { name: '确认是我的家人', exact: true }).click();
    await elder.page.getByRole('switch', { name: '共享食物识别记录', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    await openDetails(elder.page, '.family-controls');
    await elder.page.getByRole('switch', { name: '共享食物识别记录', exact: true }).check();
    await elder.page.waitForFunction(() => { const control = document.querySelector('[aria-label="共享食物识别记录"]'); return control?.checked && !control.disabled; });
    await openDetails(elder.page, '.family-controls');
    await elder.page.getByRole('switch', { name: '共享饮食相关设置', exact: true }).check();
    await elder.page.waitForFunction(() => { const control = document.querySelector('[aria-label="共享饮食相关设置"]'); return control?.checked && !control.disabled; });
    await openDetails(elder.page, '.family-controls');
    await elder.page.getByRole('button', { name: '设为主要联系人', exact: true }).click();
    await elder.page.getByText('主要联系人', { exact: true }).waitFor();
    pass('邀请、老人确认、两类授权和主要联系人');
    await shot(elder.page, '06-老人子女守护.png');

    const id = await elder.page.evaluate(async () => {
      const { saveRecognition, syncHistory } = await import('/src/core/history.js');
      const { processDemoCase } = await import('/src/core/flow.js');
      const result = await processDemoCase('plain-milk', window.FoodLensCare.state.profile);
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
      const paint = canvas.getContext('2d'); paint.fillStyle = '#e7f1e5'; paint.fillRect(0, 0, 600, 400); paint.fillStyle = '#0b4a32'; paint.font = '30px sans-serif'; paint.fillText('测试牛奶标签：配料 生牛乳', 30, 150);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      result.photo.origin = 'album'; result.photo.file = blob;
      const record = await saveRecognition(result, window.FoodLensCare.state.profile);
      await syncHistory(); return record.id;
    });
    assert.equal(await elder.page.evaluate(() => JSON.parse(localStorage.getItem('flc.records.v1.' + window.FoodLensCare.state.account.id) || '[]').length), 0);
    pass('识别历史保存不增加食用摄入');
    await goto(elder.page, 'records');
    await elder.page.getByText('纯牛奶（超高温灭菌乳）', { exact: true }).waitFor();
    await elder.page.getByRole('button', { name: /纯牛奶/ }).click();
    await elder.page.locator('.history-photo').waitFor();
    await elder.page.getByRole('combobox', { name: '设置餐次' }).selectOption('早餐');
    await elder.page.reload();
    await elder.page.locator('.history-photo').waitFor();
    assert.equal(await elder.page.getByRole('combobox', { name: '设置餐次' }).inputValue(), '早餐');
    pass('刷新后历史照片、标签和餐次仍可查看');
    await shot(elder.page, '04-识别记录详情.png');
    await checkWidth(elder.page, '识别详情');
    await goto(elder.page, 'records');
    await elder.page.getByRole('button', { name: '同步到本人账号', exact: true }).click();
    await shot(elder.page, '03-健康记录.png');
    await goto(child.page, 'home');
    await child.page.getByText('纯牛奶（超高温灭菌乳）', { exact: true }).waitFor();
    await shot(child.page, '07-子女守护概览.png');
    pass('另一个账号查看实际共享的记录');
    await goto(child.page, 'records');
    await child.page.getByRole('button', { name: /纯牛奶/ }).waitFor();
    await shot(child.page, '08-子女食物记录.png');
    await child.page.getByRole('button', { name: /纯牛奶/ }).click();
    await child.page.getByText('来自本人填写的设置，不是照片检测结果。', { exact: true }).waitFor();
    pass('子女详情显示获授权的饮食设置');
    await shot(child.page, '09-子女记录详情.png');
    await goto(child.page, 'family');
    await openDetails(child.page, '.family-controls');
    await child.page.getByText(/食物识别记录：已授权/).waitFor();
    await shot(child.page, '11-子女家人管理.png');

    await goto(child.page, 'voices');
    await child.page.getByRole('button', { name: '开始录音', exact: true }).click();
    await child.page.waitForTimeout(1300);
    await child.page.getByRole('button', { name: '停止录音', exact: true }).click();
    await child.page.waitForFunction(() => Number(document.getElementById('voice-duration')?.value) >= 1);
    await openDetails(child.page, '.voice-upload');
    await child.page.locator('#voice-note').fill('早餐提醒 · 测试录音');
    await child.page.locator('.voice-upload').evaluate(element => element.open = false);
    await shot(child.page, '15-关怀录音待发送.png');
    await child.page.getByRole('button', { name: '发送给家人', exact: true }).click();
    await child.page.getByText('“早餐提醒 · 测试录音”', { exact: true }).waitFor();
    pass('麦克风实际录音并发送');
    await goto(elder.page, 'voices');
    await elder.page.getByText('“早餐提醒 · 测试录音”', { exact: true }).waitFor();
    await elder.page.getByRole('button', { name: '播放关怀语音', exact: true }).last().click();
    await elder.page.getByText('已送达 · 已播放', { exact: true }).waitFor();
    await child.page.getByRole('button', { name: '刷新送达和播放状态', exact: true }).click();
    await child.page.getByText('已送达 · 已播放', { exact: true }).waitFor();
    pass('接收端播放后发送端取得真实回执');
    await shot(child.page, '10-关怀语音.png');
    await goto(child.page, 'settings');
    await child.page.getByRole('switch', { name: '语音送达通知', exact: true }).uncheck();
    await child.page.reload();
    assert.equal(await child.page.getByRole('switch', { name: '语音送达通知', exact: true }).isChecked(), false);
    pass('通知偏好刷新后保留');
    await shot(child.page, '12-子女设置.png');
    for (const size of ['large', 'xlarge', 'huge']) { await child.page.evaluate(size => document.documentElement.dataset.textSize = size, size); await checkWidth(child.page, '子女设置-' + size); }

    const replica = await newContext({ storageState: await elder.context.storageState() });
    await replica.page.goto(origin + '/#/records');
    await replica.page.getByText('纯牛奶（超高温灭菌乳）', { exact: true }).waitFor();
    await replica.page.getByRole('button', { name: /纯牛奶/ }).click();
    await replica.page.locator('.history-photo').waitFor();
    pass('新浏览器通过本人账号恢复记录和照片');
    await elder.page.evaluate(async id => {
      const { getHistory, syncHistory } = await import('/src/core/history.js');
      const { recordResult } = await import('/src/core/flow.js');
      const record = getHistory(id);
      record.label.servingGrams = 50;
      recordResult({ historyId: id, photo: { label: record.label, origin: 'album' }, assessment: record.assessment }, { consumptionConfirmed: true });
      await syncHistory();
    }, id);
    await replica.page.reload();
    await replica.page.waitForFunction(() => JSON.parse(localStorage.getItem('flc.records.v1.' + window.FoodLensCare?.state.account?.id) || '[]').length === 1);
    pass('确认食用后本人另一个浏览器恢复摄入记录');
    await elder.page.evaluate(async () => {
      const { loadRecords, removeRecord } = await import('/src/core/store.js');
      const { syncHistory } = await import('/src/core/history.js');
      removeRecord(loadRecords()[0].id); await syncHistory(); await syncHistory();
      if (loadRecords().length) throw new Error('撤销摄入被同步恢复');
    });
    pass('撤销食用后同步不会重新扣减摄入');
    await replica.page.reload();
    await replica.page.waitForFunction(() => window.FoodLensCare && JSON.parse(localStorage.getItem('flc.records.v1.' + window.FoodLensCare.state.account?.id) || '[]').length === 0);
    pass('食用撤销同步到本人另一个浏览器');
    await goto(elder.page, 'family');
    await openDetails(elder.page, '.family-controls');
    await elder.page.getByRole('switch', { name: '共享食物识别记录', exact: true }).uncheck();
    await goto(child.page, 'records');
    await child.page.getByText(/老人尚未授权食物记录/).waitFor();
    pass('老人关闭共享后子女不能再读取');
    await goto(elder.page, 'emergency');
    await elder.page.locator('#emergency-phone').fill('13800006628');
    await elder.page.getByRole('button', { name: '保存求助号码', exact: true }).click();
    await elder.page.locator('a[href="tel:13800006628"]').first().waitFor();
    pass('联系与求助号码生成真实拨号入口');
    await shot(elder.page, '02-老人首页.png');
    for (const route of ['profile', 'settings', 'privacy', 'guide', 'identity', 'family', 'records', 'voices']) {
      await goto(elder.page, route); await elder.page.waitForTimeout(150); await checkWidth(elder.page, '老人页面-' + route);
      if (route === 'settings') await shot(elder.page, '05-老人设置.png');
      assert.ok(!(await elder.page.locator('#view').textContent()).includes('页面出了点问题'));
    }
    await goto(elder.page, 'family');
    await openDetails(elder.page, '.family-controls');
    await elder.page.getByRole('switch', { name: '共享食物识别记录', exact: true }).check();
    await elder.page.waitForFunction(() => { const control = document.querySelector('[aria-label="共享食物识别记录"]'); return control?.checked && !control.disabled; });
    for (const width of [320, 430]) for (const size of ['large', 'huge']) {
      for (const [role, target] of [['elder', elder], ['child', child]]) {
        await target.page.setViewportSize({ width, height: 844 });
        await target.page.evaluate(size => document.documentElement.dataset.textSize = size, size);
        for (const route of ['home', 'records', 'settings', 'family', 'voices', 'profile', 'identity']) {
          await goto(target.page, route); await target.page.waitForTimeout(100);
          assert.ok(await target.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${role}/${route}/${width}/${size}横向溢出`);
          assert.ok(!(await target.page.locator('#view').textContent()).includes('页面出了点问题'));
        }
        pass(`${role}端7页 ${width}px/${size} 布局检查`);
      }
    }
    assert.deepEqual(errors, []); pass('所有新增页面没有未捕获异常');
    console.log(`第三版浏览器检查：${checks}项通过；截图仅含隔离测试数据。`);
  } finally {
    if (browser) await browser.close();
    service.kill(); await new Promise(resolve => service.once('exit', resolve));
    const resolved = path.resolve(temp);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('foodcare-browser-')) throw new Error('测试清理路径不在指定临时目录内');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
