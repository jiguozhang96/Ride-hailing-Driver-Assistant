/**
 * SVG 路径示意图（离线可用，无需地图 key）。
 * 将点位坐标(GCJ-02)投影到 SVG 画布，连线生成跑单路线示意，
 * 用颜色表示热力等级，标注时间与点位名称。
 */

export function project(lng, lat, bounds, w, h, pad = 20) {
  const spanLng = (bounds.maxLng - bounds.minLng) || 0.01;
  const spanLat = (bounds.maxLat - bounds.minLat) || 0.01;
  const x = pad + (lng - bounds.minLng) / spanLng * (w - pad * 2);
  const y = pad + (bounds.maxLat - lat) / spanLat * (h - pad * 2);
  return { x, y };
}

const HEAT_COLOR = score => {
  if (score >= 8) return '#e23c3c';
  if (score >= 6.5) return '#f0781e';
  if (score >= 5) return '#f0b400';
  if (score >= 3.5) return '#4aa8e0';
  return '#9aa4b2';
};

/** 生成 SVG 字符串。segments 为 planner 输出，仅取 work/meal/charge/end 有坐标的段 */
export function renderSchematic(segments, { width = 680, height = 400, title = '跑单路线示意图' } = {}) {
  const pts = [];
  segments.forEach((s, i) => {
    const z = s.zone;
    if (z && z.lng != null && z.lat != null) {
      pts.push({ ...z, time: s.time, label: s.label, score: s.score, seq: i + 1, kind: s.kind });
    }
  });
  if (pts.length === 0) return '';

  // 动态计算边界（适配多城市）
  const lngs = pts.map(p => p.lng), lats = pts.map(p => p.lat);
  const bounds = {
    minLng: Math.min(...lngs) - 0.02, maxLng: Math.max(...lngs) + 0.02,
    minLat: Math.min(...lats) - 0.02, maxLat: Math.max(...lats) + 0.02,
  };

  const p = pts.map(pt => ({ ...pt, ...project(pt.lng, pt.lat, bounds, width, height) }));

  // 路径折线
  const poly = p.map(pp => `${pp.x},${pp.y}`).join(' ');
  const pathD = p.map((pp, i) => (i === 0 ? `M ${pp.x} ${pp.y}` : `L ${pp.x} ${pp.y}`)).join(' ');

  const nodes = p.map(pp => {
    const color = pp.kind === 'work' ? HEAT_COLOR(pp.score) : (pp.kind === 'charge' || pp.kind === 'gas' ? '#22b573' : pp.kind === 'meal' ? '#f0781e' : '#666');
    const icon = pp.kind === 'charge' ? '⚡' : pp.kind === 'gas' ? '⛽' : pp.kind === 'meal' ? '🍚' : pp.kind === 'end' ? '🏠' : '';
    return `
      <g>
        <circle cx="${pp.x}" cy="${pp.y}" r="${pp.kind === 'work' ? 7 : 5}" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        ${icon ? `<text x="${pp.x}" y="${pp.y - 12}" font-size="13" text-anchor="middle">${icon}</text>` : ''}
        <text x="${pp.x}" y="${pp.y - 16}" font-size="10" fill="#555" text-anchor="middle" font-weight="600">${pp.seq}·${pp.name}</text>
        <text x="${pp.x}" y="${pp.y + 18}" font-size="9" fill="#888" text-anchor="middle">${pp.time}</text>
      </g>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}" style="width:100%;height:auto;background:#f7f9fc;border-radius:12px;">
    <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#f7f9fc"/>
    <text x="${width / 2}" y="22" font-size="14" font-weight="700" fill="#333" text-anchor="middle">${title}</text>
    <path d="${pathD}" fill="none" stroke="#3388ff" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.7"/>
    ${nodes}
  </svg>`;
}

/** 生成热力图例 */
export function legend() {
  const items = [
    ['≥8', '#e23c3c', '爆单区'], ['6.5-8', '#f0781e', '高需求'], ['5-6.5', '#f0b400', '稳定'],
    ['3.5-5', '#4aa8e0', '一般'], ['<3.5', '#9aa4b2', '偏冷'],
  ];
  return items.map(([r, c, l]) =>
    `<span style="display:inline-flex;align-items:center;margin-right:10px;font-size:12px;color:#555;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:4px;"></span>${l}(${r})
    </span>`).join('');
}
