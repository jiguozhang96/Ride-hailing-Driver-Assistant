# 08 · GitHub 开源发布指南

本项目已完成本地 Git 仓库初始化 + 干净源码备份，可按以下步骤发布为 GitHub 开源项目。

## 已就绪

- **本地 Git 仓库**：已 `git init` + 首次提交（V2.1），`git log` 可查看。
- **干净源码备份**：`网约车跑单规划助手-源码备份-2026-08-15.zip`（仅含源码，不含依赖/密钥/构建产物）。
- **`.gitignore`**：已排除 `node_modules/`、`dist/`、`.env`、`electron/config.json`、`.workbuddy/`、`__pycache__/` 等。

## 密钥安全（开源不泄露）

开源前已做密钥脱敏：

| 密钥 | 处理 |
|---|---|
| 高德 Web服务 key / 和风 key | 存 `.env`（已 gitignore），源码用环境变量/`.env` 读取，脚本不硬编码 |
| 高德 Web端 JS key + jscode | 源码内置**混淆形式**（非明文），界面打码，用户自定义覆盖 |
| 采集脚本（grid_poi 等） | key 从 `.env` 读取（`scripts/_env.py`），不硬编码 |

已用 `git grep` 验证：**提交内容中无任何明文密钥**。

## 发布步骤

### 1. 安装 GitHub CLI（一次性）

```bash
# Windows
winget install GitHub.cli
# 或下载 https://cli.github.com/
```

### 2. 一键发布

```bash
bash scripts/push_github.sh
```

脚本会自动：①检测 gh → ②引导 `gh auth login` 浏览器授权 → ③创建公开仓库 `taxi-planner` 并推送。

### 3. 手动方式（不用 gh CLI）

```bash
# 在 GitHub 网页上新建空仓库（不勾选 README/.gitignore/license）
# 然后：
git remote add origin https://github.com/<你的用户名>/taxi-planner.git
git push -u origin master
```

## 发布后建议

1. 在仓库添加 `LICENSE`（如 MIT）与 `README.md` 已含开源引用。
2. GitHub 仓库 Settings → Secrets 可存放私有部署密钥（本项目已用 `.env` 模式，无需提交密钥）。
3. 后续更新：`git add -A && git commit -m "..." && git push`。
