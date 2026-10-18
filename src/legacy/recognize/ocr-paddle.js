import { labelFromRegions } from './parse-regions.js';
import { loadFileAssets } from './paddle-assets.js';

// 保留已初始化的模型供连续拍照复用；空闲十分钟后释放内存。
let engine=null,idleTimer;
function release(session) {
  if(!session)return;
  if(engine===session)engine=null;
  session.controller.abort();
  session.worker?.terminate();
  session.urls.forEach(url=>URL.revokeObjectURL(url));
  session.urls=[];
}
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{clearTimeout(idleTimer);release(engine);});

async function initialize(session,onProgress) {
  const remote=window.location.protocol==='file:';
  const base=remote?'https://metal783.github.io/foodlenscare/assets/paddle/':new URL('assets/paddle/',document.baseURI).href;
  onProgress?.({text:'正在加载中文识别模型……',note:'首次需要准备识别资源；已加载的模型可供连续拍照复用。'});
  const [{PaddleOCR},assets]=await Promise.all([
    import(base+'paddle.mjs?v=worker-client-1'),
    remote?loadFileAssets({base,signal:session.controller.signal,onProgress}):null
  ]);
  if(session.controller.signal.aborted)throw new DOMException('读取已取消','AbortError');
  const makeUrl=blob=>{const url=URL.createObjectURL(blob);session.urls.push(url);return url;};
  // file:// 的 Worker 不能 fetch 页面创建的模型 Blob URL；传递 Blob 本身，由 Worker 返回资源响应。
  const cachePrelude=`const flcAssets=new Map();const flcFetch=self.fetch.bind(self);
    self.addEventListener('message',event=>{if(event.data?.type==='flc-asset-cache')for(const [url,blob] of event.data.entries)flcAssets.set(url,blob);});
    self.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url||String(input);const blob=flcAssets.get(url);
      return blob?Promise.resolve(new Response(blob,{headers:{'Content-Type':url.endsWith('.wasm')?'application/wasm':'application/octet-stream'}})):flcFetch(input,options);};\n`;
  const workerUrl=remote?makeUrl(new Blob([cachePrelude,assets['ocr-worker-classic.js']],{type:'text/javascript'})):base+'ocr-worker.mjs';
  const modelUrl=name=>base+'models/'+name+'.tar';
  onProgress?.({text:'资源已准备好，正在初始化中文模型……',note:'模型初始化完成后，同一页面再次读取无需重复初始化。'});
  session.sdk=await PaddleOCR.create({
    worker:{createWorker:()=>{
      if(session.controller.signal.aborted)throw new DOMException('读取已取消','AbortError');
      session.worker=new Worker(workerUrl,{type:remote?'classic':'module'});
      if(remote)session.worker.postMessage({type:'flc-asset-cache',entries:Object.entries(assets).filter(([name])=>name!=='ocr-worker-classic.js').map(([name,blob])=>[base+name,blob])});
      session.worker.addEventListener('error',e=>{if(session.stop)session.stop(new Error(e.message||'中文识别工作线程运行失败。'));else release(session);});
      return session.worker;
    }},
    textDetectionModelName:'PP-OCRv5_mobile_det',textRecognitionModelName:'PP-OCRv5_mobile_rec',
    textDetectionModelAsset:{url:modelUrl('PP-OCRv5_mobile_det')},textRecognitionModelAsset:{url:modelUrl('PP-OCRv5_mobile_rec')},
    ortOptions:{backend:'wasm',numThreads:1,wasmPaths:base},
    textDetLimitSideLen:1600,textDetLimitType:'max',textRecScoreThresh:0.3
  });
  session.ready=true;
  return session.sdk;
}

export async function recognize({file,signal,onProgress}) {
  if(signal?.aborted)throw new DOMException('读取已取消','AbortError');
  if(engine?.busy)throw new Error('正在读取另一张照片，请等待或取消后再试。');
  clearTimeout(idleTimer);
  const reused=Boolean(engine?.ready);
  const session=engine||{urls:[],controller:new AbortController(),ready:false};
  engine=session;session.busy=true;
  let rejectStop;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=error=>{release(session);rejectStop(error);};
  session.stop=stop;
  const abort=()=>stop(new DOMException('读取已取消','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  let timer=setTimeout(()=>stop(new Error('中文模型加载超时，请检查网络后重试。')),300000);
  const run=async()=>{
    const sdk=session.sdk||await initialize(session,onProgress);
    if(session.controller.signal.aborted)throw new DOMException('读取已取消','AbortError');
    clearTimeout(timer);
    timer=setTimeout(()=>stop(new Error('中文识别超时，请重试或缩小拍摄区域。')),120000);
    if(reused)onProgress?.({text:'已复用中文模型，正在读取照片……',note:'无需重新下载引擎或模型。'});
    onProgress?.({text:'正在定位并读取配料和营养表……',note:'识别出的字段会先交给您对照包装核对。'});
    if(session.controller.signal.aborted)throw new DOMException('读取已取消','AbortError');
    const [data]=await sdk.predict(file);
    if(session.controller.signal.aborted)throw new DOMException('读取已取消','AbortError');
    const label=labelFromRegions(data);
    if(!label.rawText)throw new Error('没有找到文字，请靠近配料表重新拍摄。');
    return {label,channel:'paddleOcr'};
  };
  try{return await Promise.race([run(),stopped]);}
  catch(error){release(session);throw error;}
  finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    session.busy=false;session.stop=null;
    if(engine===session)idleTimer=setTimeout(()=>release(session),600000);
  }
}
