/** 数据清空标记与浏览器缓存回归，只使用临时数据库。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'C:/Users/GUAN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-reset-'));
  const server = spawn('python', ['-X', 'utf8', 'tools/family_server.py', '--port', '0', '--database', path.join(temporary, 'test.sqlite3')], { cwd: root, windowsHide: true, stdio: 'pipe' });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('服务启动超时')), 15000);
      server.stdout.on('data', chunk => { output += chunk; const match = output.match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      server.once('error', reject);
    });
    browser = await chromium.launch({ executablePath: process.env.FLC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext();
    const pages = [];
    for (const host of ['127.0.0.1', 'localhost']) {
      const page = await context.newPage();
      await page.goto(`http://${host}:${port}/`);
      await page.getByRole('button', { name: '手机号登录', exact: true }).waitFor();
      await page.evaluate(async () => {
        localStorage.setItem('foodlenscare.v4.guest.elderProfile', JSON.stringify({ name: '旧测试资料' }));
        localStorage.setItem('flc.profile.v1.test', '{}');
        localStorage.setItem('unrelated-key', 'keep');
        sessionStorage.setItem('foodlenscare.v4.guest.records', '[{"id":"old"}]');
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('foodlenscare.v4.records', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('records');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise(resolve => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ photoDataUrl: 'test-photo' }, 'guest:old'); tx.oncomplete = resolve; });
        db.close();
        await caches.open('flc-v4-paddle-v1');
      });
      pages.push(page);
    }
    fs.writeFileSync(path.join(temporary, 'browser-reset.json'), JSON.stringify({ id: 'isolated-reset' }));
    for (const page of pages) {
      await page.reload();
      await page.getByRole('button', { name: '手机号登录', exact: true }).waitFor();
      await page.waitForFunction(() => sessionStorage.getItem('foodlenscare.v4.browserReset') === 'isolated-reset');
      const result = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('foodlenscare.v4.records', 1); r.onsuccess = () => resolve(r.result); });
        const count = await new Promise(resolve => { const r = db.transaction('records').objectStore('records').count(); r.onsuccess = () => resolve(r.result); });
        db.close();
        return { count, old: localStorage.getItem('foodlenscare.v4.guest.elderProfile'), legacy: localStorage.getItem('flc.profile.v1.test'), session: sessionStorage.getItem('foodlenscare.v4.guest.records'), unrelated: localStorage.getItem('unrelated-key'), modelCache: (await caches.keys()).includes('flc-v4-paddle-v1') };
      });
      assert.deepEqual(result, { count: 0, old: null, legacy: null, session: null, unrelated: 'keep', modelCache: true });
      await page.evaluate(() => localStorage.setItem('foodlenscare.v4.guest.elderProfile', 'new-data'));
      await page.reload();
      await page.waitForFunction(() => document.querySelector('button'));
      assert.equal(await page.evaluate(() => localStorage.getItem('foodlenscare.v4.guest.elderProfile')), 'new-data');
      const fresh = await context.newPage();
      await fresh.goto(await page.url());
      await fresh.waitForFunction(() => sessionStorage.getItem('foodlenscare.v4.browserReset') === 'isolated-reset');
      assert.equal(await fresh.evaluate(() => localStorage.getItem('foodlenscare.v4.guest.elderProfile')), 'new-data');
      await fresh.close();
      console.log('PASS ' + new URL(await page.url()).hostname + ' 清理旧资料/照片/会话缓存，保留OCR及其他键，重开不重复清理新数据');
    }
  } finally {
    if (browser) await browser.close();
    const ended = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await ended;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
