// 跨场景测试：其他城市、周末、限行、夜班
import { buildDailyPlan } from '../app/js/engine/planner.js';
import { zonesOf, distKm } from '../app/js/engine/poi-db.js';

const CASES = [
  { name: '北京·望京(工作日)', city: 'beijing', lng: 116.47, lat: 39.996, plate: 'hu_green', start: 7, end: 22, date: new Date(2026, 7, 13) },
  { name: '上海·静安(周六)', city: 'shanghai', lng: 121.445, lat: 31.227, plate: 'hu_green', start: 7, end: 22, date: new Date(2026, 7, 15) },
  { name: '上海·静安(外牌工作日)', city: 'shanghai', lng: 121.445, lat: 31.227, plate: 'non_hu', start: 7, end: 22, date: new Date(2026, 7, 13) },
  { name: '广州·天河(工作日)', city: 'guangzhou', lng: 113.32, lat: 23.13, plate: 'hu_green', start: 7, end: 22, date: new Date(2026, 7, 13) },
  { name: '上海·静安(夜班18-24)', city: 'shanghai', lng: 121.445, lat: 31.227, plate: 'hu_green', start: 18, end: 24, date: new Date(2026, 7, 14) },
];

for (const c of CASES) {
  const n = zonesOf(c.city).length;
  const home = { lng: c.lng, lat: c.lat };
  const t0 = Date.now();
  const p = buildDailyPlan({ city: c.city, vehicleType: 'ev', plateType: c.plate, rangeKm: 400, startHour: c.start, endHour: c.end, homeLng: c.lng, homeLat: c.lat, crossCity: false, bigWeek: false }, c.date, 'clear');
  const ms = Date.now() - t0;
  const first = p.segments.find(s => s.kind === 'work');
  const dFirst = distKm(home, first.zone);
  const emptyRate = Math.round(p.emptyKm / p.totalKm * 100);
  const works = p.segments.filter(s => s.kind === 'work');
  const uniq = new Set(works.map(s => s.zone.id)).size;
  const typeDist = {};
  works.forEach(s => typeDist[s.zone.type] = (typeDist[s.zone.type] || 0) + 1);

  console.log(`\n【${c.name}】点位${n} 耗时${ms}ms 类型${c.plate}`);
  console.log(`  首站: ${first.zone.name}(${first.zone.type}) 离家${dFirst.toFixed(1)}km 热力${first.score}`);
  console.log(`  总${p.totalKm}km 空驶${p.emptyKm}km(空驶率${emptyRate}%) 去重点位${uniq}个 类型分布${JSON.stringify(typeDist)}`);
  console.log(`  摘要: ${p.summary.split('\n')[2] || ''}`);
}
