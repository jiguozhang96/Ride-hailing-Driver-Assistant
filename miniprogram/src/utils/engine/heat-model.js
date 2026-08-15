/**
 * 热力模型：按「点位类型 × 星期类型 × 小时」计算 0-10 的需求热力分。
 * 规则依据：上海通勤规律、枢纽班次常识、互联网大厂加班与大小周文化（公开报道整理）。
 * 置信度说明：方向性规律=高置信；具体分值=工程调参值，可在设置页微调。
 */

export const DAY_KIND = {
  WORKDAY: 'workday',        // 周一~周四
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SATURDAY_BIG: 'saturday_big', // 大周周六（互联网公司上班日）
  SUNDAY: 'sunday',
  HOLIDAY: 'holiday',        // 法定节假日（旅游/枢纽点位强化）
};

// 2026 年法定节假日（国务院办公厅通知，来源：中国政府网/新华社，置信度=高；需每年更新）
const HOLIDAY_RANGES_2026 = [
  ['2026-01-01', '2026-01-03'], // 元旦
  ['2026-02-15', '2026-02-23'], // 春节
  ['2026-04-04', '2026-04-06'], // 清明
  ['2026-05-01', '2026-05-05'], // 劳动节
  ['2026-06-19', '2026-06-21'], // 端午
  ['2026-09-25', '2026-09-27'], // 中秋
  ['2026-10-01', '2026-10-07'], // 国庆
];

function isHoliday(date) {
  const y = date.getFullYear();
  const s = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return HOLIDAY_RANGES_2026.some(([a, b]) => s >= a && s <= b);
}

export function dayKindOf(date, bigWeek = false) {
  if (isHoliday(date)) return DAY_KIND.HOLIDAY;
  const d = date.getDay(); // 0 Sun ... 6 Sat
  if (d === 6) return bigWeek ? DAY_KIND.SATURDAY_BIG : DAY_KIND.SATURDAY;
  if (d === 0) return DAY_KIND.SUNDAY;
  if (d === 5) return DAY_KIND.FRIDAY;
  return DAY_KIND.WORKDAY;
}

/**
 * 各点位类型的小时热力模板 [24]（工作日基准）。
 * biz: 办公区 —— 晚出高峰强于早进（司机视角：在办公区"接人"的时段是晚高峰+加班）
 * hub: 枢纽 —— 到达波次驱动
 * night: 夜生活 —— 22:00-02:00
 * shop: 商圈 —— 白天+晚间
 * home: 居住区 —— 早高峰出发
 * meal: 餐饮带 —— 饭点
 */
const TPL = {
  biz_work:   [1,1,1,1,1,2,4,6,7,6,4,4,5,4,4,4,5,6,8,9,7,9,8,4],   // 18-20 晚高峰, 21-22 加班
  biz_overtime:[0,0,0,0,0,1,3,5,6,5,3,3,4,3,3,3,4,5,7,8,7,10,9,5], // 漕河泾/张江型：21 点峰更尖
  hub_air:    [3,2,2,3,5,7,8,7,6,6,6,6,6,6,6,6,7,7,8,8,9,9,8,6],   // 机场全天多波
  hub_rail:   [2,1,1,1,2,4,6,8,7,6,5,5,5,5,5,5,6,7,8,9,9,8,6,4],   // 火车站早晚到达峰
  night:      [5,3,2,1,1,1,1,1,1,1,1,2,3,3,3,3,3,4,5,6,7,8,9,9],
  shop:       [1,1,1,1,1,1,2,3,4,5,6,7,7,6,6,6,7,7,8,9,9,8,5,3],
  home:       [1,1,1,1,1,3,6,8,9,7,4,3,3,3,3,3,4,5,6,6,5,4,3,2],
  edu:        [1,1,1,1,1,2,4,6,7,6,4,4,5,4,4,4,5,6,7,8,9,8,6,3],
  meal:       [0,0,0,0,0,1,2,3,4,3,2,5,8,7,3,2,3,4,7,8,4,2,1,0],
};

/** 星期类型对各模板的小时修正（乘数表，缺省=1） */
const DAY_MOD = {
  [DAY_KIND.WORKDAY]: { biz_overtime: 1.0, night: 0.8, shop: 0.9 },
  [DAY_KIND.FRIDAY]:  { night: 1.5, shop: 1.2, biz_overtime: 0.9, hub_rail: 1.3 },
  [DAY_KIND.SATURDAY]:{ biz_work: 0.25, biz_overtime: 0.2, shop: 1.35, night: 1.3, home: 0.7, hub_rail: 1.2 },
  [DAY_KIND.SATURDAY_BIG]: { biz_work: 0.85, biz_overtime: 0.95, shop: 1.1, night: 1.1 },
  [DAY_KIND.SUNDAY]:  { biz_work: 0.2, biz_overtime: 0.15, shop: 1.25, night: 0.9, hub_rail: 1.35, hub_air: 1.2, edu: 1.3 },
  [DAY_KIND.HOLIDAY]: { biz_work: 0.1, biz_overtime: 0.1, shop: 1.4, night: 1.2, hub_rail: 1.5, hub_air: 1.4 },
};

/** 天气修正（来自天气 API 或手动选择）：雨/雪天打车需求显著上升。
 *  系数参考：雨天打车需求弹性约 +22%（滴滴/学术实证，置信度=中）；暴雨/雪弹性更高。 */
export const WEATHER_MOD = {
  clear: 1.0, cloudy: 1.0, rain: 1.22, heavy_rain: 1.5, snow: 1.4, extreme: 0.6,
};

function templateOf(zone) {
  switch (zone.type) {
    case 'biz':  return /互联网|大厂|科技/.test(zone.tags.join(',')) ? 'biz_overtime' : 'biz_work';
    case 'hub':  return /机场/.test(zone.tags.join(',')) ? 'hub_air' : 'hub_rail';
    case 'night': return 'night';
    case 'shop': return 'shop';
    case 'home': return 'home';
    case 'edu':  return 'edu';
    case 'meal': return 'meal';
    default: return 'shop';
  }
}

/**
 * 计算某点位在某天某小时的热力分（0-10，保留1位小数）
 * @param zone 点位
 * @param dayKind DAY_KIND
 * @param hour 0-23
 * @param weather WEATHER_MOD key
 */
export function heatScore(zone, dayKind, hour, weather = 'clear') {
  const tplName = templateOf(zone);
  // 浮点小时线性插值：8.5 小时 = 8点与9点热力的加权平均（支持 1.5h/0.5h 时间窗）
  const h0 = Math.floor(hour) % 24;
  const h1 = Math.ceil(hour) % 24;
  const frac = hour - Math.floor(hour);
  const b0 = TPL[tplName][h0] ?? 1;
  const b1 = TPL[tplName][h1] ?? b0;
  const base = b0 + (b1 - b0) * frac;
  const mod = DAY_MOD[dayKind]?.[tplName] ?? 1;
  // zone.w = 点位规模/热度权重（网格采集时按搜索排名赋值），区分大商圈与小商圈
  let score = base * mod * (WEATHER_MOD[weather] ?? 1) * (zone.w ?? 1);
  // 跨城点位在周日晚/周五晚的枢纽强化
  if (zone.type === 'hub' && (dayKind === DAY_KIND.SUNDAY || dayKind === DAY_KIND.FRIDAY) && hour >= 17 && hour <= 22) {
    score *= 1.15;
  }
  return Math.min(10, Math.round(score * 10) / 10);
}

/** 热力星级展示 */
export function heatStars(score) {
  if (score >= 8) return '★★★★★';
  if (score >= 6.5) return '★★★★☆';
  if (score >= 5) return '★★★☆☆';
  if (score >= 3.5) return '★★☆☆☆';
  return '★☆☆☆☆';
}

/** 热力等级文字 */
export function heatLabel(score) {
  if (score >= 8) return '爆单区';
  if (score >= 6.5) return '高需求';
  if (score >= 5) return '稳定';
  if (score >= 3.5) return '一般';
  return '偏冷';
}

/** 一句话天气建议 */
export function weatherAdvice(weather) {
  return {
    clear: '天气晴好，需求正常，按规划执行即可。',
    cloudy: '阴天对需求影响不大。',
    rain: '雨天打车需求预计上升约25%，可适当延长在线时长。',
    heavy_rain: '强降雨需求激增，注意积水路段，优先商圈室内上车点。',
    snow: '雨雪天需求高但路况差，降低时速预期，预留单程时间。',
    extreme: '极端天气，建议减少出车或提前收车，安全第一。',
  }[weather] || '';
}
