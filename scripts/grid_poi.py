#!/usr/bin/env python3
"""
多城市商圈网格矩阵采集脚本 v3 —— 把每个城市主城区划分成密集网格，分三类单独搜索：
  1) 商场(060100) → shop  每格 TOP1，权重 1.25（商圈是跑单核心）
  2) 写字楼(120201) → biz  每格 TOP1，权重 1.15
  3) 住宅小区(120302) → home 隔格 TOP1，权重 1.05（住宅只需少量覆盖早高峰出发潮）
避免混合搜索被住宅小区碾压导致的类型失衡。

用法：
    python scripts/grid_poi.py                 # 全量采集所有城市（约 20 分钟）
    python scripts/grid_poi.py --city 北京     # 只采集单个城市
    python scripts/grid_poi.py --dry           # 打印各城市网格参数

设计：
    - 每城网格范围 = 主城区 + 主要新城（约 3km 间距）。
    - 按高德返回的 cityname 过滤跨城市误采。
    - 特殊点位（机场/火车站/酒吧/大学/美食街/景区）从现有 poi-db.js 保留。
"""

import json, time, sys, os, re, urllib.request, urllib.parse
from _env import load_env

KEY = load_env('AMAP_WS_KEY')
POI_DB = 'app/js/engine/poi-db.js'

# 城市 key -> (中文名, 前缀, 网格范围 lng0,lng1,lat0,lat1)
# 网格间距统一 ~3km（step_lng=0.032≈3km@30°N，step_lat=0.027≈3km）
CITY_GRIDS = {
    'shanghai':  ('上海', 'sh', 121.00, 121.88, 30.80, 31.52),
    'beijing':   ('北京', 'bj', 116.15, 116.75, 39.72, 40.15),
    'hangzhou':  ('杭州', 'hz', 120.00, 120.40, 30.10, 30.45),
    'suzhou':    ('苏州', 'su', 120.45, 120.85, 31.15, 31.45),
    'shenzhen':  ('深圳', 'sx', 113.75, 114.35, 22.40, 22.75),
    'changsha':  ('长沙', 'cs', 112.75, 113.15, 28.05, 28.35),
    'guangzhou': ('广州', 'gz', 113.10, 113.55, 22.95, 23.35),
    'chengdu':   ('成都', 'cd', 103.85, 104.30, 30.45, 30.80),
    'wuhan':     ('武汉', 'wh', 114.05, 114.55, 30.35, 30.70),
    'nanjing':   ('南京', 'nj', 118.55, 118.95, 31.85, 32.20),
    'xian':      ('西安', 'xa', 108.75, 109.15, 34.10, 34.45),
    'chongqing': ('重庆', 'cq', 106.30, 106.70, 29.35, 29.70),
}

STEP_LNG = 0.032   # ~3km
STEP_LAT = 0.027   # ~3km
RADIUS = 1600      # around 搜索半径(m)

# 网格间距覆盖（超大城市用更密间距）
STEP_OVERRIDE = { 'shanghai': (0.026, 0.024) }  # 上海 2.5km 密集

# 类型 -> (typecode, zone类型, tags, note, 权重, 是否隔格采样)
CLASSES = [
    ('060100', 'shop', ['商圈'], '网格商圈。', 1.25, False),
    ('120201', 'biz', ['写字楼', '加班'], '网格写字楼。', 1.15, False),
    ('120302', 'home', ['居住'], '网格居住区。', 1.05, True),
]


def around(lng, lat, radius, types, offset=3):
    url = (f'https://restapi.amap.com/v3/place/around?key={KEY}'
           f'&location={lng},{lat}&radius={radius}&offset={offset}&page=1'
           f'&extensions=base&sortrule=weight&types={types}')
    for _ in range(3):
        try:
            r = urllib.request.urlopen(url, timeout=15)
            d = json.loads(r.read().decode())
            if d.get('status') == '1':
                return d.get('pois', [])
            if d.get('infocode') == '10009':
                time.sleep(3)
                continue
            return []
        except Exception:
            time.sleep(1)
    return []


def clean(name):
    name = name.split('(')[0].split('（')[0].split('/')[0].strip()
    return name or name


def grid_centers(lng0, lng1, lat0, lat1, step_lng=STEP_LNG, step_lat=STEP_LAT):
    pts, lng = [], lng0
    while lng <= lng1 + 1e-9:
        lat = lat0
        while lat <= lat1 + 1e-9:
            pts.append((round(lng, 6), round(lat, 6)))
            lat += step_lat
        lng += step_lng
    return pts


def collect_city(city_key, city_name):
    lng0, lng1, lat0, lat1 = CITY_GRIDS[city_key][2:]
    step_lng, step_lat = STEP_OVERRIDE.get(city_key, (STEP_LNG, STEP_LAT))
    centers = grid_centers(lng0, lng1, lat0, lat1, step_lng, step_lat)
    out, seen = [], set()

    def add_point(p, ztype, tags, note, w):
        if not p.get('location'):
            return
        if city_name not in (p.get('cityname') or ''):
            return  # 跨城市误采过滤
        plng, plat = p['location'].split(',')
        name = clean(p['name'])
        if not name:
            return
        key = f"{round(float(plng),3)},{round(float(plat),3)}"
        if key in seen:
            return
        dup = any(abs(o['lng']-float(plng)) < 0.003 and abs(o['lat']-float(plat)) < 0.003 for o in out)
        if dup:
            return
        seen.add(key)
        out.append({'name': name, 'lng': round(float(plng), 6), 'lat': round(float(plat), 6),
                    'type': ztype, 'tags': tags, 'note': note, 'w': w})

    for i, (lng, lat) in enumerate(centers):
        for typecode, ztype, tags, note, w, every_other in CLASSES:
            if every_other and i % 2 == 1:
                continue
            pois = around(lng, lat, RADIUS, typecode, offset=2)
            if pois:
                add_point(pois[0], ztype, tags, note, w)
            time.sleep(0.16)
        if (i + 1) % 100 == 0:
            print(f"    {city_name} {i+1}/{len(centers)} 格，{len(out)} 点")
    return out


def extract_special(city_key):
    src = open(POI_DB, encoding='utf-8').read()
    m = re.search(rf"{city_key}:\s*\{{.*?zones:\s*\[(.*?)\],\s*xcity", src, re.S)
    if not m:
        return []
    special = []
    for line in m.group(1).split('\n'):
        mm = re.match(r"\s*Z\('([^']+)', '([^']+)', ([\d.]+), ([\d.]+), '(\w+)', \[(.*?)\], '(.*?)'(?:, ([\d.]+))?\)", line)
        if not mm:
            continue
        zid, name, lng, lat, ztype, tags, note = mm.group(1), mm.group(2), float(mm.group(3)), float(mm.group(4)), mm.group(5), mm.group(6), mm.group(7)
        tags = [t.strip().strip("'") for t in tags.split(',') if t.strip()]
        if ztype in ('hub', 'night', 'edu', 'meal') or '旅游' in tags or '机场' in tags or '高铁' in tags:
            special.append({'name': name, 'lng': lng, 'lat': lat, 'type': ztype, 'tags': tags, 'note': note, 'w': 1.0})
    return special


def render_zones(grid, special, prefix):
    lines, idx, used = [], 0, set()

    def push(name, lng, lat, ztype, tags, note, w):
        nonlocal idx
        if name in used:
            return
        used.add(name)
        idx += 1
        tags_s = ', '.join(f"'{t}'" for t in tags)
        return f"      Z('{prefix}_g{idx:03d}', '{name}', {lng:.6f}, {lat:.6f}, '{ztype}', [{tags_s}], '{note}', {w:.2f}),"

    for s in special:
        l = push(s['name'], s['lng'], s['lat'], s['type'], s['tags'], s['note'], s['w'])
        if l:
            lines.append(l)
    for g in grid:
        l = push(g['name'], g['lng'], g['lat'], g['type'], g['tags'], g['note'], g['w'])
        if l:
            lines.append(l)
    return '\n'.join(lines)


def main():
    only = None
    if '--city' in sys.argv:
        only = sys.argv[sys.argv.index('--city') + 1]
    skip = None
    if '--skip' in sys.argv:
        skip = sys.argv[sys.argv.index('--skip') + 1]
    if '--dry' in sys.argv:
        for key, (name, prefix, lng0, lng1, lat0, lat1) in CITY_GRIDS.items():
            if only and name != only:
                continue
            sl, st = STEP_OVERRIDE.get(key, (STEP_LNG, STEP_LAT))
            n = len(grid_centers(lng0, lng1, lat0, lat1, sl, st))
            print(f"{name}: {n} 格，约 {n*2.5*0.16/60:.1f} 分钟")
        return

    # 一次性读取源文件（供特殊点位提取）
    src = open(POI_DB, encoding='utf-8').read()

    for key, (name, prefix, lng0, lng1, lat0, lat1) in CITY_GRIDS.items():
        if only and name != only:
            continue
        if skip and name == skip:
            print(f"── 跳过 {name} ──")
            continue
        print(f"── 采集 {name} ──")
        grid = collect_city(key, name)
        special = extract_special(key)
        by = {}
        for o in grid:
            by[o['type']] = by.get(o['type'], 0) + 1
        print(f"  {name} 采集 {len(grid)} 点 {by} + 特殊 {len(special)}")

        zones_js = render_zones(grid, special, prefix)
        # 替换该城市 zones 块
        pat = rf"({key}:\s*\{{.*?zones:\s*\[)(.*?)(\],\s*xcity)"
        new_src, n = re.subn(pat, lambda m: m.group(1) + '\n' + zones_js + '\n    ' + m.group(3), src, count=1, flags=re.S)
        if n == 1:
            src = new_src
        else:
            print(f"  ⚠️ 未找到 {key} 的 zones 块，跳过")
        time.sleep(0.5)

    # Z 函数加 w 参数
    src = src.replace(
        "const Z = (id, name, lng, lat, type, tags, note) => ({ id, name, lng, lat, type, tags, note });",
        "const Z = (id, name, lng, lat, type, tags, note, w = 1) => ({ id, name, lng, lat, type, tags, note, w });")
    open(POI_DB, 'w', encoding='utf-8').write(src)
    print(f"\n✅ 已写回 {POI_DB}")


if __name__ == '__main__':
    main()
