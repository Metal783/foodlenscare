# 自动化检查与截图工具

这些脚本都是**可选的辅助工具**，删掉不影响应用运行。放在这里是为了两件事：
改了规则或界面之后能立刻验证没改坏；参赛材料需要的一组运行截图能一条命令生成。

## 一键检查

电脑可直接双击根目录的 `FoodLensCare-standalone.html` 使用新版 PaddleOCR（首次识别需要联网下载资源）；也可双击 `启动新版OCR.cmd` 使用本地资源，终端保持开启，浏览器自动打开。

```bash
node tools/regions-selftest.mjs        # 区域识别与未知字段回归
node tools/ingredient-section-selftest.mjs # 配料区段与营养标题隔离
node tools/review-selftest.mjs         # 本次修复逻辑回归：25 项
node tools/rule-selftest.mjs           # 规则层与解析层自测（74 项断言）
node tools/module-check.mjs            # 模块导入导出 + 具名导入/调用 + 定向回归检查
python tools/check-interaction.py      # 交互回归：真实点击驱动按钮
node tools/check-real-ocr.cjs           # 真实中文图片 OCR + 页面流程 + 缓存后断网检查（需要 playwright 和 Edge）
node tools/check-real-ocr.cjs --file    # 双击版真实 OCR 检查（需要网络）
python tools/verify-regression-checks.py  # 验证定向回归检查真的抓得到问题
node tools/bundle-standalone.mjs       # 打包「双击就能打开」的单文件版
python tools/check-standalone.py       # 校验单文件版在 file:// 下能跑通
node tools/contrast-check.mjs          # 对比度实测（WCAG 相对亮度公式）
python tools/serve.py                  # 本地服务（局域网 + 二维码）
python tools/serve.py --mobile --host 127.0.0.1 --no-qr --open # 自动打开新版 OCR（仅本机）
python tools/capture-screenshots.py
```

新版区域 OCR 原图回归：`node tools/check-paddle.cjs "原图.jpg"`（需 Playwright 和 Edge，可设置 `FLC_PLAYWRIGHT_PATH`）。原图由本机路径提供，不复制到仓库。OCR 依赖固定版本及构建步骤见根目录 README 和 `assets/paddle/README.md`。

双击文件回归：加 `--file`。如需隔离网络波动，可再加 `--local-assets`，测试会用仓库中同一真实 SDK 和模型响应固定线上资源 URL，仍在 `file://` 下执行完整识别，不伪造 OCR 输出。

| 脚本 | 作用 | 什么时候跑 |
| --- | --- | --- |
| `rule-selftest.mjs` | 八大致敏物质匹配、INS 编码翻译、五色分级、一句话结论、标签文本解析 | 每次改 `src/core/rules.js`、`src/data/*`、`src/recognize/parse-label.js` 之后 |
| `module-check.mjs` | 真实 import 全部模块并断言关键导出；静态核对具名导入与「用了但没导入」；再跑 4 项定向回归检查 | 每次增删模块或改导入之后 |
| `check-interaction.py` | 在真实页面里派发 click/change/cancel 事件，验证按钮有反应、选照片流程正常、各页面不报错 | 每次改页面或交互之后 |
| `verify-regression-checks.py` | 把 4 个历史问题重新注入源码，确认检查会转红，再自动还原 | 改动 `module-check.mjs` 的检查项之后 |
| `bundle-standalone.mjs` | 把 `index.html` + `src/` 内联成一个 HTML | 每次改完源码、要交付单文件版时 |
| `check-standalone.py` | 用无头浏览器打开 `file://` 下的单文件版，校验 7 个页面能渲染；`--shot` 可出图 | 打包之后 |
| `contrast-check.mjs` | 计算设计令牌的实测对比度，`--emit` 可重新生成 `src/data/contrast-report.js` | 每次改配色之后 |
| `serve.py` | 本地静态服务，正确处理 ES Module 的 MIME 类型，支持局域网访问 | 每次要开发调试 |
| `capture-screenshots.py` | 用无头 Edge 批量截运行截图到 `docs/screenshots/` | 需要交参赛材料截图时 |
| `check-screenshots.py` | 检查截图像素边界，判断内容有没有被裁切 | 怀疑截图有问题时 |

> `module-check.mjs` 里那条「具名导入静态交叉核对」是补出来的：
> 曾经在 `src/app.js` 里 import 了一个并不存在的 `saveProfile`，
> 语法检查通过、页面却整片白屏。这条检查专门防这类问题。

## 「定向回归检查」为什么存在

「点了按钮没反应」这类问题有个共同点：**语法检查查不出来，前面几页还一直正常**，
只在真实点击到某一步时才炸。所以 `module-check.mjs` 里固化了 4 条断言，
每条都对应一个真实踩过的坑：

| 断言 | 对应的问题 |
| --- | --- |
| `pickPhoto` 里不许出现 `window` 的 `focus` 监听 | 旧实现用「窗口重获焦点 + 1.2 秒超时」判断用户取消，选照片慢一点就被提前判成取消，表现就是点了没反应 |
| 任何页面用了 `fill()` 必须从 `ui/dom.js` 导入 | `confirm.js` 漏了导入，「重拍照片」后整页报错 |
| `.speaker-bar` 用了 `display:flex` 就必须写 `[hidden]` 规则 | `display:flex` 会盖掉 `hidden` 属性，语音条跑到了每一页上 |
| `.btn:active` 里不许出现 `transform` | 触屏上元素位移会让浏览器丢弃这次点击 |

`verify-regression-checks.py` 会把上面 4 个问题重新注入源码、确认检查转红、再自动还原，
所以这些断言本身也是被验证过的，不是摆设。

> 曾经试过另起一个沙箱目录来跑这套「注入验证」，但无头浏览器在临时沙箱里
> 跑模块脚本不稳定（同样的代码在仓库里能跑、在沙箱里连模块都不执行），
> 于是改成静态检查 + 注入还原的方式：更快，而且没有假警报。

## 单文件版是怎么打出来的

浏览器在 `file://` 下会以 CORS 为由拒绝加载 ES Module，所以「双击 index.html」
必然白屏。`bundle-standalone.mjs` 的做法是：

1. 读入 `src/` 下全部模块；
2. **先把注释替换成等长空白**——JSDoc 里会出现 `import('./rules.js')` 这类示例，
   不先抹掉就会被当成真代码，从而解析出不存在的模块；
3. 把 `import` 改写成 `__require('路径')`，把 `export` 改写成给 `__exports` 赋值；
4. 按依赖关系排序后装进一个约 40 行的模块注册表，用 `Proxy` 转发导出，
   保持与 ES Module 相同的 live binding 语义；
5. 把 CSS 与页面结构一并内联，输出单个 HTML。

额外的两层保险：注册表外面加了一个**启动守卫**，任何模块抛错都会在页面上
显示一句人话加一行错误信息，而不是留一片白屏；打包时如果遇到没处理干净的
`import` / `export` / `export *`，直接报错退出而不是生成坏文件。

## 为什么截图要过一层 iframe

无头浏览器的 `--window-size` 与真实 CSS 视口宽度并不相等，
直接 `--screenshot` 会截出一张被裁掉右边的图（表现为文字被切一半）。
`capture-screenshots.py` 的做法是：先打开一个内嵌 **390×844 iframe** 的页面，
应用在 iframe 里以真实手机宽度排版，截完再把多余的空白裁掉。
输出固定为 `780×1688`（390×844 @2x）。

要手动截某一张：

```bash
python tools/capture-screenshots.py 07          # 只截文件名以 07 开头的那张
```

单文件版的截图走 `check-standalone.py --shot`。它不能复用上面那套：
无头浏览器在 `file://` 下会把 iframe 放进独立进程（站点隔离），父页面读不到内容、
也常常渲染不出来，所以它改为临时起一个只监听本机的静态服务，截完立刻关掉。

## URL 参数（演示与自动化都用）

| 参数 | 位置 | 作用 |
| --- | --- | --- |
| `?profile=allergy` | 问号参数（在 `#` 之前） | 预设画像：花生 + 牛奶过敏、控糖控盐 |
| `?profile=plain` | 同上 | 预设画像：无过敏、仅留意血压 |
| `?profile=none` | 同上 | 基准画像：什么都不设，用于看「纯绿色」结论 |
| `?reset=1` | 同上 | 启动时清空当日记录，让演示用例可重复 |
| `?mock=low` | 同上 | 仅显式指定 prefer=mock 时控制低置信度，不影响正常照片 |
| `?mock=high` | 同上 | 仅显式指定 prefer=mock 时控制高置信度，不影响正常照片 |
| `#/result?case=<id>` | hash 路由 | 直接打开某个内置演示用例的结果页 |
| `#/settings`、`#/help` … | hash 路由 | 直接打开指定页面 |

⚠️ `?profile=` **会保存到本地画像**。设成 `allergy` 之后再打开纯牛奶会正确地判成红色
（对乳制品过敏），这不是 bug；想回到基准画像要显式加 `?profile=none`。
自动化检查就因为没注意这一点误报过一次。

组合示例（一条链接直接进入「花生过敏 + 红色结论」画面）：

```
https://metal783.github.io/foodlenscare/?profile=allergy&reset=1#/result?case=peanut-cookie
```

用例 id 见 `src/data/sample-labels.js`：`peanut-cookie`、`sugar-drink`、
`spinach-noodle`、`plain-milk`、`blurry-photo`、`sausage`。
