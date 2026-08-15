/**
 * 多城市限行规则（2026 现行，置信度=中，需以当地交警最新公告为准）
 * 车牌类型 key 沿用通用语义：本地蓝牌 / 本地绿牌 / 本地受限牌(沪C) / 外地绿牌 / 外地牌
 * 规则要点（简化，仅覆盖主要限行）：
 *  - 上海：外牌工作日 7-20 高架 + 7-9/17-19 内环地面；沪C 全天禁外环内；外地绿牌不豁免
 *  - 北京：外牌（含外地绿牌）工作日 7-9/17-20 五环内限行（需进京证）
 *  - 深圳：外牌工作日 7-9/17:30-19:30 全市限行
 *  - 杭州：外牌工作日 7-9/16:30-18:30 绕城高速内限行
 *  - 苏州：外牌古城区工作日 7-19 限行
 *  - 长沙：基本不限行
 */

export const PLATE_TYPES = {
  hu_blue: '本地蓝牌',
  hu_green: '本地绿牌(新能源)',
  hu_c: '本地受限牌(如沪C)',
  non_hu_green: '外地绿牌',
  non_hu: '外地牌',
};

/** 各地限行时段（小时） */
const RULES = {
  shanghai: {
    nonlocal: { morning: [7, 9], evening: [17, 19], elevated: [7, 20], greenExempt: false },
  },
  beijing: {
    nonlocal: { morning: [7, 9], evening: [17, 20], greenExempt: false },
  },
  shenzhen: {
    nonlocal: { morning: [7, 9], evening: [17.5, 19.5], greenExempt: false },
  },
  hangzhou: {
    nonlocal: { morning: [7, 9], evening: [16.5, 18.5], greenExempt: false },
  },
  suzhou: {
    nonlocal: { morning: [7, 19], evening: null, greenExempt: false },
  },
  changsha: {
    nonlocal: null, // 基本不限
  },
  guangzhou: {
    nonlocal: { morning: [7, 9], evening: [17, 19], greenExempt: false }, // 外地牌开四停四，简化高峰限行
  },
  chengdu: {
    nonlocal: { morning: [7.5, 9.5], evening: [17, 19.5], greenExempt: false }, // 绕城高速内高峰限行
  },
  wuhan: {
    nonlocal: null, // 基本不限（长江大桥按尾号限行，从简）
  },
  nanjing: {
    nonlocal: { morning: [7, 9], evening: [17, 19], greenExempt: false },
  },
  xian: {
    nonlocal: { morning: [7.5, 9.5], evening: [17.5, 19.5], greenExempt: false }, // 三环内高峰限行
  },
  chongqing: {
    nonlocal: null, // 基本不限（部分桥梁限行，从简）
  },
};

const CITY_NAMES = {
  shanghai: '上海', beijing: '北京', shenzhen: '深圳', hangzhou: '杭州', suzhou: '苏州', changsha: '长沙',
  guangzhou: '广州', chengdu: '成都', wuhan: '武汉', nanjing: '南京', xian: '西安', chongqing: '重庆',
};

function inRange(hour, range) {
  if (!range) return false;
  return hour >= range[0] && hour < range[1];
}

/**
 * 判断某车牌组合在指定时间是否受限行影响
 * @param {string} plateType PLATE_TYPES key
 * @param {Date} date
 * @param {number} hour 小时（可含小数）
 * @param {string} city 城市 key
 */
export function checkRestriction(plateType, date, hour, city = 'shanghai') {
  const d = date.getDay();
  const isWorkday = d >= 1 && d <= 5;
  const rule = RULES[city] || RULES.shanghai;
  const cityName = CITY_NAMES[city] || '当地';
  const res = { restricted: false, reason: '', advice: '' };

  // 本地绿牌：多数城市新能源豁免；上海/北京外地绿牌已在外地牌分支处理
  if (plateType === 'hu_green') {
    res.advice = '本地新能源号牌一般不受限行影响。';
    return res;
  }
  if (plateType === 'hu_blue') {
    res.advice = city === 'beijing' ? '本地蓝牌工作日有尾号限行（按车牌尾号轮换），建议确认当日是否限号。' : '本地号牌一般不受外牌限行影响。';
    return res;
  }

  // 本地受限牌（沪C 等）
  if (plateType === 'hu_c') {
    if (city === 'shanghai') {
      res.restricted = true;
      res.reason = '沪C 牌照全天禁止驶入外环(S20)以内。';
      res.advice = '建议在外环外区域运营，避开中心城区点位。';
    } else {
      res.advice = '本地受限牌照，请留意当地限行区域。';
    }
    return res;
  }

  // 外地牌 / 外地绿牌
  const isNonlocal = plateType === 'non_hu' || plateType === 'non_hu_green';
  if (!isNonlocal) return res;
  if (!rule.nonlocal) {
    res.advice = `${cityName}基本不限行，可正常运营。`;
    return res;
  }
  if (!isWorkday) {
    res.advice = '周末及节假日不限行，可正常接单。';
    return res;
  }

  const { morning, evening, elevated } = rule.nonlocal;
  if (inRange(hour, elevated)) {
    // 上海高架限行（全天覆盖早晚）
    res.restricted = true;
    res.reason = `${cityName}工作日 ${fmtHour(hour)} 处于高架/快速路限行时段(7:00-20:00)。`;
    res.advice = '避开依赖高架的点位（机场/远郊方向），优先地面可达点位。';
    return res;
  }
  if (inRange(hour, morning)) {
    res.restricted = true;
    res.reason = `${cityName}工作日 ${fmtHour(hour)} 处于早高峰限行时段。`;
    res.advice = '早高峰避开限行区域（主城区），优先外环/郊区点位。';
    return res;
  }
  if (inRange(hour, evening)) {
    res.restricted = true;
    res.reason = `${cityName}工作日 ${fmtHour(hour)} 处于晚高峰限行时段。`;
    res.advice = '晚高峰避开限行区域，优先外环/郊区点位。';
    return res;
  }
  res.advice = '当前时段外地牌可通行，注意高峰时段限行。';
  return res;
}

function fmtHour(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 判断某点位是否适合某车牌（沪C 排除中心城区） */
export function zoneAllowed(zone, plateType) {
  if (plateType === 'hu_c') {
    return !isWithinOuterRing(zone);
  }
  return true;
}

/** 粗略判断是否在上海外环(S20)以内（用于沪C提示） */
function isWithinOuterRing(z) {
  const lng = z.lng, lat = z.lat;
  if (lng > 121.75 || lng < 121.35 || lat > 31.40 || lat < 31.05) return false;
  return true;
}

/** 给规划生成限行提示标签 */
export function restrictionTag(plateType, date, hour, city) {
  const r = checkRestriction(plateType, date, hour, city);
  return r.restricted ? '⚠️限行' : '';
}
