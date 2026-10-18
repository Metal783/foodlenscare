# 食护家安卓工具目录

统一目录：D:\Foodlenscare-Android。未安装 Android Studio，没有修改系统全局 JAVA_HOME。

| 文件夹 | 用途 |
| --- | --- |
| apk | Foodlenscare-Android-Demo.apk，发到安卓手机安装 |
| jdk/jdk21 | Microsoft OpenJDK 21，包含 javac 和 jlink，编译安卓 |
| sdk | Android SDK 命令行工具、平台 36、构建工具、platform-tools |
| gradle-cache | Gradle 下载与编译依赖缓存 |
| npm-cache | 新增 npm 下载缓存，原 Node 继续使用 D:\node |
| android-user | 安卓配置及 debug.keystore 测试签名，保留且不要分享 |
| downloads | 官方工具原始下载压缩包 |

重新打包：在项目目录双击“打包安卓.cmd”。APK 每次输出到 apk 文件夹。同一签名可覆盖安装测试版；此包不用于应用商店正式发布。

使用：电脑双击“只启动后端.cmd”（或 `启动完善版.cmd`），手机和电脑连接同一 Wi-Fi，App 欢迎页或设置填写电脑实际 WLAN 地址，例如 http://172.20.10.2:5184。地址变化只需在 App 更新，不需要重新打包。电脑后台必须保持运行。

SDK 官方下载：https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip

SHA256：90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a

JDK 官方下载：https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip

本次下载 SHA256：192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f

相机、麦克风、手机 OCR 性能和两台手机互通仍需真机验证。当前验证码是测试码，未配置真实短信、微信认证或后台推送。
