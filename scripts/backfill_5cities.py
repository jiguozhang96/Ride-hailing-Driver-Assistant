#!/usr/bin/env python3
"""
补采 5 城（成都/武汉/南京/西安/重庆）网格商圈数据 —— 高德日配额恢复后运行一次。

用法：
    python scripts/backfill_5cities.py

保护机制：某城网格点低于 MIN_POINTS 视为采集失败（配额不足等），跳过该城保留原数据，绝不覆盖成空。
"""
import re
from grid_poi import CITY_GRIDS, collect_city, extract_special, render_zones, POI_DB

BACKFILL = ['chengdu', 'wuhan', 'nanjing', 'xian', 'chongqing']
MIN_POINTS = 50  # 网格点低于此数视为采集失败，保留原数据

def main():
    src = open(POI_DB, encoding='utf-8').read()
    done, skipped = [], []
    for key in BACKFILL:
        name, prefix = CITY_GRIDS[key][0], CITY_GRIDS[key][1]
        print(f"── 补采 {name} ──", flush=True)
        grid = collect_city(key, name)
        if len(grid) < MIN_POINTS:
            print(f"  ⚠️ {name} 网格点仅 {len(grid)} < {MIN_POINTS}，跳过（可能配额不足），保留原数据", flush=True)
            skipped.append(name)
            continue
        special = extract_special(key)
        zones_js = render_zones(grid, special, prefix)
        pat = rf"({key}:\s*\{{.*?zones:\s*\[)(.*?)(\],\s*xcity)"
        src, n = re.subn(pat, lambda m: m.group(1) + '\n' + zones_js + '\n    ' + m.group(3), src, count=1, flags=re.S)
        print(f"  {name}: 网格 {len(grid)} 点 + 特殊 {len(special)} {'✓' if n == 1 else '✗'}", flush=True)
        done.append(name)

    open(POI_DB, 'w', encoding='utf-8').write(src)
    print(f"\n✅ 补采完成 {len(done)} 城 {done}，跳过 {len(skipped)} 城 {skipped}")


if __name__ == '__main__':
    main()
