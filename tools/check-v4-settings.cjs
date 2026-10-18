/** 修改意见验收：真实账号、主要联系人、家庭呼叫、120急救、双向解绑和双端退出。 */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let origin, checks = 0;
const pass = text => { checks++; console.log('PASS ' + text); };
async function api(context, endpoint, data, method) {
  const response = await context.request.fetch(origin + '/api' + endpoint, { method: method || (data ? 'POST' : 'GET'), data });
  const result = await response.json();
  if (!response.ok()) throw new Error(endpoint + ': ' + JSON.stringify(result));
  return result;
}
async function account(context, phone, role, name) {
  const code = await api(context, '/auth/code', { phone });
  await api(context, '/auth/login', { phone, code: code.testCode });
  return (await api(context, '/me', { role, profile: { name, phone, age: '68', diseases: ['糖尿病'], allergens: [], completed: true, healthConsent: true } }, 'PATCH')).user;
}
async function bind(elder, child, relation, primary) {
  const invite = await api(elder, '/family/invite', { role: 'elder' });
  const request = await api(child, '/family/join', { code: invite.code, relation });
  await api(elder, '/family/' + request.id, { status: 'bound', records_allowed: true, profile_allowed: true, is_primary: primary }, 'PATCH');
  return request.id;
}
async function guard(page) {
  await page.getByRole('button', { name: '我的设置', exact: true }).click();
  await page.getByRole('button', { name: /子女守护/ }).click();
}
(async () => {
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-v4-settings-'));
  const server = spawn('python', ['-X', 'utf8', path.join(root, 'tools/family_server.py'), '--port', String(port), '--database', path.join(temporary, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'pipe' });
  origin = 'http://127.0.0.1:' + port;
  for (let n = 0; n < 100; n++) { try { await fetch(origin + '/api/status'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [];
  const elderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const childContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // 外部字体服务在本机可能长期不响应；验收使用原CSS已有的系统字体回退，确保截图文字可见。
  for (const context of [elderContext, childContext, otherContext]) await context.route('**/static.figma.com/font/**', route => route.abort());
  const elder = await elderContext.newPage(), child = await childContext.newPage(), other = await otherContext.newPage();
  for (const page of [elder, child, other]) page.on('pageerror', e => errors.push(e.message));
  try {
    const elderAccount = await account(elderContext, '13800410001', 'elder', '验收老人');
    await account(childContext, '13800410002', 'child', '验收第一位子女');
    await account(otherContext, '13800410003', 'child', '验收第二位子女');
    await bind(elderContext, childContext, '女儿', true); const otherFamily = await bind(elderContext, otherContext, '儿子', false);
    await api(elderContext, '/records', { record: { id: 'settings-test-record', at: new Date().toISOString(), productName: '验收食品', meal: '早餐', label: { ingredientText: '小麦粉、白砂糖', readingOnly: true }, assessment: { level: 'gray', headline: '待核对', advice: '验收内容', diseaseReminders: [{condition:'diabetes',title:'糖尿病 · 糖份与碳水提醒',message:'验收时保存的糖份核对提醒'}] } } });
    await elder.goto(origin); await elder.getByRole('button', { name: '健康记录', exact: true }).click();
    await elder.getByText('验收食品', { exact: true }).waitFor(); assert.ok(!(await elder.locator('body').innerText()).includes('早餐')); pass('老人列表隐藏旧记录中的餐次');
    await elder.getByRole('button', { name: /验收食品/ }).first().click(); assert.ok(!(await elder.locator('body').innerText()).includes('早餐')); pass('老人详情隐藏餐次');
    await elder.locator('.detail-content').getByText('验收时保存的糖份核对提醒',{exact:false}).waitFor(); pass('老人历史详情保留当时保存的疾病提醒');
    await elder.goto(origin); await guard(elder);
    await elder.getByRole('button', { name: /儿子 · 验收第二位子女/ }).click();
    for (const width of [320,430]) { await elder.setViewportSize({width,height:844}); assert.ok(await elder.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); } pass('主要联系人弹窗在320和430宽度无横向溢出'); await elder.setViewportSize({width:390,height:844});
    await elder.getByRole('button', { name: '设为主要联系人', exact: true }).click();
    await elder.getByText('主要联系人已更新，呼叫家人将联系此人。', { exact: false }).waitFor();
    const family = (await api(elderContext, '/family')).families;
    assert.equal(family.filter(f => f.is_primary).length, 1); assert.equal(family.find(f => f.is_primary).id, otherFamily); pass('老人通过界面切换主要联系人，服务端保持唯一');
    await elder.getByRole('button', { name: '我的设置', exact: true }).click(); await elder.getByRole('button', { name: '拍照识别', exact: true }).click();
    await elder.getByRole('button', { name: /呼叫儿子/ }).click(); await elder.getByRole('heading', { name: '给儿子验收第二位子女打电话？', exact: true }).waitFor(); pass('呼叫家人使用设置中选定的新主要联系人');
    await elder.screenshot({ path: path.join(root, '_qa/第四版截图/11-呼叫主要联系人.png'), fullPage: true });
    await elder.getByRole('button', { name: '确认呼叫', exact: true }).click(); await elder.getByText('无法打开系统电话，请使用手机电话手动拨打联系人号码', { exact: true }).waitFor(); pass('电脑不伪造已拨通电话');
    await elder.getByRole('button', { name: '取消', exact: true }).click();
    await elder.getByRole('button', { name: /紧急求助/ }).click(); await elder.getByRole('heading', { name: '是否拨打急救电话120？', exact: true }).waitFor();
    assert.ok(!(await elder.getByRole('dialog').innerText()).includes('验收第二位子女'));
    await elder.screenshot({ path: path.join(root, '_qa/第四版截图/15-紧急求助120.png'), fullPage: true });
    await elder.getByRole('button', { name: '确认拨打120', exact: true }).click(); await elder.getByText('无法打开系统电话，请使用手机电话手动拨打120', { exact: true }).waitFor(); pass('紧急求助固定120，与主要联系人分开，电脑如实提示手动拨打');
    await elder.getByRole('button', { name: '取消', exact: true }).click(); await guard(elder);
    await elder.getByRole('button', { name: /儿子 · 验收第二位子女/ }).click(); await elder.getByRole('button', { name: '解除绑定', exact: true }).click();
    await elder.getByRole('button', { name: '取消', exact: true }).click(); assert.equal((await api(elderContext, '/family')).families.length, 2); pass('取消解绑不改变家庭关系');
    await elder.getByRole('button', { name: /儿子 · 验收第二位子女/ }).click(); await elder.getByRole('button', { name: '解除绑定', exact: true }).click();
    await elder.screenshot({ path: path.join(root, '_qa/第四版截图/12-老人解除绑定确认.png'), fullPage: true });
    await elder.getByRole('button', { name: '确认解除绑定', exact: true }).click(); await elder.getByText('已解除绑定。', { exact: false }).waitFor();
    assert.equal((await api(otherContext, '/family')).families.length, 0); assert.equal((await api(elderContext, '/family')).families.find(f => f.is_primary).member.name, '验收第一位子女'); pass('老人界面解绑并由剩余家人接任主要联系人');
    await child.goto(origin); await child.getByRole('button', { name: '记录', exact: true }).click(); await child.getByRole('heading', { name: '验收食品', exact: true }).waitFor({ timeout: 15000 });
    assert.ok(!(await child.locator('body').innerText()).includes('早餐')); pass('子女列表隐藏旧记录中的餐次');
    await child.getByRole('button', { name: '查看详情', exact: true }).click(); assert.ok(!(await child.locator('body').innerText()).includes('早餐')); pass('子女详情隐藏餐次');
    await child.getByRole('button', { name: '返回', exact: true }).click(); await child.getByRole('button', { name: '家人', exact: true }).click(); await child.getByRole('button', { name: '解除绑定', exact: true }).click();
    await child.screenshot({ path: path.join(root, '_qa/第四版截图/13-子女解除绑定确认.png'), fullPage: true });
    for (const width of [320,430]) { await child.setViewportSize({width,height:844}); assert.ok(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); } pass('子女解绑弹窗在320和430宽度无横向溢出'); await child.setViewportSize({width:390,height:844});
    await child.getByRole('button', { name: '确认解除绑定', exact: true }).click(); await child.getByRole('heading', { name: '尚未绑定家人', exact: true }).waitFor();
    assert.equal((await api(elderContext, '/family')).families.length, 0); assert.equal((await api(elderContext, '/records')).records.length, 1); pass('子女界面解除绑定，老人原始记录保留');
    await child.getByRole('button', { name: '记录', exact: true }).click(); assert.equal(await child.locator('.child-food-card').count(), 0); pass('解绑后子女页面清除共享记录');
    await elder.goto(origin); await elder.getByRole('button', { name: /添加家人/ }).waitFor(); await elder.getByRole('button', { name: /紧急求助/ }).click(); await elder.getByRole('heading', { name: '是否拨打急救电话120？', exact: true }).waitFor(); assert.ok(await elder.getByRole('button', { name: '确认拨打120', exact: true }).isEnabled()); pass('全部解绑后120求助仍可用，家庭入口不使用旧联系人');
    await elder.getByRole('button', { name: '取消', exact: true }).click(); await elder.getByRole('button', { name: '我的设置', exact: true }).click();
    await elder.getByRole('button', { name: '退出登录', exact: true }).click(); await elder.screenshot({ path: path.join(root, '_qa/第四版截图/14-退出登录确认.png'), fullPage: true }); await elder.getByRole('button', { name: '确认退出', exact: true }).click(); await elder.getByRole('button', { name: '手机号登录', exact: true }).waitFor(); assert.ok(await elder.getByRole('button', { name: '微信登录', exact: true }).isVisible());
    await elder.screenshot({ path: path.join(root, '_qa/第四版截图/16-退出回到登录方式选择.png'), fullPage: true });
    assert.equal((await api(elderContext, '/me')).user, null); pass('老人退出后回到可选择手机号和微信登录的欢迎页，会话失效');
    await elder.goBack(); assert.ok(!(await elder.locator('body').innerText()).includes('验收食品')); pass('退出后浏览器后退不恢复私人页面');
    await child.getByRole('button', { name: '我的', exact: true }).click(); await child.getByRole('button', { name: '退出登录', exact: true }).click(); await child.getByRole('button', { name: '确认退出', exact: true }).click(); await child.getByRole('button', { name: '手机号登录', exact: true }).waitFor(); assert.ok(await child.getByRole('button', { name: '微信登录', exact: true }).isVisible());
    assert.equal((await api(childContext, '/me')).user, null); pass('子女退出后回到可选择手机号和微信登录的欢迎页，会话失效');
    assert.deepEqual(errors, []); pass('修改意见相关页面没有未处理脚本异常');
    console.log('修改意见设置验收：' + checks + '项通过');
  } finally {
    await browser.close(); const stopped = new Promise(r => server.once('exit', r)); server.kill(); await stopped;
    const target = path.resolve(temporary); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(target, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
