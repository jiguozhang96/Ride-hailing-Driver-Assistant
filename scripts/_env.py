#!/usr/bin/env python3
"""从环境变量或项目根 .env 读取密钥（供数据采集脚本共用，避免在脚本中硬编码 key）。"""
import os
import re


def load_env(key='AMAP_WS_KEY'):
    """优先环境变量，其次项目根 .env；返回密钥字符串（可能为空）。"""
    if os.environ.get(key):
        return os.environ[key]
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
        if os.path.exists(env_path):
            for line in open(env_path, encoding='utf-8'):
                m = re.match(rf'^\s*{key}\s*=\s*([^#\r\n]+)', line)
                if m:
                    os.environ[key] = m.group(1).strip()
                    return os.environ[key]
    except Exception:
        pass
    return ''


def get_amap_key():
    return load_env('AMAP_WS_KEY')
