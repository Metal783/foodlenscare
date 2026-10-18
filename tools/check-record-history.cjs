/** Isolated history display/deletion regression; no external model calls. */
process.env.DEEPSEEK_API_KEY = '';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-history-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('startup timeout')), 15000);
      server.stdout.on('data', data => { const found = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (found) { clearTimeout(timer); resolve(found[0]); } });
    });
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const elder = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const child = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const request = async (context, url, body, method = 'POST') => {
      const response = await context.request.fetch(origin + '/api' + url, { method, data: body });
      assert(response.ok(), url); return response.json();
    };
    const login = async (context, phone, role) => {
      const code = await request(context, '/auth/code', { phone });
      await request(context, '/auth/login', { phone, code: code.testCode });
      return (await request(context, '/me', { role, profile: { name: '隔离记录测试', phone, completed: true, healthConsent: true, diseases: [], allergens: [] } }, 'PATCH')).user;
    };
    const user = await login(elder, '13800630001', 'elder');
    await login(child, '13800630002', 'child');
    const invite = await request(elder, '/family/invite', { role: 'elder' });
    const family = await request(child, '/family/join', { code: invite.code, relation: '女儿' });
    await request(elder, '/family/' + family.id, { status: 'bound', records_allowed: true, profile_allowed: false }, 'PATCH');
    const record = {
      id: 'history-test', at: new Date().toISOString(), productName: '隔离测试食品', origin: 'photo',
      label: { ingredientText: '配料：花生、小麦粉。', nutritionTable: [{ key: 'sodium', label: '钠', value: 220, unit: 'mg', nrv: 11 }], servingLabel: '每100克' },
      assessment: { level: 'red', headline: '已保存过敏风险', advice: '不应重复展示的旧建议' },
      aiAnalysis: { provider: 'test', model: 'isolated', generatedAt: new Date().toISOString(), formatVersion: 2, recommendation: 'not_recommended', summary: '配料包含本人已填写的过敏原。', considerations: ['请选择其他食品。'], uncertainties: [], nutritionAnalysis: [] },
    };
    await request(elder, '/records', { record });
    const page = await elder.newPage(), shared = await child.newPage();
    let analysisCalls = 0;
    for (const context of [elder, child]) await context.route('**/api/analysis', route => { analysisCalls++; return route.abort(); });
    await page.goto(origin);
    await page.getByRole('button', { name: '健康记录', exact: true }).click();
    await page.locator('.record-row-compact').first().click();
    const advice = page.getByRole('region', { name: '食用建议' });
    const expected = await advice.innerText();
    assert(!expected.includes('旧建议'));
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: 932 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await shared.goto(origin);
    await shared.getByRole('button', { name: '记录', exact: true }).click();
    await shared.getByRole('button', { name: '查看详情', exact: true }).click();
    await shared.getByText('饮食资料未授权，暂无法查看个性化分析。', { exact: true }).waitFor();
    assert(!(await shared.locator('body').innerText()).includes(record.aiAnalysis.summary));
    assert.equal(await shared.getByRole('button', { name: '删除记录', exact: true }).count(), 0);
    await request(elder, '/family/' + family.id, { profile_allowed: true }, 'PATCH');
    await shared.reload();
    await shared.getByRole('button', { name: '记录', exact: true }).click();
    await shared.getByRole('button', { name: '查看详情', exact: true }).click();
    assert.equal(await shared.getByRole('region', { name: '食用建议' }).innerText(), expected);
    assert.equal(await shared.getByRole('table').innerText(), await page.getByRole('table').innerText());
    for (const width of [320, 430, 1280]) {
      await shared.setViewportSize({ width, height: 932 });
      assert(await shared.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await request(elder, '/family/' + family.id, { profile_allowed: false }, 'PATCH');
    await shared.getByText('饮食资料未授权，暂无法查看个性化分析。', { exact: true }).waitFor({ timeout: 15000 });
    assert(!(await shared.locator('body').innerText()).includes(record.aiAnalysis.summary));
    console.log('PASS 双端历史展示一致、三种宽度、授权撤回隐藏分析、子女无删除入口');

    const openDelete = () => page.getByRole('button', { name: '删除记录', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除这条识别记录？', exact: true });
    await openDelete();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await request(elder, '/records', undefined, 'GET')).records.length, 1);
    await elder.route('**/api/records/history-test', route => route.fulfill({ status: 503, json: { error: '隔离测试：删除失败' } }));
    await openDelete();
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await dialog.getByRole('alert').getByText('隔离测试：删除失败', { exact: true }).waitFor();
    assert.equal((await request(elder, '/records', undefined, 'GET')).records.length, 1);
    await elder.unroute('**/api/records/history-test');
    let deletes = 0;
    await elder.route('**/api/records/history-test', async route => { deletes++; await new Promise(resolve => setTimeout(resolve, 300)); await route.continue(); });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('heading', { name: '还没有食品识别记录', exact: true }).waitFor();
    assert.equal(deletes, 1);
    await shared.getByRole('heading', { name: '当前记录不可访问', exact: true }).waitFor({ timeout: 15000 });
    assert.equal((await request(child, '/records?elder=' + user.id, undefined, 'GET')).records.length, 0);
    await page.reload();
    await page.getByRole('button', { name: '健康记录', exact: true }).click();
    await page.getByRole('heading', { name: '还没有食品识别记录', exact: true }).waitFor();
    assert.equal(analysisCalls, 0);
    console.log('PASS 删除取消、失败保留、重试成功、防双击、刷新不恢复、子女同步移除、历史不调用API');

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(origin);
    await guest.getByRole('button', { name: '暂时跳过', exact: true }).waitFor();
    await guest.evaluate(async source => {
      sessionStorage.setItem('foodlenscare.v4.guestOwner', 'history-guest');
      const records = [{ ...source, id: 'guest-one', aiAnalysis: undefined }, { ...source, id: 'guest-two', aiAnalysis: undefined }];
      sessionStorage.setItem('foodlenscare.v4.guest.records', JSON.stringify(records));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('foodlenscare.v4.records', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        records.forEach(record => tx.objectStore('records').put(record, 'guest-history-guest:' + record.id));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, record);
    await guest.getByRole('button', { name: '暂时跳过', exact: true }).click();
    await guest.getByRole('button', { name: '继续', exact: true }).click();
    await guest.getByRole('button', { name: '暂时跳过基础信息设置', exact: true }).click();
    await guest.getByRole('button', { name: '健康记录', exact: true }).click();
    await guest.locator('.record-row-compact').first().click();
    await guest.getByText('该记录未保存智能分析。', { exact: true }).waitFor();
    await guest.getByRole('button', { name: '删除记录', exact: true }).click();
    await guest.getByRole('dialog').getByRole('button', { name: '确认删除', exact: true }).click();
    await guest.waitForFunction(() => document.querySelectorAll('.record-row-compact').length === 1);
    const stored = await guest.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('foodlenscare.v4.records', 1); request.onsuccess = () => resolve(request.result); });
      const keys = await new Promise(resolve => { const request = db.transaction('records').objectStore('records').getAllKeys(); request.onsuccess = () => resolve(request.result); });
      db.close();
      return { keys, records: JSON.parse(sessionStorage.getItem('foodlenscare.v4.guest.records')) };
    });
    assert.deepEqual(stored.keys, ['guest-history-guest:guest-two']);
    assert.equal(stored.records.length, 1);
    assert.equal(stored.records[0].id, 'guest-two');
    console.log('PASS 游客单条删除同步清理照片及元数据、不影响另一条、旧记录不伪造AI');
  } finally {
    await browser?.close();
    const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
