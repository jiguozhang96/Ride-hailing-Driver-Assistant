// 规划合理性测试：验证网格密集化后的首站就近、空驶率、跨江行为
import { buildDailyPlan } from '../app/js/engine/planner.js';
import { zonesOf, distKm, cityInfo } from '../app/js/engine/poi-db.js';

const CASES = [
  { name: '上海·静安(市中心)', city: 'shanghai', lng: 121.445, lat: 31.227, date: new Date(2026, 7, 13) }, // 周四工作日
  { name: '上海·金桥(浦东跨江)', city: 'shanghai', lng: 121.61, lat: 31.26, date: new Date(2026, 7, 13) },
  { name: '上海·松江(西南远郊)', city: 'shanghai', lng: 121.22, lat: 31.05, date: new Date(2026, 7, 13) },
  { name: '上海·宝山(北郊)', city: 'shanghai', lng: 121.42, lat: 31.34, date: new Date(2026, 7, 13) },
  { name: '上海·嘉定(西北郊)', city: 'shanghai', lng: 121.26, lat: 31.38, date: new Date(2026, 7, 14) }, // 周五
];

function side(lng) { return lng > 121.50 ? '浦东' : '浦西'; }

for (const c of CASES) {
  const n = zonesOf(c.city).length;
  const home = { lng: c.lng, lat: c.lat };
  const t0 = Date.now();
  const p = buildDailyPlan({ city: c.city, vehicleType: 'ev', plateType: 'hu_green', rangeKm: 400, startHour: 7, endHour: 22, homeLng: c.lng, homeLat: c.lat }, c.date, 'clear');
  const ms = Date.now() - t0;

  const first = p.segments.find(s => s.kind === 'work');
  const dFirst = distKm(home, first.zone);
  const emptyRate = Math.round(p.emptyKm / p.totalKm * 100);

  // 跨江次数（上海）
  let cross = 0, prevSide = side(c.lng);
  for (const s of p.segments) {
    if (s.kind === 'work') {
      const sd = side(s.zone.lng);
      if (sd !== prevSide) { cross++; prevSide = sd; }
    }
  }

  const works = p.segments.filter(s => s.kind === 'work');
  const uniq = new Set(works.map(s => s.zone.id)).size;

  console.log(`\n【${c.name}】点位${n}个 耗时${ms}ms`);
  console.log(`  首站: ${first.zone.name}(${first.zone.type}) 离家${dFirst.toFixed(1)}km 热力${first.score}`);
  console.log(`  总${p.totalKm}km 空驶${p.emptyKm}km(空驶率${emptyRate}%) 跨江${cross}次 去重点位${uniq}个`);
  const timeline = works.map(s => `${s.time.slice(0,5)}:${s.zone.name.slice(0,8)}`).join(' → ');
  console.log(`  时间线: ${timeline}`);
}
