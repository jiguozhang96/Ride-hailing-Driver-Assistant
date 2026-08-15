/**
 * 周度规划：为未来 7 天生成每天的「主题策略 + 关键时段 + 黄金点位」。
 * 体现商圈大厂单双休、周五夜生活、周六商圈、周日返程/返校等规律。
 */
import { buildDailyPlan, dayKindLabel, fmt, dateLabel } from './planner.js';
import { dayKindOf } from './heat-model.js';

export function buildWeeklyPlan(profile, weather = 'clear') {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayKind = dayKindOf(d, profile.bigWeek);
    const plan = buildDailyPlan(profile, d, weather);
    days.push({
      date: d,
      dateLabel: dateLabel(d),
      dayKind,
      dayKindLabel: dayKindLabel(dayKind),
      theme: themeOf(dayKind, profile),
      golden: plan.segments.filter(s => s.kind === 'work').sort((a, b) => b.score - a.score).slice(0, 3),
      totalKm: plan.totalKm,
    });
  }
  return days;
}

function themeOf(dayKind, profile) {
  const t = {
    workday: '工作日通勤：早高峰抓居住区→办公区，晚高峰+加班抓办公区回程，21点后蹲加班园区。',
    friday: '周五：晚高峰最强+夜生活爆发，18点后主攻商圈/夜生活，可接跨城返乡单。',
    saturday: profile.bigWeek ? '大周周六：互联网公司上班，午晚餐时段+21点加班单有效。' : '周六：商圈全天高热，白天商场+晚间夜生活，通勤单弱化。',
    saturday_big: '大周周六：互联网公司上班，午晚餐时段+21点加班单有效。',
    sunday: '周日：返程/返校潮，午后主攻高铁站/机场+大学城，傍晚商圈，21点前可收车。',
    holiday: '节假日：旅游点位+枢纽全天高热，写字楼单冷。',
  };
  return t[dayKind] || '';
}
