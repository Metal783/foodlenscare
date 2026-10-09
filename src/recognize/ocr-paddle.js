import { labelFromRegions } from './parse-regions.js';
export async function recognize({file,signal,onProgress}) {
  if(signal?.aborted) throw new DOMException('读取已取消','AbortError');
  let worker,sdk,workerUrl,cancelled=false;
  let rejectStop;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=e=>{cancelled=true;worker?.terminate();rejectStop(e);};
  const abort=()=>stop(new DOMException('读取已取消','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  // 首次下载资源与图片推理分别计时，避免慢网络还没加载完就退回基础识别。
  let timer=setTimeout(()=>stop(new Error('中文模型加载超时，请检查网络后重试。')),300000);
  const run=async()=>{
    // 双击 HTML 不能读取旁边的模型文件；只从固定线上资源地址下载新引擎，照片仍在本机处理。
    const remote=window.location.protocol==='file:';
    const base=remote?'https://metal783.github.io/foodlenscare/assets/paddle/':new URL('assets/paddle/',document.baseURI).href;
    onProgress?.({text:'正在加载中文识别模型……',note:'首次下载引擎和模型可能较久，请保持页面打开。照片在本机处理。'});
    const runtimeUrl=base+'paddle.mjs';
    const {PaddleOCR}=await import(runtimeUrl);
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    if(remote) {
      // file:// 不支持模块 Worker；下载由同一 SDK 构建的普通 Worker，并在本机启动。
      const response=await fetch(base+'ocr-worker-classic.js',{signal});
      if(!response.ok) throw new Error('中文识别工作线程下载失败，请检查网络后重试。');
      const script=await response.text();
      if(cancelled) throw new DOMException('读取已取消','AbortError');
      workerUrl=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
    }
    sdk=await PaddleOCR.create({
      worker:{createWorker:()=>{if(cancelled) throw new DOMException('读取已取消','AbortError');worker=new Worker(workerUrl||base+'ocr-worker.mjs',{type:remote?'classic':'module'});worker.addEventListener('error',e=>stop(new Error(e.message||'中文识别工作线程运行失败。')),{once:true});return worker;}},
      textDetectionModelName:'PP-OCRv5_mobile_det',textRecognitionModelName:'PP-OCRv5_mobile_rec',
      textDetectionModelAsset:{url:base+'models/PP-OCRv5_mobile_det.tar'},textRecognitionModelAsset:{url:base+'models/PP-OCRv5_mobile_rec.tar'},
      ortOptions:{backend:'wasm',numThreads:1,wasmPaths:base},textDetLimitSideLen:1600,textDetLimitType:'max',textRecScoreThresh:0.3
    });
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    clearTimeout(timer);
    timer=setTimeout(()=>stop(new Error('中文识别超时，请重试或缩小拍摄区域。')),120000);
    onProgress?.({text:'正在定位并读取配料和营养表……',note:'识别出的字段会先交给您对照包装核对。'});
    const [data]=await sdk.predict(file);
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    const label=labelFromRegions(data);
    if(!label.rawText) throw new Error('没有找到文字，请靠近配料表重新拍摄。');
    return {label,channel:'paddleOcr'};
  };
  try {return await Promise.race([run(),stopped]);}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);if(sdk&&!cancelled){try{await sdk.dispose();}catch{}}worker?.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);}
}
