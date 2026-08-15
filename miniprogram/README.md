# 网约车跑单规划助手 · 小程序（uni-app）

用 uni-app 把核心算法引擎封装为小程序，一套代码编译到：**微信小程序 / H5 / App(安卓+iOS)**。

## 已包含

- `src/utils/engine/`：核心算法引擎（热力模型/动态规划/12城市点位库/限行），从 H5 版**零改动复制**。
- `src/utils/api.js`：平台适配层（`localStorage`→`uni.setStorageSync`、`fetch`→`uni.request`、定位→`uni.getLocation`）。
- 4 个页面：首页表单 / 今日规划 / 商圈热力排行 / 我的。
- `src/manifest.json`：已配置微信小程序 appid 占位、定位权限、安卓权限。

## 构建步骤

### 方式 A：HBuilderX（推荐，图形化）

1. 下载安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)。
2. 打开本项目 `miniprogram/` 目录。
3. 运行 → 运行到小程序模拟器 → 微信开发者工具（需先安装微信开发者工具并登录）。
4. 发行 → 小程序-微信 → 填写你的小程序 appid → 生成 `dist/build/mp-weixin/`。
5. 用微信开发者工具打开 `dist/build/mp-weixin/` 上传审核。

### 方式 B：CLI（Vue3 + Vite）

```bash
cd miniprogram
npm install
npm run dev:mp-weixin     # 开发（输出 dist/dev/mp-weixin）
npm run build:mp-weixin   # 构建（输出 dist/build/mp-weixin）
```

## 关键适配说明

| H5 原实现 | 小程序实现 |
|---|---|
| `localStorage` | `uni.setStorageSync`（见 `utils/api.js`）|
| `fetch('/api/*')` 代理 | 小程序无后端代理，天气/POI 用 `uni.request` 直连（需在后台配置合法域名：`*.qweatherapi.com`、`restapi.amap.com`）|
| `navigator.geolocation` | `uni.getLocation`（manifest.json 已声明 `scope.userLocation`）|
| 高德 JS API 地图 | 小程序不支持高德 JS SDK，地图/热力图改为列表/气泡展示（`pages/heatmap`）|

## 密钥

- 和风/高德 Web服务 key：小程序内「我的」页或 `utils/api.js` 配置；REST 直连需配置合法域名。
- 高德「Web端 JS API」key：小程序不支持 JS SDK，无需配置（地图功能已降级为列表）。

## 说明

- 个人主体小程序**不支持 web-view 组件**，故采用 uni-app 原生渲染（非网页套壳）。
- 完整 H5 版的在线地图/真实驾车路线/气泡热力图，小程序端降级为列表展示（微信地图组件需另行接入）。
