/**
 * 应用主入口：SPA 路由 + 视图渲染 + 事件绑定。
 * 无框架、无构建，ES Module 直接运行。需通过 HTTP 服务访问（见 启动说明）。
 */
import * as storage from './storage.js';
import { PLATE_TYPES } from './engine/restrictions.js';
import { buildDailyPlan, mergeSegments, fmt, dateLabel, dayKindLabel } from './engine/planner.js';
import { buildWeeklyPlan } from './engine/week-planner.js';
import { heatStars, weatherAdvice, WEATHER_MOD, heatLabel } from './engine/heat-model.js';
import { renderSchematic, legend } from './ui/schematic.js';
import { renderHeatmap } from './ui/heatmap.js';
import { CITIES, cityInfo, distKm } from './engine/poi-db.js';
import * as amap from './amap.js';
import * as qweather from './weather.js';

// ── 状态 ────────────────────────────────────────────────────
const CITY_NAME_TO_KEY = {
  '上海': 'shanghai', '北京': 'beijing', '杭州': 'hangzhou', '苏州': 'suzhou', '深圳': 'shenzhen', '长沙': 'changsha',
  '广州': 'guangzhou', '成都': 'chengdu', '武汉': 'wuhan', '南京': 'nanjing', '西安': 'xian', '重庆': 'chongqing',
};
let profile = storage.loadProfile();
profile.city = CITY_NAME_TO_KEY[profile.city] || profile.city || 'shanghai';
let settings = storage.loadSettings();
let apikey = storage.loadApiKey();
let jscode = storage.loadApiJsCode();
let amapWsKey = storage.loadApiWsKey();
let qwhost = storage.loadQwHost();
let qwkey = storage.loadQwKey();
let currentDaily = null;
let currentWeekly = null;
let currentView = 'home';
let currentMapMode = 'route';   // 'route' 路线示意 | 'heat' 商圈热力

const VIEWS = ['home', 'daily', 'weekly', 'map', 'me'];

// ── 工具 ────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => new Date();

// ── 初始化 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  bindNav();
  bindGlobal();
  renderForm();
  switchView('home');
}

// ── 导航 ────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.nav));
  });
}
function switchView(v) {
  if (!VIEWS.includes(v)) v = 'home';
  currentView = v;
  VIEWS.forEach(x => document.getElementById(`view-${x}`).classList.toggle('active', x === v));
  document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('on', el.dataset.nav === v));
  if (v === 'daily') renderDaily();
  if (v === 'weekly') renderWeekly();
  if (v === 'map') renderMap();
  if (v === 'me') renderMe();
  window.scrollTo(0, 0);
}

// ── 首页：档案录入 ──────────────────────────────────────────
function renderForm() {
  const v = $('#view-home');
  const plateOpts = Object.entries(PLATE_TYPES).map(([k, name]) =>
    `<option value="${k}" ${profile.plateType === k ? 'selected' : ''}>${name}</option>`).join('');
  v.innerHTML = `
    <header class="hero">
      <h1>网约车跑单规划助手</h1>
      <p class="sub">输入你的出车信息，生成日度/周度跑单路线建议</p>
    </header>
    ${apikey ? '' : `<div class="card key-banner" id="key-banner">
      <div class="key-banner-text">⚠️ 尚未配置高德密钥，地址解析/在线地图/实时POI/天气将受限，示意图降级为离线模式。</div>
      <button class="btn btn-mini" id="btn-goto-me">去配置 →</button>
    </div>`}
    <form id="profile-form" class="card form">
      <h2 class="sec-title">1 · 基础信息</h2>
      <label class="field">
        <span>城市</span>
        <select name="city" id="city-select">
          ${CITIES.map(c => `<option value="${c.key}" ${profile.city === c.key ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>住宿地址 / 当前位置 <i class="hint">(用于回程与就近规划)</i></span>
        <input type="text" name="homeAddress" id="home-address" value="${esc(profile.homeAddress)}" placeholder="如：上海市闵行区莘庄地铁站附近">
        <div class="geo-row">
          <span id="geo-status" class="geo-status">${apikey ? '已配置高德 key，可解析地址' : '未配置 key，可用实时定位'}</span>
          <button type="button" class="btn btn-mini" id="btn-geocode">地址解析</button>
          <button type="button" class="btn btn-mini" id="btn-locate">📍实时定位</button>
        </div>
        <input type="hidden" name="homeLng" value="${profile.homeLng}">
        <input type="hidden" name="homeLat" value="${profile.homeLat}">
      </label>

      <h2 class="sec-title">2 · 车辆信息</h2>
      <div class="field-row">
        <label class="field">
          <span>车辆类型</span>
          <select name="vehicleType">
            <option value="ev" ${profile.vehicleType === 'ev' ? 'selected' : ''}>新能源(纯电/插混)</option>
            <option value="oil" ${profile.vehicleType === 'oil' ? 'selected' : ''}>燃油车</option>
          </select>
        </label>
        <label class="field">
          <span>车牌类型</span>
          <select name="plateType">${plateOpts}</select>
        </label>
      </div>
      <label class="field">
        <span>单次续航预估 <i class="hint">(km)</i></span>
        <input type="number" name="rangeKm" min="50" max="1200" value="${profile.rangeKm}" placeholder="如 400">
      </label>

      <h2 class="sec-title">3 · 出车时间</h2>
      <div class="field-row">
        <label class="field">
          <span>出车时间</span>
          <input type="time" name="startTime" value="${toTime(profile.startHour)}">
        </label>
        <label class="field">
          <span>预估收车时间</span>
          <input type="time" name="endTime" value="${toTime(profile.endHour)}">
        </label>
      </div>
      <label class="switch-row">
        <span>现在出发（实时规划）<i class="hint">(以当前时间+定位，规划「现在→收车」的实时路径)</i></span>
        <input type="checkbox" name="nowStart" id="now-start">
      </label>

      <h2 class="sec-title">4 · 辅助选项</h2>
      <label class="switch-row">
        <span>是否接跨城单 <i class="hint">(苏州/杭州等，周五周日晚需求高)</i></span>
        <input type="checkbox" name="crossCity" ${profile.crossCity ? 'checked' : ''}>
      </label>
      <label class="switch-row">
        <span>今日是否大周 <i class="hint">(互联网公司大小周，大周周六加班单多)</i></span>
        <input type="checkbox" name="bigWeek" ${profile.bigWeek ? 'checked' : ''}>
      </label>
      <div class="field-row field-row-weather">
        <label class="field">
          <span>今日天气 <i class="hint">(影响热力)</i></span>
          <select name="weather" id="weather-select">
            ${Object.entries(WEATHER_MOD).map(([k]) => `<option value="${k}" ${settings.weather === k ? 'selected' : ''}>${weatherName(k)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="btn btn-mini" id="btn-weather" style="align-self:flex-end;margin-bottom:14px;">自动获取天气</button>
      </div>

      <button type="submit" class="btn btn-primary btn-block">生成跑单规划</button>
    </form>
    <p class="foot-note">数据仅保存在本机浏览器。${apikey ? '✅ 高德已配置（在线地图/实时POI/天气可用）' : '高德 key 可选，配置后解锁在线地图/POI/天气。'}</p>`;
  bindFormEvents();
}

function bindFormEvents() {
  const form = $('#profile-form');

  // 从表单读取当前档案（不触发渲染）
  function readProfileFromForm() {
    const read = n => form.elements[n].value;
    const nowStart = form.elements.nowStart ? form.elements.nowStart.checked : false;
    profile = {
      city: read('city') || '上海',
      homeAddress: read('homeAddress'),
      homeLng: parseFloat(read('homeLng')) || profile.homeLng,
      homeLat: parseFloat(read('homeLat')) || profile.homeLat,
      vehicleType: read('vehicleType'),
      plateType: read('plateType'),
      rangeKm: parseFloat(read('rangeKm')) || 400,
      startHour: nowStart ? currentHalfHour(now()) : parseTime(read('startTime'), 7),
      endHour: parseTime(read('endTime'), 22),
      crossCity: form.elements.crossCity.checked,
      bigWeek: form.elements.bigWeek.checked,
    };
    settings.weather = read('weather');
    storage.saveProfile(profile);
    storage.saveSettings(settings);
  }

  // 地址解析（公共）：geocode → 写坐标 → 自动切城市。返回解析结果或 null
  async function resolveAddress(addr) {
    if (!addr || !apikey) return null;
    // 地址已含城市名（如"北京市..."）时不限 city，让高德按地址自动解析；否则用下拉城市限定
    const addrHasCity = CITIES.some(c => addr.includes(c.name));
    const geoCity = addrHasCity ? '' : cityInfo(profile.city).name;
    const r = await amap.geocode(apikey, jscode, addr, geoCity);
    if (!r) {
      $('#geo-status').textContent = '解析失败，请检查 key 类型是否为「Web端 JS API」';
      return null;
    }
    $('#geo-status').textContent = `已定位：${r.formatted}`;
    document.querySelector('[name=homeLng]').value = r.lng;
    document.querySelector('[name=homeLat]').value = r.lat;
    // 坐标反查城市：地址实际城市与下拉不符时自动切换
    const dc = detectCityByCoord(r.lng, r.lat);
    if (dc && dc !== profile.city) {
      const citySel = document.querySelector('#city-select');
      if (citySel) citySel.value = dc;
      toast(`已自动切换至${cityInfo(dc).name}`);
    }
    return r;
  }

  // 提交：先确保地址已解析，再规划并跳转
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const addr = $('#home-address').value.trim();
    if (addr && apikey) await resolveAddress(addr); // 地址未解析完成时同步等待 geocode
    readProfileFromForm();
    regenerate();
    storage.pushHistory({ at: new Date().toISOString(), label: dateLabel(now()), totalKm: currentDaily.totalKm });
    switchView('daily');
  });

  // 关键参数变更 → 防抖实时重规划
  // input 类字段（数字/时间）用 input 事件（实时）
  ['rangeKm', 'startTime', 'endTime'].forEach(name => {
    const el = form.elements[name];
    if (el) el.addEventListener('input', () => scheduleRegenerate());
  });
  // select/checkbox 用 change 事件
  ['vehicleType', 'plateType', 'weather', 'crossCity', 'bigWeek', 'nowStart'].forEach(name => {
    const el = form.elements[name];
    if (el) el.addEventListener('change', () => scheduleRegenerate());
  });
  // 现在出发：切换时即时重规划（并提示当前时间）
  const nowEl = form.elements['nowStart'];
  if (nowEl) nowEl.addEventListener('change', () => {
    if (nowEl.checked) toast(`现在出发：从 ${fmt(currentHalfHour(now()))} 开始规划`);
    scheduleRegenerate(100);
  });
  // 城市切换：重置坐标到城市中心 + 重规划
  const cityEl = form.elements['city'];
  if (cityEl) cityEl.addEventListener('change', () => {
    const info = cityInfo(cityEl.value);
    document.querySelector('[name=homeLng]').value = info.center.lng;
    document.querySelector('[name=homeLat]').value = info.center.lat;
    $('#home-address').value = '';
    $('#geo-status').textContent = `已切换至${info.name}，请填写住宿地址自动定位（未填则用市中心）`;
    readProfileFromForm();
    regenerate();
    toast(`已切换至${info.name}`);
  });

  // 地址输入：防抖自动解析 + 实时重规划
  let geoDebounce = null;
  $('#home-address').addEventListener('input', () => {
    $('#geo-status').textContent = '输入中，稍候自动定位…';
    clearTimeout(geoDebounce);
    geoDebounce = setTimeout(async () => {
      const addr = $('#home-address').value.trim();
      if (addr && apikey) {
        const r = await resolveAddress(addr);
        if (r) {
          readProfileFromForm();
          regenerate();
          toast('已按新地址重新规划');
        }
      }
    }, 700);
  });

  // 手动地址解析按钮
  $('#btn-geocode').addEventListener('click', async () => {
    const addr = $('#home-address').value.trim();
    if (!addr) { $('#geo-status').textContent = '请先填写地址'; return; }
    if (!apikey) { $('#geo-status').textContent = '未配置高德 key'; toast('未配置高德 key'); return; }
    $('#geo-status').textContent = '解析中…';
    const r = await resolveAddress(addr);
    if (r) {
      readProfileFromForm();
      regenerate();
      toast('已按新地址重新规划');
    }
  });

  // 实时定位按钮（HTML5 Geolocation，WGS84 → GCJ02 转换）
  $('#btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('当前浏览器不支持定位'); return; }
    $('#geo-status').textContent = '定位中（需授权）…';
    navigator.geolocation.getCurrentPosition(pos => {
      const { longitude, latitude } = pos.coords;
      const gcj = wgs84ToGcj02(longitude, latitude);
      document.querySelector('[name=homeLng]').value = gcj.lng;
      document.querySelector('[name=homeLat]').value = gcj.lat;
      $('#geo-status').textContent = `已定位 (${gcj.lng.toFixed(4)}, ${gcj.lat.toFixed(4)})`;
      $('#home-address').value = '';
      readProfileFromForm();
      regenerate();
      toast('已定位当前位置并实时重规划');
    }, err => {
      $('#geo-status').textContent = '定位失败：请检查浏览器定位权限（需 HTTPS 或 localhost）';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });

  // 去配置密钥按钮（仅「未配置密钥」提示条存在时渲染）
  const gotoMeBtn = $('#btn-goto-me');
  if (gotoMeBtn) gotoMeBtn.addEventListener('click', () => switchView('me'));

  $('#btn-weather').addEventListener('click', async () => {
    const btn = $('#btn-weather');
    btn.textContent = '获取中…';
    const result = await getAutoWeather();
    if (result) {
      const sel = $('#weather-select');
      sel.value = result.mapped;
      settings.weather = result.mapped;
      storage.saveSettings(settings);
      regenerate();
      toast(`${result.source}：${result.text}`);
    } else {
      toast('天气获取失败，请手动选择（或检查和风/高德 key）');
    }
    btn.textContent = '自动获取天气';
  });
}

// ── 实时重规划 ──────────────────────────────────────────────
let regenTimer = null;
function scheduleRegenerate(delay = 350) {
  clearTimeout(regenTimer);
  regenTimer = setTimeout(regenerate, delay);
}
function regenerate() {
  if (!currentDaily && !currentWeekly) {
    // 尚未生成过：先按当前档案生成一次
    currentDaily = buildDailyPlan(profile, now(), settings.weather);
    currentWeekly = buildWeeklyPlan(profile, settings.weather);
    return;
  }
  currentDaily = buildDailyPlan(profile, now(), settings.weather);
  currentWeekly = buildWeeklyPlan(profile, settings.weather);
  // 若当前在结果视图，立即刷新
  if (currentView === 'daily') renderDaily();
  else if (currentView === 'weekly') renderWeekly();
  else if (currentView === 'map') renderMap();
}

/**
 * 自动获取天气：优先和风天气（更专业：实时+分钟级降雨），失败回退高德天气。
 * 返回 { mapped, text, source }
 */
async function getAutoWeather() {
  const adcode = cityInfo(profile.city).adcode;
  const cityName = cityInfo(profile.city).name;
  // 1) 和风天气（优先，分钟级降雨最专业）。优先走后端代理（隐藏 key），故不依赖前端 qwhost/qwkey
  const nowW = await qweather.qwNow(qwhost, qwkey, adcode);
  if (nowW) {
    const mapped = qweather.mapQwWeather(nowW.text);
    const minutely = await qweather.qwMinutely(qwhost, qwkey, profile.homeLng, profile.homeLat);
    const advice = qweather.qwAdvice(nowW, minutely);
    return { mapped, text: advice || `${nowW.text} ${nowW.temp}℃`, source: '和风天气' };
  }
  // 2) 高德 REST 天气（代理优先，隐藏 key）
  const w = await amap.restWeather(amapWsKey, cityName);
  if (w) return { mapped: w.mapped, text: `${w.weather} ${w.temperature}℃（已应用热力${weatherName(w.mapped)}档）`, source: '高德天气' };
  // 3) 高德 JS API 天气（回退）
  if (apikey) {
    const w2 = await amap.getWeather(apikey, jscode, cityName);
    if (w2) return { mapped: w2.mapped, text: `${w2.weather}（已应用热力${weatherName(w2.mapped)}档）`, source: '高德天气' };
  }
  return null;
}

// ── 日度规划 ────────────────────────────────────────────────
function renderDaily() {
  const v = $('#view-daily');
  if (!currentDaily) {
    v.innerHTML = `<div class="empty">请先在「首页」填写信息并生成规划</div>`;
    return;
  }
  const d = currentDaily;
  const merged = mergeSegments(d.segments); // 合并连续相同点位（半小时窗口 → 连续时间段）
  const rows = merged.map((s, i) => {
    const isWork = s.kind === 'work';
    const badge = s.kind === 'charge' || s.kind === 'gas' ? `<span class="badge b-supply">${s.label}</span>`
      : s.kind === 'meal' ? `<span class="badge b-meal">用餐</span>`
      : s.kind === 'end' ? `<span class="badge b-end">收车</span>`
      : `<span class="badge b-${heatClass(s.score)}">${s.label}</span>`;
    const supplyBtn = (s.kind === 'charge' || s.kind === 'gas' || s.kind === 'meal') && s.zone.lng != null
      ? `<button class="btn btn-mini poi-btn" data-kind="${s.kind}" data-lng="${s.zone.lng}" data-lat="${s.zone.lat}" data-idx="${i}">查附近POI</button>` : '';
    return `<div class="plan-row ${isWork ? '' : 'plan-nonwork'}" id="seg-${i}">
      <div class="plan-time">${s.time}</div>
      <div class="plan-body">
        <div class="plan-head"><strong>${esc(s.zone.name)}</strong>${badge}</div>
        ${isWork ? `<div class="plan-stars">${s.stars} <span class="score">热力 ${s.score}</span></div>` : ''}
        <div class="plan-strategy">${esc(s.strategy)}</div>
        ${s.km ? `<div class="plan-km">本时段约行驶 ${s.km}km${s.transfer ? ` · 空驶${s.transfer}km约${s.transferMin}分钟` : ''}${s.cumKm ? ` · 累计 ${s.cumKm}km` : ''}</div>` : ''}
        <div class="poi-slot" id="poi-${i}"></div>
      </div>
      <div class="plan-actions">
        ${s.zone.lng != null ? `<button class="btn btn-mini nav-btn" data-lng="${s.zone.lng}" data-lat="${s.zone.lat}" data-name="${esc(s.zone.name)}">导航</button>` : ''}
        ${supplyBtn}
      </div>
    </div>`;
  }).join('');

  // 当前时刻的实时推荐（现在该去哪）
  const nowHour = now().getHours() + now().getMinutes() / 60;
  const currentSeg = d.segments.find(s => s.kind === 'work' && nowHour >= s.hour && nowHour < s.hour + 0.5)
    || d.segments.find(s => s.kind === 'work' && nowHour < s.hour)
    || d.segments.filter(s => s.kind === 'work').slice(-1)[0];
  const nowCard = currentSeg ? `
    <div class="card now-card">
      <div class="now-label">📍 现在（${now().getHours()}:${String(now().getMinutes()).padStart(2, '0')}）推荐</div>
      <div class="now-body">
        <div><strong>${esc(currentSeg.zone.name)}</strong> <span class="score">热力 ${currentSeg.score}</span></div>
        <div class="now-strategy">${esc(currentSeg.strategy)}</div>
      </div>
      ${currentSeg.zone.lng != null ? `<button class="btn btn-primary btn-mini nav-btn" data-lng="${currentSeg.zone.lng}" data-lat="${currentSeg.zone.lat}" data-name="${esc(currentSeg.zone.name)}">一键导航</button>` : ''}
    </div>` : '';

  v.innerHTML = `
    <header class="page-head">
      <h1>今日跑单规划</h1>
      <p class="sub">${dateLabel(d.date)} · ${dayKindLabel(d.dayKind)} · 预计 ${d.totalKm}km</p>
    </header>
    ${nowCard}
    <div class="card summary">${esc(d.summary).replace(/\n/g, '<br>')}</div>
    <div class="toolbar">
      <button class="btn" id="btn-map">查看示意图</button>
      <button class="btn" id="btn-copy">复制文字版</button>
      <button class="btn" id="btn-csv">导出CSV</button>
    </div>
    <div class="plan-list">${rows}</div>
    <div class="card legend-box">${legend()}</div>`;
  $('#btn-map').addEventListener('click', () => switchView('map'));
  $('#btn-copy').addEventListener('click', () => { copyText(planToText(d)); toast('已复制到剪贴板'); });
  $('#btn-csv').addEventListener('click', () => { downloadCSV(d); });
  bindPoiButtons(d);
}

/** 补给段「查附近POI」：有 key 时搜索真实充电/加油/餐饮门店并回填 */
function bindPoiButtons(d) {
  if (!apikey) return;
  document.querySelectorAll('.poi-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.kind, lng = parseFloat(btn.dataset.lng), lat = parseFloat(btn.dataset.lat);
      const idx = btn.dataset.idx;
      const slot = $(`#poi-${idx}`);
      slot.innerHTML = '<span class="muted">搜索中…</span>';
      let keyword, type;
      if (kind === 'charge') { keyword = '充电'; type = '充电站'; }
      else if (kind === 'gas') { keyword = '加油站'; type = '加油站'; }
      else { keyword = '快餐'; type = '餐饮服务'; }
      const pois = await amap.searchNearby(apikey, jscode, keyword, lng, lat, 3000, cityInfo(profile.city).name, type);
      if (pois && pois.length) {
        slot.innerHTML = pois.slice(0, 4).map((p, i) =>
          `<div class="poi-item"><span class="poi-name">${i + 1}. ${esc(p.name)}</span><span class="muted">${Math.round(p.distance)}m</span></div>`).join('');
      } else if (pois && pois.length === 0) {
        slot.innerHTML = '<span class="muted">附近未找到相关门店</span>';
      } else {
        slot.innerHTML = '<span class="muted">查询失败（key 类型需为「Web端 JS API」）</span>';
      }
    });
  });
}

// ── 周度规划 ────────────────────────────────────────────────
function renderWeekly() {
  const v = $('#view-weekly');
  if (!currentWeekly) {
    v.innerHTML = `<div class="empty">请先在「首页」填写信息并生成规划</div>`;
    return;
  }
  const cards = currentWeekly.map(day => {
    const gold = day.golden.map(g =>
      `<div class="gold-item"><span class="gold-time">${g.time}</span> ${esc(g.zone.name)} <span class="score">${g.score}</span></div>`).join('');
    return `<div class="card week-card">
      <div class="week-head"><strong>${day.dateLabel}</strong><span class="badge b-week">${day.dayKindLabel}</span></div>
      <div class="week-theme">${esc(day.theme)}</div>
      <div class="week-gold">${gold || '<span class="muted">今日休息</span>'}</div>
      <div class="week-km">预计 ${day.totalKm}km</div>
    </div>`;
  }).join('');
  v.innerHTML = `
    <header class="page-head"><h1>周度规划</h1><p class="sub">未来 7 天跑单节奏建议（含单双休差异）</p></header>
    ${cards}
    <div class="toolbar"><button class="btn" id="btn-week-copy">复制周计划文字版</button></div>`;
  $('#btn-week-copy').addEventListener('click', () => { copyText(weekToText(currentWeekly)); toast('已复制'); });
}

// ── 示意图 ──────────────────────────────────────────────────
function renderMap() {
  const v = $('#view-map');
  if (!currentDaily) {
    v.innerHTML = `<div class="empty">请先在「首页」生成规划</div>`;
    return;
  }
  const legendHtml = `<div class="card legend-box">${legend()}</div>`;
  const nowHour = now().getHours() + now().getMinutes() / 60;

  // 顶部模式切换 tab
  v.innerHTML = `
    <header class="page-head"><h1>路径示意图</h1><p class="sub">路线规划 / 商圈热力</p></header>
    <div class="map-tabs">
      <button class="map-tab ${currentMapMode === 'route' ? 'on' : ''}" data-map-mode="route">路线示意</button>
      <button class="map-tab ${currentMapMode === 'heat' ? 'on' : ''}" data-map-mode="heat">商圈热力</button>
    </div>
    <div id="map-body"></div>
    ${legendHtml}`;
  document.querySelectorAll('.map-tab').forEach(b => b.addEventListener('click', () => {
    currentMapMode = b.dataset.mapMode;
    renderMapBody(nowHour);
    document.querySelectorAll('.map-tab').forEach(x => x.classList.toggle('on', x.dataset.mapMode === currentMapMode));
  }));
  renderMapBody(nowHour);
}

function renderMapBody(nowHour) {
  const body = $('#map-body');
  if (currentMapMode === 'heat') {
    // 商圈热力（当前时段，离线 SVG 气泡图）
    body.innerHTML = `<div class="card">${renderHeatmap(profile.city, now(), nowHour, settings.weather, profile.bigWeek)}</div>
      <p class="foot-note">气泡越大越热，数字为热力指数(0-10)。随当前时间实时刷新。</p>`;
    return;
  }
  // 路线示意
  if (apikey) {
    body.innerHTML = `
      <div class="card map-card">
        <div id="amap-container" style="height:430px;border-radius:10px;"></div>
        <div id="route-status" class="route-status">正在加载真实驾车路线…</div>
      </div>
      <p class="foot-note">实线为真实驾车路线，虚线为示意连线；点击「导航」跳转高德实时导航。</p>`;
    renderAmapMap();
  } else {
    body.innerHTML = `<div class="card">${renderSchematic(currentDaily.segments)}</div>
      <p class="foot-note">未配置高德 key，当前为离线示意图。配置 key 后可升级为在线地图。</p>`;
  }
}

async function renderAmapMap() {
  const AMap = await amap.loadAMap(apikey, jscode);
  const el = $('#amap-container');
  if (!AMap || !el) return;
  const pts = currentDaily.segments.filter(s => s.zone && s.zone.lng != null && s.zone.lat != null);
  if (!pts.length) return;
  try {
    const map = new AMap.Map(el, { zoom: 11, center: [pts[0].zone.lng, pts[0].zone.lat], viewMode: '2D' });
    const infoWin = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });
    const markers = [];
    pts.forEach((s, i) => {
      const color = s.kind === 'work' ? heatColor(s.score) : (s.kind === 'charge' || s.kind === 'gas' ? '#22b573' : s.kind === 'meal' ? '#f0781e' : '#666');
      const marker = new AMap.Marker({
        position: [s.zone.lng, s.zone.lat],
        content: `<div style="width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);">${i + 1}</div>`,
        offset: new AMap.Pixel(-11, -11),
      });
      marker.setMap(map);
      marker.on('click', () => {
        infoWin.setContent(`<div style="font-size:13px;line-height:1.5;"><b>${esc(s.zone.name)}</b><br>${esc(s.time)}${s.score ? ' · 热力' + s.score : ''}</div>`);
        infoWin.open(map, marker.getPosition());
      });
      markers.push(marker);
    });
    // 示意虚线（即时显示）
    const dashed = new AMap.Polyline({
      path: pts.map(p => [p.zone.lng, p.zone.lat]),
      strokeColor: '#8ab4f8', strokeWeight: 2, strokeOpacity: 0.6, strokeStyle: 'dashed',
    });
    map.add(dashed);
    map.setFitView(markers, false, [50, 50, 50, 50]);
    // 异步加载真实驾车路线
    await renderDrivingRoutes(AMap, map, pts, dashed);
  } catch (e) {
    el.innerHTML = '<div class="empty">在线地图初始化失败，可到「我的」检查 key 或切换离线模式。</div>';
  }
}

/** 逐段调用高德 Driving，用真实驾车路线覆盖示意虚线（节流，避免 QPS 超限） */
async function renderDrivingRoutes(AMap, map, pts, dashed) {
  const status = $('#route-status');
  const segCount = pts.length - 1;
  let okCount = 0;
  let realKm = 0;
  for (let i = 0; i < segCount; i++) {
    const from = pts[i].zone, to = pts[i + 1].zone;
    // 跳过超远段（如跨城/浦东机场），避免规划超时，仅保留示意线
    const straight = distKmSimple(from, to);
    if (straight > 45) { okCount++; continue; }
    const route = await amap.drivingRoute(apikey, jscode, from, to);
    if (route && route.points && route.points.length > 1) {
      const real = new AMap.Polyline({
        path: route.points,
        strokeColor: '#1b6ef3', strokeWeight: 4, strokeOpacity: 0.85,
        showDir: true,
      });
      map.add(real);
      realKm += (route.distance || 0) / 1000;
      okCount++;
    }
    if (status) status.textContent = `真实驾车路线加载中 ${okCount}/${segCount}…`;
    await amap.sleep(250);
  }
  if (dashed) dashed.hide();
  if (status) {
    status.textContent = okCount === segCount
      ? `✅ 已加载 ${segCount} 段真实驾车路线（合计约 ${Math.round(realKm)}km）`
      : `已加载 ${okCount}/${segCount} 段真实路线（部分远距离段保留示意线）`;
  }
}

function distKmSimple(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function heatColor(score) {
  if (score >= 8) return '#e23c3c';
  if (score >= 6.5) return '#f0781e';
  if (score >= 5) return '#f0b400';
  if (score >= 3.5) return '#4aa8e0';
  return '#9aa4b2';
}

// ── 我的（设置/历史/导出/key） ──────────────────────────────
function renderMe() {
  const v = $('#view-me');
  const hist = storage.loadHistory();
  const histHtml = hist.slice(0, 10).map(h =>
    `<div class="hist-item"><span>${esc(h.label)}</span><span class="muted">${h.totalKm}km</span></div>`).join('') || '<div class="muted">暂无历史</div>';
  v.innerHTML = `
    <header class="page-head"><h1>我的</h1></header>
    <div class="card">
      <h2 class="sec-title">高德地图配置（Web端 JS API）</h2>
      <label class="field"><span>Key（Web端 JS API 类型）</span>
        <input type="password" id="input-key" value="${esc(apikey)}" placeholder="粘贴高德「Web端」key" autocomplete="off">
      </label>
      <label class="field"><span>安全密钥 jscode</span>
        <input type="password" id="input-jscode" value="${esc(jscode)}" placeholder="粘贴安全密钥 jscode" autocomplete="off">
      </label>
      <div class="toolbar">
        <button class="btn" id="btn-save-key">保存配置</button>
        <button class="btn" id="btn-toggle-key">显示/隐藏</button>
        <button class="btn" id="btn-key-guide">注册指引</button>
      </div>
      <p class="hint">🔒 密钥不明文内置、界面打码、本地混淆存储。此 key 因地图 SDK 必须前端加载而无法完全隐藏，请务必在高德控制台设置「域名白名单」限制使用范围。</p>
    </div>
    <div class="card">
      <h2 class="sec-title">REST 密钥（和风天气 · 高德 Web服务）</h2>
      <p class="hint">🔒 这些 key 由<b>后端代理</b>提供（server.js / Docker / Electron 环境变量注入），前端不存储、不显示、不暴露，通过同源 <code>/api/*</code> 代理调用。</p>
      <div id="proxy-status" class="qw-diag" style="display:none;"></div>
      <p class="hint">自定义 REST key：部署后端时设置环境变量 <code>QW_HOST</code> / <code>QW_KEY</code> / <code>AMAP_WS_KEY</code>（见 .env.example）。</p>
    </div>
    <div class="card">
      <h2 class="sec-title">数据管理</h2>
      <div class="toolbar">
        <button class="btn" id="btn-export">导出数据(JSON)</button>
        <button class="btn" id="btn-import">导入数据</button>
        <button class="btn btn-danger" id="btn-clear">清空数据</button>
      </div>
      <input type="file" id="file-import" accept=".json" style="display:none">
    </div>
    <div class="card">
      <h2 class="sec-title">历史规划</h2>
      ${histHtml}
    </div>
    <div class="card">
      <h2 class="sec-title">关于 · 开源引用</h2>
      <p class="hint">本工具为司机自用的行程规划（V2.0），核心逻辑纯前端实现，感谢以下服务与算法：</p>
      <ul class="credit-list">
        <li>高德地图 JS API 2.0 / Web服务 API（地图、路线、POI、天气）</li>
        <li>和风天气 API v7（实时天气、分钟级降雨）</li>
        <li>Viterbi 动态规划（路径全局优化，经典公开算法）</li>
        <li>WGS84→GCJ-02 坐标转换（公开算法）</li>
        <li>12 城市真实商圈数据（高德 POI）</li>
        <li>法定节假日数据（国务院办公厅通知）</li>
      </ul>
      <p class="hint">多端部署：H5 / 小程序(uni-app) / 本地程序(Electron) / Docker(含飞牛NAS)，见 docs/05-架构V2与部署方案.md。</p>
    </div>
    <p class="foot-note">本应用为司机自用行程规划工具，不涉及抢单外挂或绕过平台调度，合规安全。</p>`;
  $('#btn-save-key').addEventListener('click', () => {
    apikey = $('#input-key').value.trim();
    jscode = $('#input-jscode').value.trim();
    storage.saveApiKey(apikey);
    storage.saveApiJsCode(jscode);
    toast('配置已保存');
    renderForm();
  });
  let showKey = false;
  $('#btn-toggle-key').addEventListener('click', () => {
    showKey = !showKey;
    const t = showKey ? 'text' : 'password';
    $('#input-key').type = t;
    $('#input-jscode').type = t;
    $('#btn-toggle-key').textContent = showKey ? '隐藏' : '显示/隐藏';
  });
  $('#btn-key-guide').addEventListener('click', () => { location.href = '../docs/03-API-Key注册指引.md'; });
  // 检测后端代理状态（REST key 是否由服务端提供）
  (async () => {
    const st = $('#proxy-status');
    const show = (color, text) => { st.style.display = 'block'; st.style.color = color; st.textContent = text; };
    try {
      const r = await fetch('/api/amap/weather?city=上海');
      if (r.ok) {
        const d = await r.json();
        if (d.status === '1') return show('#158a53', '✅ 后端代理已连接，REST 密钥由服务端安全提供');
      }
      show('#b8860b', '⚠️ 未检测到后端代理（当前为纯静态部署），天气/POI 走降级模式。如需 REST 服务请用 server.js / Docker / Electron 部署（密钥只存服务端）。');
    } catch (e) {
      show('#b8860b', '⚠️ 未检测到后端代理（当前为纯静态部署），天气/POI 走降级模式。如需 REST 服务请用 server.js / Docker / Electron 部署（密钥只存服务端）。');
    }
  })();
  $('#btn-export').addEventListener('click', () => {
    downloadJSON(storage.exportAllData(), `跑单助手数据_${now().toISOString().slice(0, 10)}.json`);
    toast('已导出');
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { storage.importAllData(JSON.parse(reader.result)); toast('导入成功'); renderMe(); renderForm(); }
      catch (err) { toast('导入失败：文件格式错误'); }
    };
    reader.readAsText(f);
  });
  $('#btn-clear').addEventListener('click', () => {
    if (confirm('确定清空所有本地数据？此操作不可恢复。')) { storage.clearAllData(); location.reload(); }
  });
}

// ── 全局事件 ────────────────────────────────────────────────
function bindGlobal() {
  document.addEventListener('click', e => {
    const nb = e.target.closest('.nav-btn');
    if (nb) {
      const lng = nb.dataset.lng, lat = nb.dataset.lat, name = nb.dataset.name;
      location.href = amap.naviLink(name, parseFloat(lng), parseFloat(lat));
    }
  });
}

// ── 导出/复制工具 ───────────────────────────────────────────
function planToText(d) {
  const head = `【跑单规划】${dateLabel(d.date)} ${dayKindLabel(d.dayKind)} 预计${d.totalKm}km\n`;
  const lines = d.segments.map(s =>
    `${s.time} ${s.zone.name}${s.label ? ' [' + s.label + ']' : ''}${s.score ? ' 热力' + s.score : ''}\n  ${s.strategy}`).join('\n');
  return head + lines;
}
function weekToText(days) {
  return days.map(d =>
    `${d.dateLabel}（${d.dayKindLabel}）\n  ${d.theme}\n  ${d.golden.map(g => `${g.time} ${g.zone.name}(${g.score})`).join(' | ') || '休息'}`).join('\n\n');
}
function downloadCSV(d) {
  const header = '时间段,点位,类型,热力,策略,本段里程km,累计里程km';
  const rows = d.segments.map(s => {
    const name = s.zone.name.replace(/[,，]/g, ' ');
    const strat = s.strategy.replace(/[,，]/g, ' ');
    return `${s.time},${name},${s.label || s.kind},${s.score || ''},${strat},${s.km || 0},${s.cumKm || 0}`;
  }).join('\n');
  downloadText(`\uFEFF${header}\n${rows}`, `跑单规划_${dateLabel(d.date)}.csv`, 'text/csv;charset=utf-8');
}
function downloadJSON(obj, name) { downloadText(JSON.stringify(obj, null, 2), name, 'application/json'); }
function downloadText(text, name, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function copyText(t) {
  navigator.clipboard?.writeText(t).catch(() => {});
}
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── 小工具 ──────────────────────────────────────────────────
function toTime(h) { return `${String(h).padStart(2, '0')}:00`; }
function parseTime(s, def) {
  if (!s) return def;
  const [h] = s.split(':').map(Number);
  return Number.isInteger(h) ? h : def;
}
function heatClass(score) { return score >= 6.5 ? 'hot' : score >= 5 ? 'warm' : 'cool'; }
function weatherName(k) { return { clear: '晴', cloudy: '多云', rain: '小雨', heavy_rain: '暴雨', snow: '雪', extreme: '极端天气' }[k] || k; }

/** 用坐标反查最近城市（50km 内命中，haversine 精确距离），用于地址解析后自动切换城市 */
function detectCityByCoord(lng, lat) {
  let best = null, bestD = Infinity;
  for (const c of CITIES) {
    const ctr = cityInfo(c.key).center;
    const d = distKm({ lng, lat }, ctr);
    if (d < bestD) { bestD = d; best = c.key; }
  }
  return bestD < 50 ? best : null;
}

/** 当前时间向上取整到半小时（小时小数） */
function currentHalfHour(d) {
  const h = d.getHours(), m = d.getMinutes();
  const half = Math.ceil(m / 30) * 30;
  if (half >= 60) return h + 1;
  return h + half / 60;
}

/** WGS84 → GCJ-02 坐标转换（高德/腾讯坐标，公开算法） */
function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  function outOfChina(l, la) { return l < 72.004 || l > 137.8347 || la < 0.8293 || la > 55.8271; }
  function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lng: lng + dLng, lat: lat + dLat };
}
