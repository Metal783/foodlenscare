/**
 * Service Worker —— 离线可用
 *
 * 目的很具体：答辩现场网络不稳定时，作品仍要能完整演示（方案 8. 风险与应对）。
 * 策略：
 *  - 预缓存应用外壳（HTML / CSS / JS / 图标）；
 *  - 应用外壳走 cache-first，保证打开即用；
 *  - 版本升级时清理旧缓存，避免老人手机上留一堆陈旧文件；
 *  - 不缓存任何用户照片，照片只在本机内存与 localStorage 记录里流转。
 */

const VERSION = 'flc-v1';
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
  './src/pages/help.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 只接管同源静态资源；第三方接口一律直连，不缓存识别结果
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // 后台静默更新，下次打开就是新版本
        event.waitUntil(refresh(request));
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() =>
          request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
        );
    })
  );
});

function refresh(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        return caches.open(VERSION).then((cache) => cache.put(request, response));
      }
      return undefined;
    })
    .catch(() => undefined);
}
