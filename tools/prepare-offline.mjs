/**
 * 只缓存公共页面资源，家庭接口与私人业务数据不进入网页缓存。
 * 用法：node tools/prepare-offline.mjs [--dist dist] [--base /]
 * GitHub Pages 需要 --base /foodlenscare/，本地启动器使用默认 /。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const dist = path.resolve(root, option('--dist', 'dist'));
const rawBase = option('--base', '/');
const base = rawBase.endsWith('/') ? rawBase : rawBase + '/';
const assetDir = path.join(dist, 'assets');
let cssFiles = fs.readdirSync(assetDir).filter(name => name.endsWith('.css'));
const indexPath = path.join(dist, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
// 原 index.css 保留不动；只在构建产物中补 font-display:swap，
// 避免外部字体服务不可达时整段中文长时间不显示（FOIT）。
// 补丁后按内容重命名样式文件，防止 Pages/CDN 继续命中旧样式缓存。
for (const name of cssFiles) {
  const file = path.join(assetDir, name);
  let css = fs.readFileSync(file, 'utf8');
  if (!css.includes('font-display')) {
    css = css.replace(/@font-face\s*\{/g, match => `${match}font-display:swap;`);
  }
  const digest = crypto.createHash('sha256').update(css).digest('hex').slice(0, 8);
  const nextName = name.replace(/-[^-]+\.css$/, `-${digest}.css`);
  if (nextName !== name) {
    fs.writeFileSync(path.join(assetDir, nextName), css);
    fs.unlinkSync(file);
    indexHtml = indexHtml.split(name).join(nextName);
  } else {
    fs.writeFileSync(file, css);
  }
}
fs.writeFileSync(indexPath, indexHtml);
cssFiles = fs.readdirSync(assetDir).filter(name => name.endsWith('.css'));
const resources = [
  base,
  base + 'index.html',
  base + 'favicon.svg',
  ...fs.readdirSync(assetDir)
    .filter(name => /\.(css|js|svg|png)$/.test(name))
    .map(name => base + 'assets/' + name),
];
const signature = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(dist, 'index.html')))
  .update(cssFiles.map(name => fs.readFileSync(path.join(assetDir, name))).join(''))
  .digest('hex').slice(0, 12);
fs.writeFileSync(path.join(dist, 'sw.js'), `const BASE=${JSON.stringify(base)};
const CACHE='flc-v5-public-${signature}',MODELS='flc-v5-paddle-v1';
const SHELL=${JSON.stringify(resources)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('flc-v4-public-')||key.startsWith('flc-v5-public-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith(BASE+'api/'))return;
 const model=url.pathname.startsWith(BASE+'assets/paddle/');
 const publicResource=event.request.mode==='navigate'||url.pathname.startsWith(BASE+'assets/')||url.pathname.startsWith(BASE+'audio/')||url.pathname===BASE+'favicon.svg';
 if(!publicResource)return;
 event.respondWith((async()=>{
   const cache=await caches.open(model?MODELS:CACHE);
   if(model){const saved=await cache.match(event.request);if(saved)return saved;}
   try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)await cache.put(event.request,response.clone());return response;}
   catch(error){const saved=await cache.match(event.request);if(saved)return saved;if(event.request.mode==='navigate'){const home=await cache.match(BASE+'index.html');if(home)return home;}throw error;}
 })());
});
`);
console.log(`已生成公共页面与OCR模型离线缓存（base: ${base}，资源 ${resources.length} 项）；家庭接口不缓存。`);
