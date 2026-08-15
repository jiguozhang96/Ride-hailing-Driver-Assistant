/**
 * 网约车跑单规划助手 —— 可复用代理服务模块（零第三方依赖）
 * 导出 createProxyServer(config) => http.Server，供独立 Node（server.js）与 Electron 主进程共用。
 *
 * config = { qwHost, qwKey, amapWsKey, staticDir, port }
 *  - 静态服务 staticDir（app/ 目录）
 *  - 代理 /api/qweather/* 与 /api/amap/*（REST 类 key 藏在服务端，前端不可见）
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function proxy(res, targetUrl, headers) {
  const u = new URL(targetUrl);
  const req = https.request({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers: { ...headers, 'Accept-Encoding': 'identity' },
  }, (upstream) => {
    const resHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
    if (upstream.headers['content-encoding']) resHeaders['Content-Encoding'] = upstream.headers['content-encoding'];
    res.writeHead(upstream.statusCode, resHeaders);
    upstream.pipe(res);
  });
  req.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'proxy_upstream_error' }));
  });
  req.end();
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function createProxyServer(config) {
  const { qwHost = '', qwKey = '', amapWsKey = '', staticDir = path.join(__dirname, 'app') } = config;

  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);

    if (p.startsWith('/api/')) {
      if (p === '/api/qweather/now' || p === '/api/qweather/minutely' || p === '/api/qweather/hourly') {
        if (!qwHost || !qwKey) return json(res, 503, { error: 'qweather_key_not_configured' });
        const loc = u.searchParams.get('location');
        if (!loc) return json(res, 400, { error: 'missing_location' });
        const pathMap = { '/api/qweather/now': '/v7/weather/now', '/api/qweather/minutely': '/v7/minutely/5m', '/api/qweather/hourly': '/v7/weather/24h' };
        const target = `https://${qwHost}${pathMap[p]}?location=${encodeURIComponent(loc)}`;
        return proxy(res, target, { 'X-QW-Api-Key': qwKey, 'Accept': 'application/json' });
      }
      if (p === '/api/amap/weather') {
        if (!amapWsKey) return json(res, 503, { error: 'amap_wskey_not_configured' });
        const city = u.searchParams.get('city');
        const target = `https://restapi.amap.com/v3/weather/weatherInfo?key=${amapWsKey}&city=${encodeURIComponent(city)}&extensions=base`;
        return proxy(res, target, { 'Accept': 'application/json' });
      }
      if (p === '/api/amap/geocode') {
        if (!amapWsKey) return json(res, 503, { error: 'amap_wskey_not_configured' });
        const address = u.searchParams.get('address');
        const city = u.searchParams.get('city') || '';
        const target = `https://restapi.amap.com/v3/geocode/geo?key=${amapWsKey}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`;
        return proxy(res, target, { 'Accept': 'application/json' });
      }
      if (p === '/api/amap/poi') {
        if (!amapWsKey) return json(res, 503, { error: 'amap_wskey_not_configured' });
        const keywords = u.searchParams.get('keywords');
        const city = u.searchParams.get('city');
        const types = u.searchParams.get('types') || '';
        const target = `https://restapi.amap.com/v3/place/text?key=${amapWsKey}&keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(city)}&types=${encodeURIComponent(types)}&offset=10&page=1&extensions=base`;
        return proxy(res, target, { 'Accept': 'application/json' });
      }
      return json(res, 404, { error: 'unknown_api' });
    }

    let filePath = path.join(staticDir, p === '/' ? 'index.html' : p);
    if (!filePath.startsWith(staticDir)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

module.exports = { createProxyServer };
