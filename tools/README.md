# 第三版开发工具

运行第三版使用 `python -X utf8 tools/family_server.py --open`；局域网加 `--host 0.0.0.0`。`serve.py` 是同一家庭服务的兼容启动入口，不再启动旧版静态体验服务。

所有检查使用隔离浏览器或临时数据库，不改正式账号数据。浏览器脚本需要开发环境 Playwright，可通过 `FLC_PLAYWRIGHT_PATH` 指定包目录；应用本身无需安装这些依赖。

## 当前检查

```powershell
node tools/rule-selftest.mjs
node tools/module-check.mjs
python -X utf8 tools/check-interaction.py
python -X utf8 tools/check-v3-api.py
node tools/check-v3-browser.cjs
node tools/check-update-browser.cjs
node tools/regions-selftest.mjs
node tools/ingredient-section-selftest.mjs
node tools/review-selftest.mjs
node tools/contrast-check.mjs
node tools/check-real-ocr.cjs
```

`check-v3-browser.cjs` 验证双账号家庭流程、授权、照片、真实录音播放及不同字号布局，并生成 `_qa/第三版截图/` 的最新截图。`check-update-browser.cjs` 验证旧缓存升级、在线读取最新页面、断网使用缓存、接口不缓存以及固定模型保留。

## 生成最新版交付文件

```powershell
node tools/bundle-standalone.mjs
python -X utf8 tools/prepare-pages.py
python -X utf8 tools/check-standalone.py
python -X utf8 tools/check-standalone.py --pages
node tools/check-v3-browser.cjs
python -X utf8 tools/prepare-v3-preview.py
```

单文件与docs是当前源码的生成物。预览工具将当前截图同步到docs，给图片附加内容摘要防止旧图缓存，生成最新版界面预览与可展开的设计参考。PaddleOCR固定资源随目录提供；重建引擎时使用 `build-paddle.mjs`。
