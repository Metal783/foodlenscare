/**
 * GitHub Pages 用的离线缓存（仅在线体验版需要）
 *
 * 为什么单独写一个：网页版（docs/index.html）是单文件版，
 * 而单文件版本身不注册 Service Worker —— 它设计成双击就能开，
 * 那时是 file:// 协议，浏览器根本不允许注册。
 * 放到 Pages 上以后是正常的 https，于是应用会去请求 ./sw.js，
 * 没有这个文件就会在控制台留一个 404。这个文件补上那一步。
 *
 * 注意：单文件版的全部内容都在 index.html 里，所以这里只需要缓存它自己。
 */

const VERSION = 'flc-pages-v9-paddle-reuse';
const SHELL = ['./', './index.html'];

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
  // 只管自己的页面；识别接口一律直连，不缓存任何结果
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    })
  );
});
