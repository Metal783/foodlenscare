# 食护家 · 第五版（完善版）

当前版本：**5.0.0 · 20261018-1**。双击 `启动完善版.cmd` 即可运行最新版；旧的 `启动第四版.cmd` 已移除。

GitHub：<https://github.com/Metal783/foodlenscare>（`main` 与 `version-5` 均为本版）。在线单机演示：<https://metal783.github.io/foodlenscare/>，使用 `docs/` 构建，只能体验游客拍照识别与标签核对；登录、家庭绑定、关怀语音、AI 助手需要本机启动 Python 服务。首次在线识别需下载约 50MB 本机 OCR 模型，网络慢时可能等待较久；本机启动器使用本地模型，不需要下载。

2026-10-17新增三项功能：老人识别结果及本人历史详情可打开“选购替代思路”“日常搭配建议”，填写用餐场景或准备方式偏好，主动同意后生成并继续追问。两端标签下新增“查看标签核对清单”，本机列出配料、口径、营养字段、过敏原声明及储存日期的核对方向，可临时勾选和朗读；无需密钥，不修改OCR结果。详见 `AI功能扩展说明-2026-10-17.md`。

2026-10-17助手体验优化：食品追问/包装解读新增常用问题，点选后可修改再发送；食品回答、识别回顾与关怀草稿均可停止朗读。生成过程中可取消等待，迟到结果不会恢复；食品追问保留问题并重新开始对话。过敏提醒和对比口径限制独立展示，重新生成草稿会清除旧文字及核对状态。变更和验证结果持续记录在 `CHANGELOG.md`。

2026-10-17第二批AI扩展：老人“健康记录”和子女首页新增近7天识别回顾，先查看真实摘要，再主动生成解读。子女可生成、编辑、朗读关怀草稿，核对后复制或带入录音页参考；不会自动发送。老人需在设置另行开启“允许家人AI整理记录”，并已共享食物记录。仅向模型发送最小食品摘要，识别记录不代表实际食用。详见 `AI功能扩展说明-2026-10-17.md` 与 `CHANGELOG.md`。

2026-10-17新增食品助手：老人本人在识别结果或历史详情中可点击“为什么这样建议”“解释包装说法”“和另一款比较”。支持连续追问、短回答/展开说明/朗读，以及从本人历史选择或拍摄上传第二款标签。需使用自己的DeepSeek密钥，并在提交问题前单独勾选授权；仅打开页面不调用模型。使用说明见 `AI功能扩展说明-2026-10-17.md`。

这是供队友运行、演示和继续开发的项目副本，整理日期：2026-10-18。

包含最新网页源码、已构建网页（`dist/` 本地版、`docs/` Pages 版）、本机OCR资源、Python后端及安卓工程源码。没有携带原作者的API密钥、账号数据库、健康资料、识别照片、家庭绑定或语音数据。启动后会生成你自己的本地数据。

2026-10-17缺陷修复：历史返回白屏、失效会话恢复、迟到相机流释放、资料独立共享、需留意统计口径、低置信度AI输入和请求超时已修正。记录同步增加版本检查与每页50条列表，照片及语音按需读取；页面隐藏时暂停轮询。AI未开启或失败时显示已有本地疾病核对提醒。详见 `缺陷修复说明-2026-10-17.md`。

更新后请关闭旧后端，重新双击 `启动完善版.cmd` 并刷新网页，让前后端同时使用本版。既有数据保留；本次未生成新APK。

## 1. 先运行看看

电脑需要 Python 3.10 或以上版本，以及新版 Edge / Chrome。后端仅使用 Python 标准库，不需要 `pip install`。只运行已构建网页，不需要 Node.js 或 Android Studio。

1. 将整个文件夹解压到本地，不要在压缩包里直接运行。
2. 双击 `启动完善版.cmd`。
3. 浏览器会打开软件；默认地址是 `http://127.0.0.1:5184/`。端口被占用时会顺延，以终端显示的地址为准。
4. 保持终端运行，可以最小化。关闭浏览器不等于关闭后端；终端内按 Ctrl+C 可停止服务。

如果双击失败，在项目目录打开 PowerShell：

```powershell
python -X utf8 tools/family_server.py --open
```

也可以使用 `py -3 -X utf8 tools/family_server.py --open`。Linux/macOS 使用 `python3`。

不要直接双击 `dist/index.html`，登录、绑定和共享功能需要后端。

### 测试老人端和子女端

- 一个普通浏览器窗口和一个隐私窗口，分别登录两个不同手机号，选择老人、子女身份。不要在共享同一登录Cookie的两个普通标签页中测试两个账号。
- 登录验证码显示在页面中，是本地测试码，不会真的发送短信。
- 老人生成5分钟有效的绑定码，子女填写发送申请，再由老人确认并选择共享范围。
- 使用自己的食品包装照片测试。识别成功不自动保存，点击保存后才进入历史并共享。
- 摄像头不可用时可以选择本地图片；桌面端 `localhost` / `127.0.0.1` 可用于录音权限测试。

## 2. API说明

**已去掉真实API密钥和本机私有配置，保留接口实现。** 未配置密钥时，OCR、登录、绑定、保存记录和语音功能仍可使用，DeepSeek智能分析不可用，不会伪造分析结果。

需要分析时，请使用自己的密钥，不要向原作者索取私有配置：

```powershell
New-Item -ItemType Directory -Path _local -Force
Copy-Item deepseek.example.json _local/deepseek.json
```

编辑新文件，把 `apiKey` 的空字符串替换为自己的密钥。模型名称在同一文件中设置，应使用你的账号可用模型。配置后重启后端。

- 服务端读取位置：`_local/deepseek.json`。
- 也支持环境变量 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`，环境变量优先。
- 不要把密钥放在 `src/`、`public/`、`dist/`，也不要放在前端环境变量或手机包中。
- `tools/deepseek_analysis.py` 负责服务端调用；前端通过自己的后端请求分析。
- 使用真实API会产生费用。只在有明确需要时测试，不要把回归测试改为批量调用真实模型。

## 3. 想改代码

本次构建与测试使用 Node.js 24.15.0、Python 3.13.5。继续开发可使用 Node.js 24 系列；项目构建最低要求为22.12，但下列直接执行TypeScript模块的自测在较早版本中可能需要额外参数。在本目录执行：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build        # 本地版 dist/，资源使用根路径
npm.cmd run build:pages  # GitHub Pages 版 docs/，资源使用 /foodlenscare/ 子路径
```

`npm ci` 根据锁文件安装依赖，需要联网。`node_modules` 没有放进分享包，安装后会自动生成。修改前端后，需要重新构建，再刷新浏览器查看；只修改Python代码时，需要重启后端。`dist/` 供 `启动完善版.cmd` 使用，`docs/` 供 GitHub Pages 使用，两者不要混用；发布网页后应同时更新 `dist` 与 `docs`。

### 开发时热更新

终端一启动后端：

```powershell
python -X utf8 tools/family_server.py --host 127.0.0.1 --port 5184
```

终端二启动Vite前端：

```powershell
npm.cmd run dev -- --port 5173
```

此时访问 `http://localhost:5173/`，前端会把 `/api` 代理到本机5184端口。若后端用了其他端口，在启动Vite前设置 `$env:FLC_API_URL='http://127.0.0.1:实际端口'`。

### 常用修改位置

| 路径 | 内容 |
| --- | --- |
| `src/App.tsx`、`src/Onboarding.tsx` | 主流程、登录后身份与资料填写 |
| `src/ElderHome.tsx`、`src/ElderSettings.tsx` | 老人首页、设置 |
| `src/ChildApp.tsx` | 子女首页、记录、家人、设置及通知开关 |
| `src/FoodRecognition.tsx`、`src/recognition.ts` | 拍照/上传、OCR与结果流程 |
| `src/FoodLabel.tsx`、`src/SavedFoodResult.tsx` | 当前识别及已保存记录的结果展示 |
| `src/SmartAnalysis.tsx`、`src/analysisCopy.ts` | 智能分析展示、内容整理及朗读文本 |
| `src/backend.ts` | 前端请求、账号状态、双端同步 |
| `tools/family_server.py` | Python HTTP服务、SQLite、家庭权限和API路由 |
| `tools/deepseek_analysis.py` | DeepSeek配置、请求、输入筛选和输出校验 |
| `src/FoodAssistant.tsx`、`src/analysisInput.ts` | 食品追问、包装解读、对比与输入白名单 |
| `tools/food_assistant.py`、`tools/assistant-allergens.json` | 食品助手上下文、比较换算、过敏保护；词典快照由既有本地词典生成 |
| `src/recordNotifications.ts` | 新记录检测、去重和系统通知显示 |
| `src/birthDate.ts`、`src/DateWheelPicker.tsx` | 生日滚轮与年龄计算 |
| `src/mobile.ts`、`src/mobileCamera.ts` | Capacitor手机适配 |
| `src/legacy/` | 复用的识别解析与规则模块，不是可随意删除的旧垃圾文件 |
| `src/index.css`、`public/` | 原界面样式、图标、音频、OCR引擎与模型 |
| `.figma/make/site.json` | Vite配置引用的构建配置，不能漏掉 |
| `dist/` | 已构建的网页；由构建生成，不在这里手工改功能 |
| `android/`、`capacitor.config.ts` | 安卓工程与打包配置 |

原有协作约定见 `AGENTS.md`。默认保留 `src/index.css` 和原始素材；不要只修改当前结果页，漏掉历史记录详情。共享权限必须由服务端检查，不能只在界面上隐藏按钮。

## 4. 修改后检查

```powershell
npm.cmd run typecheck
npm.cmd run build
node tools/rule-selftest.mjs
node tools/record-notifications-selftest.mjs
python -X utf8 tools/check-v4-api.py
node tools/version-fixes-selftest.mjs
python -X utf8 tools/check-version-fixes.py
node tools/assistant-input-selftest.mjs
python -X utf8 tools/check-food-assistant.py
```

这些检查不需要真实DeepSeek密钥，API检查使用隔离数据库，不修改你的正式数据。

双账号浏览器检查还需要额外准备 Playwright 和 Edge：设置 `FLC_PLAYWRIGHT_PATH` 为你本机Playwright包目录，可选设置 `FLC_BROWSER` 为浏览器可执行文件，再运行 `node tools/check-v4-browser.cjs` / `node tools/check-record-notifications.cjs`。测试中的系统通知权限与显示使用模拟适配器，不代表手机后台推送验证。部分其他历史检查含原作者的环境路径，使用前按自己的环境调整。

本次8项缺陷的专项浏览器回归：`node tools/check-version-fixes.cjs`，使用隔离账号与数据库、真实本地OCR及挂起的分析状态请求验证超时，不调用真实DeepSeek。新增照片/音频接口每次检查权限，媒体仅在当前页面会话内做有容量限制的内存缓存，不加入离线缓存。旧版完整记录与语音接口保留兼容。

食品助手专项浏览器检查：`node tools/check-food-assistant.cjs`。回答使用模拟服务，第二张标签通过真实本地OCR读取，测试不会消耗真实模型额度。修改本地过敏词典后需同步服务端 `assistant-allergens.json`；输入自测会检查二者一致。

选购、搭配与核对清单已纳入上述食品助手专项，服务端检查为 `python -X utf8 tools/check-food-assistant.py`；清单字段边界检查为 `node tools/label-checklist-selftest.mjs`。清单勾选只表示本次查看，收起或来源标签变化后清除，不等于确认识别正确。

识别回顾/关怀草稿专项：`python -X utf8 tools/check-record-insights.py` 与 `node tools/check-record-insights.cjs`。覆盖服务端统计、最小化输入、家庭独立授权、生成后撤权/数据变更复核、编辑复制及录音参考；使用隔离数据库和模拟模型响应。

`tools/check-design-preserved.py` 需要原始Figma界面压缩包，本分享包没有附带该历史压缩包；不要把缺少外部文件误认为应用运行失败。

## 5. 数据、手机与局域网

- 正式本地数据会生成在 `_local/`：包括SQLite数据库和可选API配置。请勿再分享这个目录。
- 浏览器也可能保存本地偏好及游客记录。普通账号、隐私窗口、不同浏览器的数据并不完全共用。
- 本分享包不含现成APK，也没有重新打包原作者的手机App；安卓源码用于后续开发。APK资源需在你自己的环境执行 `npx cap sync android` 后生成。
- 安卓打包需要JDK 21、Android SDK及Gradle依赖；`tools/build-android.ps1` 默认工具目录是原作者的 `D:\Foodlenscare-Android`，使用前需要准备工具并按自己的路径调整。SDK路径配置、签名密钥和编译缓存均未分享。
- 仅演示电脑网页不需要配置安卓环境，也不需要USB线。
- 局域网可用 `只启动后端.cmd` 或 `python -X utf8 tools/family_server.py --host 0.0.0.0`。设备要能访问该电脑实际局域网地址和端口，并由你确认防火墙放行。
- 手机浏览器通过局域网HTTP访问时，相机/麦克风可能受安全上下文限制；不要将其等同于真机App权限问题。
- 当前通知依赖页面运行，没有手机后台推送。系统权限和“允许通知”开关都开启、且老人授权记录共享后，保存新记录才提醒。
- 每日摄入打分仍处于讨论阶段，没有实现；识别记录不代表真实食用。
- 当前是本机/可信局域网开发演示版，不要直接暴露到公网。真实短信/微信登录、生产HTTPS、后台推送和正式发布流程需另行接入。

## 6. 本次没有带走的东西

原作者的 `_local/`、`_qa/`、`node_modules/`、`无用/`、`附件/`、Python缓存、安卓编译缓存、机器SDK路径、签名文件和手机安装包均未复制。接口源码及空密钥模板是开发所需文件，不是泄漏的密钥。
