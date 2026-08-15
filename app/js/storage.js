/**
 * 本地存储（localStorage）：司机档案、偏好、历史规划记录、API key。
 * 纯前端方案，零服务器依赖；数据仅存于当前设备浏览器。
 *
 * ⚠️ 安全说明：
 *  - REST 类 key（和风 / 高德 Web服务）不写在前端源码、不在前端界面配置，
 *    由后端 server.js/proxy-server 通过环境变量提供，前端走同源 /api/* 代理，前端完全不可见。
 *  - 高德「Web端 JS API」key + jscode 因 JS SDK 必须前端加载而无法藏到后端，
 *    源码不明文内置、界面打码显示、localStorage 混淆存储，防护依赖高德控制台「域名白名单」。
 */

const KEY = {
  PROFILE: 'taxi_profile',
  SETTINGS: 'taxi_settings',
  HISTORY: 'taxi_history',
  APIKEY: 'taxi_apikey',
  APIJSCODE: 'taxi_apijscode',
  APIWSKEY: 'taxi_apikwskey',
  QWHOST: 'taxi_qwhost',
  QWKEY: 'taxi_qwkey',
  WEATHER: 'taxi_weather',
};

// 密钥配置策略（「对前端隐藏 key」）：
//  - REST 类 key（和风 / 高德 Web服务）不写在前端源码、不在前端配置，由后端环境变量提供，
//    前端走同源 /api/* 代理。
//  - 高德「Web端 JS API」key + jscode 因 JS SDK 必须前端加载而无法藏到后端，
//    内置（混淆形式，源码不含明文）+ 界面打码 + localStorage 混淆 + 域名白名单防护。

/** 混淆（XOR + hex，防 casual 查看；前端 key 本质无法真正加密，正式防护靠服务商白名单） */
const OBF_KEY = 'taxi-planner-v2';
function obfuscate(s) {
  if (!s) return '';
  let hex = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length);
    hex += c.toString(16).padStart(2, '0');
  }
  return hex;
}
function deobfuscate(hex) {
  if (!hex) return '';
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.substr(i, 2), 16);
    out += String.fromCharCode(c ^ OBF_KEY.charCodeAt((i / 2) % OBF_KEY.length));
  }
  return out;
}

// 内置默认 key（混淆形式存储，源码不含明文；运行时解密使用，用户自定义 key 优先覆盖）。
// 高德「Web端 JS API」key + jscode：内置方便开箱即用，界面打码显示，可被用户自定义覆盖。
const BUILTIN_AMAP_KEY = '43004e5c141409515f0b07471e420710511b5b48455859085b54464b4e514304';
const BUILTIN_AMAP_JSCODE = '10561b501c120959580a53451915031251480b15130e585d0c01434e4f561000';
export const DEFAULT_AMAP_KEY = deobfuscate(BUILTIN_AMAP_KEY);
export const DEFAULT_AMAP_JSCODE = deobfuscate(BUILTIN_AMAP_JSCODE);
export const DEFAULT_AMAP_WSKEY = '';      // REST，后端代理隐藏
export const DEFAULT_QW_HOST = '';          // REST，后端代理隐藏
export const DEFAULT_QW_KEY = '';           // REST，后端代理隐藏

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}

export const DEFAULT_PROFILE = {
  city: '上海',
  homeAddress: '', homeLng: 121.4700, homeLat: 31.2300,
  vehicleType: 'ev',        // ev 新能源 | oil 油车
  plateType: 'hu_green',    // 见 restrictions.PLATE_TYPES
  rangeKm: 400,
  startHour: 7, endHour: 22,
  crossCity: false,
  bigWeek: false,           // 大周（互联网公司大小周）
};

export function loadProfile() { return { ...DEFAULT_PROFILE, ...safeGet(KEY.PROFILE, {}) }; }
export function saveProfile(p) { return safeSet(KEY.PROFILE, p); }

export function loadSettings() { return safeGet(KEY.SETTINGS, { theme: 'light', weather: 'clear' }); }
export function saveSettings(s) { return safeSet(KEY.SETTINGS, s); }

export function loadHistory() { return safeGet(KEY.HISTORY, []); }
export function saveHistory(h) { return safeSet(KEY.HISTORY, h.slice(0, 50)); }
export function pushHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  saveHistory(h);
  return h;
}

/** 读取混淆存储的 key：有用户自定义值→解密；无→用内置明文默认值（用户自定义优先） */
function loadObf(key, fallbackPlain) {
  const raw = safeGet(key, null);
  return (raw != null && raw !== '') ? deobfuscate(raw) : fallbackPlain;
}

export function loadApiKey() { return loadObf(KEY.APIKEY, DEFAULT_AMAP_KEY); }
export function saveApiKey(k) { return safeSet(KEY.APIKEY, obfuscate(k)); }

export function loadApiJsCode() { return loadObf(KEY.APIJSCODE, DEFAULT_AMAP_JSCODE); }
export function saveApiJsCode(c) { return safeSet(KEY.APIJSCODE, obfuscate(c)); }

export function loadApiWsKey() { return loadObf(KEY.APIWSKEY, DEFAULT_AMAP_WSKEY); }
export function saveApiWsKey(k) { return safeSet(KEY.APIWSKEY, obfuscate(k)); }

export function loadQwHost() { return loadObf(KEY.QWHOST, DEFAULT_QW_HOST); }
export function saveQwHost(h) { return safeSet(KEY.QWHOST, obfuscate(h)); }

export function loadQwKey() { return loadObf(KEY.QWKEY, DEFAULT_QW_KEY); }
export function saveQwKey(k) { return safeSet(KEY.QWKEY, obfuscate(k)); }

export function loadWeather() { return safeGet(KEY.WEATHER, 'clear'); }
export function saveWeather(w) { return safeSet(KEY.WEATHER, w); }

export function exportAllData() {
  return {
    profile: loadProfile(), settings: loadSettings(), history: loadHistory(),
    apikey: loadApiKey(), apijscode: loadApiJsCode(), api_wskey: loadApiWsKey(),
    qwhost: loadQwHost(), qwkey: loadQwKey(),
    exportedAt: new Date().toISOString(),
  };
}
export function importAllData(obj) {
  if (obj.profile) saveProfile(obj.profile);
  if (obj.settings) saveSettings(obj.settings);
  if (obj.history) saveHistory(obj.history);
  if (obj.apikey) saveApiKey(obj.apikey);
  if (obj.apijscode) saveApiJsCode(obj.apijscode);
  if (obj.api_wskey) saveApiWsKey(obj.api_wskey);
  if (obj.qwhost) saveQwHost(obj.qwhost);
  if (obj.qwkey) saveQwKey(obj.qwkey);
}
export function clearAllData() {
  Object.values(KEY).forEach(k => localStorage.removeItem(k));
}
