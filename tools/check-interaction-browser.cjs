/** IndexedDB 使用真实时间验证，避免 dump-dom 虚拟时钟提前结束照片事务。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + requested);
  if (!target.startsWith(root + path.sep)) return res.writeHead(404).end();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  fs.readFile(target, (error, data) => { if (error) return res.writeHead(404).end(); res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    // 截获系统选择器，让测试自行派发 change/cancel，不由无头浏览器自动取消。
    page.on('filechooser', () => {});
    await page.goto(`http://127.0.0.1:${server.address().port}/_qa/interaction-test.html`);
    try {
      await page.waitForFunction(() => /小计：|^ERROR:|^REJECT:/.test(document.getElementById('probe').textContent), null, { timeout: 120000 });
    } catch (error) {
      console.error(await page.locator('#probe').textContent());
      throw error;
    }
    const report = await page.locator('#probe').textContent();
    console.log(report);
    if (!report.includes('失败 0')) throw new Error('交互回归未通过');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
