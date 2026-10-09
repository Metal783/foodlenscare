// 只持久缓存固定版本公共引擎资源，照片和识别结果不进入这个数据库。
const CACHE_VERSION = 'paddle-0.4.2-ort-1.24.3-v1';
const FILES = [
  ['ocr-worker-classic.js',10873161],
  ['models/PP-OCRv5_mobile_det.tar',4843520],
  ['models/PP-OCRv5_mobile_rec.tar',16701440],
  ['ort-wasm-simd-threaded.jsep.wasm',25014754]
];
let database;
function openCache() {
  if (database) return database;
  database = new Promise(resolve => {
    try {
      const request = indexedDB.open('flc.ocr-assets.v1',1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return database;
}
async function cacheEntry(key,blob) {
  const db = await openCache();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx=db.transaction('assets',blob?'readwrite':'readonly'),store=tx.objectStore('assets');
      const request=blob?store.put(blob,key):store.get(key);
      let value;
      request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(blob?blob:value);
      tx.onerror=tx.onabort=()=>resolve(null);
    } catch {resolve(null);}
  });
}
export async function loadFileAssets({base,signal,onProgress}) {
  const loaded=new Map(),total=FILES.reduce((sum,[,bytes])=>sum+bytes,0);
  let lastUpdate=0;
  const progress=(name,bytes,force=false)=>{
    loaded.set(name,bytes);
    const now=performance.now();
    if(!force&&now-lastUpdate<200)return;
    lastUpdate=now;
    const amount=[...loaded.values()].reduce((sum,n)=>sum+n,0);
    onProgress?.({text:`正在准备识别资源：${(amount/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`,note:'已下载的资源会保存在此浏览器，之后优先读取缓存。照片不上传。'});
  };
  return Object.fromEntries(await Promise.all(FILES.map(async([name,bytes])=>{
    const key=CACHE_VERSION+':'+base+name;
    const cached=await cacheEntry(key);
    if(signal.aborted)throw new DOMException('读取已取消','AbortError');
    if(cached instanceof Blob&&cached.size===bytes){progress(name,bytes,true);return [name,cached];}
    const response=await fetch(base+name,{signal});
    if(!response.ok)throw new Error('识别资源下载失败：'+name);
    const reader=response.body?.getReader();
    let blob;
    if(reader){
      const chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);size+=value.byteLength;progress(name,size);}
      blob=new Blob(chunks);
    }else blob=await response.blob();
    if(blob.size!==bytes)throw new Error('识别资源不完整：'+name+'，请重试。');
    await cacheEntry(key,blob);
    progress(name,bytes,true);
    return [name,blob];
  })));
}
