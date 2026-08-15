@echo off
chcp 65001 >nul
cd /d "%~dp0app"
echo ==========================================
echo   网约车跑单规划助手 - 本地启动
echo   请用浏览器打开: http://127.0.0.1:8756
echo   按 Ctrl+C 停止服务
echo ==========================================
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8756 --bind 127.0.0.1
) else (
  echo [错误] 未检测到 python，请先安装 Python 3，或改用其他静态服务器。
  pause
)
