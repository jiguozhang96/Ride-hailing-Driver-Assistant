#!/usr/bin/env python3
"""用高德 Web服务 POI 搜索，把 poi-db.js 中手工近似坐标精确化为真实坐标。"""
import re, json, time, urllib.request, urllib.parse
from _env import load_env

KEY = load_env('AMAP_WS_KEY')
SRC = 'app/js/engine/poi-db.js'
OUT = 'app/js/engine/poi-db.js'

# 城市 key -> 中文名（用于高德 city 参数）
CITY_NAME = {
    'shanghai': '上海', 'beijing': '北京', 'hangzhou': '杭州',
    'suzhou': '苏州', 'shenzhen': '深圳', 'changsha': '长沙',
}

def amap_search(keyword, city):
    url = f'https://restapi.amap.com/v3/place/text?key={KEY}&keywords={urllib.parse.quote(keyword)}&city={urllib.parse.quote(city)}&offset=5&page=1&extensions=base'
    try:
        r = urllib.request.urlopen(url, timeout=15)
        d = json.loads(r.read().decode())
        if d.get('status') == '1' and d.get('pois'):
            return d['pois']
    except Exception:
        pass
    return []

# 名称清洗：去掉括号说明、常见后缀，提高匹配率
def clean_kw(name):
    kw = name.split('(')[0].split('（')[0]
    # 提取核心关键词
    for suffix in ['司机餐饮带', '餐饮带', '居住区', '方向']:
        if kw.endswith(suffix):
            kw = kw[:-len(suffix)]
            break
    return kw.strip() or name

def resolve(name, city, ztype):
    """返回 (lng, lat, matched_name) 或 None"""
    pois = amap_search(clean_kw(name), city)
    if not pois:
        return None
    p = pois[0]
    lng, lat = p['location'].split(',')
    return float(lng), float(lat), p['name']

def main():
    src = open(SRC, encoding='utf-8').read()
    out_lines = []
    pos = 0
    hit = 0; miss = 0
    current_city = 'shanghai'

    # 逐行处理，追踪城市上下文 + 替换 Z(...) 坐标
    for line in src.split('\n'):
        # 城市块开头： shanghai: {
        m_city = re.match(r"^  (\w+):\s*\{", line)
        if m_city and m_city.group(1) in CITY_NAME:
            current_city = m_city.group(1)
        # 城市名行： name: '上海',
        m_name = re.match(r"^\s+name:\s*'([^']+)',", line)
        if m_name and m_name.group(1) in CITY_NAME.values():
            for k, v in CITY_NAME.items():
                if v == m_name.group(1):
                    current_city = k

        # Z('id', 'name', lng, lat, 'type', [tags], 'note'),
        m = re.match(r"^(\s*)Z\('([^']+)', '([^']+)', ([\d.]+), ([\d.]+), '([^']+)', (\[[^\]]*\]), '([^']*)'\),?\s*$", line)
        if m:
            indent, zid, name, lng, lat, ztype, tags, note = m.groups()
            city_cn = CITY_NAME.get(current_city, current_city)
            r = resolve(name, city_cn, ztype)
            if r:
                nlng, nlat, matched = r
                hit += 1
                line = f"{indent}Z('{zid}', '{name}', {nlng}, {nlat}, '{ztype}', {tags}, '{note}'),"
            else:
                miss += 1
                print(f"  [未匹配] {city_cn} / {name}")
        out_lines.append(line)
        # 限流：避免 QPS 过高
        if 'Z(' in line and current_city in CITY_NAME:
            time.sleep(0.12)

    open(OUT, 'w', encoding='utf-8').write('\n'.join(out_lines))
    print(f"\n完成：命中 {hit} 个，未匹配 {miss} 个")

if __name__ == '__main__':
    main()
