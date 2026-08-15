/**
 * 平台适配层：把 H5 的 localStorage/fetch/navigator.geolocation 映射到 uni 小程序 API。
 * 核心算法引擎（engine/*.js）为纯逻辑，零改动复用。
 */

// ── 存储 ──────────────────────────────────────────────
export const storage = {
  get(key, fallback = null) {
    try {
      const v = uni.getStorageSync(key);
      return v === '' || v === undefined || v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, val) {
    try { uni.setStorageSync(key, val); } catch (e) {}
  },
};

// ── 网络请求（REST 直连，小程序需在后台配置合法域名）──
export function request(url, options = {}) {
  return new Promise((resolve) => {
    uni.request({
      url,
      method: options.method || 'GET',
      header: options.headers || { 'Accept': 'application/json' },
      timeout: 15000,
      success: (res) => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: res.data }),
      fail: () => resolve({ ok: false, status: 0, data: null }),
    });
  });
}

// ── 定位（WGS84）──────────────────────────────────────
export function getLocation() {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'wgs84',
      success: (res) => resolve({ lng: res.longitude, lat: res.latitude }),
      fail: () => resolve(null),
    });
  });
}
