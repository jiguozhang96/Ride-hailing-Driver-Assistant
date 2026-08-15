@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 清理可能干扰 Electron 的环境变量（WorkBuddy 等注入的 NODE_OPTIONS/ELECTRON_RUN_AS_NODE）
set NODE_OPTIONS=
set ELECTRON_RUN_AS_NODE=

echo 正在启动网约车跑单规划助手（桌面版）...
if exist "node_modules\electron\dist\electron.exe" (
  "node_modules\electron\dist\electron.exe" .
) else (
  echo 首次运行需先安装依赖：npm install
  call npm install --no-audit --no-fund
  "node_modules\electron\dist\electron.exe" .
)
pause
