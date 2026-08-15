/**
 * 和风天气集成（QWeather API v7）
 * 认证方式：API KEY（X-QW-Api-Key 请求头）或 JWT（Authorization: Bearer，预留）。
 * 接口：
 *   /v7/weather/now     实时天气
 *   /v7/minutely/5m     分钟级降雨（需经纬度）
 *   /v7/weather/24h     逐小时预报
 * 说明：key 类型必须是「API KEY」凭据；若凭据为 JWT 类型则需另配私钥签名（见 docs）。
 */

/**
 * 通用请求。host 为完整 API Host（如 xxx.re.qweatherapi.com），apiKey 为 API KEY。
 * 策略：优先后端代理（/api/*，隐藏 key）；代理不可用（纯静态部署）时回退直连。
 */
const PROXY_MAP = {
  '/v7/weather/now': '/api/qweather/now',
  '/v7/minutely/5m': '/api/qweather/minutely',
  '/v7/weather/24h': '/api/qweather/hourly',
};

/** fetch 带超时（默认 8 秒），避免网络异常时请求挂起 */
async function fetchTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function qwRequest(host, path, params, { apiKey = '', jwt = '' } = {}) {
  const qs = new URLSearchParams(params).toString();
  const location = params.location;

  // 1) 优先后端代理（隐藏 key）
  const proxyPath = PROXY_MAP[path];
  if (proxyPath && location) {
    try {
      const r = await fetchTimeout(`${proxyPath}?location=${encodeURIComponent(location)}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.code === '200') return data;
      }
    } catch (e) { /* 回退直连 */ }
  }

  // 2) 回退直连（纯静态部署，key 由前端持有）
  if (!host) return null;
  const url = `https://${host}${path}?${qs}`;
  const headers = { 'Accept': 'application/json', 'User-Agent': 'TaxiRoutePlanner/1.0' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  else if (apiKey) headers['X-QW-Api-Key'] = apiKey;
  try {
    const r = await fetchTimeout(url, { headers });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.code !== '200') return null;
    return data;
  } catch (e) { return null; }
}

/**
 * 和风天气诊断：定位 host/key 配置问题。
 * 返回 { ok, status, message }
 *  - 200 → 成功
 *  - 401 → key 无效/未传（host 有效）
 *  - 403 → host 无效（很可能是把「凭据ID」当成 API Host 了，正确 API Host 是控制台「设置」页的小写域名）
 */
export async function qwDiagnose(host, apiKey, location = '101020100') {
  if (!host) return { ok: false, status: 0, message: '未填写 API Host' };
  const qs = new URLSearchParams({ location }).toString();
  const url = `https://${host}/v7/weather/now?${qs}`;
  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['X-QW-Api-Key'] = apiKey;
  try {
    const r = await fetch(url, { headers });
    if (r.status === 200) {
      const data = await r.json();
      if (data.code === '200') return { ok: true, status: 200, message: `成功：${data.now?.text || ''} ${data.now?.temp || ''}℃` };
      return { ok: false, status: 200, message: `响应异常：code=${data.code} ${data.info || ''}` };
    }
    if (r.status === 401) return { ok: false, status: 401, message: 'API Key 无效或凭据类型不是「API KEY」（Host 有效）' };
    if (r.status === 403) return { ok: false, status: 403, message: 'API Host 无效——「凭证」≠「API Host」。请在控制台「设置」页复制小写域名(形如 xxxxxx.re.qweatherapi.com)' };
    return { ok: false, status: r.status, message: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, message: '请求被拒（跨域/CORS）——该 API Host 无效。请确认是控制台「设置」页的小写域名(形如 xxxxxx.re.qweatherapi.com)，而非「项目管理」页的凭据 ID' };
  }
}

/** 实时天气 */
export async function qwNow(host, apiKey, location = '101020100', jwt = '') {
  const d = await qwRequest(host, '/v7/weather/now', { location }, { apiKey, jwt });
  if (!d || !d.now) return null;
  return {
    text: d.now.text, temp: d.now.temp, feelsLike: d.now.feelsLike,
    windDir: d.now.windDir, windScale: d.now.windScale,
    humidity: d.now.humidity, precip: d.now.precip, obsTime: d.updateTime,
  };
}

/** 分钟级降雨（未来 2 小时逐 5 分钟），返回 summary + 是否将下雨 */
export async function qwMinutely(host, apiKey, lng, lat, jwt = '') {
  const d = await qwRequest(host, '/v7/minutely/5m', { location: `${lng},${lat}` }, { apiKey, jwt });
  if (!d) return null;
  const list = d.minutely || [];
  // 和风 minutely 返回 type 字段（"rain"/"snow" 等），非 text
  const rainList = list.filter(m => (m.type === 'rain' || m.type === 'snow') && parseFloat(m.precip) > 0);
  return {
    summary: d.summary || '',
    willRain: rainList.length > 0,
    rainRatio: list.length ? Math.round(rainList.length / list.length * 100) : 0,
  };
}

/** 逐小时预报（24h），返回 [{time, text, temp, precip}] */
export async function qwHourly(host, apiKey, location = '101020100', jwt = '') {
  const d = await qwRequest(host, '/v7/weather/24h', { location }, { apiKey, jwt });
  if (!d || !d.hourly) return null;
  return d.hourly.map(h => ({ time: h.fxTime, text: h.text, temp: h.temp, precip: h.precip }));
}

/** 和风天气文案 -> 热力模型档位 key（与 heat-model WEATHER_MOD 对应） */
export function mapQwWeather(text) {
  const w = String(text || '');
  if (/晴/.test(w)) return 'clear';
  if (/多云|少云|阴|晴间多云/.test(w)) return 'cloudy';
  if (/暴雨|大暴雨|特大暴雨|大雨|中雨/.test(w)) return 'heavy_rain';
  if (/雨|阵雨|雷阵/.test(w)) return 'rain';
  if (/雪|暴雪/.test(w)) return 'snow';
  if (/台风|沙尘|霾|雾|浮尘/.test(w)) return 'extreme';
  return 'clear';
}

/** 生成司机可读的天气建议 */
export function qwAdvice(now, minutely) {
  const parts = [];
  if (now) {
    parts.push(`当前${now.text} ${now.temp}℃`);
    if (now.windScale && Number(now.windScale) >= 6) parts.push('风力较大，注意行车安全');
  }
  if (minutely) {
    if (minutely.willRain) parts.push(`未来2小时有降雨（概率${minutely.rainRatio}%），打车需求预计上升`);
    else parts.push('未来2小时无明显降雨');
  }
  return parts.join('；');
}
