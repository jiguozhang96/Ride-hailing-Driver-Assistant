# 网约车跑单规划助手 · 安卓 App（Capacitor）

用 Capacitor 把现有 H5（`app/`）封装为安卓 APK。web-view 本地加载 H5，无需域名。

## 构建步骤

### 方式 A：Docker 一键构建（无需本机装 Android Studio）

```bash
cd android
bash build-docker.sh    # 用 cimg/android 镜像构建 APK（首次拉镜像约 4GB）
```

产物：`android/android/app/build/outputs/apk/debug/app-debug.apk`

### 方式 B：本机 Android Studio 构建

```bash
cd android
npm install                 # 安装 Capacitor 依赖
npx cap add android         # 生成 android/ 原生工程（首次）
npx cap sync android        # 同步 H5 到原生工程
npx cap open android        # 用 Android Studio 打开 → Build → Build APK
```

或用 Android Studio 打开 `android/android/` 目录直接构建。

## 密钥说明

- 安卓 app 内 REST 请求走「直连回退」（`/api/*` 在本地 web-view 下不可用，自动回退直连）。
- 请在 app 内「我的」页填入和风 API Host/Key、高德 Web服务 key（存本机 localStorage）。
- 高德「Web端 JS API」key + jscode 已预置在 `app/js/storage.js`（配域名白名单）。
- 若想隐藏 key，可扩展 Capacitor 主 Activity 内嵌 `proxy-server.js`（Node 无法直接跑在 Android，需改用 Capacitor 的 HTTP 插件拦截 fetch，见后续）。

## 说明

- 此工程只提供 Capacitor 配置与构建脚本；`android/android/` 原生工程由 `npx cap add android` 在本机生成。
- 构建 APK 需 Android Studio（含 SDK + JDK），本环境无法代构建。
