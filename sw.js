/** 在线优先读取最新版页面；断网时使用最近成功保存的版本。
 * 固定 Paddle 模型单独缓存，升级界面不需要重新下载模型。
 * 不缓存家庭接口，不修改账号、照片、资料或记录存储。
 */
const VERSION = 'flc-v3-current-20261010-2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './src/styles/tokens.css',
  './src/styles/app.css',
  './src/app.js',
  './src/core/router.js',
  './src/core/rules.js',
  './src/core/store.js',
  './src/core/speech.js',
  './src/core/flow.js',
  './src/core/label-review.js',
  './src/core/service.js',
  './src/core/history.js',
  './src/ui/care.js',
  './src/pages/care.js',
  './src/pages/history.js',
  './src/pages/voices.js',
  './src/data/allergens.js',
  './src/data/additives.js',
  './src/data/nutrition.js',
  './src/data/sample-labels.js',
  './src/data/contrast-report.js',
  './src/recognize/index.js',
  './src/recognize/config.js',
  './src/recognize/channels.js',
  './src/recognize/quality.js',
  './src/recognize/parse-label.js',
  './src/recognize/demo.js',
  './src/recognize/mock.js',
  './src/recognize/http.js',
  './src/recognize/ocr-huawei.js',
  './src/recognize/ocr-paddle.js',
  './src/recognize/paddle-assets.js',
  './src/recognize/parse-regions.js',
  './src/recognize/crypto-utils.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/pages/home.js',
  './src/pages/onboarding.js',
  './src/pages/confirm.js',
  './src/pages/progress.js',
  './src/pages/result.js',
  './src/pages/records.js',
  './src/pages/settings.js',
  './src/pages/help.js',
  './src/pages/scan.js'
];

const MODELS = 'flc-paddle-fixed-0.4.2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const models = await caches.open(MODELS);
    for (const key of await caches.keys()) {
      if (!(key.startsWith('flc-v') && !key.startsWith('flc-pages-')) || key === VERSION || key === MODELS) continue;
      // 旧版将模型混在页面缓存里；先迁移模型再移除旧页面，保留离线识别能力。
      const previous = await caches.open(key);
      for (const request of await previous.keys()) {
        if (new URL(request.url).pathname.includes('/assets/paddle/')) {
          const response = await previous.match(request);
          if (response && !(await models.match(request))) await models.put(request, response);
        }
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const isModel = url.pathname.includes('/assets/paddle/');
    const cache = await caches.open(isModel ? MODELS : VERSION);
    const cached = await cache.match(request);
    if (isModel && cached) return cached;
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    } catch {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('./index.html', self.location.href));
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
