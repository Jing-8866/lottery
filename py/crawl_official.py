#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
crawl_official.py
从官方站点获取彩票开奖数据，输出 JSON 到 ../data/ 目录

数据源：
  福彩：https://www.cwl.gov.cn/       → ssq, qlc, kl8
  体彩：https://www.lottery.gov.cn/   → dlt, qxc

用法：
    python crawl_official.py              # 抓取所有彩种
    python crawl_official.py ssq dlt      # 仅抓取指定彩种
    python crawl_official.py --debug      # 调试模式
"""

import requests
import json
import os
import sys
import time
from datetime import datetime

# ========== 配置 ==========
DEBUG = "--debug" in sys.argv
TIMEOUT = 20
RETRY_TIMES = 3

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.cwl.gov.cn/",
}

# 输出目录：脚本所在目录的上级 data/ 下
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data"))

# ========== 彩种配置 ==========

# 福彩配置（使用 cwl.gov.cn API）
FC_CONFIG = {
    "ssq": {  # 双色球
        "api_name": "ssq",
        "name": "双色球",
        "red_cnt": 6, "blue_cnt": 1,
    },
    "qlc": {  # 七乐彩 - red 存基本号(7个), blue 存特别号(1个)
        "api_name": "qlc",
        "name": "七乐彩",
        "red_cnt": 7, "blue_cnt": 1,
    },
    "kl8": {  # 快乐8
        "api_name": "kl8",
        "name": "快乐8",
        "red_cnt": 20, "blue_cnt": 0,
    },
}

# 体彩配置（使用 webapi.sporttery.cn API）
TC_CONFIG = {
    "dlt": {  # 大乐透
        "game_no": "85",
        "name": "超级大乐透",
        "front_cnt": 5, "back_cnt": 2,
    },
    "qxc": {  # 七星彩
        "game_no": "04",
        "name": "7星彩",
        "front_cnt": 7, "back_cnt": 0,
    },
}

FC_URL = "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice"
TC_URL = "https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry"


# ========== 工具函数 ==========

def log(msg, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def fetch_json(url, headers=None, params=None, source_name=""):
    """通用 JSON API 请求，带重试"""
    last_err = None
    for attempt in range(RETRY_TIMES):
        try:
            if attempt > 0:
                wait = 2 ** attempt
                log(f"重试 {attempt + 1}/{RETRY_TIMES}，等待 {wait}s...", "WARN")
                time.sleep(wait)
            r = requests.get(url, headers=headers or HEADERS,
                             params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                last_err = f"HTTP {r.status_code}"
                if DEBUG:
                    log(f"响应内容(前200字): {r.text[:200]}", "DEBUG")
                continue
            return r.json()
        except Exception as e:
            last_err = str(e)[:100]
            continue
    raise Exception(f"{source_name} 请求失败 ({last_err})")


# ========== 福彩解析 ==========

def parse_fc(item, cfg):
    """解析单条福彩数据"""
    red_str = item.get("red", "")
    blue_str = item.get("blue", "")

    reds = [n.strip().zfill(2) for n in red_str.split(",") if n.strip()][:cfg["red_cnt"]]
    blues = []

    if cfg["blue_cnt"] > 0:
        blues = [n.strip().zfill(2) for n in blue_str.split(",") if n.strip()][:cfg["blue_cnt"]]

    result = {
        "issue": item.get("code", ""),
        "date": item.get("date", "").split("(")[0] if "(" in item.get("date", "") else item.get("date", ""),
        "red": reds,
    }
    if blues:
        result["blue"] = blues

    return result


def crawl_fc(key):
    """抓取单个福彩彩种"""
    cfg = FC_CONFIG[key]
    log(f"[福彩] 开始抓取 {cfg['name']} ({key})...")

    params = {
        "name": cfg["api_name"],
        "issueCount": "",
        "issueStart": "",
        "issueEnd": "",
        "dayStart": "",
        "dayEnd": "",
        "pageNo": 1,
        "pageSize": 50,
        "week": "",
        "systemType": "PC",
    }

    data = fetch_json(FC_URL, params=params, source_name=f"福彩{cfg['name']}")

    items = data.get("result", [])
    if not items:
        log(f"[福彩] {cfg['name']}: 未获取到数据", "WARN")
        return []

    parsed = []
    for item in items:
        try:
            parsed.append(parse_fc(item, cfg))
        except Exception as e:
            log(f"[福彩] 解析失败: {e}", "WARN")
            continue

    log(f"[福彩] {cfg['name']}: 获取到 {len(parsed)} 期数据")
    return parsed


# ========== 体彩解析 ==========

def parse_tc(item, cfg):
    """解析单条体彩数据"""
    draw_result = item.get("lotteryDrawResult", "")
    nums = draw_result.split()

    front_cnt = cfg["front_cnt"]
    back_cnt = cfg["back_cnt"]

    fronts = [n.strip().zfill(2) for n in nums[:front_cnt] if n.strip()]
    backs = [n.strip().zfill(2) for n in nums[front_cnt:front_cnt + back_cnt] if n.strip()]

    result = {
        "issue": item.get("lotteryDrawNum", ""),
        "date": item.get("lotteryDrawTime", ""),
        "red": fronts,
    }
    if backs:
        result["blue"] = backs

    return result


def crawl_tc(key):
    """抓取单个体彩彩种"""
    cfg = TC_CONFIG[key]
    log(f"[体彩] 开始抓取 {cfg['name']} ({key})...")

    params = {
        "gameNo": cfg["game_no"],
        "provinceId": "0",
        "pageSize": 50,
        "isVerify": "1",
        "pageNo": 1,
    }

    # 体彩 API 需要 Referer
    tc_headers = HEADERS.copy()
    tc_headers["Referer"] = "https://www.lottery.gov.cn/"

    data = fetch_json(TC_URL, headers=tc_headers, params=params, source_name=f"体彩{cfg['name']}")

    items = data.get("value", {}).get("list", [])
    if not items:
        log(f"[体彩] {cfg['name']}: 未获取到数据", "WARN")
        return []

    parsed = []
    for item in items:
        try:
            parsed.append(parse_tc(item, cfg))
        except Exception as e:
            log(f"[体彩] 解析失败: {e}", "WARN")
            continue

    log(f"[体彩] {cfg['name']}: 获取到 {len(parsed)} 期数据")
    return parsed


# ========== 彩种分发 ==========

CRAWLERS = {}

for k in FC_CONFIG:
    CRAWLERS[k] = crawl_fc
for k in TC_CONFIG:
    CRAWLERS[k] = crawl_tc


def merge_with_existing(key, new_data):
    """与已有 JSON 文件合并，同期号用新数据覆盖旧数据"""
    out_path = os.path.join(DATA_DIR, f"{key}.json")
    existing = []

    if os.path.isfile(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            existing = existing_data.get("data", [])
            log(f"{key}: 已有文件含 {len(existing)} 期历史数据")
        except (json.JSONDecodeError, KeyError) as e:
            log(f"{key}: 已有文件解析失败，将覆盖重建 ({e})", "WARN")
            existing = []

    # 建立期号 → 旧数据 的映射
    old_map = {item.get("issue", ""): item for item in existing if item.get("issue")}

    # 用新数据覆盖旧数据
    replaced_count = 0
    for item in new_data:
        issue = item.get("issue", "")
        if not issue:
            continue
        old_map[issue] = item
        replaced_count += 1

    merged = list(old_map.values())

    # 按期号降序排列（最新期在前）
    merged.sort(key=lambda x: x.get("issue", ""), reverse=True)

    log(f"{key}: 覆盖 {replaced_count} 期，累计 {len(merged)} 期")
    return merged


def main():
    log("=== 彩票开奖数据抓取工具 (crawl_official) ===")
    log("数据源: 福彩 cwl.gov.cn | 体彩 lottery.gov.cn")

    # 命令行参数指定彩种
    cli_args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keys = cli_args if cli_args else list(CRAWLERS.keys())

    os.makedirs(DATA_DIR, exist_ok=True)
    log(f"输出目录: {DATA_DIR}")

    success_count = 0
    fail_count = 0

    for key in keys:
        if key not in CRAWLERS:
            log(f"未知彩种: {key}，跳过", "WARN")
            continue
        try:
            new_data = CRAWLERS[key](key)
            if not new_data:
                log(f"警告: {key} 未解析到任何数据", "WARN")
                fail_count += 1
                continue

            merged_data = merge_with_existing(key, new_data)

            out_path = os.path.join(DATA_DIR, f"{key}.json")
            output = {
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "count": len(merged_data),
                "data": merged_data,
            }
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)

            log(f"✓ {key}: 累计 {len(merged_data)} 期 -> {out_path}")
            success_count += 1

        except Exception as e:
            log(f"✗ {key}: 失败 - {e}", "ERROR")
            if DEBUG:
                import traceback
                traceback.print_exc()
            fail_count += 1

    total = len(keys)
    log("=" * 40)
    log(f"完成: 成功 {success_count}/{total}")
    if fail_count > 0:
        log(f"失败 {fail_count} 个", "WARN")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
