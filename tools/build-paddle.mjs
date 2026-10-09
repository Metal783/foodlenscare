/** 固定版本开源浏览器 OCR；资源在本机/Pages 加载，照片不上传。 */
import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/paddle');
await mkdir(join(out, 'models'), { recursive: true });
await build({ entryPoints: [join(root, 'node_modules/@paddleocr/paddleocr-js/dist/index.mjs')], outfile: join(out, 'paddle.mjs'), bundle: true, minify: true, format: 'esm', platform: 'browser', external: ['fs', 'path'], target: 'es2022', legalComments: 'eof' });
const sdkAssets = join(root, 'node_modules/@paddleocr/paddleocr-js/dist/assets');
const workerName = (await readdir(sdkAssets)).find(n => /^worker-entry.*\.js$/.test(n));
const worker = await transform(await readFile(join(sdkAssets, workerName), 'utf8'), { minify: true, format: 'esm', target: 'es2022', legalComments: 'eof' });
await writeFile(join(out, 'ocr-worker.mjs'), worker.code);
// file:// 不允许模块 Worker；生成同一 SDK 的普通 Worker，显式提供脚本基址。
const classicWorker = await transform(await readFile(join(sdkAssets, workerName), 'utf8'), {
  minify: true, format: 'iife', target: 'es2022', legalComments: 'eof',
  define: { 'import.meta.url': JSON.stringify('https://metal783.github.io/foodlenscare/assets/paddle/ocr-worker-classic.js') }
});
await writeFile(join(out, 'ocr-worker-classic.js'), classicWorker.code);
const ort = join(root, 'node_modules/onnxruntime-web/dist');
const runtimeFiles = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];
for (const name of runtimeFiles) await copyFile(join(ort, name), join(out, name));
for (const kind of ['det', 'rec']) {
  const name = `PP-OCRv5_mobile_${kind}`;
  const target = join(out, 'models', name + '.tar');
  try { await stat(target); } catch {
    const url = `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${name}_onnx_infer.tar`;
    console.log('Downloading ' + name);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  }
}
const manifest = { sdk: '0.4.2', onnxruntime: '1.24.3', files: {} };
for (const name of ['paddle.mjs', 'ocr-worker.mjs', 'ocr-worker-classic.js', ...runtimeFiles, 'models/PP-OCRv5_mobile_det.tar', 'models/PP-OCRv5_mobile_rec.tar']) {
  const data = await readFile(join(out, name));
  manifest.files[name] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [name, url] of [['LICENSE-onnxruntime.txt', 'https://api.github.com/repos/microsoft/onnxruntime/contents/LICENSE?ref=v1.24.3'], ['LICENSE-paddle.txt', 'https://api.github.com/repos/PaddlePaddle/PaddleOCR/contents/LICENSE?ref=dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf'], ['LICENSE-boost.txt', 'https://api.github.com/repos/boostorg/boost/contents/LICENSE_1_0.txt?ref=master']]) {
  const target = join(out, name);
  try { await stat(target); } catch {
    let error;
    for (let attempt=0; attempt<3; attempt++) {
      try { const response = await fetch(url, {signal:AbortSignal.timeout(15000),headers:{'User-Agent':'FoodLensCare-build'}}); if (!response.ok) throw new Error(`License download failed: ${url}`); const json=await response.json(); await writeFile(target,Buffer.from(json.content,'base64')); error = null; break; }
      catch (e) { error = e; }
    }
    if(error) throw error;
  }
}
for (const [pkg, name] of [['@techstark/opencv-js', 'opencv'], ['js-yaml', 'yaml']]) await copyFile(join(root, 'node_modules', pkg, 'LICENSE'), join(out, `LICENSE-${name}.txt`));
// Clipper includes its Boost licence in the source header.
const clipper = await readFile(join(root, 'node_modules/clipper-lib/clipper.js'), 'utf8');
await writeFile(join(out, 'LICENSE-clipper.txt'), clipper.slice(0, clipper.indexOf('(function')));
await copyFile(join(root, 'node_modules/@paddleocr/paddleocr-js/README.md'), join(out, 'README-sdk.md'));
await writeFile(join(out, 'README.md'), '# 本机中文区域 OCR\n\nPaddleOCR.js 0.4.2，PP-OCRv5 mobile 检测/识别模型，来自 https://github.com/PaddlePaddle/PaddleOCR （Apache-2.0）。ONNX Runtime Web 1.24.3 来自 https://github.com/microsoft/onnxruntime （MIT）。其他依赖 js-yaml（MIT）、clipper-lib（BSL-1.0）、OpenCV.js（Apache-2.0）的许可证保留在打包资源中及 notices 文件。\n\n构建：npm ci 后运行 npm run build:ocr。运行时从同源加载资源；模型仅下载，不发送照片。manifest.json 记录版本、体积与 SHA-256。\n');
console.log(JSON.stringify(manifest, null, 2));
