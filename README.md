# 网约车跑单规划助手（V2 · 12 城市 · 多端）
# Ride-hailing Driver Assistant

司机自用的行程规划工具：输入车辆/出车信息，生成**日度/周度跑单路线规划** + **商圈热力指数可视化**。

> A self-hosted trip planning tool for ride-hailing drivers: generates daily/weekly route plans with commercial-district heat visualization across 12 Chinese cities. Pure frontend + optional Node backend; deployable as H5 / Docker / Electron / mini-program.

## 使用说明

1. **启动应用**：任选下方「快速开始」中的一种方式（Docker / Node / 双击 `启动服务.bat`），浏览器打开对应地址。
2. **填写信息**：首页选择城市 → 输入住宿地址（自动定位）→ 选择车辆/车牌/续航 → 设置出车时间 → 点「生成跑单规划」。
3. **查看规划**：日度规划（半小时粒度最优路线）、周度规划（7 天主题策略）、商圈热力地图（气泡图 + 热力排行）。
4. **（可选）配置 key**：未配置 key 也能完整使用（离线示意）；配置高德「Web端 JS API」key 后解锁在线地图/实时 POI/天气。详见「密钥安全」与 `docs/03`。

## 交付物清单

| 目录/文件 | 说明 |
|---|---|
| `docs/01-调研报告.md` | 开源项目 / 竞品 / 技术选型调研 |
| `docs/02-产品设计方案.md` | 需求、架构、热力模型、算法 |
| `docs/03-API-Key注册指引.md` | 高德 key 申请步骤 |
| `docs/04-用户使用手册.md` | 使用说明 |
| `docs/05-架构V2与部署方案.md` | **V2 架构 + 多端部署 + 开源引用** |
| `docs/06-飞牛NAS部署.md` | 飞牛 fnOS 镜像导入/Compose 部署 |
| `docs/07-商圈数据更新维护.md` | 商圈数据一键更新维护指南 |
| `docs/08-GitHub开源发布.md` | GitHub 开源发布 + 密钥脱敏说明 |
| `app/` | 成品程序（纯前端 H5，无构建） |
| `server.js` / `proxy-server.js` | 后端代理（隐藏 REST key） |
| `Dockerfile` / `docker-compose.yml` | Docker 部署（含飞牛 NAS） |
| `electron/` | 桌面版（绿色版 zip 已产出） |
| `android/` | 安卓 App（Capacitor 工程 + Docker 构建脚本） |
| `miniprogram/` | 微信小程序（uni-app，dist 已产出） |
| `dist/` | 飞牛镜像 tar（47MB） |
| `scripts/update_poi.py` | 商圈数据一键更新脚本 |

## 快速开始

**方式 A：Docker（推荐，云服务器 / 飞牛 NAS）**

```bash
docker compose up -d
# 飞牛 fnOS：Docker 应用 → Compose → 粘贴 docker-compose.yml → 启动
# 访问 http://<设备IP>:3000
```

**方式 B：本地 Node（隐藏 REST key）**

```bash
$env:QW_HOST="..."; $env:QW_KEY="..."; $env:AMAP_WS_KEY="..."; node server.js
```

**方式 C：纯静态（key 手动配置）**

双击 `启动服务.bat`，浏览器打开 http://127.0.0.1:8756

## 功能特性（V2）

- **12 城市 · 网格矩阵商圈点位**：上海/北京/杭州/苏州/深圳/长沙/广州/成都/武汉/南京/西安/重庆，全城网格化密集采集真实商圈（上海 2.5km 间距 891 点，其余 3km 间距每城数百点），坐标/名称来自高德 POI，带热度权重 w，支持一键更新维护（`docs/07`）。
- **商圈热力可视化**：气泡热力图（大小=热力、颜色=等级）+ 实时热力指数排行。
- **半小时精细规划 + 动态规划全局最优**：Viterbi DP 全局权衡热力与转移成本。
- **实时路径模块**：当前时间 + GPS 定位 → 「现在出发」即时规划。
- **节假日识别**：2026 法定节假日自动切换旅游/枢纽热力模板。
- **多城市限行规则**：外牌高峰限行 + 新能源豁免。
- **降级设计**：不配任何 key 也能完整使用。

## 密钥安全（前端不暴露明文密钥）

- **REST 类 key**（和风天气 / 高德 Web服务）**只存服务端**：由 `server.js`/Docker/Electron 从 `.env` 或环境变量读取，前端走同源 `/api/*` 代理，源码和界面**均不包含、不显示**这些 key。
- **高德「Web端 JS API」key + jscode**（地图 SDK 必须前端加载，无法藏后端）：源码不明文内置、设置页 **password 打码** + 「显示/隐藏」切换、localStorage **混淆存储**；防护依赖高德控制台「域名白名单」。
- **用户可自定义 key**：设置页可填自己的高德 Web端 key；REST key 通过部署后端时改 `.env` 环境变量自定义。
- 配置文件约定：`.env`（已被 `.gitignore` 忽略）存真实 key，`.env.example` 为占位符模板，`docker-compose.yml` 用 `${VAR}` 引用，均不含明文密钥。

## 多端部署

| 端 | 方案 | 状态 |
|---|---|---|
| 移动端网页 H5 | 纯静态 / node server.js | ✅ 已实现 |
| Docker / 飞牛 NAS | 镜像 tar + `docker-compose.yml` | ✅ 已提供（`docs/06`）|
| 桌面本地程序 | Electron 绿色版 zip（`electron/dist/`）| ✅ 已落地 |
| 安卓 App | Capacitor 工程（`android/`）| ✅ 工程已提供 |
| 微信小程序 | uni-app 工程（`miniprogram/`）| ✅ 工程已提供 |

## ⚠️ 安全说明（对前端隐藏 key）

- **REST 类 key（和风 / 高德 Web服务）**：不写在前端源码，由 `server.js`/Docker 环境变量提供，前端走 `/api/*` 代理。
- **高德「Web端 JS API」key + jscode**：JS SDK 必须前端加载，防护依赖高德控制台**「域名白名单」**。

## 开源引用

高德地图 JS API 2.0 / Web服务 API、和风天气 API v7、Viterbi 动态规划（公开算法）、WGS84→GCJ-02 转换（公开算法）、高德 POI 数据、国务院办公厅节假日通知。详见 `docs/05`。

## 合规声明

本工具为司机自用的行程规划，不涉及自动抢单、虚拟定位、接入平台私有接口，合规安全。
