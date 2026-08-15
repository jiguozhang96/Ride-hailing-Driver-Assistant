#!/usr/bin/env bash
# GitHub 开源发布脚本：认证后一键创建仓库并推送
# 用法：bash scripts/push_github.sh
set -e
cd "$(dirname "$0")/.."

REPO_NAME="taxi-planner"
DESC="网约车跑单规划助手：12城商圈热力 + 动态规划最优路线 + 多端部署(H5/小程序/桌面/Docker)"

# 1. 检查 gh CLI
if ! command -v gh &>/dev/null; then
  echo "❌ 未安装 GitHub CLI (gh)。"
  echo "   Windows 安装：winget install GitHub.cli"
  echo "   或下载：https://cli.github.com/"
  exit 1
fi

# 2. 认证
if ! gh auth status &>/dev/null 2>&1; then
  echo "首次使用需登录 GitHub（浏览器授权）："
  gh auth login
fi

# 3. 创建仓库并推送（若已存在则直接推送）
if gh repo view "$REPO_NAME" &>/dev/null 2>&1; then
  echo "仓库已存在，直接推送…"
  LOGIN=$(gh api user -q .login)
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$LOGIN/$REPO_NAME.git"
  git push -u origin master
else
  echo "创建公开仓库并推送…"
  gh repo create "$REPO_NAME" --public --source=. --push --description "$DESC"
fi

echo ""
echo "✅ 发布完成！仓库地址：https://github.com/$(gh api user -q .login)/$REPO_NAME"
