# 06 · 飞牛 fnOS NAS 部署指南

网约车跑单规划助手在飞牛 NAS（fnOS）上的部署方式。

## 方式 A：Docker 镜像 tar 导入（离线，推荐）

适合 NAS 不方便访问 Docker Hub 的场景。

1. 把 `dist/网约车跑单规划助手-fnos.tar` 上传到飞牛 NAS 任意目录。
2. 打开飞牛「Docker」应用 → 「镜像」→ 「导入」→ 选择该 tar 文件。
3. 导入完成后，「容器」→ 「新增容器」→ 选择镜像 `taxi-planner:v2`：
   - 端口映射：容器 `3000` → 主机 `3000`（或自定义）
   - 环境变量：
     - `QW_HOST` = 你的和风 API Host
     - `QW_KEY` = 你的和风 API Key
     - `AMAP_WS_KEY` = 你的高德 Web服务 key
   - 重启策略：`unless-stopped`
4. 启动后浏览器访问 `http://<飞牛NAS-IP>:3000`。

## 方式 B：Compose 部署（在线）

1. 打开飞牛「Docker」应用 → 「Compose」→ 「新建项目」。
2. 粘贴项目根目录 `docker-compose.yml` 内容，修改环境变量为你自己的 key。
3. 启动，飞牛自动拉取 `node:20-alpine` 基础镜像并构建。
4. 访问 `http://<飞牛NAS-IP>:3000`。

## 密钥说明

- REST 类 key（和风/高德 Web服务）只存在容器环境变量，前端不可见（隐藏 key）。
- 高德「Web端 JS API」key + jscode 在 `app/js/storage.js`（地图 SDK 必须前端加载，配域名白名单）。
- 如需从外网访问，在飞牛配置反向代理或 DDNS，并注意给高德 key 配置对应域名白名单。

## 一键脚本（方式 B 变体）

```bash
# 在飞牛 SSH 终端执行
cd /path/to/project
docker compose up -d
```

## 常见问题

- **端口冲突**：改 `docker-compose.yml` 的 `3000:3000` 为 `8080:3000`。
- **天气不可用**：检查容器环境变量 `QW_HOST`/`QW_KEY` 是否正确（和风 API Host 是「设置」页的小写域名，非凭据 ID）。
- **地图白屏**：高德 JS API key 未配置或域名白名单未包含当前访问域名。
