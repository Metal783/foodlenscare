/** 真实浏览器验证旧缓存迁移、在线更新、断网读取和个人数据保留。 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let apiReads = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/legacy-sw.js') {
    const key = JSON.stringify(url.searchParams.get('key'));
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-store' });
    return res.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&!new URL(e.request.url).pathname.startsWith('/api/')) e.respondWith(caches.open(${key}).then(async c=>(await c.match(e.request))||fetch(e.request)));});`);
  }
  if (url.pathname === '/api/cache-probe') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ count: ++apiReads }));
  }
  const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (filename !== root && !filename.startsWith(root + path.sep)) return res.writeHead(404).end();
  const file = fs.existsSync(filename) && fs.statSync(filename).isDirectory() ? path.join(filename, 'index.html') : filename;
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    const types = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let checks = 0;
  const pass = label => { checks++; console.log('PASS ' + label); };
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const entry of ['/index.html', '/docs/index.html']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // 先在同源无注册页面写入旧页面与模型，模拟已有旧缓存的设备。
      await page.goto(origin + '/api/cache-probe');
      const prefix = entry.startsWith('/docs') ? '/docs' : '';
      const oldKey = prefix ? 'flc-pages-v3-design-20261010-1' : 'flc-v3-design-20261010-1';
      const modelUrl = origin + prefix + '/assets/paddle/update-probe.bin';
      await page.evaluate(async ({ oldKey, entry, modelUrl, prefix }) => {
        localStorage.setItem('flc-update-personal-probe', '保留本人数据');
        const old = await caches.open(oldKey);
        await old.put(entry, new Response('之前的页面'));
        await old.put(prefix + '/src/styles/app.css', new Response('旧样式'));
        if (!prefix) await old.put('/src/app.js', new Response('throw new Error("仍在执行旧模块")', {headers:{'Content-Type':'text/javascript'}}));
        await old.put(modelUrl, new Response('固定模型缓存'));
        const foreign = await caches.open('other-application-cache');
        await foreign.put('/foreign-probe', new Response('其他应用数据'));
      }, { oldKey, entry, modelUrl, prefix });
      await page.evaluate(async ({oldKey,prefix}) => {
        const registration = await navigator.serviceWorker.register('/legacy-sw.js?key='+encodeURIComponent(oldKey), {scope:prefix+'/'});
        const worker = registration.installing || registration.waiting || registration.active;
        if (worker.state !== 'activated') await new Promise(resolve=>worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();}));
      }, {oldKey,prefix});
      await page.goto(origin + entry + '?v=20261010-2#/welcome');
      await page.waitForFunction(() => window.FoodLensCare);
      await page.evaluate(async () => {
        await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('离线缓存未完成安装')), 15000))]);
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      });
      await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js') && navigator.serviceWorker.controller.state === 'activated');
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="app-version"]').content), '3.0.1-20261010');
      assert.equal(await page.evaluate(async oldKey => {
        if (!(await caches.keys()).includes(oldKey)) return 0;
        return (await (await caches.open(oldKey)).keys()).length;
      }, oldKey), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('flc-update-personal-probe')), '保留本人数据');
      assert.ok((await page.evaluate(() => caches.keys())).includes('other-application-cache'));
      pass(entry + ' 升级清理旧页面，保留本人数据与其他应用缓存');
      assert.equal(await page.evaluate(async url => (await fetch(url)).text(), modelUrl), '固定模型缓存');
      pass(entry + ' 固定模型已迁移，无需重新下载');
      const key = prefix ? 'flc-pages-current-20261010-2' : 'flc-v3-current-20261010-2';
      // 当前版本也可能残留旧响应；下一次在线请求必须直接得到新文件。
      await page.evaluate(async ({ key, entry }) => {
        const cache = await caches.open(key);
        await cache.put(entry, new Response('之前的页面'));
        await cache.put('/src/styles/app.css', new Response('旧样式'));
        await cache.put('/src/ui/icons.js', new Response('旧模块'));
      }, { key, entry });
      await page.reload();
      await page.waitForFunction(() => window.FoodLensCare);
      assert.ok(await page.getByRole('button', { name: '手机号登录', exact: true }).isVisible());
      assert.ok((await page.evaluate(async () => (await fetch('/src/styles/app.css')).text())).includes('.brand-logo'));
      assert.ok((await page.evaluate(async () => (await fetch('/src/ui/icons.js')).text())).includes('brand:'));
      pass(entry + ' 已有旧缓存仍首选最新页面、样式与模块');
      const counts = await page.evaluate(async () => {
        const a = await (await fetch('/api/cache-probe')).json();
        const b = await (await fetch('/api/cache-probe')).json();
        return [a.count, b.count];
      });
      assert.equal(counts[1], counts[0] + 1);
      for (const cacheKey of await page.evaluate(() => caches.keys())) {
        assert.equal(await page.evaluate(async cacheKey => (await (await caches.open(cacheKey)).keys()).some(request => new URL(request.url).pathname.startsWith('/api/')), cacheKey), false);
      }
      pass(entry + ' 家庭接口实时查询，不进入缓存');
      assert.ok(await page.evaluate(async ({key,entry}) => (await (await (await caches.open(key)).match(entry+'?v=20261010-2')).text()).includes('3.0.1-20261010'), {key,entry}));
      await context.setOffline(true);
      await page.reload();
      try {
        await page.waitForFunction(() => window.FoodLensCare);
      } catch (error) {
        console.error('断网页面诊断', { entry, errors, html: (await page.content()).slice(0, 200) });
        throw error;
      }
      assert.ok(await page.getByRole('button', { name: '手机号登录', exact: true }).isVisible());
      assert.equal(await page.evaluate(async url => (await fetch(url)).text(), modelUrl), '固定模型缓存');
      assert.deepEqual(errors, []);
      pass(entry + ' 断网可打开新界面和固定模型，无页面异常');
      await context.close();
    }
    const file = await browser.newPage();
    await file.goto(require('node:url').pathToFileURL(path.join(root, 'index.html')).href);
    await file.waitForFunction(() => window.FoodLensCare);
    assert.ok(file.url().includes('FoodLensCare-standalone.html'));
    pass('双击源码index入口自动进入最新版单文件');
    console.log(`更新与离线检查：${checks}项通过。`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
