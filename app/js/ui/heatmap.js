/**
 * 商圈热力气泡图（离线 SVG，无需地图 key）。
 * 把某城市当前时段的各商圈热力指数渲染成气泡图：气泡大小 ∝ 热力分，颜色 = 热力等级。
 */
import { zonesOf } from '../engine/poi-db.js';
import { heatScore, heatLabel, dayKindOf } from '../engine/heat-model.js';

function heatColor(score) {
  if (score >= 8) return '#e23c3c';
  if (score >= 6.5) return '#f0781e';
  if (score >= 5) return '#f0b400';
  if (score >= 3.5) return '#4aa8e0';
  return '#9aa4b2';
}

function project(lng, lat, bounds, w, h, pad = 30) {
  const spanLng = (bounds.maxLng - bounds.minLng) || 0.01;
  const spanLat = (bounds.maxLat - bounds.minLat) || 0.01;
  const x = pad + (lng - bounds.minLng) / spanLng * (w - pad * 2);
  const y = pad + (bounds.maxLat - lat) / spanLat * (h - pad * 2);
  return { x, y };
}

/**
 * 生成商圈热力气泡图 SVG。
 * @param city 城市 key
 * @param date Date
 * @param hour 小时（可含小数）
 * @param weather 天气档位
 * @param bigWeek 是否大周
 */
export function renderHeatmap(city, date, hour, weather = 'clear', bigWeek = false, { width = 680, height = 460 } = {}) {
  const dayKind = dayKindOf(date, bigWeek);
  const zones = zonesOf(city).filter(z => z.type !== 'meal' && z.lng != null && z.lat != null);
  if (!zones.length) return '<div class="empty">该城市暂无商圈数据</div>';

  const items = zones
    .map(z => ({ z, score: heatScore(z, dayKind, hour, weather) }))
    .sort((a, b) => b.score - a.score);

  // 气泡降采样：点位密集化后(上海1000+点)只渲染热力 TOP 60，避免 SVG 卡顿与视觉重叠
  const bubbleSrc = items.slice(0, 60);

  const lngs = zones.map(z => z.lng), lats = zones.map(z => z.lat);
  const bounds = {
    minLng: Math.min(...lngs) - 0.03, maxLng: Math.max(...lngs) + 0.03,
    minLat: Math.min(...lats) - 0.03, maxLat: Math.max(...lats) + 0.03,
  };

  const bubbles = bubbleSrc.map(it => {
    const { z, score } = it;
    const { x, y } = project(z.lng, z.lat, bounds, width, height);
    const r = 7 + score * 2.6;
    const c = heatColor(score);
    const label = z.name.length > 7 ? z.name.slice(0, 7) + '…' : z.name;
    return { x, y, r, c, score, name: z.name, label };
  });

  const hourLabel = `${Math.floor(hour)}:${String(Math.round((hour - Math.floor(hour)) * 60)).padStart(2, '0')}`;

  const nodes = bubbles.map(b => `
    <g>
      <circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${b.c}" fill-opacity="0.55" stroke="${b.c}" stroke-width="1.5"/>
      <circle cx="${b.x}" cy="${b.y}" r="3" fill="${b.c}"/>
      <text x="${b.x}" y="${b.y - b.r - 4}" font-size="10" fill="#333" text-anchor="middle" font-weight="600">${b.label}</text>
      <text x="${b.x}" y="${b.y + 3}" font-size="11" fill="#fff" text-anchor="middle" font-weight="700">${b.score.toFixed(1)}</text>
    </g>`).join('');

  // 右侧热力指数排行（前 8）
  const rank = items.slice(0, 8).map((it, i) => `
    <div class="rank-item">
      <span class="rank-no">${i + 1}</span>
      <span class="rank-dot" style="background:${heatColor(it.score)}"></span>
      <span class="rank-name">${it.z.name}</span>
      <span class="rank-score" style="color:${heatColor(it.score)}">${it.score.toFixed(1)}</span>
    </div>`).join('');

  const svg = `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#f7f9fc;border-radius:12px;">
    <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#f7f9fc"/>
    <text x="${width / 2}" y="24" font-size="15" font-weight="700" fill="#333" text-anchor="middle">商圈热力指数（${hourLabel} 时段）</text>
    <text x="${width / 2}" y="42" font-size="11" fill="#888" text-anchor="middle">气泡越大越热 · 数字为热力指数(0-10)</text>
    ${nodes}
  </svg>`;

  return `<div class="heatmap-wrap">
    ${svg}
    <div class="card rank-box"><h3 class="sec-title">当前时段热力排行</h3>${rank}</div>
  </div>`;
}
