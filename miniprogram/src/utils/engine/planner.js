/**
 * 日度线路规划算法 v4（动态规划全局路径优化 + 半小时窗口 + 多城市 + 真实路网估算）
 * 核心升级：
 *   1. 用 Viterbi 动态规划替代逐窗口贪心：全局权衡「热力收益 − 转移成本 − 切换成本」，
 *      避免贪心陷入局部最优（如为了当前高热区而多跑空驶）
 *   2. 时间窗 0.5h；多城市点位库；出发地址实时影响首站与整体动线
 *   3. 转移成本用真实驾车时间/里程估算（过江 + 远距离加成）
 *   4. 饭点/续航作为硬约束后处理（DP 只优化「选哪个点位」）
 */

import { zonesOf, xcityOf, nearestZones, distKm, cityInfo } from './poi-db.js';
import { dayKindOf, heatScore, heatLabel, heatStars } from './heat-model.js';
import { checkRestriction, zoneAllowed } from './restrictions.js';

// ── 路网与成本参数 ──────────────────────────────────────────
const WINDOW_H = 0.5;             // 时间窗（小时）= 30 分钟
const CITY_SPEED = 26;            // 市区平均车速 km/h（含红绿灯/缓行）
const TIME_COST_W = 0.06;         // 每分钟转移时间扣分（热力 0-10 制）
const EMPTY_KM_W = 0.08;          // 每公里空驶额外扣分
const SWITCH_COST = 0.5;          // 切换点位成本（避免过强导致死守单点）
const START_BONUS_MAX = 6.0;      // 出发就近奖励上限（加强，让地址明显影响首站）
const START_BONUS_DECAY = 0.4;    // 每离家公里衰减（更快，远距离点位不选作首站）

/** 停留疲劳：连续守同一商圈超过 2 小时（4 窗口）后热力递减，驱动司机轮换商圈 */
function stayFatigue(dwell) {
  return Math.max(0.6, 1 - Math.max(0, dwell - 4) * 0.08);
}
/** 最小停留：切换到新点位后至少停留 N 个窗口（2 小时），避免半小时来回刷点 */
const MIN_DWELL = 4;

// 上海过江检测：黄浦江约在经度 121.50（浦东 lng>121.50）；按坐标判断，兼容自动生成的点位库
function sideOf(z, city) {
  if (city !== 'shanghai') return 'same';
  return z.lng > 121.50 ? 'pudong' : 'puxi';
}

/** 道路系数：直线距离 → 路网距离放大倍数（过江/远距离更大） */
function roadFactor(a, b, city) {
  let f = 1.35;
  if (city === 'shanghai' && sideOf(a, city) !== sideOf(b, city)) f += 0.25; // 跨黄浦江
  const d = distKm(a, b);
  if (d > 20) f += 0.15; // 远距离（如机场）
  return f;
}

/** 转移信息：路网里程(km) + 预计耗时(分钟) */
function transferInfo(from, to, city) {
  const d = distKm(from, to);
  const km = d * roadFactor(from, to, city);
  const min = km / CITY_SPEED * 60;
  return { lineKm: Math.round(d * 10) / 10, km: Math.round(km), min: Math.round(min) };
}

/**
 * 候选点位裁剪：点位库密集化后（上海 1000+ 点），DP 的 O(N×M²) 会失控，
 * 且候选过密会让 DP 选到不合理的长距离跳跃。裁剪策略：
 *   1) 强制保留枢纽（机场/火车站，热力模板特殊不可替代）+ 夜生活点位
 *   2) 强制保留离家最近 8 个（保证首站就近）
 *   3) 其余按「全天平均热力」降序 + 5km 空间去重，补满 MAX 个
 * 复杂度：M 控制在 ~60，DP 毫秒级。
 */
const MAX_CANDIDATES = 60;
const MIN_NEAR = 8;         // 强制保留的离家最近点数
const SPATIAL_MIN_KM = 5;   // 空间去重最小间距（避免候选挤在同一商圈）

function avgHeatOf(z, dayKind, weather) {
  let s = 0, n = 0;
  for (let h = 7; h <= 22; h += 3) { s += heatScore(z, dayKind, h, weather); n++; }
  return s / n;
}

function pruneCandidates(zones, homeAnchor, dayKind, weather) {
  if (zones.length <= MAX_CANDIDATES) return zones;
  const scored = zones.map(z => ({ z, h: avgHeatOf(z, dayKind, weather), d: distKm(homeAnchor, z) }));
  const picked = [];
  const has = it => picked.includes(it);

  // 1) 枢纽（机场/火车站）热力模板特殊且不可替代，强制保留
  for (const it of scored) if (it.z.type === 'hub') picked.push(it);
  // 2) 夜生活点位（数量少、单均价高）强制保留
  for (const it of scored) if (it.z.type === 'night' && !has(it)) picked.push(it);

  // 3) 离家最近 8 个（首站就近保障）
  const near = scored.slice().sort((a, b) => a.d - b.d).slice(0, MIN_NEAR);
  for (const it of near) if (!has(it)) picked.push(it);

  // 4) 热力降序 + 5km 空间去重，补满 MAX
  const byHeat = scored.slice().sort((a, b) => b.h - a.h);
  for (const it of byHeat) {
    if (picked.length >= MAX_CANDIDATES) break;
    if (has(it)) continue;
    if (picked.some(p => distKm(p.z, it.z) < SPATIAL_MIN_KM)) continue;
    picked.push(it);
  }
  return picked.map(p => p.z);
}

/**
 * Viterbi 动态规划：求「热力收益 − 转移成本 − 切换成本」全局最大的点位序列。
 * 复杂度 O(N × M²)，N=窗口数(~30)，M=候选点位(~60)，纯前端毫秒级。
 */
function optimizePathDP(windows, candidates, homeAnchor, dayKind, weather, city, profile, date) {
  const N = windows.length;
  const M = candidates.length;
  // 预计算热力矩阵 heat[j][i]，含限行降权（外牌限行时段给枢纽类降权）
  const heat = candidates.map((z, j) => windows.map(w => {
    let hs = heatScore(z, dayKind, w.start, weather);
    const r = checkRestriction(profile.plateType, date, w.start, city);
    if (r.restricted && z.type === 'hub') hs -= 2; // 限行时段枢纽降权
    return hs;
  }));

  // 首站候选：离家最近的 FIRST_TOP_N 个点位（强制就近，避免 DP 全局最优导致首站选远处高热枢纽）
  const FIRST_TOP_N = 5;
  const firstSet = new Set(
    candidates
      .map((z, i) => ({ i, d: transferInfo(homeAnchor, z, city).km }))
      .sort((a, b) => a.d - b.d)
      .slice(0, FIRST_TOP_N)
      .map(x => x.i)
  );

  // dp[i][j] = 前 i+1 个窗口、第 i 窗选 candidates[j] 的最优 { score, prev, dwell }
  let dp = new Array(M);
  for (let j = 0; j < M; j++) {
    if (!firstSet.has(j)) { dp[j] = { score: -Infinity, prev: -1, dwell: 1 }; continue; }
    const t = transferInfo(homeAnchor, candidates[j], city);
    const startBonus = Math.max(0, START_BONUS_MAX - t.km * START_BONUS_DECAY);
    dp[j] = { score: heat[j][0] - t.min * TIME_COST_W - t.km * EMPTY_KM_W + startBonus, prev: -1, dwell: 1 };
  }
  const trace = [dp.map(d => ({ ...d }))];

  for (let i = 1; i < N; i++) {
    const next = new Array(M);
    for (let j = 0; j < M; j++) {
      let best = { score: -Infinity, prev: -1, dwell: 1 };
      for (let p = 0; p < M; p++) {
        if (p === j) {
          // 继续停留：受疲劳衰减（守点越久，边际收益越低）
          const dwell = (dp[p].dwell || 1) + 1;
          const s = dp[p].score + heat[j][i] * stayFatigue(dwell);
          if (s > best.score) best = { score: s, prev: p, dwell };
        } else {
          // 最小停留约束：切换后须至少停留 MIN_DWELL 窗口才允许再切换
          if ((dp[p].dwell || 1) < MIN_DWELL) continue;
          const t = transferInfo(candidates[p], candidates[j], city);
          let hubBoost = 0;
          if (profile.crossCity && candidates[j].type === 'hub' && (dayKind === 'friday' || dayKind === 'sunday') && windows[i].start >= 17) hubBoost = 1.5;
          const s = dp[p].score + heat[j][i] - t.min * TIME_COST_W - t.km * EMPTY_KM_W - SWITCH_COST + hubBoost;
          if (s > best.score) best = { score: s, prev: p, dwell: 1 };
        }
      }
      next[j] = best;
    }
    dp = next;
    trace.push(dp.map(d => ({ ...d })));
  }

  // 回溯
  let bestJ = 0;
  for (let j = 1; j < M; j++) if (dp[j].score > dp[bestJ].score) bestJ = j;
  const path = new Array(N);
  let cur = bestJ;
  for (let i = N - 1; i >= 0; i--) {
    path[i] = candidates[cur];
    cur = trace[i][cur].prev;
  }
  return path;
}

export function buildDailyPlan(profile, date = new Date(), weather = 'clear') {
  const city = profile.city || 'shanghai';
  const dayKind = dayKindOf(date, profile.bigWeek);
  const startH = profile.startHour ?? 7;
  const endH = profile.endHour ?? 22;
  const center = cityInfo(city);

  const allCandidates = zonesOf(city).filter(z => z.type !== 'meal' && zoneAllowed(z, profile.plateType));
  const homeAnchor = { id: 'home', lng: profile.homeLng ?? center.lng ?? 121.47, lat: profile.homeLat ?? center.lat ?? 31.23 };
  const candidates = pruneCandidates(allCandidates, homeAnchor, dayKind, weather);

  // 半小时时间窗
  const windows = [];
  for (let h = startH; h < endH; h += WINDOW_H) {
    windows.push({ start: h, end: Math.min(h + WINDOW_H, endH) });
  }

  // 1) DP 全局优化求最优点位序列
  const path = optimizePathDP(windows, candidates, homeAnchor, dayKind, weather, city, profile, date);

  // 2) 沿路径生成 segments，饭点/续航硬约束后处理
  let cumKm = 0;
  let cumEmpty = 0;
  let prevPos = { lng: homeAnchor.lng, lat: homeAnchor.lat };
  let lunchDone = false, dinnerDone = false;
  const segments = [];
  const rangeKm = profile.rangeKm || 400;
  const rangeLimit = rangeKm * 0.8;

  windows.forEach((w, wi) => {
    const hour = w.start;
    const durH = w.end - w.start;
    const midH = hour + WINDOW_H / 2;
    const zone = path[wi];

    // 饭点补给
    const isLunch = !lunchDone && midH >= 11.75 && midH < 12.75;
    const isDinner = !dinnerDone && midH >= 17.75 && midH < 18.75;
    if ((isLunch || isDinner) && segments.length > 0) {
      // 优先找专门司机餐厅（meal），若超过 8km 则改用就近商圈就餐（商圈/写字楼均含餐饮）
      let mealZone = nearestZones(prevPos.lng, prevPos.lat, 1, ['meal'], city)[0];
      let mealFallback = false;
      if (!mealZone || distKm(prevPos, mealZone) > 8) {
        mealZone = nearestZones(prevPos.lng, prevPos.lat, 1, ['shop', 'biz', 'home'], city)[0];
        mealFallback = true;
      }
      if (mealZone) {
        if (isLunch) lunchDone = true;
        if (isDinner) dinnerDone = true;
        const t = transferInfo(prevPos, mealZone, city);
        cumKm += t.km; cumEmpty += t.km;
        segments.push({
          kind: 'meal', time: `${fmt(w.start)}-${fmt(w.end)}`, hour,
          zone: mealZone, score: 0,
          strategy: mealFallback
            ? (isLunch ? '午餐补给，就近商圈就餐，顺路听单' : '晚餐补给，就近商圈就餐，顺路听单')
            : (isLunch ? '午餐补给，顺路听单（快餐/司机餐厅集中区）' : '晚餐补给，顺路听单（快餐/司机餐厅集中区）'),
          km: t.km, transfer: t.km, cumKm: Math.round(cumKm), stars: '', label: '用餐',
        });
        prevPos = { lng: mealZone.lng, lat: mealZone.lat };
        return;
      }
    }

    const t = transferInfo(prevPos, zone, city);
    const opKm = durH * 18;
    cumKm += opKm + t.km;
    cumEmpty += t.km;

    // 续航检查
    if (cumKm > rangeLimit && rangeKm > 0) {
      segments.push({
        kind: profile.vehicleType === 'ev' ? 'charge' : 'gas',
        time: `${fmt(w.start)}-${fmt(w.end)}`, hour,
        zone: { id: 'recharge', name: profile.vehicleType === 'ev' ? '就近充电站' : '就近加油站', lng: zone.lng, lat: zone.lat },
        score: 0,
        strategy: `累计约${Math.round(cumKm)}km，接近续航${rangeKm}km的80%，安排${profile.vehicleType === 'ev' ? '充电' : '加油'}30-60分钟`,
        km: 0, cumKm: Math.round(cumKm), stars: '', label: profile.vehicleType === 'ev' ? '充电' : '加油',
      });
      cumKm = 0;
      prevPos = { lng: zone.lng, lat: zone.lat };
      return;
    }

    const hs = heatScore(zone, dayKind, hour, weather);
    segments.push({
      kind: 'work', time: `${fmt(w.start)}-${fmt(w.end)}`, hour,
      zone, score: Math.round(hs * 10) / 10,
      strategy: buildStrategy(zone, dayKind, hour, profile),
      km: Math.round(opKm), transfer: t.km, transferMin: t.min, cumKm: Math.round(cumKm),
      stars: heatStars(hs), label: heatLabel(hs),
    });
    prevPos = { lng: zone.lng, lat: zone.lat };
  });

  // 收车回程
  const ret = transferInfo(prevPos, homeAnchor, city);
  cumKm += ret.km;
  segments.push({
    kind: 'end', time: `≈${fmt(endH)}`, hour: endH,
    zone: { id: 'home', name: '回住宿地', lng: homeAnchor.lng, lat: homeAnchor.lat },
    score: 0, strategy: `收车回家，距当前点位约${ret.km}km（约${ret.min}分钟），可顺路接一单同方向。`,
    km: ret.km, cumKm: Math.round(cumKm), stars: '', label: '收车',
  });

  const totalKm = segments.reduce((s, x) => s + (x.km || 0), 0);
  const summary = buildSummary(segments, totalKm, cumEmpty, dayKind, profile, date, weather);
  return { date, dayKind, weather, segments, totalKm: Math.round(totalKm), emptyKm: Math.round(cumEmpty), summary };
}

/** 合并连续相同点位的展示段（半小时窗口 → 连续时间段） */
export function mergeSegments(segments) {
  const out = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.zone.id === s.zone.id && last.kind === s.kind) {
      // 合并：扩展结束时间，累加里程
      last.endHour = s.hour + (s.kind === 'work' ? 0.5 : 0.5);
      last.km = (last.km || 0) + (s.km || 0);
      last.cumKm = s.cumKm;
      last.time = `${last.time.split('-')[0]}-${s.time.split('-')[1] || s.time.split('-')[0]}`;
    } else {
      out.push({ ...s, endHour: s.hour + 0.5 });
    }
  }
  return out;
}

function buildStrategy(z, dayKind, hour, profile) {
  const parts = [];
  if (z.type === 'biz') {
    if (hour >= 20) parts.push('互联网/金融加班下班高峰，蹲守写字楼出口');
    else if (hour >= 17) parts.push('晚高峰办公区出发潮，往居住区方向听单');
    else parts.push('早高峰办公区到达潮，接市区短驳单');
  } else if (z.type === 'hub') {
    parts.push(z.tags.includes('机场') ? '机场到达波次，排队区接单' : '高铁到达高峰，出站口即约即走');
    if (profile.crossCity) parts.push('可接跨城返程单');
  } else if (z.type === 'night') {
    parts.push('夜生活回程单，单均价高');
  } else if (z.type === 'shop') {
    parts.push(hour >= 20 ? '商场闭店+餐饮结束的返程潮' : '商圈购物/餐饮客流');
  } else if (z.type === 'home') {
    parts.push('早高峰居住区出发潮，接进市区/地铁换乘单');
  } else if (z.type === 'edu') {
    parts.push('学生返校/离校潮');
  }
  if (parts.length === 0 && z.note) parts.push(z.note);
  return parts.slice(0, 2).join('；') || z.note || '稳定听单区';
}

function buildSummary(segments, totalKm, emptyKm, dayKind, profile, date, weather) {
  const workSegs = segments.filter(s => s.kind === 'work');
  const best = workSegs.reduce((a, b) => (b.score > a.score ? b : a), workSegs[0]);
  const chargeCount = segments.filter(s => s.kind === 'charge' || s.kind === 'gas').length;
  const r = checkRestriction(profile.plateType, date, profile.startHour, profile.city);
  const emptyRate = totalKm ? Math.round(emptyKm / totalKm * 100) : 0;
  const lines = [
    `${dateLabel(date)}（${dayKindLabel(dayKind)}）`,
    `预计总行驶 ${totalKm}km（空驶 ${emptyKm}km，空驶率约 ${emptyRate}%），共 ${workSegs.length} 个半小时跑单时段${chargeCount ? `，${chargeCount} 次补给` : ''}。`,
    best ? `黄金时段：${best.time} · ${best.zone.name}（${heatLabel(best.score)}，热力${best.score}）` : '',
    r.restricted ? `限行提示：${r.reason}` : `限行提示：${r.advice}`,
    `天气：${weatherLabel(weather)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function fmt(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function dateLabel(d) {
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
}
export function dayKindLabel(k) {
  return {
    workday: '工作日', friday: '周五', saturday: '周六', saturday_big: '大周周六(上班)',
    sunday: '周日', holiday: '节假日',
  }[k] || k;
}
export function weatherLabel(w) {
  return { clear: '晴', cloudy: '多云', rain: '雨', heavy_rain: '暴雨', snow: '雪', extreme: '极端' }[w] || w;
}
