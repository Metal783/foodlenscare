/** 使用真实浏览器、真实中文图片和真实 OCR 模型完成回归检查。
 * 需要 playwright；可用 FLC_PLAYWRIGHT_PATH 指向其安装目录。
 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (target === root || target.startsWith(root + path.sep)) {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  }
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const external = [];
    const errors = [];
    page.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith('http://127.0.0.1:')) external.push(req.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/_qa/ocr-test.html`);
    await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.getElementById('probe').textContent), null, { timeout: 180000 });
    const report = await page.locator('#probe').textContent();
    console.log(report);
    if (!report.startsWith('PASS')) console.log(await page.evaluate(() => JSON.stringify(window.ocrResult)));
    if (!report.startsWith('PASS') || errors.length || external.length) throw new Error(JSON.stringify({ errors, external }));
    console.log('PASS: 全部引擎和模型从本地加载，未上传照片或调用外部识别服务。');
    const fixture = Buffer.from((await page.evaluate(() => window.ocrFixture)).split(',')[1], 'base64');
    const entries = process.argv.includes('--file') ? [pathToFileURL(path.join(root, 'FoodLensCare-standalone.html')).href] : ['/index.html', '/docs/index.html'];
    for (const entry of entries) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const app = await context.newPage();
      const appErrors = [];
      app.on('pageerror', error => appErrors.push(error.message));
      const origin = `http://127.0.0.1:${server.address().port}`;
      const fileMode = entry.startsWith('file:');
      await app.goto((fileMode ? entry : origin + entry) + '#/scan');
      await app.waitForFunction(() => window.FoodLensCare);
      await app.evaluate(() => { window.FoodLensCare.state.profile.voiceOn = false; window.FoodLensCare.state.profile.allergens = ['peanut']; });
      const read = async () => {
        await app.evaluate(() => window.FoodLensCare.ctx.navigate('scan'));
        const chooser = app.waitForEvent('filechooser');
        await app.getByRole('button', { name: '从相册里选一张配料表照片' }).click();
        await (await chooser).setFiles({ name: '配料表.png', mimeType: 'image/png', buffer: fixture });
        await app.getByRole('button', { name: /就用这张/ }).click();
        await app.waitForFunction(() => window.FoodLensCare.state.result?.photo.label.readingOnly, null, { timeout: 150000 });
        const text = await app.locator('#view').textContent();
        if (!text.includes('小麦') || !text.includes('花生') || !text.includes('照片识别全文')) throw new Error(entry + ': 真实照片未展示');
        if (await app.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('配料核对界面出现横向溢出');
        if (!text.includes('疑似') || !text.includes('过敏')) throw new Error(entry + ': 本机 OCR 过敏冲突未提示');
        if (await app.evaluate(() => JSON.parse(localStorage.getItem('flc.records.v1') || '[]').length)) throw new Error('查看照片不应自动记入摄入');
      };
      await read();
      console.log('PASS: ' + entry + ' 相册选图 → 确认 → 真实 OCR → 原文结果');
      if (!fileMode && entry === '/index.html') {
        await app.evaluate(() => window.FoodLensCare.ctx.navigate('scan'));
        const chooser = app.waitForEvent('filechooser');
        await app.getByRole('button', { name: '从相册里选一张配料表照片' }).click();
        await (await chooser).setFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: fixture });
        await app.getByRole('button', { name: /就用这张/ }).click();
        await app.waitForFunction(() => location.hash.includes('progress'));
        await app.evaluate(() => { location.hash = '#/home'; });
        await app.waitForFunction(() => !window.FoodLensCare.state.progressPhoto);
        await app.waitForTimeout(1500);
        if (!(await app.evaluate(() => location.hash)).includes('home')) throw new Error('浏览器离开进度页后被旧结果带回');
        console.log('PASS: 浏览器切换页面中断真实读取，旧结果不会覆盖页面');
        await read();
      }
      await app.getByRole('button', { name: '确认核对，重新查看提醒' }).click();
      if (!(await app.locator('#view').textContent()).includes('请先对照包装核对')) throw new Error('未经勾选应阻止提交');
      await app.locator('#review-ingredients').fill('配料：水、白砂糖。');
      await app.locator('#review-allergens').fill('');
      if (!(await app.locator('#review-unit').isVisible())) await app.getByText('填写营养表（可选）', { exact: true }).click();
      await app.locator('#review-unit').selectOption('ml');
      const nutrition = { energy: 100, protein: 1, fat: 2, saturatedFat: 0.5, carbohydrate: 8, sugar: 5, sodium: 100 };
      for (const [key, value] of Object.entries(nutrition)) await app.locator('#review-' + key).fill(String(value));
      await app.locator('#review-checked').check();
      await app.getByRole('button', { name: '确认核对，重新查看提醒' }).click();
      await app.waitForFunction(() => window.FoodLensCare.state.result.photo.label.nutritionConfirmed);
      if (await app.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('营养与摄入界面出现横向溢出');
      if (!(await app.locator('#view').textContent()).includes('如果吃这一份，还剩 20 g')) throw new Error('摄入前额度预览错误');
      await app.locator('#consumed-quantity').fill('50');
      await app.getByRole('button', { name: '我已吃了，记入今天' }).click();
      const saved = await app.evaluate(() => JSON.parse(localStorage.getItem('flc.records.v1')));
      if (saved.length !== 1 || saved[0].nutrients.sugar !== 2.5 || saved[0].servingUnit !== 'ml') throw new Error('实际食用份量换算错误');
      if (!(await app.locator('#view').textContent()).includes('已记录，还剩 22.5 g')) throw new Error('食用后额度重复扣减');
      await app.evaluate(() => window.FoodLensCare.ctx.navigate('result', {}, { force: true }));
      if (await app.evaluate(() => JSON.parse(localStorage.getItem('flc.records.v1')).length) !== 1) throw new Error('重看重复记录');
      console.log('PASS: ' + entry + ' 配料纠错 + 营养核对 + 50 毫升确认食用 + 额度仅扣一次');
      if (process.env.FLC_REVIEW_SCREENSHOT && entry.includes('/docs/')) await app.screenshot({ path: process.env.FLC_REVIEW_SCREENSHOT, fullPage: true });
      if (appErrors.length) throw new Error('页面运行异常：' + appErrors.join('; '));
      await app.evaluate(() => localStorage.removeItem('flc.records.v1'));
      if (fileMode) { await context.close(); continue; }
      await app.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      });
      await context.setOffline(true);
      await app.reload();
      await app.waitForFunction(() => window.FoodLensCare);
      await app.evaluate(() => { window.FoodLensCare.state.profile.voiceOn = false; window.FoodLensCare.state.profile.allergens = ['peanut']; });
      await read();
      console.log('PASS: ' + entry + ' 缓存后断网仍能真实识别');
      if (process.env.FLC_OCR_SCREENSHOT && entry.includes('/docs/')) await app.screenshot({ path: process.env.FLC_OCR_SCREENSHOT, fullPage: true });
      await context.close();
    }
    const shot = process.env.FLC_OCR_SCREENSHOT;
    if (shot) console.log('结果页截图：' + shot);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
