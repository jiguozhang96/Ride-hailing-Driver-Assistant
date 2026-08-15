#!/usr/bin/env python3
"""
商圈数据更新维护脚本 —— 用高德 Web服务 POI 搜索，批量生成/更新 12 城市真实商圈点位库。

用法：
    python scripts/update_poi.py            # 全量生成 app/js/engine/poi-db.js
    python scripts/update_poi.py --city 上海  # 只更新单个城市

维护说明：
    - 数据来自高德 POI（真实坐标、真实名称），按 sortrule=weight 取热度最高的 TOP N。
    - 定期（建议每月）重跑一次即可刷新商圈数据（新开业/关闭的商圈自动更新）。
    - 高德 Web服务 key 从环境变量 AMAP_WS_KEY 或项目根 .env 读取。
"""

import json, time, sys, os, urllib.request, urllib.parse
from _env import load_env

KEY = load_env('AMAP_WS_KEY')

# 城市 key -> (中文名, 高德 adcode, 短前缀)  —— 高德 Web服务天气用 adcode，POI 搜索用中文名即可
CITIES = [
    ('shanghai', '上海', '310000', 'sh'),
    ('beijing', '北京', '110000', 'bj'),
    ('hangzhou', '杭州', '330100', 'hz'),
    ('suzhou', '苏州', '320500', 'su'),
    ('shenzhen', '深圳', '440300', 'sx'),
    ('changsha', '长沙', '430100', 'cs'),
    ('guangzhou', '广州', '440100', 'gz'),
    ('chengdu', '成都', '510100', 'cd'),
    ('wuhan', '武汉', '420100', 'wh'),
    ('nanjing', '南京', '320100', 'nj'),
    ('xian', '西安', '610100', 'xa'),
    ('chongqing', '重庆', '500000', 'cq'),
]

# 城市中心（默认锚点）
CENTERS = {
    'shanghai': (121.47, 31.23), 'beijing': (116.40, 39.90), 'hangzhou': (120.15, 30.27),
    'suzhou': (120.62, 31.31), 'shenzhen': (114.06, 22.54), 'changsha': (112.97, 28.19),
    'guangzhou': (113.26, 23.13), 'chengdu': (104.06, 30.57), 'wuhan': (114.30, 30.59),
    'nanjing': (118.79, 32.06), 'xian': (108.94, 34.26), 'chongqing': (106.55, 29.56),
}

# 拉取类别：keyword -> (zone类型, tags, note, 每个城市取 TOP N)
CATEGORIES = [
    ('商场', 'shop', ['商圈'], '商圈购物/餐饮客流，全天有效。', 12),
    ('写字楼', 'biz', ['写字楼', '加班'], '办公区，晚高峰+加班打车。', 8),
    ('机场', 'hub', ['机场', '长途单'], '机场到达波次，排队接单。', 2),
    ('火车站', 'hub', ['高铁'], '高铁到达高峰，出站即约即走。', 3),
    ('景区', 'shop', ['旅游'], '旅游客流，节假日全天高热。', 5),
    ('酒吧', 'night', ['夜生活', '酒吧'], '夜生活回程单，单均价高。', 4),
    ('大学', 'edu', ['高校'], '高校聚集，返校/离校潮。', 4),
    ('小区', 'home', ['居住'], '居住区，早高峰出发潮。', 8),
    ('美食街', 'meal', ['司机餐厅', '平价'], '司机平价餐饮带。', 5),
]

# 郊区/新区补充搜索：对每个城市的主要郊区关键词再搜商圈，扩大覆盖
SUBURBS = {
    '上海': ['浦东', '松江', '嘉定', '宝山', '闵行', '青浦'],
    '北京': ['通州', '昌平', '大兴', '顺义', '房山'],
    '杭州': ['余杭', '萧山', '临平', '富阳'],
    '苏州': ['吴江', '相城', '高新区', '工业园区'],
    '深圳': ['龙岗', '龙华', '宝安', '光明'],
    '长沙': ['星沙', '望城', '雨花'],
    '广州': ['番禺', '白云', '黄埔', '花都'],
    '成都': ['双流', '温江', '龙泉驿', '郫都'],
    '武汉': ['光谷', '江夏', '东西湖', '汉阳'],
    '南京': ['江宁', '浦口', '栖霞', '六合'],
    '西安': ['长安', '未央', '雁塔', '灞桥'],
    '重庆': ['渝北', '九龙坡', '沙坪坝', '南岸'],
}


def search(keyword, city, count=10):
    url = (f'https://restapi.amap.com/v3/place/text?key={KEY}'
           f'&keywords={urllib.parse.quote(keyword)}&city={urllib.parse.quote(city)}'
           f'&offset={count}&page=1&extensions=base&sortrule=weight')
    try:
        r = urllib.request.urlopen(url, timeout=15)
        d = json.loads(r.read().decode())
        return d.get('pois', []) if d.get('status') == '1' else []
    except Exception:
        return []


def norm(name):
    """清洗名称：去掉括号说明、店名后缀，避免跨城市同名误匹配"""
    name = name.split('(')[0].split('（')[0].split('/')[0].strip()
    for suffix in ['店', '餐厅', '食堂', '专营店']:
        if name.endswith(suffix) and len(name) > 3:
            name = name[:-len(suffix)]
    return name or name


def build_city(city_key, city_name, adcode, prefix):
    zones, seen = [], set()
    idx = 0

    def add(name, lng, lat, ztype, tags, note):
        nonlocal idx
        n = norm(name)
        if not n or n in seen:
            return
        seen.add(n)
        idx += 1
        tags_str = ', '.join(f"'{t}'" for t in tags)
        return f"      Z('{prefix}_a{idx:03d}', '{name}', {lng:.6f}, {lat:.6f}, '{ztype}', [{tags_str}], '{note}'),"

    for keyword, ztype, tags, note, topn in CATEGORIES:
        pois = search(keyword, city_name, 10)
        got = 0
        for p in pois:
            if got >= topn:
                break
            if not p.get('location'):
                continue
            lng, lat = p['location'].split(',')
            line = add(p['name'], float(lng), float(lat), ztype, tags, note)
            if line:
                zones.append(line)
                got += 1
        time.sleep(0.15)  # 限速，避免 QPS 过高

    # 郊区/新区补充搜索：每个郊区关键词搜商圈，扩大点位覆盖（避免郊区地址首站过远）
    for sub in SUBURBS.get(city_name, []):
        pois = search(f'{sub} 商圈', city_name, 3)
        got = 0
        for p in pois:
            if got >= 2:
                break
            if not p.get('location'):
                continue
            lng, lat = p['location'].split(',')
            line = add(f'{sub}·{p["name"]}', float(lng), float(lat), 'shop', ['商圈'], '郊区商圈。')
            if line:
                zones.append(line)
                got += 1
        time.sleep(0.12)

    return zones, idx


def main():
    only = None
    if '--city' in sys.argv:
        only = sys.argv[sys.argv.index('--city') + 1]

    blocks = []
    total = 0
    for key, name, adcode, prefix in CITIES:
        if only and name != only:
            continue
        zones, cnt = build_city(key, name, adcode, prefix)
        total += cnt
        blocks.append(f"  // ── {name} ──────────────────────────────────────────────\n"
                      f"  {key}: {{\n    name: '{name}', adcode: '{adcode}',\n    zones: [\n"
                      + '\n'.join(zones) + "\n    ],\n    xcity: [],\n  },")
        print(f"  {name}: {cnt} 个点位")

    center_lines = '\n'.join(f"  {k}: {{ lng: {c[0]}, lat: {c[1]} }}," for k, c in CENTERS.items() if not only or any(c[0] == CENTERS[x][0] for x in [k]))

    js = f"""/**
 * 多城市跑单点位数据库（自动生成，真实商圈坐标）。
 * 数据来源：高德 Web服务 POI 搜索（sortrule=weight 按热度），可定期重跑 scripts/update_poi.py 更新。
 * 字段：id, name, lng, lat, type(biz|hub|night|shop|home|edu|meal), tags, note
 */

const Z = (id, name, lng, lat, type, tags, note) => ({{ id, name, lng, lat, type, tags, note }});

export const CITY_DB = {{
{chr(10).join(blocks)}
}};

/** 城市列表（供选择器） */
export const CITIES = Object.entries(CITY_DB).map(([key, c]) => ({{ key, name: c.name, adcode: c.adcode }}));

/** 城市中心坐标（用于默认锚点） */
const CENTERS = {{
{center_lines}
}};

/** 取城市点位（未知城市回退上海） */
export function zonesOf(city) {{
  return CITY_DB[city]?.zones || CITY_DB.shanghai.zones;
}}
export function xcityOf(city) {{
  return CITY_DB[city]?.xcity || [];
}}
export function cityInfo(city) {{
  const c = CITY_DB[city] || CITY_DB.shanghai;
  return {{ ...c, center: CENTERS[city] || CENTERS.shanghai }};
}}

/** 距离（km，haversine） */
export function distKm(a, b) {{
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}}

/** 找离给定坐标最近的 N 个点位 */
export function nearestZones(lng, lat, n = 3, types = null, city = 'shanghai') {{
  const pool = zonesOf(city).filter(z => !types || types.includes(z.type));
  return pool
    .map(z => ({{ ...z, dist: distKm({{ lng, lat }}, z) }}))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}}
"""

    out = 'app/js/engine/poi-db.js'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f"\n✅ 已生成 {out}（共 {total} 个真实商圈点位）")


if __name__ == '__main__':
    main()
