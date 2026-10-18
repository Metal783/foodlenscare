/** 在临时数据库中验证真实页面与两账号联动，不向正式家庭数据写测试记录。 */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
process.env.DEEPSEEK_API_KEY = '';
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const selectBirthday = require('./select-birthday.cjs');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
let origin;
const shots = path.join(root, '_qa', '第四版截图'); fs.mkdirSync(shots, { recursive: true });
let checks = 0;
const pass = text => { console.log('PASS ' + text); checks++; };
async function post(context, url, data, method = 'POST') { const response = await context.request.fetch(origin + '/api' + url, { method, data }); const value = await response.json(); if (!response.ok()) throw new Error(url + ': ' + JSON.stringify(value)); return value; }
async function account(context, phone, role, name) { const { testCode } = await post(context, '/auth/code', { phone }); await post(context, '/auth/login', { phone, code: testCode }); return (await post(context, '/me', { role, profile: { name, phone, age: '68', diseases: [], allergens: ['花生'], completed: true, healthConsent: true } }, 'PATCH')).user; }
async function signIn(page, phone, role, name) {
  await page.goto(origin); await page.getByRole('button', { name: '手机号登录', exact: true }).click();
  await page.getByPlaceholder('请输入11位手机号').fill(phone);
  await page.getByRole('button', { name: '获取验证码', exact: true }).click();
  await page.getByText(/本地测试验证码：\d{6}/).waitFor();
  const code = (await page.locator('body').innerText()).match(/本地测试验证码：(\d{6})/)[1];
  await page.getByPlaceholder('输入验证码').fill(code); await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('radio', { name: role === 'elder' ? /我是老人/ : /我是子女/ }).click();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.locator(role === 'elder' ? '#elder-name' : '#child-name').waitFor({timeout:15000});
  await page.locator(role === 'elder' ? '#elder-name' : '#child-name').fill(name);
  if (role === 'elder') {
    await selectBirthday(page, 'elder-birth-date', '1958-01-01'); assert(await page.locator('#elder-age').evaluate(e => e.readOnly)); await page.getByRole('button',{name:'花生',exact:true}).click(); await page.getByRole('button',{name:'糖尿病',exact:true}).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'完成设置，开始使用',exact:true}).click();
    await page.getByRole('button',{name:'我的设置',exact:true}).waitFor();
  } else {
    await page.getByRole('button',{name:'暂时跳过',exact:true}).click();
    await page.getByRole('heading',{name:'已跳过基础信息设置',exact:true}).waitFor();
    await page.locator('.dialog-card button').click();
    await page.getByRole('heading',{name:/早上好|下午好|晚上好/}).waitFor();
    await page.getByRole('button',{name:'我的',exact:true}).click();
    await page.getByRole('button',{name:'修改个人信息',exact:true}).click();
    await page.getByLabel('姓名／称呼').fill(name);
    await page.getByRole('button',{name:'保存修改',exact:true}).click();
    await page.getByRole('button',{name:'首页',exact:true}).click();
  }
  pass(role + '实际登录、验证码和资料保存');
}
async function screenshot(page, filename) { await page.screenshot({ path: path.join(shots,filename), fullPage:true }); }
(async () => {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve)); const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'flc-v4-browser-'));
  const server=spawn('python',['-X','utf8',path.join(root,'tools','family_server.py'),'--port',String(port),'--database',path.join(temporary,'test.sqlite3')],{cwd:root,windowsHide:true,stdio:'pipe'});
  origin='http://127.0.0.1:'+port;
  for(let attempt=0;attempt<100;attempt++) { try { await fetch(origin+'/api/status'); break; } catch { await new Promise(resolve=>setTimeout(resolve,100)); } }
  const browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const errors = []; const externalOcr = [];
  const elderContext = await browser.newContext({viewport:{width:390,height:844}}), childContext = await browser.newContext({viewport:{width:390,height:844}});
  const elder = await elderContext.newPage(), child = await childContext.newPage();
  for (const page of [elder, child]) { page.on('pageerror',error => errors.push(error.message)); page.on('request',request => { if (request.url().includes('paddle') && !request.url().startsWith(origin)) externalOcr.push(request.url()); }); page.on('dialog',dialog => dialog.accept()); }
  try {
    const deniedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await deniedContext.addInitScript(() => {
        if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('isolated denied camera', 'NotAllowedError'); };
      });
      const denied = await deniedContext.newPage();
      await denied.goto(origin);
      await denied.getByRole('button',{name:'暂时跳过',exact:true}).click(); await denied.getByRole('button',{name:'继续',exact:true}).click(); await denied.getByRole('button',{name:'暂时跳过基础信息设置',exact:true}).click();
      await denied.getByRole('button',{name:'拍照识别食品标签',exact:true}).click();
      await denied.getByText('无法使用相机',{exact:true}).waitFor();
      assert.equal(await denied.getByRole('group',{name:'演示识别结果',exact:true}).count(),0);
      assert.equal(await denied.getByRole('button',{name:/演示成功|演示未看清标签|使用演示照片/}).count(),0);
      const fileChooser = denied.waitForEvent('filechooser');
      await denied.getByRole('button',{name:'选择照片',exact:true}).click();
      assert.equal((await fileChooser).isMultiple(),false);
      assert.ok(!(await denied.locator('body').innerText()).includes('演示照片'));
      pass('相机拒绝权限时仅提供重试和选择本人照片，无演示识别入口');
    } finally { await deniedContext.close(); }
    await elder.goto(origin); await screenshot(elder,'01-欢迎.png');
    await elder.getByRole('button',{name:'暂时跳过',exact:true}).click(); await elder.getByRole('button',{name:'继续',exact:true}).click(); await elder.getByRole('button',{name:'暂时跳过基础信息设置',exact:true}).click();
    await elder.getByRole('button',{name:'我的设置',exact:true}).click(); await elder.getByRole('button',{name:/子女守护/}).click(); await elder.getByRole('button',{name:'＋ 添加家人',exact:true}).click();
    assert.equal(await elder.locator('.binding-code-card strong').innerText(),'请先登录'); await elder.getByRole('button',{name:'登录后生成绑定码',exact:true}).click(); await elder.getByPlaceholder('请输入11位手机号').waitFor(); pass('游客明确显示登录提示并能跳转登录');
    await signIn(elder, '13800180011', 'elder', '测试老人');
    await screenshot(elder,'02-老人首页.png');
    await signIn(child, '13800180012', 'child', '测试子女');
    assert.ok(!(await child.locator('body').innerText()).includes('李阿姨')); pass('子女概览不显示固定示例人物与次数');
    await elder.getByRole('button',{name:'我的设置',exact:true}).click();
    await elder.getByRole('button',{name:/子女守护/}).click();
    await elder.getByRole('button',{name:'＋ 添加家人',exact:true}).click();
    await elder.locator('.binding-code-card strong').waitFor();
    await elder.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.querySelector('.binding-code-card strong')?.textContent || ''));
    const bindingCode = await elder.locator('.binding-code-card strong').innerText();
    assert.equal(await elder.getByPlaceholder('输入或粘贴绑定码').count(),0);
    assert.equal(await elder.getByRole('button',{name:'下一步，确认家人身份',exact:true}).count(),0);
    await elder.getByRole('heading',{name:'收到的绑定申请',exact:true}).waitFor();
    await screenshot(elder,'23-老人仅生成邀请码与确认申请.png');
    pass('老人绑定页仅提供邀请码和收到的申请，无反向填写入口');
    assert.match(bindingCode,/^\d{6}$/); assert.match(await elder.locator('.binding-code-card').innerText(),/5分钟有效/); pass('老人绑定页显示随机6位码及5分钟倒计时');
    await elderContext.route('**/api/family/invite',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'隔离测试：生成服务暂不可用'})}));
    await elder.getByRole('button',{name:'重新生成绑定码',exact:true}).click(); await elder.getByText('隔离测试：生成服务暂不可用',{exact:true}).first().waitFor(); pass('邀请码生成失败显示真实错误');
    await elderContext.unroute('**/api/family/invite'); await elder.getByRole('button',{name:'重新生成绑定码',exact:true}).click(); await elder.waitForFunction(old=>/^\d{6}$/.test(document.querySelector('.binding-code-card strong')?.textContent||'') && document.querySelector('.binding-code-card strong').textContent!==old,bindingCode);
    const freshCode=await elder.locator('.binding-code-card strong').innerText(); pass('老人可主动重新生成绑定码');
    await child.getByRole('button',{name:'家人',exact:true}).click(); await child.getByRole('button',{name:'添加家人',exact:true}).click();
    await child.getByPlaceholder('输入老人绑定码').fill(freshCode); await child.getByRole('button',{name:'下一步：发送绑定申请',exact:true}).click();
    await child.getByRole('heading',{name:'绑定申请待确认',exact:true}).waitFor(); pass('子女实际发送绑定申请，未冒充已绑定');
    await elder.getByRole('button',{name:/女儿 · 测试子女/}).click({timeout:15000});
    await elder.getByRole('switch',{name:'授权食物识别记录',exact:true}).click();
    await elder.getByRole('button',{name:/确认绑定/}).click();
    await elder.getByRole('heading',{name:'子女守护',exact:true}).waitFor(); pass('老人本人确认绑定并分别选择共享范围');
    await child.getByRole('heading',{name:'已绑定家人',exact:true}).waitFor({timeout:15000});
    await screenshot(child,'03-子女家人管理.png');
    await elder.getByRole('button',{name:'我的设置',exact:true}).click(); await elder.getByRole('button',{name:'拍照识别',exact:true}).click();
    await elder.getByRole('button',{name:'拍照识别食品标签',exact:true}).click();
    assert.equal(await elder.getByRole('group',{name:'演示识别结果',exact:true}).count(),0);
    assert.equal(await elder.getByRole('button',{name:/演示成功|演示未看清标签|使用演示照片/}).count(),0);
    const fixture = await elder.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width=1400; canvas.height=700; const c=canvas.getContext('2d'); c.fillStyle='white'; c.fillRect(0,0,1400,700); c.fillStyle='#111'; c.font='48px "Microsoft YaHei",sans-serif'; ['产品名称：花生饼干','配料：小麦粉、白砂糖、花生、食用盐。','过敏原信息：含有小麦和花生。','净含量：200克','营养成分表 每100克','能量 1800千焦','蛋白质 8克','脂肪 18克','碳水化合物 65克','钠 220毫克'].forEach((line,i)=>c.fillText(line,50,65+i*62)); return canvas.toDataURL('image/png'); });
    await elder.locator('input[type=file]').setInputFiles({name:'测试包装.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')});
    await elder.getByRole('heading',{name:'本次识别结果',exact:true}).waitFor({timeout:180000});
    const text = await elder.locator('body').innerText(); assert.match(text,/花生/); assert.match(text,/不建议食用/); assert.ok(!text.includes('原味燕麦片')); pass('真实PaddleOCR读取中文包装并触发本人过敏规则');
    const ingredientCard = elder.locator('.recognition-card').filter({ has: elder.getByRole('heading', { name: '识别到的成分', exact: true }) });
    assert.ok(!(await ingredientCard.innerText()).includes('过敏原信息：')); pass('配料区不再显示额外过敏原信息行');
    assert.equal(externalOcr.length,0); pass('OCR引擎和模型从本机加载');
    assert.equal((await (await elderContext.request.get(origin+'/api/records')).json()).records.length,0);
    const firstElderId=(await (await elderContext.request.get(origin+'/api/me')).json()).user.id;
    assert.equal((await (await childContext.request.get(origin+'/api/records?elder='+firstElderId)).json()).records.length,0); pass('识别完成不自动入库，双方都没有未保存记录');
    assert.equal(await elder.getByRole('region',{name:'食用建议'}).getByRole('heading').innerText(),'不建议食用'); assert.equal(await elder.getByRole('heading',{name:'结合您的已有设置',exact:true}).count(),0); pass('结果先显示食用建议且移除重复设置区块');
    await elder.getByRole('button',{name:'保存记录',exact:true}).click(); await elder.getByText('已保存识别历史；尚未计为实际食用',{exact:true}).waitFor(); assert.ok(await elder.getByRole('button',{name:'已保存',exact:true}).isDisabled()); pass('本人点击保存后入库且防止重复保存');
    const ownRecords = (await (await elderContext.request.get(origin+'/api/records')).json()).records;
    assert.ok(ownRecords[0].label.allergenDeclaration.includes('花生')); pass('过敏原声明仍保存用于识别和安全分析');
    assert.equal(ownRecords.length,1); assert.ok(ownRecords[0].photoDataUrl.startsWith('data:image/')); assert.equal(ownRecords[0].consumption,undefined); pass('真实照片与识别历史已持久保存，未自动计入食用');
    await screenshot(elder,'04-真实识别结果.png');
    for(const width of [320,430]) { await elder.setViewportSize({width,height:844}); assert.ok(await elder.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'识别结果横向溢出'); pass(width+'px 真实风险结果无横向溢出'); }
    await elder.setViewportSize({width:390,height:844});
    await child.getByRole('button',{name:'记录',exact:true}).click(); await child.getByRole('button',{name:'查看详情',exact:true}).waitFor({timeout:15000}); await child.getByRole('button',{name:'查看详情',exact:true}).click();
    assert.match(await child.locator('body').innerText(),/花生/); assert.match(await child.locator('body').innerText(),/饮食资料未授权，暂无法查看个性化分析/); pass('授权后子女可看真实照片和记录，未授权的资料保持隐藏');
    assert.ok(!(await child.locator('body').innerText()).includes('糖尿病')); assert.ok(!(await child.locator('body').innerText()).includes('餐次')); pass('未授权疾病提醒不外泄，子女详情不显示餐次');
    await screenshot(child,'05-子女记录详情.png');
    for(const width of [320,430]) { await child.setViewportSize({width,height:844}); assert.ok(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'子女详情横向溢出'); pass(width+'px 子女真实详情无横向溢出'); }
    await child.setViewportSize({width:390,height:844});
    // Keep real recipient receipts pending until the sender-only assertion is complete.
    // The recipient's background poll may otherwise legitimately acknowledge first.
    let allowRecipientReceipts;
    const receiptGate = new Promise(resolve => { allowRecipientReceipts = resolve; });
    await elder.route('**/api/voices/*/receipt', async route => { await receiptGate; await route.continue(); });
    await child.getByRole('button',{name:/发送语音提醒/}).click(); await child.getByRole('button',{name:'开始录音',exact:true}).last().click(); await child.getByText('正在录音',{exact:true}).waitFor();
    await child.waitForTimeout(1500); await child.getByRole('button',{name:'停止录音',exact:true}).last().click(); await child.getByText('录制完成 · 待发送',{exact:true}).waitFor();
    await child.getByRole('button',{name:'试听',exact:true}).click(); await child.getByRole('button',{name:/发送给测试老人/}).click();
    await child.getByRole('heading',{name:'关怀语音已发送',exact:true}).waitFor(); pass('实际MediaRecorder录音、试听和发送');
    const before = (await (await childContext.request.get(origin+'/api/voices')).json()).messages[0]; assert.equal(before.deliveredAt,null); assert.equal(before.playedAt,null); pass('发送端不伪造送达或播放');
    allowRecipientReceipts();
    await child.getByRole('button',{name:'完成',exact:true}).click();
    await elder.getByRole('button',{name:'返回',exact:true}).click();
    await elder.getByRole('button',{name:'播放关怀语音',exact:true}).waitFor({timeout:15000}); await elder.getByRole('button',{name:'播放关怀语音',exact:true}).click();
    await child.waitForTimeout(5500);
    const after = (await (await childContext.request.get(origin+'/api/voices')).json()).messages[0]; assert.ok(after.deliveredAt); assert.ok(after.playedAt); pass('接收端实际播放产生服务端送达和播放回执');
    await screenshot(elder,'06-老人收到语音.png');
    await elder.getByRole('button',{name:'我的设置',exact:true}).click(); await elder.getByRole('button',{name:/子女守护/}).click();
    await elder.getByRole('switch',{name:'与家人共享记录',exact:true}).click(); await elder.getByRole('button',{name:'确认关闭',exact:true}).click();
    await child.getByRole('button',{name:'记录',exact:true}).click(); await child.getByRole('heading',{name:'食物记录尚未授权',exact:true}).waitFor({timeout:15000}); assert.equal(await child.locator('.child-food-card').count(),0); pass('撤回共享后清除子女页面旧记录');
    await screenshot(child,'07-撤回共享.png');
    await elder.getByRole('switch',{name:'与家人共享记录',exact:true}).click();
    await elder.getByRole('checkbox',{name:'食物识别记录',exact:true}).check(); await elder.getByRole('checkbox',{name:'饮食相关资料',exact:true}).check();
    await elder.getByRole('button',{name:'确认授权',exact:true}).click();
    await child.getByRole('button',{name:'查看详情',exact:true}).waitFor({timeout:15000}); await child.getByRole('button',{name:'查看详情',exact:true}).click();
    assert.match(await child.getByRole('region',{name:'食用建议'}).innerText(),/过敏原线索：花生/); pass('独立打开资料授权后显示当时保存的过敏风险，不重复展示设置');
    await child.getByRole('button',{name:'返回',exact:true}).click(); await child.getByRole('button',{name:'选择日期',exact:true}).click();
    await child.getByRole('button',{name:'确定',exact:true}).click(); assert.equal(await child.locator('.child-food-card').count(),1); pass('日期筛选操作实际记录');
    await child.getByRole('button',{name:'我的',exact:true}).click();
    assert.equal(await child.getByRole('switch',{name:/语音送达通知|语音播放通知/}).count(),0);
    await child.getByRole('switch',{name:'允许通知',exact:true}).waitFor(); pass('通知设置仅保留允许通知开关，不再提供语音通知开关');
    await child.getByRole('button',{name:'修改个人信息',exact:true}).click(); await child.locator('.child-readonly-field button').first().click();
    await child.getByPlaceholder('输入11位手机号码').fill('13800180014'); await child.getByRole('button',{name:'获取本地测试验证码',exact:true}).click();
    const newCode=(await child.locator('.child-demo-code').innerText()).match(/验证码：(\d{6})/)[1]; await child.getByPlaceholder('输入6位验证码').fill(newCode); await child.getByRole('button',{name:'确认验证新号码',exact:true}).click();
    await child.getByRole('button',{name:'保存修改',exact:true}).click(); await child.getByRole('heading',{name:'我的设置',exact:true}).waitFor();
    assert.equal((await (await childContext.request.get(origin+'/api/me')).json()).user.phone,'13800180014'); pass('修改手机号的原弹窗连接服务验证并保存');
    await child.getByRole('button',{name:'家人',exact:true}).click(); await child.getByRole('button',{name:'申请更正关系',exact:true}).click();
    await child.getByRole('radio',{name:'儿子',exact:true}).click(); await child.getByRole('button',{name:'发起关系更正',exact:true}).click();
    await elder.getByRole('button',{name:/女儿 · 测试子女/}).click(); await elder.getByRole('button',{name:'确认更正',exact:true}).waitFor({timeout:15000}); await elder.getByRole('button',{name:'确认更正',exact:true}).click();
    await elder.getByRole('button',{name:/儿子 · 测试子女/}).waitFor();
    assert.equal((await (await elderContext.request.get(origin+'/api/family')).json()).families[0].relation,'儿子'); pass('双方真实界面完成关系更正确认');
    await elder.getByRole('button',{name:'我的设置',exact:true}).click(); await elder.getByRole('button',{name:/字体大小/}).click(); await elder.getByRole('radio',{name:'大字',exact:true}).click(); await elder.getByRole('button',{name:'确认使用大字',exact:true}).click();
    await screenshot(elder,'08-大字号设置.png'); assert.equal((await (await elderContext.request.get(origin+'/api/me')).json()).user.prefs.fontSize,'large'); pass('三档字号连接账号偏好');
    await elder.getByRole('button',{name:'修改个人信息',exact:true}).click(); await elder.getByRole('textbox').first().fill('测试老人修改'); await elder.getByRole('button',{name:'保存修改',exact:true}).click();
    await elder.getByRole('heading',{name:'我的设置',exact:true}).waitFor();
    assert.equal((await (await elderContext.request.get(origin+'/api/me')).json()).user.profile.name,'测试老人修改'); pass('老人资料编辑保存真实账号');
    await elder.reload(); await elder.getByRole('button',{name:'健康记录',exact:true}).click(); await elder.getByText(/花生饼干/).first().waitFor(); pass('刷新后恢复账号、记录和照片');
    for (const width of [320,430]) { await elder.setViewportSize({width,height:844}); await child.setViewportSize({width,height:844}); for (const [p,name] of [[elder,'老人记录'],[child,'子女记录']]) { assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+'横向溢出'); pass(width+'px '+name+'无横向溢出'); } }
    await elder.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.ok(await elder.evaluate(async()=>{for(const key of await caches.keys()){const cache=await caches.open(key);if((await cache.keys()).some(request=>new URL(request.url).pathname.startsWith('/api/')))return false;}return true;})); pass('离线缓存没有家庭API或私人响应');
    const secondContext=await browser.newContext({viewport:{width:390,height:844}});
    const secondId=await account(secondContext,'13800180013','elder','测试另一位老人');
    const secondInvite=await post(secondContext,'/family/invite',{role:'elder'});
    const secondBinding=await post(childContext,'/family/join',{code:secondInvite.code,relation:'儿子'});
    await post(secondContext,'/family/'+secondBinding.id,{status:'bound',records_allowed:true,profile_allowed:false},'PATCH');
    await post(secondContext,'/records',{record:{...ownRecords[0],id:'second-elder-test',productName:'测试另一位食品',label:{...ownRecords[0].label,productName:'测试另一位食品'}}});
    await child.getByRole('button',{name:'首页',exact:true}).click(); await child.getByRole('button',{name:/切换/}).click();
    await child.getByRole('button',{name:/测试另一位老人/}).click({timeout:15000});
    await child.getByRole('button',{name:'记录',exact:true}).click(); await child.getByRole('heading',{name:'测试另一位食品',exact:true}).waitFor({timeout:15000});
    assert.ok(!(await child.locator('body').innerText()).includes('花生饼干')); pass('多老人切换按授权读取并清除上一位快照'); await secondContext.close();
    await post(elderContext,'/auth/logout',{}); await elder.goto(origin);
    await elder.getByRole('button',{name:'暂时跳过',exact:true}).click(); await elder.getByRole('button',{name:'继续',exact:true}).click();
    await elder.locator('#elder-name').fill('测试离线游客'); await elder.getByRole('button',{name:'花生',exact:true}).click(); await elder.getByRole('checkbox').check(); await elder.getByRole('button',{name:'完成设置，开始使用',exact:true}).click();
    await elder.getByRole('button',{name:'健康记录',exact:true}).waitFor();
    await elderContext.setOffline(true); await elder.reload();
    await elder.getByRole('button',{name:'暂时跳过',exact:true}).click(); await elder.getByRole('button',{name:'继续',exact:true}).click(); await elder.getByRole('button',{name:'暂时跳过基础信息设置',exact:true}).click();
    await elder.getByRole('button',{name:'拍照识别食品标签',exact:true}).click();
    await elder.locator('input[type=file]').setInputFiles({name:'测试离线包装.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')});
    await elder.getByRole('heading',{name:'本次识别结果',exact:true}).waitFor({timeout:180000}); assert.match(await elder.locator('body').innerText(),/花生/); await elder.getByRole('button',{name:'保存记录',exact:true}).click(); await elder.getByText('已保存识别历史；尚未计为实际食用',{exact:true}).waitFor(); pass('断网重载公共页面后游客完成真实本机OCR并手动保存');
    await elder.getByRole('button',{name:'返回',exact:true}).click(); await elder.getByRole('button',{name:'健康记录',exact:true}).click(); await elder.getByText(/花生饼干/).first().waitFor();
    await elder.reload(); await elder.getByRole('button',{name:'暂时跳过',exact:true}).click(); await elder.getByRole('button',{name:'继续',exact:true}).click(); await elder.getByRole('button',{name:'暂时跳过基础信息设置',exact:true}).click(); await elder.getByRole('button',{name:'健康记录',exact:true}).click();
    await elder.getByText(/花生饼干/).first().waitFor(); assert.equal(await elder.locator('img[src^="data:image/"]').count(),1); pass('游客离线照片与记录通过IndexedDB恢复');
    await elderContext.setOffline(false);
    assert.deepEqual(errors,[]); pass('浏览器无未处理脚本异常');
    console.log('第四版浏览器检查：'+checks+'项通过');
  } catch(error) { await screenshot(elder,'失败-老人.png'); await screenshot(child,'失败-子女.png'); console.error('老人页面：'+await elder.locator('body').innerText()); console.error('子女页面：'+await child.locator('body').innerText()); console.error(errors); throw error; }
  finally { await browser.close(); server.kill(); await new Promise(resolve=>server.once('exit',resolve)); fs.rmSync(temporary,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1});
