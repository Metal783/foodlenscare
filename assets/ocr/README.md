# 本机 OCR 依赖

- Tesseract.js 5.1.1： https://github.com/naptha/tesseract.js （Apache-2.0，LICENSE-tesseract.txt）
- Tesseract.js-core 5.1.1： https://github.com/naptha/tesseract.js-core （Apache-2.0，LICENSE-core.txt）
- 中文模型： https://github.com/tesseract-ocr/tessdata_fast/blob/main/chi_sim.traineddata （Apache-2.0，LICENSE-models.txt），下载后 gzip 压缩，未修改模型。
中文模型同时包含常见拉丁字符，用于包装中混排的英文与单位。

脚本和 WASM 随应用分发；照片在浏览器内识别，不会上传。file:// 双击模式使用固定版本 CDN 运行时。
