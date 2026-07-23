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
import random
from datetime import datetime

# ========== 配置 ==========
DEBUG = "--debug" in sys.argv
TIMEOUT = 20
RETRY_TIMES = 3

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
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


def make_session(base_url, referer):
    """创建带浏览器级 Cookie 和 Header 的 Session（先访问首页获取 Cookie）"""
    sess = requests.Session()
    sess.headers.update(HEADERS)
    sess.headers["Referer"] = referer

    # 先访问首页，获取必要的 Cookie
    try:
        home = sess.get(referer, timeout=TIMEOUT)
        if DEBUG:
            log(f"首页 Cookie: {dict(sess.cookies)}", "DEBUG")
    except Exception as e:
        log(f"首页访问失败（不影响后续）: {e}", "WARN")

    # 随机延迟 1~3 秒，模拟真人
    time.sleep(1 + random.random() * 2)
    return sess


def fetch_json(url, session, params=None, source_name=""):
    """使用已有 Session 发起 JSON API 请求，带重试"""
    last_err = None
    for attempt in range(RETRY_TIMES):
        try:
            if attempt > 0:
                wait = 2 ** attempt + random.random() * 2
                log(f"重试 {attempt + 1}/{RETRY_TIMES}，等待 {wait:.1f}s...", "WARN")
                time.sleep(wait)
            r = session.get(url, params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                last_err = f"HTTP {r.status_code}"
                if DEBUG:
                    log(f"响应头: {dict(r.headers)}", "DEBUG")
                    log(f"响应体(前300字): {r.text[:300]}", "DEBUG")
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

    session = make_session("https://www.cwl.gov.cn/", "https://www.cwl.gov.cn/")

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

    data = fetch_json(FC_URL, session, params=params, source_name=f"福彩{cfg['name']}")

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

    session = make_session("https://www.lottery.gov.cn/", "https://www.lottery.gov.cn/")

    # 体彩 API 需要额外的 lottery.gov.cn referer
    session.headers["Referer"] = "https://www.lottery.gov.cn/kj/kjlb.html?" + cfg["game_no"]

    params = {
        "gameNo": cfg["game_no"],
        "provinceId": "0",
        "pageSize": 50,
        "isVerify": "1",
        "pageNo": 1,
    }

    data = fetch_json(TC_URL, session, params=params, source_name=f"体彩{cfg['name']}")

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


# ========== 500.com 备用爬取（官方 API 被 WAF 拦截时自动降级）==========

FALLBACK_URLS = {
    "ssq": "https://datachart.500.com/ssq/history/newinc/history.php?start=00001&end=99999&limit=50",
    "dlt": "https://datachart.500.com/dlt/history/newinc/history.php?start=00001&end=99999&limit=50",
    "qlc": "https://datachart.500.com/qlc/history/newinc/history.php?start=00001&end=99999&limit=50",
    "kl8": "https://datachart.500.com/kl8/?expect=50",
    "qxc": "https://datachart.500.com/qxc/?expect=50",
}

FALLBACK_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def fallback_crawl(key):
    """500.com 备用爬取（仅当官方 API 失败时调用）"""
    url = FALLBACK_URLS.get(key)
    if not url:
        return None

    log(f"[备用] 尝试从 500.com 抓取 {key}...")

    try:
        r = requests.get(url, headers=FALLBACK_HEADERS, timeout=TIMEOUT)
        if r.status_code != 200:
            log(f"[备用] {key}: HTTP {r.status_code}", "WARN")
            return None

        from bs4 import BeautifulSoup
        html = r.content.decode("utf-8", "ignore")
        soup = BeautifulSoup(html, "lxml")

        if key == "ssq":
            return fallback_parse_ssq(soup)
        elif key == "dlt":
            return fallback_parse_dlt(soup)
        elif key == "qlc":
            return fallback_parse_qlc(soup)
        elif key == "kl8":
            return fallback_parse_kl8(soup)
        elif key == "qxc":
            return fallback_parse_qxc(soup)
    except ImportError:
        log("[备用] 缺少 beautifulsoup4 或 lxml，无法使用备用方案", "WARN")
        return None
    except Exception as e:
        log(f"[备用] {key}: 失败 - {e}", "WARN")
        return None


def fallback_parse_ssq(soup):
    """500.com 双色球解析"""
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


def fallback_parse_dlt(soup):
    """500.com 大乐透解析"""
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


def fallback_parse_qlc(soup):
    """500.com 七乐彩解析"""
    data = []
    tbl = soup.find("table", id="tablelist")
    if not tbl:
        return data
    for tr in list(tbl.find_all("tr"))[1:]:
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


def _extract_date_from_tds(tds):
    """在 td 列表中查找包含日期格式的文本（如 2026-07-21）"""
    import re
    for td in tds:
        text = td.get_text().strip()
        m = re.search(r'(20\d{2}-\d{2}-\d{2})', text)
        if m:
            return m.group(1)
    return ""


def fallback_parse_kl8(soup):
    """500.com 快乐8解析（含日期提取）"""
    data = []
    for t_tag in soup.find_all("tbody", id="tdata"):
        for tr in t_tag.find_all("tr"):
            if len(tr) == 1:
                continue
            tds = tr.find_all("td")
            seq_no = tds[0].get_text().replace(" ", "")
            nums = [td.get_text().strip().zfill(2)
                    for td in tds if td.get("class") and "chartBall01" in td.get("class")][:20]
            date = _extract_date_from_tds(tds)
            data.append({"issue": seq_no, "date": date, "red": nums})
    return data


def fallback_parse_qxc(soup):
    """500.com 七星彩解析（含日期提取）"""
    data = []
    import re
    for t_tag in soup.find_all("table", class_="zs_table"):
        for tr in t_tag.find_all("tr"):
            if len(tr) != 87:
                continue
            tds = tr.find_all("td")
            seq_no = "20" + tds[0].get_text().replace(" ", "")
            nums = [td.get_text().strip().zfill(2)
                    for td in tds if td.get("class") and "chartBall01" in td.get("class")][:7]
            # 查找日期：遍历所有 td 找 YYYY-MM-DD 格式
            date = _extract_date_from_tds(tds)
            data.append({"issue": seq_no, "date": date, "numbers": nums})
    return data


# ========== 彩种分发（含自动降级）==========

CRAWLERS = {}

for k in FC_CONFIG:
    CRAWLERS[k] = crawl_fc
for k in TC_CONFIG:
    CRAWLERS[k] = crawl_tc


def crawl_with_fallback(key):
    """尝试官方 API，失败后自动降级到 500.com"""
    try:
        return CRAWLERS[key](key)
    except Exception as e:
        log(f"官方 API 失败: {e}", "WARN")
        log("尝试 500.com 备用方案...", "WARN")
        fb_data = fallback_crawl(key)
        if fb_data is not None and len(fb_data) > 0:
            log(f"备用方案成功: {key} 获取到 {len(fb_data)} 期")
            return fb_data
        # 备用也失败，抛出原始异常
        log("备用方案也失败", "ERROR")
        raise


def normalize_issue(issue):
    """统一期号为7位格式（如 26081 → 2026081）"""
    if not issue:
        return issue
    s = str(issue).strip()
    if len(s) == 5:
        return "20" + s
    return s


def merge_with_existing(key, new_data):
    """
    与已有 JSON 文件合并，同期号用新数据覆盖旧数据。
    统一期号为7位格式后，按数值降序排列。
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

    # 建立期号 → 旧数据 的映射（统一为7位期号）
    old_map = {}
    for item in existing:
        issue = item.get("issue", "")
        if issue:
            norm_issue = normalize_issue(issue)
            item["issue"] = norm_issue
            old_map[norm_issue] = item

    # 用新数据覆盖旧数据
    replaced_count = 0
    for item in new_data:
        issue = item.get("issue", "")
        if not issue:
            continue
        norm_issue = normalize_issue(issue)
        item["issue"] = norm_issue
        old_map[norm_issue] = item
        replaced_count += 1

    merged = list(old_map.values())

    # 按数值降序排列（最新期在前），避免字符串比较导致 26081 > 2026082
    merged.sort(key=lambda x: int(x.get("issue", "0")), reverse=True)

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
            new_data = crawl_with_fallback(key)
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
