# 宝宝照护 Android App

这是与网页部署并行的原生 Android 壳工程。App 不复制服务端，也不改变现有网页构建；它会加载用户选择的完整网站地址，从而继续使用现有同源 Cookie、实时更新和离线缓存。

## 功能

- 首次启动选择外网或局域网服务器
- 外网地址强制使用 HTTPS
- 局域网允许私网 HTTP/HTTPS 地址
- 切换前测试 `/api/health`
- 局域网和外网的 Cookie、缓存、离线队列相互隔离
- 支持头像和 JSON 备份文件选择
- 支持携带当前登录 Cookie 下载备份
- 证书错误直接阻止，不允许忽略继续
- 状态栏和系统导航栏跟随浅色/深色主题，无重复原生标题栏
- 网页设置页在 Android App 内显示“服务器环境”入口
- 不申请麦克风、相机或存储权限

## 构建要求

- Android Studio Quail 1（2026.1.1）或兼容版本
- JDK 17（Android Studio 自带即可）
- Android SDK 36 / Build Tools 36.0.0
- Android Gradle Plugin 9.2.0 / Gradle 9.4.1

本机当前没有 Java 和 Android SDK，因此工程创建后尚未在本机编译。安装 Android Studio 后直接打开本目录并等待同步，或在具备 JDK 17 和 SDK 36 的环境运行：

```bash
./gradlew assembleDebug
```

生成文件位于：

```text
app/build/outputs/apk/debug/app-debug.apk
```

## 地址示例

```text
外网：https://baby.example.com
局域网：http://192.168.1.10:5937
模拟器访问开发电脑：http://10.0.2.2:5937
```

外网不要填写裸露的后端端口，应使用配置好证书的 HTTPS 域名。局域网 HTTP 只应在可信家庭网络使用。

## 使用说明

首次启动必须通过连接测试才能进入。之后可从右上角菜单选择“切换服务器”。切换到不同地址后可能需要重新登录，这是两个网站来源的安全隔离结果。

备份导出文件由 Android 下载管理器保存到 App 专属下载目录，并在完成后显示系统通知。头像上传和备份导入使用系统文件选择器。
