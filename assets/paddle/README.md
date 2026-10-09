# 本机中文区域 OCR

PaddleOCR.js 0.4.2，PP-OCRv5 mobile 检测/识别模型，来自 https://github.com/PaddlePaddle/PaddleOCR （Apache-2.0）。ONNX Runtime Web 1.24.3 来自 https://github.com/microsoft/onnxruntime （MIT）。其他依赖 js-yaml（MIT）、clipper-lib（BSL-1.0）、OpenCV.js（Apache-2.0）的许可证保留在打包资源中及 notices 文件。

构建：npm ci 后运行 npm run build:ocr。运行时从同源加载资源；模型仅下载，不发送照片。manifest.json 记录版本、体积与 SHA-256。
