#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
crawl-local.py
本地运行：抓取 500.com 彩票开奖历史数据，输出 JSON 到 ../data/ 目录

数据源：datachart.500.com（直连，Python requests 无 CORS 限制）
解析方式参考 caipiao_db.py：使用 chartBall01 / chartBall02 / specialball 类选择器

用法：
    python crawl-local.py              # 抓取所有彩种
    python crawl-local.py ssq dlt      # 仅抓取指定彩种
    python crawl-local.py --debug      # 调试模式
"""

import requests
from bs4 import BeautifulSoup
import json
import os
import sys
import time
from datetime import datetime

# ========== 配置 ==========
DEBUG = "--debug" in sys.argv
TIMEOUT = 15
RETRY_TIMES = 2

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 输出目录：脚本所在目录的上级 data/ 下
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data"))

# 彩种配置（URL 参考 caipiao_db.py 的 choose_type）
LOTTERY_CONFIG = {
    "ssq": {  # 双色球
        "url": "https://datachart.500.com/ssq/history/newinc/history.php?start=00001&end=99999&limit=50",
        "red_cnt": 6, "blue_cnt": 1,
    },
    "dlt": {  # 大乐透
        "url": "https://datachart.500.com/dlt/history/newinc/history.php?start=00001&end=99999&limit=50",
        "red_cnt": 5, "blue_cnt": 2,
    },
    "qlc": {  # 七乐彩
        "url": "https://datachart.500.com/qlc/history/newinc/history.php?start=00001&end=99999&limit=50",
        "red_cnt": 7, "blue_cnt": 0,
    },
    "kl8": {  # 快乐8
        "url": "https://datachart.500.com/kl8/?expect=50",
        "red_cnt": 20, "blue_cnt": 0,
    },
    "qxc": {  # 七星彩
        "url": "https://datachart.500.com/qxc/?expect=50",
        "red_cnt": 7, "blue_cnt": 0,
    },
}


# ========== 工具函数 ==========

def log(msg, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def fetch_page(url):
    """
    直连 500.com 获取页面（参考 caipiao_db.py 的方式）
    Python requests 无浏览器 CORS 限制，无需代理
    """
    last_err = None
    for attempt in range(RETRY_TIMES):
        try:
            if attempt > 0:
                time.sleep(2)
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if r.status_code != 200:
                last_err = f"HTTP {r.status_code}"
                continue
            # 500.com 页面编码为 GBK/GB2312，用 utf-8 解码并忽略错误
            html = r.content.decode("utf-8", "ignore")
            if len(html.strip()) < 200:
                last_err = "页面内容过短"
                continue
            return html
        except Exception as e:
            last_err = str(e)[:80]
            continue
    raise Exception(f"获取失败 ({last_err})")


# ========== 解析函数（参考 caipiao_db.py 的选择器）==========

def parse_ssq(soup):
    """
    双色球 (history.php, 16 tds)
    td[0]=期号, td[1..6]=红球, td[7]=蓝球, td[15]=开奖日期
    """
    data = []
    tbody = soup.find("tbody", id="tdata")
    if not tbody:
        return data
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 16:
            continue
        issue = tds[0].get_text().strip()
        reds = [td.get_text().strip().zfill(2) for td in tds[1:7]]
        blues = [td.get_text().strip().zfill(2) for td in tds[7:8]]
        date = tds[15].get_text().strip()
        data.append({"issue": issue, "date": date, "red": reds, "blue": blues})
    return data


def parse_dlt(soup):
    """
    大乐透 (history.php, 15 tds)
    td[0]=期号, td[1..5]=前区, td[6..7]=后区, td[14]=开奖日期
    """
    data = []
    tbody = soup.find("tbody", id="tdata")
    if not tbody:
        return data
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 15:
            continue
        issue = "20" + tds[0].get_text().strip()
        fronts = [td.get_text().strip().zfill(2) for td in tds[1:6]]
        backs = [td.get_text().strip().zfill(2) for td in tds[6:8]]
        date = tds[14].get_text().strip()
        data.append({"issue": issue, "date": date, "red": fronts, "blue": backs})
    return data


def parse_qlc(soup):
    """
    七乐彩 (history.php, table#tablelist, 6 tds)
    td[0]=期号, td[1]="号码1 号码2 ... 号码7 特别号", td[5]=开奖日期
    """
    data = []
    tbl = soup.find("table", id="tablelist")
    if not tbl:
        return data
    for tr in list(tbl.find_all("tr"))[1:]:  # 跳过表头
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue
        issue = "20" + tds[0].get_text().strip()
        nums = tds[1].get_text().strip().split()
        date = tds[5].get_text().strip()
        if len(nums) >= 7:
            basics = [n.zfill(2) for n in nums[:7]]
            special = nums[7].zfill(2) if len(nums) > 7 else ""
            data.append({"issue": issue, "date": date, "red": basics, "special": special})
    return data


def parse_kl8(soup):
    """快乐8（主页面）：chartBall01×20，无日期"""
    data = []
    for t_tag in soup.find_all("tbody", id="tdata"):
        for tr in t_tag.find_all("tr"):
            if len(tr) == 1:
                continue
            seq_no = tr.find("td").get_text().replace(" ", "")
            nums = [td.get_text().strip().zfill(2)
                    for td in tr.findAll("td", class_="chartBall01")][:20]
            data.append({"issue": seq_no, "date": "", "red": nums})
    return data


def parse_qxc(soup):
    """七星彩（主页面）：chartBall01×7，无日期"""
    data = []
    for t_tag in soup.find_all("table", class_="zs_table"):
        for tr in t_tag.find_all("tr"):
            if len(tr) != 87:
                continue
            seq_no = "20" + tr.find("td").get_text().replace(" ", "")
            nums = [td.get_text().strip().zfill(2)
                    for td in tr.findAll("td", class_="chartBall01")][:7]
            data.append({"issue": seq_no, "date": "", "numbers": nums})
    return data


# ========== 彩种分发 ==========

PARSERS = {
    "ssq": parse_ssq,
    "dlt": parse_dlt,
    "qlc": parse_qlc,
    "kl8": parse_kl8,
    "qxc": parse_qxc,
}


def crawl_one(key):
    """抓取单个彩种并解析"""
    cfg = LOTTERY_CONFIG[key]
    log(f"开始抓取 {key}...")

    html = fetch_page(cfg["url"])

    if DEBUG:
        debug_dir = os.path.join(SCRIPT_DIR, "debug_pages")
        os.makedirs(debug_dir, exist_ok=True)
        with open(os.path.join(debug_dir, f"{key}_page.html"), "w", encoding="utf-8") as f:
            f.write(html)
        log(f"页面已保存到 debug_pages/{key}_page.html")

    soup = BeautifulSoup(html, "lxml")
    parser = PARSERS[key]
    data = parser(soup)

    log(f"{key}: 解析到 {len(data)} 期数据")
    return data


def merge_with_existing(key, new_data):
    """
    将本次抓取的新数据与已有 JSON 文件合并，按期号去重。
    
    策略：
    1. 读取已有文件（如果存在）
    2. 用已有数据的期号建立 Set
    3. 新数据中凡是期号不在 Set 中的，追加到已有数据尾部
    4. 最终按期号降序排列（最新期在前）
    """
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

    # 建立已有期号集合
    existing_issues = set()
    for item in existing:
        # 不同彩种 issue 字段名不同：ssq/dlt/qlc/kl8 用 "issue"，qxc 也用 "issue"
        issue = item.get("issue", "")
        if issue:
            existing_issues.add(issue)

    # 追加新数据（去重）
    added_count = 0
    for item in new_data:
        issue = item.get("issue", "")
        if issue and issue not in existing_issues:
            existing.append(item)
            existing_issues.add(issue)
            added_count += 1

    # 按期号降序排列（最新期在前）
    existing.sort(key=lambda x: x.get("issue", ""), reverse=True)

    log(f"{key}: 本次新增 {added_count} 期，累计 {len(existing)} 期")
    return existing


def main():
    log("=== 彩票开奖数据抓取工具 (crawl-local) ===")

    # 确定要抓取的彩种列表
    # 支持命令行参数指定：python crawl-local.py ssq dlt
    cli_args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keys = cli_args if cli_args else list(LOTTERY_CONFIG.keys())

    # 创建输出目录
    os.makedirs(DATA_DIR, exist_ok=True)
    log(f"输出目录: {DATA_DIR}")

    success_count = 0
    fail_count = 0

    for key in keys:
        if key not in LOTTERY_CONFIG:
            log(f"未知彩种: {key}，跳过", "WARN")
            continue
        try:
            new_data = crawl_one(key)
            if not new_data:
                log(f"警告: {key} 未解析到任何数据", "WARN")
                fail_count += 1
                continue

            # 与已有数据合并（去重）
            merged_data = merge_with_existing(key, new_data)
            added = len(merged_data) - len(new_data)  # 实际新增量（近似）

            out_path = os.path.join(DATA_DIR, f"{key}.json")
            output = {
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "count": len(merged_data),
                "data": merged_data,
            }
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)

            log(f"✓ {key}: 新增 {added} 期，累计 {len(merged_data)} 期 -> {out_path}")
            success_count += 1

        except Exception as e:
            log(f"✗ {key}: 失败 - {e}", "ERROR")
            if DEBUG:
                import traceback
                traceback.print_exc()
            fail_count += 1

    # 汇总
    total = len(keys)
    log("=" * 40)
    log(f"完成: 成功 {success_count}/{total}")
    if fail_count > 0:
        log(f"失败 {fail_count} 个", "WARN")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()