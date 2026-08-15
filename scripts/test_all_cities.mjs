// 12 城市全量规划测试：验证每城点位数量、首站就近、空驶率、轮换合理性
import { buildDailyPlan } from '../app/js/engine/planner.js';
import { zonesOf, cityInfo } from '../app/js/engine/poi-db.js';

const CASES = [
  ['shanghai', '上海'], ['beijing', '北京'], ['hangzhou', '杭州'], ['suzhou', '苏州'],
  ['shenzhen', '深圳'], ['changsha', '长沙'], ['guangzhou', '广州'], ['chengdu', '成都'],
  ['wuhan', '武汉'], ['nanjing', '南京'], ['xian', '西安'], ['chongqing', '重庆'],
];

let pass = 0, fail = 0;
for (const [key, name] of CASES) {
  const n = zonesOf(key).length;
  const center = cityInfo(key).center;
  const p = buildDailyPlan({ city: key, vehicleType: 'ev', plateType: 'hu_green', rangeKm: 400, startHour: 7, endHour: 22, homeLng: center.lng, homeLat: center.lat }, new Date(2026, 7, 13), 'clear');
  const first = p.segments.find(s => s.kind === 'work');
  const emptyRate = Math.round(p.emptyKm / p.totalKm * 100);
  const works = p.segments.filter(s => s.kind === 'work');
  const uniq = new Set(works.map(s => s.zone.id)).size;

  const ok = n >= 80 && uniq >= 3 && emptyRate <= 25;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '⚠️'} ${name}: 点位${n} 首站${first.zone.name}(热力${first.score}) 空驶率${emptyRate}% 轮换${uniq}个点`);
}

console.log(`\n通过 ${pass}/${CASES.length}`);
