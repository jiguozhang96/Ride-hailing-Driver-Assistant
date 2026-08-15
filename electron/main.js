/**
 * 网约车跑单规划助手 —— Electron 桌面应用主进程
 * 复用 proxy-server.js 的内嵌服务：启动本地 http 服务（隐藏 REST 类 key），
 * BrowserWindow 加载该服务，前端代码零改动。
 *
 * 密钥读取优先级：环境变量 > electron/config.json（本地文件）。
 * 说明：桌面程序 key 存本机（环境变量或 config.json），不外发。
 */

const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// 路径兼容：开发环境（electron .）在 electron/ 目录，proxy-server/app 在上级；
// 打包后（asar）三者同在根目录。
let createProxyServer;
let staticDir;
try {
  ({ createProxyServer } = require('../proxy-server'));
  staticDir = path.join(__dirname, '..', 'app');
} catch (e) {
  ({ createProxyServer } = require('./proxy-server'));
  staticDir = path.join(__dirname, 'app');
}

function loadKeys() {
  const cfg = {
    qwHost: process.env.QW_HOST || '',
    qwKey: process.env.QW_KEY || '',
    amapWsKey: process.env.AMAP_WS_KEY || '',
  };
  const cfgPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const local = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (!cfg.qwHost && local.qwHost) cfg.qwHost = local.qwHost;
      if (!cfg.qwKey && local.qwKey) cfg.qwKey = local.qwKey;
      if (!cfg.amapWsKey && local.amapWsKey) cfg.amapWsKey = local.amapWsKey;
    } catch (e) { /* 忽略损坏的 config.json */ }
  }
  return cfg;
}

let server = null;
let mainWindow = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: '网约车跑单规划助手',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const keys = loadKeys();
  server = createProxyServer({
    ...keys,
    staticDir,
  });
  // 随机端口，避免与独立 server.js 冲突
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && server) createWindow(server.address().port);
});
