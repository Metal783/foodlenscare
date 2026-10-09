# docs/ 目录说明

这个目录有两个用途，别混淆：

## 1. `screenshots/` —— 参赛材料用的运行截图

原有 11 张 390×844 @2x 的手机截图（历史演示素材，需要提交最新版时请重新生成），用下面这条命令一键重新生成：

```bash
python tools/capture-screenshots.py        # 需要先启动 python tools/serve.py
```

## 2. `index.html` —— GitHub Pages 的在线体验入口（自动生成，别手改）

它是 `FoodLensCare-standalone.html` 的副本，内容完全一样。
放在这里是因为 GitHub Pages 只能从仓库根目录或 `/docs` 发布，
而把仓库根目录当站点会让 `src/`、`tools/` 全部变成可访问的静态文件。

**改了源码之后要重新生成它**，否则线上版本会落后：

```bash
node tools/bundle-standalone.mjs                     # 先重新打包
python tools/prepare-pages.py                        # 再同步到 docs/index.html
```

- `docs/index.html`：生成产物，请勿手动编辑
- `docs/sw.js`：Pages 版的离线缓存，手写文件，不受上面的命令影响
- `docs/assets/paddle/`：新版中文区域 OCR 的固定引擎、模型和许可证，由同步脚本复制；大资源在识别时按需缓存
- `docs/assets/ocr/`：基础文字 OCR 的降级资源

首次构建或修改 OCR 依赖时，在根目录执行 `npm ci`、`npm run build`。GitHub 更新后由 Pages 部署，实际生效版本以部署状态为准。电脑本地体验双击根目录的 `启动新版OCR.cmd`；完整操作及原图复测见根目录更新日志。

新增 `screenshots/12-reviewed-intake.png`：本次更新的营养核对、实际食用确认与额度展示，390px 宽整页截图。操作方法见根目录 `更新日志.md`。
