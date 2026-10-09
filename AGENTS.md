# AGENTS.md · 食护家 FoodLensCare

给 AI 编码助手的项目约定。**动手前请先读完本文件**，这里的每一条都来自实际踩过的坑。**每次工作完应更新 CHANGELOG.md**

---

## 一、这个项目是什么

面向老年家庭的**食品标签智能解读 H5**：老人拍一张食品包装照片，系统用一句听得懂的话告诉他「这个能不能吃、为什么」。

参赛作品：2026 年第十四届全国大学生数字媒体科技作品及创意竞赛 · 自主选题类 · 移动与网络应用开发。

**产品判断优先于技术炫技**：全流程零键盘输入，用户唯一动作是拍一张照片；系统承担全部术语翻译，最终交付的不是数据而是一句可朗读的人话。

---

## 二、技术栈：零依赖、无构建（不要引入框架）

**这是硬约束，不是偏好。**

- 31 个 ES Module + 2 个 CSS，**没有 `package.json`、没有 `node_modules`、没有构建步骤**。
- 不要引入 React / Vue / Svelte / Tailwind / 任何打包器。原因：作品定位是「扫码即用的 H5」，首屏体积与离线可用性优先；上框架会破坏单文件版打包链路（`tools/bundle-standalone.mjs`）与静态导入检查（`tools/module-check.mjs`）。
- 页面用 `src/ui/dom.js` 的 `h()` / `fill()` / `button()` / `topbar()` 组合式构建。加新 UI 请沿用这个模式，重复结构抽成 `src/ui/` 下的纯函数组件。
- 状态集中在 `src/app.js` 的 `state` 与 `src/core/store.js`，不引入状态库。

---

## 三、目录即地盘（改动前先认清归属）

```
src/pages/      交互层：每屏一个动作，页面只组装、不写样式细节
src/core/       业务核心：rules 规则引擎 / flow 闭环动作 / store 本地存储 / speech / router
src/recognize/  感知层：质量检测 + 双通道（视觉大模型 / 华为 OCR）+ mock、demo 降级
src/data/       数据层：致敏原、添加剂、营养阈值，全部引用国标
src/ui/         视图工具：dom.js（微 DOM）/ icons.js（内联 SVG）
src/styles/     tokens.css 设计令牌 + app.css 组件样式
tools/          自检脚本与打包脚本（删掉不影响应用运行）
docs/           GitHub Pages 入口 + 参赛截图（脚本生成）
_qa/            截图台与测试台（仅开发用）
```

### 公共接口文件（改这些要格外小心）

以下文件被多个模块依赖，**改它们等于改接口**。改前先想清楚影响面，改后**必须更新对应的 `@typedef` JSDoc**（那份 typedef 就是这个项目的接口文档）：

- `src/app.js` —— 路由注册与全局状态
- `index.html` —— 应用外壳与语音条
- `src/core/store.js` —— 画像字段与记录结构
- `src/core/flow.js` —— 闭环编排
- `src/styles/tokens.css` —— 字号、色板、点击区域

---

## 四、生成物：绝对不要手动编辑

以下文件**都是脚本产物**，手改会被下次生成覆盖，且会导致巨型合并冲突：

| 生成物 | 由谁生成 |
| --- | --- |
| `FoodLensCare-standalone.html` | `node tools/bundle-standalone.mjs` |
| `docs/index.html` | `python tools/prepare-pages.py` |
| `docs/screenshots/*.png` | `python tools/capture-screenshots.py` |
| `src/data/contrast-report.js` | `node tools/contrast-check.mjs --emit` |

**规则**：改了 `src/` 之后才重新生成，且由集成负责人在合并后统一跑。日常 PR 里不要包含这些文件。

---

## 五、改完必须自测（不要凭感觉说"应该没问题"）

```bash
node tools/rule-selftest.mjs        # 规则层与解析层：74 项断言
node tools/module-check.mjs         # 模块导入导出 + 具名导入/调用 + 4 项定向回归
python tools/check-interaction.py   # 交互回归：真实点击驱动按钮
```

改动范围与必跑项：

| 你改了什么 | 必跑 |
| --- | --- |
| `src/core/rules.js`、`src/data/*`、`parse-label.js` | `rule-selftest.mjs` |
| 增删模块或改 import | `module-check.mjs` |
| 任何页面或交互 | `check-interaction.py` + `module-check.mjs` |
| 配色 / `tokens.css` | `contrast-check.mjs`（对比度必须 ≥ 4.5:1） |
| 源码改完、要交付 | `bundle-standalone.mjs` + `check-standalone.py` |

**交付前完整跑一遍**：

```bash
node tools/rule-selftest.mjs
node tools/module-check.mjs
python tools/check-interaction.py
node tools/bundle-standalone.mjs
python tools/check-standalone.py
python tools/prepare-pages.py
python tools/check-standalone.py --pages
```

### 四条被固化下来的回归断言（改代码时别踩）

`tools/module-check.mjs` 里有 4 条断言，每条对应一个真实踩过的坑：

1. `pickPhoto` 里不许出现 `window` 的 `focus` 监听（旧实现用「重获焦点 + 1.2 秒超时」判取消，选照片慢的老人会被提前判成取消，表现是"点了没反应"）。
2. 任何页面用了 `fill()` 必须从 `ui/dom.js` 导入（`confirm.js` 曾漏导入，"重拍照片"后整页报错）。
3. `.speaker-bar` 用了 `display:flex` 就必须写 `[hidden]` 规则（`display:flex` 会盖掉 `hidden` 属性，语音条跑到每一页上）。
4. `.btn:active` 里不许出现 `transform`（触屏上元素位移会让浏览器丢弃这次点击）。

---

## 六、代码约定

- **纯中文注释与文案**。注释解释「为什么这么做」，不是「这行在做什么」——尤其要写清踩过的坑。
- **零依赖**。能用原生 API 就不要引库。
- **所有确定性判断放规则层**（`rules.js`），纯本地执行；模型只负责「理解与表达」。不要在识别层做风险判断，也不要在表达层编造结论。
- **信息不足时给灰色等级并请用户补拍**，绝不编造答案。
- **区分「规则判定」与「模型推测」**：依据面板（`buildBasis`）必须明确标注来源，两者不可混淆。
- **风险等级四重编码**：颜色 + 文字标签 + 图标 + 语音，颜色不得作为唯一信息载体（适老化硬要求）。
- **字号写法**：文字用 `calc(N * var(--fs-scale) * 1rem)`，布局尺寸不用，这样三档字号只影响文字不影响布局。
- **不写 `innerHTML` 拼用户数据**（`h()` 的 `html:` 选项只用于可信的内联 SVG 图标）。
- **隐私红线**：画像与记录只存 `localStorage`，不上传、不埋点、无账号体系。照片只在本机内存流转。
- **密钥红线**：`src/recognize/config.js` 里 AK/SK 必须留空或走后端转发。**前端放密钥 = 公开密钥**，任何"先填上试试"的改动都不允许提交。

---

## 七、适老化硬指标（改 UI 时的红线）

| 要求 | 本项目标准 |
| --- | --- |
| 字体 | 全站无衬线；正文三档 20 / 24 / 29 px；结论文字为正文 1.6 倍 |
| 行距 | ≥ 1.3 倍（本项目用 1.5）；段间距 = 行距 × 1.3 |
| 对比度 | ≥ 4.5:1（本项目实测最低 5.45:1），改配色后必须重测 |
| 点击区域 | 主操作按钮 96×96 px；次级按钮 ≥ 60×60 px |
| 手势 | 只允许单指点击与上下滑动，禁止 3 指及以上 |
| 禁止项 | 零广告、零弹窗、零诱导按键；提示一律用非打断式轻提示（`toast`） |

另有三条面向老年认知的设计原则：**一次只问一件事**（画像拆 5 屏单问题）、**确认代替输入**（全站无输入框）、**撤销始终可用**（每步都有返回）。

---

## 八、本地开发

```bash
python tools/serve.py            # 默认 0.0.0.0:5173，会打印本机与局域网两个地址
python tools/serve.py --port 8080
```

必须用本地服务的原因：浏览器在 `file://` 下会以 CORS 为由拒绝加载 ES Module，直接双击 `index.html` 会白屏。

**调试入口**（浏览器控制台）：

```js
await FoodLensCare.selfTest();   // 跑规则层自测，输出表格
FoodLensCare.state               // 全局状态
FoodLensCare.debug.pickPhoto     // 自动化测试用的内部动作
```

---

## 九、URL 参数（演示与自动化都用）

| 参数 | 作用 |
| --- | --- |
| `?profile=allergy` / `plain` / `none` | 预设画像（等同用户勾选，**会保存**） |
| `?reset=1` | 启动时清空当日记录（演示用例可反复跑） |
| `?mock=low` / `high` | 模拟识别返回低/高置信度结果 |
| `#/result?case=<id>` | 直接打开某个内置用例结果页 |

用例 id 见 `src/data/sample-labels.js`：`peanut-cookie`、`sugar-drink`、`spinach-noodle`、`plain-milk`、`blurry-photo`、`sausage`。

⚠️ `?profile=` 会持久保存。设成 `allergy` 后再打开纯牛奶会正确判红——这是引擎应有的行为，不是 bug。回基准画像用 `?profile=none`。

---

## 十、Git 工作流

```
upstream = 团队主库
origin   = 自己的 fork
```

```bash
# 每次开工前（必须）
git fetch upstream && git merge --ff-only upstream/main

# 一分支一主题
git checkout -b feat/<你的名字>-<做什么>

# 推到自己 fork，然后向主库开 PR
git push origin feat/<你的名字>-<做什么>
```

**三条铁律**：

1. 分支只做一件事，别在一个分支里既改 UI 又改规则；
2. 每天至少合并一次，拖三天以上冲突难解；
3. **生成物（`FoodLensCare-standalone.html`、`docs/index.html`）只由集成负责人在合并后统一生成提交**，其他人不要提交这两个文件。

---

## 十一、改动前先问自己

1. 这个改动会不会影响公共接口文件？
2. 会不会动到生成物？
3. 对应要跑哪几个自测？
4. 有没有破坏适老化指标（字号缩放、对比度、点击区域）？
5. 有没有把「规则判定」和「模型推测」搅在一起？
6. 有没有可能泄露密钥或用户数据？

**不确定就停下来问，不要猜。**
