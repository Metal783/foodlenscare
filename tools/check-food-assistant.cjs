/** Feature UI checks: real local OCR for second photo, mocked provider, isolated data. */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-assistant-ui-'));
  const server = spawn('python', ['-B', '-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temp, 'test.sqlite3')], { cwd: root, windowsHide: true, env: { ...process.env, DEEPSEEK_API_KEY: '' } });
  let browser;
  try {
    const origin = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('startup timeout')), 15000); server.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } }); });
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const elder = await browser.newContext({ viewport: { width: 430, height: 932 } }), child = await browser.newContext({ viewport: { width: 430, height: 932 } });
    // Keep visual checks deterministic if the original external fonts are unavailable.
    await elder.route('https://static.figma.com/font/**', route => route.abort());
    await child.route('https://static.figma.com/font/**', route => route.abort());
    const api = async (ctx, url, data, method = 'POST') => { const r = await ctx.request.fetch(origin + '/api' + url, { method, data }); assert(r.ok(), url + ': ' + await r.text()); return r.json(); };
    const login = async (ctx, phone, role) => { const code = await api(ctx, '/auth/code', { phone }); await api(ctx, '/auth/login', { phone, code: code.testCode }); return (await api(ctx, '/me', { role, profile: { name: '食品助手测试', phone, diseases: ['高血压'], allergens: [], completed: true, healthConsent: true } }, 'PATCH')).user; };
    await login(elder, '13800920001', 'elder'); await login(child, '13800920002', 'child');
    const label = { productName: '当前面包', ingredientText: '小麦粉、酵母、盐', declaredPer: 'per100g', servingLabel: '每100克', nutritionPer100g: { sodium: 200 }, confidence: { sodium: .99 } };
    for (const [id, name] of [['assistant-current', '当前面包'], ['assistant-second', '另一款面包']]) await api(elder, '/records', { record: { id, at: new Date().toISOString(), productName: name, label: { ...label, productName: name }, assessment: { level: 'gray' }, origin: 'album' } });
    const invite = await api(elder, '/family/invite', {}), family = await api(child, '/family/join', { code: invite.code });
    await api(elder, '/family/' + family.id, { status: 'bound', records_allowed: true, profile_allowed: true }, 'PATCH');
    const page = await elder.newPage(), errors = [], calls = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.getByRole('button', { name: '健康记录', exact: true }).click();
    await page.locator('.record-row-compact').filter({ hasText: '当前面包' }).click();
    await page.getByRole('button', { name: '为什么这样建议', exact: true }).waitFor();
    await page.evaluate(() => { window.testSpeech = ''; window.testCancels = 0; speechSynthesis.cancel = () => { window.testCancels++; }; speechSynthesis.speak = u => { window.testSpeech = u.text; window.testUtterance = u; window.testLateError = u.onerror; }; });
    let failNext = false, delayNext = false, release;
    await elder.route('**/api/food-assistant', async route => {
      const request = route.request().postDataJSON(); calls.push(request);
      assert.equal(request.consent, true); assert(!JSON.stringify(request).includes('photoDataUrl')); assert(!('profile' in request));
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: '隔离测试：食品助手暂不可用' } }); }
      if (delayNext) { delayNext = false; await new Promise(resolve => { release = resolve; }); }
      const result = { answer: request.mode === 'shopping' ? '下次选同类食品时，可先核对完整配料和相同计量口径的营养表。' : request.mode === 'pairing' ? '搭配前先核对其他食物的配料，不把思路当作完整餐单。' : request.mode === 'claims' ? '包装说法不能代替完整营养标签，请结合配料核对。' : request.mode === 'compare' ? '两款需要结合完整配料和同一计量口径比较。' : '需要先核对配料与营养口径。',
        details: ['未识别的信息不能当作不存在。'], followUps: ['还需要核对哪些标签信息？'], safetyNotes: request.mode === 'ask' ? ['当前食品存在本人过敏原线索，请核对完整标签。'] : [], conversationId: 'ui-test-' + request.mode, turnsRemaining: 4,
        taskNotes: ['shopping', 'pairing'].includes(request.mode) ? ['其他食品的完整标签及本人过敏原仍需核对。'] : [],
        comparison: request.mode === 'compare' ? [{ nutrient: 'sodium', label: '钠', unit: 'mg', first: 200, second: 100, firstBasis: '每100克', secondBasis: '每100克', comparable: true, note: '已按同一口径换算，数值仍为识别候选' }] : [] };
      try { await route.fulfill({ json: { result } }); } catch { /* Closing intentionally aborts the browser request. */ }
    });
    const dialog = () => page.getByRole('dialog');
    const checklist = page.getByRole('region', { name: '标签核对助手', exact: true });
    await checklist.getByText('查看标签核对清单', { exact: true }).click();
    assert((await checklist.innerText()).includes('未读到单独声明')); assert((await checklist.innerText()).includes('未读到，请核对包装是否标有该项；不能当作零'));
    await checklist.getByRole('checkbox', { name: '已查看：完整配料表', exact: true }).check();
    assert((await checklist.getByRole('status').innerText()).includes('1 / 11'));
    const saved = (await api(elder, '/records', undefined, 'GET')).records.find(r => r.id === 'assistant-current');
    assert.equal(saved.label.nutritionConfirmed, undefined); assert.equal(saved.label.confidence.sodium, .99);
    await api(elder, '/records', { record: { ...saved, label: { ...saved.label, nutritionPer100g: { ...saved.label.nutritionPer100g, sodium: 201 } } } });
    await page.waitForFunction(() => !document.querySelector('input[aria-label="已查看：完整配料表"]').checked, null, { timeout: 15000 });
    assert((await checklist.getByRole('status').innerText()).includes('0 / 11'));
    await checklist.getByRole('button', { name: '朗读核对清单', exact: true }).click();
    assert((await page.evaluate(() => window.testSpeech)).includes('完整配料表'));
    for (const width of [320, 430, 1280]) { await page.setViewportSize({ width, height: 932 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
    await checklist.getByText('查看标签核对清单', { exact: true }).click();
    await checklist.getByText('查看标签核对清单', { exact: true }).click();
    assert(!(await checklist.getByRole('checkbox', { name: '已查看：完整配料表', exact: true }).isChecked()));
    await checklist.getByRole('button', { name: '朗读核对清单', exact: true }).waitFor();
    await checklist.getByText('查看标签核对清单', { exact: true }).click();
    await page.setViewportSize({ width: 430, height: 932 }); assert.equal(calls.length, 0);
    console.log('PASS 本机核对清单：缺失/无声明提示，零AI请求，临时勾选不修改OCR，来源数字改变或收起清除勾选/停止朗读，三宽度正常');
    await page.getByRole('button', { name: '为什么这样建议', exact: true }).click();
    assert.equal(calls.length, 0); assert(await dialog().getByRole('button', { name: '发送问题', exact: true }).isDisabled());
    await dialog().getByRole('group', { name: '常用食品问题' }).getByRole('button', { name: '哪些配料需要我留意？', exact: true }).click();
    assert.equal(await dialog().getByRole('textbox').inputValue(), '哪些配料需要我留意？');
    assert(await dialog().getByRole('textbox').evaluate(e => e === document.activeElement)); assert.equal(calls.length, 0);
    for (const width of [320, 430, 1280]) { await page.setViewportSize({ width, height: 932 }); assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth + 1)); }
    await page.setViewportSize({ width: 320, height: 932 });
    const usabilityShots = path.join(root, '_qa', 'ai-usability-20261017'); fs.mkdirSync(usabilityShots, { recursive: true });
    await dialog().getByRole('group', { name: '常用食品问题' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(usabilityShots, '常用问题-320.png'), fullPage: true });
    await page.setViewportSize({ width: 430, height: 932 });
    await dialog().getByRole('checkbox').check(); await dialog().getByRole('button', { name: '发送问题', exact: true }).click();
    await dialog().getByText('需要先核对配料与营养口径。', { exact: true }).waitFor();
    await dialog().getByText('展开说明', { exact: true }).click();
    assert(await dialog().getByText('未识别的信息不能当作不存在。', { exact: true }).isVisible());
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).click();
    assert((await page.evaluate(() => window.testSpeech)).includes('需要先核对'));
    assert((await page.evaluate(() => window.testSpeech)).startsWith('当前食品存在本人过敏原线索'));
    assert(await dialog().getByRole('note', { name: '本人过敏提醒' }).isVisible());
    await dialog().getByRole('button', { name: '停止朗读', exact: true }).click();
    await page.evaluate(() => window.testLateError({ error: 'synthesis-failed' }));
    assert.equal(await dialog().getByRole('alert').count(), 0);
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).click();
    await page.evaluate(() => window.testUtterance.onend());
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).waitFor();
    await page.evaluate(() => { window.testSpeak = speechSynthesis.speak; speechSynthesis.speak = () => { throw new Error('isolated speech failure'); }; });
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).click();
    await dialog().getByRole('alert').getByText('朗读未能开始，请重试。', { exact: true }).waitFor();
    await page.evaluate(() => { speechSynthesis.speak = window.testSpeak; });
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).click();
    assert.equal(await dialog().getByRole('alert').count(), 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
    await dialog().getByRole('button', { name: '朗读回答', exact: true }).waitFor();
    assert((await page.evaluate(() => window.testCancels)) > 0);
    await dialog().getByRole('button', { name: '还需要核对哪些标签信息？', exact: true }).click();
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click({ timeout: 10000 });
    await dialog().getByRole('region', { name: '第2次回答', exact: true }).waitFor();
    assert.equal(calls[1].conversationId, 'ui-test-ask');
    await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    console.log('PASS 食品追问：常用问题只填入/聚焦不自动请求，独立授权、多轮编号、独立过敏提醒与优先朗读、停止/结束/迟到错误隔离');

    await page.getByRole('button', { name: '解释包装说法', exact: true }).click();
    await dialog().getByRole('group', { name: '常用食品问题' }).getByRole('button', { name: '如何核对包装上的“无蔗糖”说法？', exact: true }).click();
    assert.equal(await dialog().getByRole('textbox').inputValue(), '如何核对包装上的“无蔗糖”说法？');
    await dialog().getByRole('textbox', { name: '包装说法或追问' }).fill('包装写“无蔗糖”，是否表示无糖？');
    await dialog().getByRole('checkbox').check(); failNext = true;
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click();
    await dialog().getByRole('alert').getByText('隔离测试：食品助手暂不可用', { exact: true }).waitFor();
    assert.equal(await dialog().getByRole('textbox').inputValue(), '包装写“无蔗糖”，是否表示无糖？');
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click();
    await dialog().getByText('包装说法不能代替完整营养标签，请结合配料核对。', { exact: true }).waitFor();
    assert.equal(calls.at(-1).mode, 'claims'); assert.equal(calls.at(-1).conversationId, '');
    await dialog().getByRole('button', { name: '关闭食品助手', exact: true }).click();
    console.log('PASS 包装解读：具体说法输入、真实错误不丢草稿、主动重试、任务上下文独立');

    for (const [mode, title, question] of [['shopping', '选购替代思路', '我想准备起来简单一些，下次选同类食品要核对什么？'], ['pairing', '日常搭配建议', '我想把这款食品作为加餐，有什么搭配思路？']]) {
      const before = calls.length;
      await page.getByRole('button', { name: title, exact: true }).click();
      assert(await dialog().getByRole('button', { name: '发送问题', exact: true }).isDisabled());
      await dialog().getByRole('group', { name: '常用食品问题' }).getByRole('button').first().click();
      await dialog().getByRole('textbox').fill(question); assert.equal(calls.length, before);
      await dialog().getByRole('checkbox').check(); await dialog().getByRole('button', { name: '发送问题', exact: true }).click();
      await dialog().getByRole('region', { name: '第1次回答', exact: true }).waitFor();
      assert.equal(calls.at(-1).mode, mode); assert.equal(calls.at(-1).question, question); assert.equal(calls.at(-1).conversationId, '');
      assert(!('secondLabel' in calls.at(-1))); assert(!('secondRecordId' in calls.at(-1)));
      await dialog().getByRole('note', { name: '使用说明' }).waitFor();
      await dialog().getByRole('button', { name: '朗读回答', exact: true }).click();
      assert((await page.evaluate(() => window.testSpeech)).includes('其他食品的完整标签'));
      for (const width of [320, 430, 1280]) { await page.setViewportSize({ width, height: 932 }); assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth + 1)); const box = await dialog().boundingBox(); assert(box.y >= 0 && box.height <= 932); }
      await page.setViewportSize({ width: 430, height: 932 });
      const shots = path.join(root, '_qa', 'ai-more-features-20261017'); fs.mkdirSync(shots, { recursive: true });
      await dialog().getByRole('note', { name: '使用说明' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(shots, title + '.png'), fullPage: false });
      if (mode === 'pairing') {
        await dialog().getByRole('button', { name: '还需要核对哪些标签信息？', exact: true }).click();
        await dialog().getByRole('button', { name: '发送问题', exact: true }).click({ timeout: 10000 });
        await dialog().getByRole('region', { name: '第2次回答', exact: true }).waitFor(); assert.equal(calls.at(-1).conversationId, 'ui-test-pairing');
      }
      await dialog().getByRole('button', { name: '关闭食品助手', exact: true }).click();
    }
    console.log('PASS 选购/搭配：独立任务、场景偏好编辑、显式授权、只围绕当前食品、用途说明、朗读、连续追问与三宽度');

    await page.getByRole('button', { name: '和另一款比较', exact: true }).click();
    await dialog().getByRole('combobox', { name: '选择另一款已保存食品' }).selectOption('assistant-second');
    await dialog().getByRole('checkbox').check(); await dialog().getByRole('button', { name: '开始对比 / 继续追问', exact: true }).click();
    await dialog().getByRole('table', { name: '两款食品营养对比' }).waitFor();
    assert(await dialog().getByRole('note', { name: '对比说明' }).getByText('已按同一口径换算，数值仍为识别候选', { exact: true }).isVisible());
    assert.equal(calls.at(-1).secondRecordId, 'assistant-second'); assert(!('secondLabel' in calls.at(-1)));
    for (const width of [320, 430, 1280]) { await page.setViewportSize({ width, height: 932 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth + 1)); }
    await page.setViewportSize({ width: 430, height: 932 });
    const output = path.join(root, '_qa', 'ai-expansion-20261017'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, '食品对比.png'), fullPage: true });
    const fixture = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1400; c.height = 700; const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 1400, 700); x.fillStyle = '#111'; x.font = '48px Microsoft YaHei'; ['产品名称：上传面包', '配料：小麦粉、酵母、食盐。', '营养成分表 每100克', '能量 1500千焦', '蛋白质 8克', '脂肪 10克', '碳水化合物 60克', '钠 100毫克'].forEach((s, i) => x.fillText(s, 50, 65 + i * 70)); return c.toDataURL('image/png').split(',')[1]; });
    const before = calls.length;
    await dialog().locator('input[type=file]').first().setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    await dialog().getByText(/另一款：.+（已识别，未保存）/).waitFor({ timeout: 180000 });
    assert.equal(calls.length, before); assert.equal((await api(elder, '/records', undefined, 'GET')).records.length, 2);
    await dialog().getByRole('textbox', { name: '食品问题' }).fill('这两款的配料有什么差异？');
    await dialog().getByRole('button', { name: '开始对比 / 继续追问', exact: true }).click({ timeout: 10000 });
    await dialog().getByRole('table', { name: '两款食品营养对比' }).waitFor();
    assert(calls.at(-1).secondLabel.ingredientText.includes('小麦')); assert(!calls.at(-1).secondRecordId);
    assert(calls.at(-1).secondLabel.nutritionEvidence.sodium.confidence > 0);
    await dialog().getByRole('button', { name: '关闭食品助手', exact: true }).click();
    console.log('PASS 食品对比：本人历史选择、三种宽度、真实OCR第二张照片、不自动保存或发送图片');

    await page.getByRole('button', { name: '为什么这样建议', exact: true }).click();
    await dialog().getByRole('checkbox').check(); delayNext = true;
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click();
    while (!release) await page.waitForTimeout(20);
    await dialog().getByRole('button', { name: '取消本次等待', exact: true }).click();
    assert.equal(await dialog().getByRole('textbox').inputValue(), '为什么这样建议？');
    assert(await dialog().getByText(/问题已保留；下次发送将开始新一轮问答/).isVisible());
    release(); release = undefined; await page.waitForTimeout(100);
    assert.equal(await dialog().getByRole('region', { name: '第1次回答', exact: true }).count(), 0);
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click({ timeout: 10000 });
    await dialog().getByRole('region', { name: '第1次回答', exact: true }).waitFor();
    assert.equal(calls.at(-1).conversationId, '');
    await dialog().getByRole('button', { name: '还需要核对哪些标签信息？', exact: true }).click(); delayNext = true;
    await dialog().getByRole('button', { name: '发送问题', exact: true }).click({ timeout: 10000 });
    await page.waitForFunction(() => !!document.querySelector('[role=dialog] [role=status]'));
    await dialog().getByRole('button', { name: '关闭食品助手', exact: true }).click();
    while (!release) await page.waitForTimeout(20); release(); await page.waitForTimeout(100);
    assert.equal(await dialog().count(), 0);
    const shared = await child.newPage(); shared.on('pageerror', e => errors.push(e.message)); await shared.goto(origin);
    await shared.getByRole('button', { name: '记录', exact: true }).click(); await shared.getByRole('button', { name: '查看详情', exact: true }).first().click();
    assert.equal(await shared.getByRole('region', { name: '食品助手', exact: true }).count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS 主动取消保留问题且重试重开对话、关闭/取消均丢弃迟到回答，子女无代问入口，无脚本异常');
  } finally { await browser?.close(); const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
})().catch(error => { console.error(error); process.exitCode = 1; });
