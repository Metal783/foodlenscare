/** 只缓存公共页面资源，家庭接口与私人业务数据不进入网页缓存。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const assetNames=new Set([...fs.readdirSync(path.join(dist,'assets')),...fs.readdirSync(path.join(root,'public','assets'))]);
const resources=['/','/index.html','/favicon.svg',...Array.from(assetNames).filter(name=>/\.(css|js|svg|png)$/.test(name)).map(name=>'/assets/'+name)];
const signature=crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'index.html'))).digest('hex').slice(0,12);
fs.writeFileSync(path.join(dist,'sw.js'),`const CACHE='flc-v4-public-${signature}',MODELS='flc-v4-paddle-v1';
const SHELL=${JSON.stringify(resources)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('flc-v4-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 const model=url.pathname.startsWith('/assets/paddle/');
 const publicResource=event.request.mode==='navigate'||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/audio/')||url.pathname==='/favicon.svg';
 if(!publicResource)return;
 event.respondWith((async()=>{
   const cache=await caches.open(model?MODELS:CACHE);
   if(model){const saved=await cache.match(event.request);if(saved)return saved;}
   try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)await cache.put(event.request,response.clone());return response;}
   catch(error){const saved=await cache.match(event.request);if(saved)return saved;if(event.request.mode==='navigate'){const home=await cache.match('/index.html');if(home)return home;}throw error;}
 })());
});
`);
console.log('已生成公共页面与OCR模型离线缓存；家庭接口不缓存。');
