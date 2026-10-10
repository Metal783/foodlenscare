# 第三版静态入口

index.html 是由 tools/prepare-pages.py 生成的单文件副本，不手动编辑。

此目录供单机页面/OCR体验使用。静态托管不包含家庭服务，登录、绑定、共享和关怀语音通信请使用项目根目录“启动第三版.cmd”或“启动第三版局域网.cmd”。

修改源码后重新运行 node tools/bundle-standalone.mjs 与 python -X utf8 tools/prepare-pages.py。
