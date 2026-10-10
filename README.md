# 食护家 · 第三版

当前版本：**3.0.1 · 20261010-2**。前端已按13张设计稿更新。在线打开优先读取最新页面，断网可读取已缓存版本，升级保留固定OCR模型和本人数据。

**实际使用请双击“启动第三版.cmd”**。`第三版前端设计对照.html` 是最新版界面截图预览，点击图片下方“进入应用”可进入实际页面；原设计放在可展开参考区。不要把截图当成可操作页面。

最新代码、启动入口和功能说明均在此目录。第一版、第二版保留，不修改。

GitHub仓库：[Metal783/foodlenscare](https://github.com/Metal783/foodlenscare)，最新版位于 `main` 分支。下载整个项目后，使用下方的第三版启动文件。仓库不包含本机账号数据库或家庭记录；最新应用截图已包含，原设计参考需要本机另有同级 `UI界面` 目录。GitHub静态页面提供单机体验，家庭登录、绑定与同步需启动Python服务。

## 如何打开

- 电脑：双击 **启动第三版.cmd**，浏览器自动打开；保持启动窗口开启。
- 手机和家人设备：双击 **启动第三版局域网.cmd**，连接同一 Wi-Fi，打开窗口打印的局域网地址。两位家人访问同一台电脑的服务，用不同测试手机号登录。
- 只看单机功能：双击 **FoodLensCare-standalone.html**。家庭服务、登录和同步需要启动上述服务。

需要电脑已安装 Python。应用运行不需要 npm install、前端框架或云端 OCR 密钥；PaddleOCR 引擎和模型随目录附带。

## 本轮按顺序完成

1. 识别历史与食用记录分开，照片持久保存，记录详情、日期筛选、餐次与本周统计。
2. 欢迎页、手机号测试登录、游客跳过、老人/子女身份、基础资料及两套导航。
3. 家庭邀请绑定码、老人确认、主要联系人、分别授权食物记录和饮食设置、真实服务端访问控制。
4. 子女概览、切换老人、食物记录和详情、家人管理、双方设置与隐私帮助。
5. 关怀录音/试听/重录/发送、接收端送达和播放回执、应用内通知偏好、联系人拨号与本人配置的求助号码。

详细状态见 [第三版功能完成清单.md](第三版功能完成清单.md)，历史变更见 [CHANGELOG.md](CHANGELOG.md)。

## 两位家人的体验顺序

1. 老人登录：勾选协议，输入测试手机号，获取页面显示的测试验证码，登录后选择“我是老人”，填写资料。
2. 子女在另一浏览器或设备登录另一个测试手机号，选择“我是子女”。
3. 任一方在“添加家人”生成绑定码交给另一方；另一方提交绑定申请。
4. 老人在“子女守护”确认关系，分别打开食物记录与饮食设置共享开关，需要时设为主要联系人。
5. 老人拍包装并核对标签。识别历史自动保存；只有点击“我已吃了”才累计摄入。子女刷新后能查看获准记录。
6. 子女在关怀语音录音并试听，发送后老人进入首页或语音页接收播放；子女刷新查看送达与播放状态。
7. 老人关闭共享后，子女的下一次查询会被服务端拒绝；解除绑定后不能继续取得双方语音。

## 当前真实边界

- **测试验证码直接显示在页面，不发送短信；微信登录未接入。** 这是用户选择的本机/局域网可运行版本，不能当作公网身份验证。
- 电脑 localhost 可以申请麦克风。普通手机局域网 HTTP 受浏览器限制，界面提供选择已有录音发送；手机直接录音需要可信 HTTPS 安全访问。
- 通知是应用内提示，不是手机系统推送；页面需保持运行。
- 紧急求助打开本人配置号码的拨号入口，不会自动派出救援。
- “其他”疾病/过敏信息可以填写与共享，但不会凭自由文本自动扩展诊断或过敏词典。
- 照片仍在浏览器本机完成 OCR；登录后的本人资料、识别记录、照片及发送的语音保存到这台电脑的家庭服务。游客数据只在当前浏览器。

## 数据和备份

家庭服务数据库：`_local/family.sqlite3`。关停服务后可备份整个 `_local` 目录；此目录不会通过网页公开。

本机照片：浏览器 IndexedDB；资料、记录元数据和偏好：按账号隔离的 localStorage。登录后的本人记录可以通过家庭服务恢复到新浏览器。游客数据不会自动并入账号。

`_qa/第三版截图/` 与 `docs/screenshots/` 只保留本次第三版自动验收截图，含明确标注的隔离测试数据；测试数据库不会留在正式服务中。

第三版的旧说明、旧截图、弃用OCR资源和旧启动别名已移出本目录，归档至 `D:/foodcare/历史资料/第三版整理前_20261010`。保留的源码与工具均用于当前功能或当前回归检查。

## 开发和检查

```powershell
python -X utf8 tools/family_server.py --open
node tools/rule-selftest.mjs
node tools/module-check.mjs
python -X utf8 tools/check-interaction.py
python -X utf8 tools/check-v3-api.py
node tools/check-update-browser.cjs
node tools/regions-selftest.mjs
node tools/review-selftest.mjs
node tools/contrast-check.mjs
```

新增页面与跨账号浏览器验证脚本是 `tools/check-v3-browser.cjs`，真实 OCR 回归为 `tools/check-real-ocr.cjs`。它们使用开发环境已有的 Playwright，可用 `FLC_PLAYWRIGHT_PATH` 指向包目录；不增加用户运行依赖。

源码修改后生成可双击入口及静态副本：

```powershell
node tools/bundle-standalone.mjs
python -X utf8 tools/prepare-pages.py
node tools/check-v3-browser.cjs
python -X utf8 tools/prepare-v3-preview.py
python -X utf8 tools/check-standalone.py
python -X utf8 tools/check-standalone.py --pages
```

静态托管只支持单机功能。第三版家庭能力以 Python 家庭服务为准，本次没有发布到公网或推送 GitHub。
