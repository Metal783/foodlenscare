import { labelFromRegions } from './parse-regions.js';
export async function recognize({file,signal,onProgress}) {
  if(signal?.aborted) throw new DOMException('读取已取消','AbortError');
  let worker,sdk,cancelled=false;
  let rejectStop;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=e=>{cancelled=true;worker?.terminate();rejectStop(e);};
  const abort=()=>stop(new DOMException('读取已取消','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>stop(new Error('中文识别超时，请重试或缩小拍摄区域。')),120000);
  const run=async()=>{
    const base=new URL('assets/paddle/',document.baseURI).href;
    onProgress?.({text:'正在加载中文识别模型……',note:'首次下载模型需要稍等，照片在本机处理。'});
    const runtimeUrl=base+'paddle.mjs';
    const {PaddleOCR}=await import(runtimeUrl);
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    sdk=await PaddleOCR.create({
      worker:{createWorker:()=>{if(cancelled) throw new DOMException('读取已取消','AbortError');worker=new Worker(base+'ocr-worker.mjs',{type:'module'});return worker;}},
      textDetectionModelName:'PP-OCRv5_mobile_det',textRecognitionModelName:'PP-OCRv5_mobile_rec',
      textDetectionModelAsset:{url:base+'models/PP-OCRv5_mobile_det.tar'},textRecognitionModelAsset:{url:base+'models/PP-OCRv5_mobile_rec.tar'},
      ortOptions:{backend:'wasm',numThreads:1,wasmPaths:base},textDetLimitSideLen:1600,textDetLimitType:'max',textRecScoreThresh:0.3
    });
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    onProgress?.({text:'正在定位并读取配料和营养表……',note:'识别出的字段会先交给您对照包装核对。'});
    const [data]=await sdk.predict(file);
    if(cancelled) throw new DOMException('读取已取消','AbortError');
    const label=labelFromRegions(data);
    if(!label.rawText) throw new Error('没有找到文字，请靠近配料表重新拍摄。');
    return {label,channel:'paddleOcr'};
  };
  try {return await Promise.race([run(),stopped]);}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);if(sdk&&!cancelled){try{await sdk.dispose();}catch{}}worker?.terminate();}
}
