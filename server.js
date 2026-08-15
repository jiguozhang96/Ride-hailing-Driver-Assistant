/**
 * 网约车跑单规划助手 —— 独立 Node 启动入口（复用 proxy-server.js）
 * 启动：node server.js（自动读取同目录 .env；也可用环境变量 QW_HOST/QW_KEY/AMAP_WS_KEY 覆盖）
 */
const fs = require('fs');
const path = require('path');

// 零依赖加载 .env（服务端密钥，前端不可见）
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^#\r\n]*)/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch (e) { /* 忽略 .env 读取错误 */ }
}
loadEnv();

const { createProxyServer } = require('./proxy-server');

const qwHost = process.env.QW_HOST || '';
const qwKey = process.env.QW_KEY || '';
const amapWsKey = process.env.AMAP_WS_KEY || '';
const port = process.env.PORT || 3000;

const server = createProxyServer({ qwHost, qwKey, amapWsKey });
server.listen(port, () => {
  console.log(`跑单规划助手已启动: http://localhost:${port}`);
  console.log(`REST 类密钥已通过环境变量注入（前端不可见）。`);
  console.log(`和风: ${qwHost ? '已配置' : '未配置'} | 高德Web服务: ${amapWsKey ? '已配置' : '未配置'}`);
});
