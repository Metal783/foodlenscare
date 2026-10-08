# docs/ 目录说明

这个目录有两个用途，别混淆：

## 1. `screenshots/` —— 参赛材料用的运行截图

11 张 390×844 @2x 的手机截图，用下面这条命令一键重新生成：

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
