/**
 * 高德地图集成（JS API 2.0 插件方式）
 * key 类型：Web端（JS API）；安全密钥 jscode 用于 window._AMapSecurityConfig。
 * 说明：本 key 为「Web端」类型，不能用 REST Web服务接口（restapi.amap.com），
 *       因此全部能力通过 JS API 2.0 插件实现：
 *         AMap.Geocoder(地理编码) / AMap.Weather(天气) / AMap.PlaceSearch(POI) / AMap.Driving(驾车路线)
 * 无 key 时所有函数返回 null，UI 自动降级为内置 SVG 示意图。
 */

let _amapPromise = null;

/** 动态加载 JS API 2.0（带安全密钥），返回 Promise<AMap|null> */
export function loadAMap(key, jscode) {
  if (!key) return Promise.resolve(null);
  if (_amapPromise) return _amapPromise;
  _amapPromise = new Promise((resolve) => {
    try {
      if (window.AMap) { resolve(window.AMap); return; }
      if (jscode) {
        window._AMapSecurityConfig = { securityJsCode: jscode };
      }
      const s = document.createElement('script');
      s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
      s.onload = () => resolve(window.AMap || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    } catch (e) { resolve(null); }
  });
  return _amapPromise;
}

/** 地理编码：地址 -> {lng, lat, formatted}；失败返回 null */
export async function geocode(key, jscode, address, city = '上海') {
  const AMap = await loadAMap(key, jscode);
  if (!AMap || !address) return null;
  return new Promise((resolve) => {
    AMap.plugin('AMap.Geocoder', () => {
      const g = new AMap.Geocoder({ city });
      g.getLocation(address, (status, result) => {
        if (status === 'complete' && result.geocodes && result.geocodes.length) {
          const gc = result.geocodes[0];
          resolve({ lng: gc.location.lng, lat: gc.location.lat, formatted: gc.formattedAddress });
        } else resolve(null);
      });
    });
  });
}

/**
 * 天气查询：city 如 '上海' 或 adcode。
 * 返回 { weather: '晴', mapped: 'clear', text: '晴' }
 */
export async function getWeather(key, jscode, city = '上海') {
  const AMap = await loadAMap(key, jscode);
  if (!AMap) return null;
  return new Promise((resolve) => {
    AMap.plugin('AMap.Weather', () => {
      const w = new AMap.Weather();
      w.getLive(city, (err, data) => {
        if (err || !data) { resolve(null); return; }
        resolve({
          weather: data.weather || '',
          mapped: mapWeather(data.weather),
          temperature: data.temperature,
        });
      });
    });
  });
}

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

/**
 * 天气查询（REST，用 Web服务 key，轻量无需加载 AMap JS）：city 为中文城市名。
 * 策略：优先后端代理（/api/amap/weather，隐藏 key），回退直连。
 * 返回 { weather, mapped, temperature }
 */
export async function restWeather(wskey, city = '上海') {
  // 1) 优先后端代理（隐藏 key）
  try {
    const rp = await fetchTimeout(`/api/amap/weather?city=${encodeURIComponent(city)}`);
    if (rp.ok) {
      const pd = await rp.json();
      if (pd.status === '1' && pd.lives && pd.lives.length) {
        const l = pd.lives[0];
        return { weather: l.weather || '', mapped: mapWeather(l.weather), temperature: l.temperature };
      }
    }
  } catch (e) { /* 回退直连 */ }
  // 2) 回退直连
  if (!wskey) return null;
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${encodeURIComponent(wskey)}&city=${encodeURIComponent(city)}&extensions=base`;
  try {
    const r = await fetchTimeout(url);
    const data = await r.json();
    if (data.status === '1' && data.lives && data.lives.length) {
      const l = data.lives[0];
      return { weather: l.weather || '', mapped: mapWeather(l.weather), temperature: l.temperature };
    }
    return null;
  } catch (e) { return null; }
}

/** 天气文案 -> 热力模型档位 */
export function mapWeather(weatherText) {
  const w = String(weatherText || '');
  if (/晴/.test(w)) return 'clear';
  if (/多云|阴/.test(w)) return 'cloudy';
  if (/暴雨|大雨|中雨/.test(w)) return 'heavy_rain';
  if (/雨|雷阵|阵雨/.test(w)) return 'rain';
  if (/雪|暴雪/.test(w)) return 'snow';
  if (/台风|沙尘|霾|大雾/.test(w)) return 'extreme';
  return 'clear';
}

/** POI 周边搜索：keyword 如 '充电'/'加油站'/'快餐'，types 如 '充电站'。返回 [{name,address,location,lng,lat,distance}] */
export async function searchNearby(key, jscode, keyword, lng, lat, radius = 3000, city = '上海', type = '') {
  const AMap = await loadAMap(key, jscode);
  if (!AMap) return null;
  return new Promise((resolve) => {
    AMap.plugin('AMap.PlaceSearch', () => {
      const ps = new AMap.PlaceSearch({
        type: type || keyword, city, pageSize: 8, pageIndex: 1, extensions: 'base',
      });
      ps.searchNearBy(keyword, [lng, lat], radius, (status, result) => {
        if (status === 'complete' && result.poiList) {
          resolve(result.poiList.pois.map(p => ({
            name: p.name, address: p.address,
            lng: p.location.lng, lat: p.location.lat, distance: p.distance,
          })));
        } else resolve([]);
      });
    });
  });
}

/** 驾车路径规划：返回 {distance(米), duration(秒), points:[[lng,lat]...]}；失败 null */
export async function drivingRoute(key, jscode, from, to) {
  const AMap = await loadAMap(key, jscode);
  if (!AMap) return null;
  return new Promise((resolve) => {
    AMap.plugin('AMap.Driving', () => {
      const driving = new AMap.Driving({ map: null, hideMarkers: true, autoFitView: false });
      driving.search(
        [from.lng, from.lat],
        [to.lng, to.lat],
        (status, result) => {
          if (status === 'complete' && result.routes && result.routes.length) {
            const r = result.routes[0];
            const steps = r.steps || [];
            const points = [];
            // 兼容 path 元素为 LngLat 对象 / [lng,lat] 数组 / 普通对象
            steps.forEach(st => (st.path || []).forEach(p => {
              if (Array.isArray(p)) points.push([p[0], p[1]]);
              else if (p && typeof p.getLng === 'function') points.push([p.getLng(), p.getLat()]);
              else if (p && p.lng != null && p.lat != null) points.push([p.lng, p.lat]);
            }));
            resolve({ distance: r.distance, duration: r.time, points });
          } else resolve(null);
        });
    });
  });
}

/** 延时工具（用于节流连续 Driving 调用） */
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 生成高德导航跳转链接（无需 key） */
export function naviLink(name, lng, lat) {
  return `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name || '目的地')}&mode=car&coordinate=gaode`;
}
