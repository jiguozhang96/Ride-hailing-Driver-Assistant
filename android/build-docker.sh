#!/usr/bin/env bash
# 用 Docker 构建安卓 APK（无需本机安装 Android Studio / JDK）
# 依赖：本机有 Docker；首次运行会拉取 android 构建镜像（约 4GB，需耐心等待）
set -e

cd "$(dirname "$0")"

echo "==> 1/3 安装 Capacitor 依赖并生成 android 原生工程"
if [ ! -d "android/android" ]; then
  docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npm install --no-audit --no-fund && npx cap add android"
fi

echo "==> 2/3 同步 H5 到 android 工程"
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npx cap sync android"

echo "==> 3/3 用 android 镜像构建 APK"
docker run --rm -v "$(pwd)":/app -w /app cimg/android:2024.01 bash -c "cd android/android && ./gradlew assembleDebug"

echo ""
echo "✅ APK 已生成：$(pwd)/android/android/app/build/outputs/apk/debug/app-debug.apk"
