#!/usr/bin/env python3
"""生成 6 个新城市（广州/成都/武汉/南京/西安/重庆）的真实商圈数据，输出 JS 代码块。"""
import json, time, urllib.request, urllib.parse
from _env import load_env

KEY = load_env('AMAP_WS_KEY')

NEW_CITIES = {
    'guangzhou': ('广州', '101280101', [
        ('gz_air', '广州白云国际机场', 'hub', ['机场', '长途单'], '到达波次，跨城单多。'),
        ('gz_south', '广州南站', 'hub', ['高铁'], '到达高峰 18-22 点。'),
        ('gz_station', '广州站', 'hub', ['高铁', '普速'], '到达高峰 7-9 / 18-21。'),
        ('gz_zhujiang', '珠江新城', 'biz', ['金融', '写字楼', '加班'], '天河CBD核心，加班单多。'),
        ('gz_tianhe', '天河城', 'shop', ['商圈', '地铁换乘'], '天河核心商圈。'),
        ('gz_beijinglu', '北京路步行街', 'shop', ['商圈', '旅游'], '老城商圈+旅游。'),
        ('gz_shangxiajiu', '上下九步行街', 'shop', ['商圈', '旅游'], '西关老商圈。'),
        ('gz_kejiyuan', '天河软件园', 'biz', ['互联网', '科技', '加班'], '互联网聚集，21-23 加班。'),
        ('gz_pazhou', '琶洲', 'biz', ['会展', '互联网'], '会展+电商总部。'),
        ('gz_jiangnanxi', '江南西', 'shop', ['商圈', '居住'], '海珠商圈。'),
        ('gz_pati', '珠江琶醍', 'night', ['夜生活', '酒吧'], '珠江边夜生活，22-02 出单。'),
        ('gz_taojin', '淘金', 'night', ['夜生活'], '越秀夜生活次中心。'),
        ('gz_baiyun', '白云居住区', 'home', ['居住'], '大型居住区，早高峰进市。'),
        ('gz_panyu', '番禺居住区', 'home', ['居住'], '南部大型居住区。'),
        ('gz_daxuecheng', '广州大学城', 'edu', ['高校'], '高校聚集，返校潮。'),
        ('gz_meal', '天河司机餐饮带', 'meal', ['司机餐厅', '平价'], '天河平价餐饮。'),
    ]),
    'chengdu': ('成都', '101270101', [
        ('cd_air', '成都双流国际机场', 'hub', ['机场', '长途单'], '到达波次。'),
        ('cd_east', '成都东站', 'hub', ['高铁'], '到达高峰 18-22 点。'),
        ('cd_station', '成都站', 'hub', ['高铁', '普速'], '到达高峰 7-9 / 18-21。'),
        ('cd_chunxi', '春熙路', 'shop', ['商圈', '高端单'], '成都核心商圈，全天高热。'),
        ('cd_kuanzhai', '宽窄巷子', 'shop', ['商圈', '旅游'], '旅游+商圈。'),
        ('cd_jinli', '锦里古街', 'shop', ['旅游'], '武侯祠旁旅游客流。'),
        ('cd_ruanjianyuan', '天府软件园', 'biz', ['互联网', '科技', '加班'], '互联网聚集，21-23 加班。'),
        ('cd_jinrong', '金融城', 'biz', ['金融', '写字楼'], '金融中心，通勤时段强。'),
        ('cd_jiuyanqiao', '九眼桥', 'night', ['夜生活', '酒吧'], '酒吧区，22-03 出单。'),
        ('cd_lanfanggui', '兰桂坊', 'night', ['夜生活'], '夜生活次中心。'),
        ('cd_nanmen', '南门居住区', 'home', ['居住'], '南部大型居住区。'),
        ('cd_dianzike', '电子科技大学', 'edu', ['高校'], '高校聚集。'),
        ('cd_meal', '春熙路司机餐饮带', 'meal', ['司机餐厅', '平价'], '市中心平价餐饮。'),
    ]),
    'wuhan': ('武汉', '101200101', [
        ('wh_air', '武汉天河国际机场', 'hub', ['机场', '长途单'], '到达波次。'),
        ('wh_wuchang', '武昌站', 'hub', ['高铁', '普速'], '到达高峰 7-9 / 18-21。'),
        ('wh_hankou', '汉口站', 'hub', ['高铁', '普速'], '到达高峰。'),
        ('wh_jianghan', '江汉路步行街', 'shop', ['商圈', '旅游'], '汉口核心商圈+夜生活。'),
        ('wh_hanjie', '楚河汉街', 'shop', ['商圈'], '武昌商圈。'),
        ('wh_guanggu', '光谷广场', 'shop', ['商圈', '高校'], '光谷商圈+高校客流。'),
        ('wh_guanggu_soft', '光谷软件园', 'biz', ['互联网', '科技', '加班'], '互联网聚集，21-23 加班。'),
        ('wh_wuguang', '武广商圈', 'shop', ['商圈', '写字楼'], '汉口商圈。'),
        ('wh_jijiqing', '吉庆街', 'night', ['夜生活'], '汉口夜宵。'),
        ('wh_guanggu_home', '光谷居住区', 'home', ['居住'], '光谷大型居住区。'),
        ('wh_luojia', '武汉大学', 'edu', ['高校'], '高校聚集。'),
        ('wh_meal', '光谷司机餐饮带', 'meal', ['司机餐厅', '平价'], '光谷平价餐饮。'),
    ]),
    'nanjing': ('南京', '101190101', [
        ('nj_air', '南京禄口国际机场', 'hub', ['机场', '长途单'], '到达波次。'),
        ('nj_south', '南京南站', 'hub', ['高铁'], '到达高峰 18-22 点。'),
        ('nj_station', '南京站', 'hub', ['高铁', '普速'], '到达高峰 7-9 / 18-21。'),
        ('nj_xinjiekou', '新街口', 'shop', ['商圈', '地铁换乘'], '南京核心商圈，全天高热。'),
        ('nj_fuzimiao', '夫子庙', 'shop', ['商圈', '旅游'], '旅游+商圈。'),
        ('nj_hexi', '河西新城', 'biz', ['写字楼', '互联网', '加班'], '河西CBD，加班单。'),
        ('nj_ruanjian', '软件大道', 'biz', ['互联网', '科技', '加班'], '软件企业聚集。'),
        ('nj_1912', '1912街区', 'night', ['夜生活', '酒吧'], '酒吧街区，22-02 出单。'),
        ('nj_jiangning', '江宁居住区', 'home', ['居住'], '南部大型居住区。'),
        ('nj_xianlin', '仙林大学城', 'edu', ['高校'], '高校聚集，返校潮。'),
        ('nj_meal', '新街口司机餐饮带', 'meal', ['司机餐厅', '平价'], '市中心平价餐饮。'),
    ]),
    'xian': ('西安', '101110101', [
        ('xa_air', '西安咸阳国际机场', 'hub', ['机场', '长途单'], '远距枢纽，到达波次。'),
        ('xa_north', '西安北站', 'hub', ['高铁'], '到达高峰 18-22 点。'),
        ('xa_station', '西安站', 'hub', ['高铁', '普速'], '到达高峰 7-9 / 18-21。'),
        ('xa_zhonglou', '钟楼', 'shop', ['商圈', '旅游'], '西安核心商圈+旅游。'),
        ('xa_xiaozhai', '小寨', 'shop', ['商圈', '高校'], '城南商圈。'),
        ('xa_dayanta', '大雁塔', 'shop', ['旅游', '夜生活'], '旅游+夜景，晚间高热。'),
        ('xa_gaoxin', '高新区', 'biz', ['科技', '写字楼', '加班'], '科技企业聚集，加班单。'),
        ('xa_huimin', '回民街', 'night', ['夜生活', '旅游'], '美食街+夜生活。'),
        ('xa_qujiang', '曲江居住区', 'home', ['居住'], '南部居住区。'),
        ('xa_changan', '长安大学城', 'edu', ['高校'], '高校聚集。'),
        ('xa_meal', '钟楼司机餐饮带', 'meal', ['司机餐厅', '平价'], '市中心平价餐饮。'),
    ]),
    'chongqing': ('重庆', '101040100', [
        ('cq_air', '重庆江北国际机场', 'hub', ['机场', '长途单'], '到达波次。'),
        ('cq_north', '重庆北站', 'hub', ['高铁'], '到达高峰 18-22 点。'),
        ('cq_west', '重庆西站', 'hub', ['高铁', '普速'], '到达高峰。'),
        ('cq_jiefangbei', '解放碑', 'shop', ['商圈', '旅游'], '渝中核心商圈+旅游。'),
        ('cq_guanyinqiao', '观音桥', 'shop', ['商圈'], '江北核心商圈。'),
        ('cq_nanping', '南坪', 'shop', ['商圈'], '南岸商圈。'),
        ('cq_jiangbeizui', '江北嘴', 'biz', ['金融', '写字楼'], '金融中心。'),
        ('cq_zhaomushan', '照母山科技城', 'biz', ['科技', '写字楼', '加班'], '科技企业聚集。'),
        ('cq_jiujie', '九街', 'night', ['夜生活', '酒吧'], '酒吧街，22-03 出单。'),
        ('cq_hongyadong', '洪崖洞', 'night', ['旅游', '夜景'], '夜景旅游，晚间高热。'),
        ('cq_yubei', '渝北居住区', 'home', ['居住'], '北部大型居住区。'),
        ('cq_daxuecheng', '大学城', 'edu', ['高校'], '高校聚集。'),
        ('cq_meal', '解放碑司机餐饮带', 'meal', ['司机餐厅', '平价'], '市中心平价餐饮。'),
    ]),
}

def search(kw, city):
    url = f'https://restapi.amap.com/v3/place/text?key={KEY}&keywords={urllib.parse.quote(kw)}&city={urllib.parse.quote(city)}&offset=5&page=1&extensions=base'
    try:
        r = urllib.request.urlopen(url, timeout=15)
        d = json.loads(r.read().decode())
        if d.get('status') == '1' and d.get('pois'):
            return d['pois']
    except Exception:
        pass
    return []

def clean_kw(name):
    kw = name.split('(')[0].split('（')[0].split('/')[0]
    for s in ['司机餐饮带', '餐饮带', '居住区', '方向']:
        if kw.endswith(s):
            kw = kw[:-len(s)]
            break
    return kw.strip() or name

def main():
    lines = []
    hit = miss = 0
    for key, (city, adcode, zones) in NEW_CITIES.items():
        lines.append(f"  // ── {city} ──────────────────────────────────────────────")
        lines.append(f"  {key}: {{")
        lines.append(f"    name: '{city}', adcode: '{adcode}',")
        lines.append(f"    zones: [")
        for zid, name, ztype, tags, note in zones:
            pois = search(clean_kw(name), city)
            if pois:
                lng, lat = pois[0]['location'].split(',')
                hit += 1
                lng, lat = round(float(lng), 6), round(float(lat), 6)
            else:
                miss += 1
                lng, lat = 0, 0
                print(f"  [未匹配] {city}/{name}")
            tags_str = ', '.join(f"'{t}'" for t in tags)
            lines.append(f"      Z('{zid}', '{name}', {lng}, {lat}, '{ztype}', [{tags_str}], '{note}'),")
            time.sleep(0.12)
        lines.append(f"    ],")
        lines.append(f"    xcity: [],")
        lines.append(f"  }},")
    open('scripts/new_cities_out.txt', 'w', encoding='utf-8').write('\n'.join(lines))
    print(f"\n完成：命中 {hit}，未匹配 {miss}。输出已写入 scripts/new_cities_out.txt")

if __name__ == '__main__':
    main()
