#!/usr/bin/env python3
"""多城市网格数据跨城市误采清理：对每城边界点位做逆地理编码(regeo)验证，删除非目标城市的 POI。"""
import json, re, time, urllib.request
from _env import load_env

KEY = load_env('AMAP_WS_KEY')
POI_DB = 'app/js/engine/poi-db.js'

# 城市 key -> (中文名, 边界 lng0,lng1,lat0,lat1)  —— 与 grid_poi.py 的 CITY_GRIDS 一致
CITY_GRIDS = {
    'shanghai':  ('上海', 121.00, 121.88, 30.80, 31.52),
    'beijing':   ('北京', 116.15, 116.75, 39.72, 40.15),
    'hangzhou':  ('杭州', 120.00, 120.40, 30.10, 30.45),
    'suzhou':    ('苏州', 120.45, 120.85, 31.15, 31.45),
    'shenzhen':  ('深圳', 113.75, 114.35, 22.40, 22.75),
    'changsha':  ('长沙', 112.75, 113.15, 28.05, 28.35),
    'guangzhou': ('广州', 113.10, 113.55, 22.95, 23.35),
    'chengdu':   ('成都', 103.85, 104.30, 30.45, 30.80),
    'wuhan':     ('武汉', 114.05, 114.55, 30.35, 30.70),
    'nanjing':   ('南京', 118.55, 118.95, 31.85, 32.20),
    'xian':      ('西安', 108.75, 109.15, 34.10, 34.45),
    'chongqing': ('重庆', 106.30, 106.70, 29.35, 29.70),
}
PAD = 0.02  # 边界外扩


def regeo_city(lng, lat):
    url = f'https://restapi.amap.com/v3/geocode/regeo?key={KEY}&location={lng},{lat}&extensions=base'
    for _ in range(2):
        try:
            d = json.loads(urllib.request.urlopen(url, timeout=10).read().decode())
            ac = d.get('regeocode', {}).get('addressComponent', {})
            return ac.get('city', '')
        except Exception:
            time.sleep(1)
    return ''


def main():
    src = open(POI_DB, encoding='utf-8').read()
    total_removed = 0

    for city_key, (city_name, lng0, lng1, lat0, lat1) in CITY_GRIDS.items():
        m = re.search(rf"{city_key}:\s*\{{.*?zones:\s*\[(.*?)\],\s*xcity", src, re.S)
        if not m:
            continue
        body = m.group(1)
        removed, kept = [], []

        def is_boundary(lng, lat):
            return (lng < lng0 - PAD or lng > lng1 + PAD or lat < lat0 - PAD or lat > lat1 + PAD)

        for line in body.split('\n'):
            mm = re.match(r"\s*Z\('([^']+)', '([^']+)', ([\d.]+), ([\d.]+), '(\w+)', \[(.*?)\], '(.*?)'(?:, ([\d.]+))?\)", line)
            if not mm:
                kept.append(line)
                continue
            name, lng, lat = mm.group(2), float(mm.group(3)), float(mm.group(4))
            if not is_boundary(lng, lat):
                kept.append(line)
                continue
            city = regeo_city(lng, lat)
            if city and city_name not in city and city != '':
                removed.append((name, city))
                continue
            kept.append(line)
            time.sleep(0.12)

        if removed:
            new_body = '\n'.join(kept)
            src = src[:m.start(1)] + new_body + src[m.end(1):]
            total_removed += len(removed)
            print(f"{city_name}: 删除 {len(removed)} 个跨城市点")
            for name, city in removed[:8]:
                print(f"    {name} → {city}")

    if total_removed:
        open(POI_DB, 'w', encoding='utf-8').write(src)
        print(f"✅ 共删除 {total_removed} 个跨城市点")
    else:
        print("无需清理，边界干净")


if __name__ == '__main__':
    main()
