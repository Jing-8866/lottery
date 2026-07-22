/**
 * 彩票核对工具 - 号码比对与中奖计算逻辑
 * 
 * 功能：用户输入自己的投注号码（支持复式），
 * 从官方渠道自动获取最新开奖号码并比对，计算中奖情况。
 * 若自动获取失败，可手动输入开奖号码作为备选。
 */

// ==================== 共享函数 ====================

function comb(n, r) {
    if (r > n || r < 0) return 0;
    if (r === 0 || r === n) return 1;
    let res = 1;
    for (let i = 1; i <= r; i++) res = res * (n - i + 1) / i;
    return Math.round(res);
}

// ==================== API 开奖号码获取 ====================

/** 官方开奖数据API */
/** 500.com API路径（HTML格式） */
const FIFTY_SITE = 'https://datachart.500.com';
const FIFTY_PATHS = {
    ssq: '/ssq/history/newinc/history.php?limit=1',
    kl8: '/kl8/history/newinc/history.php?limit=1',
    qlc: '/qlc/history/newinc/history.php?limit=1',
    dlt: '/dlt/history/newinc/history.php?limit=1',
    qxc: '/qxc/history/newinc/history.php?limit=1'
};

/** 多个 CORS 代理（依次尝试，任一成功即可） */
const PROXY_LIST = [
    u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

/**
 * 获取开奖号码（仅最新期）
 *
 * 策略链：
 *   1. cwl.gov.cn 官方 API  ← 原生支持 CORS（福彩直连可用）
 *   2. CORS 代理 → 500.com  ← 绕过跨域限制
 *   3. 500.com 直连           ← VS Code 预览调试
 */
async function fetchDrawResult(lotteryId) {
    const path = FIFTY_PATHS[lotteryId];
    if (!path) throw new Error('不支持的彩票类型');

    const url500 = `${FIFTY_SITE}${path}`;

    // ① cwl.gov.cn 官方 JSON API（福彩: ssq/qlc/kl8，原生 CORS）
    //    体彩 (dlt/qxc) 会返回 404，自动跳过
    const cwlData = await fetchJson(
        `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=${lotteryId}&issueCount=1`
    );
    if (cwlData && cwlData.state === 0 && cwlData.result && cwlData.result.length > 0) {
        const item = cwlData.result[0];
        return {
            drawIssue: item.code,
            drawDate: (item.date || '').replace(/\([^)]*\)$/, ''),
            groups: parseCWLGroups(lotteryId, item)
        };
    }

    // ② 多个 CORS 代理同时尝试 500.com（并行，取最快成功的）
    const proxyResults = await Promise.allSettled(
        PROXY_LIST.map(build => fetchHtml(build(url500)))
    );
    for (const r of proxyResults) {
        if (r.status === 'fulfilled' && r.value) {
            const p = parse500Result(lotteryId, r.value);
            if (p) return p;
        }
    }

    // ③ 500.com 直连（VS Code 预览调试）
    const html = await fetchHtml(url500);
    if (html) { const p = parse500Result(lotteryId, html); if (p) return p; }

    throw new Error('获取失败，请手动输入开奖号码');
}

/** 从 cwl.gov.cn JSON 中提取开奖号码分组 */
function parseCWLGroups(lotteryId, item) {
    const r = (item.red || '').split(',').filter(Boolean).map(Number);
    const b = (item.blue || '').split(',').filter(Boolean).map(Number);
    switch (lotteryId) {
        case 'ssq': return [
            { key: 'red', nums: r },
            { key: 'blue', nums: b }
        ];
        case 'dlt': return [
            { key: 'front', nums: r },
            { key: 'back', nums: b }
        ];
        case 'qlc': return [
            { key: 'basic', nums: r },
            { key: 'special', nums: b }
        ];
        case 'kl8': return [
            { key: 'numbers', nums: r }
        ];
        case 'qxc': return [
            { key: 'digits', nums: (item.red || '').replace(/\D/g, '').split('').map(Number).slice(0, 7) }
        ];
        default: return [];
    }
}

/** 从 JSON API 获取数据 */
async function fetchJson(url) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    try {
        const resp = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(tm);
        return resp.ok ? await resp.json() : null;
    } catch {
        clearTimeout(tm);
        return null;
    }
}

/** 从 URL 获取 HTML 文本 */
async function fetchHtml(url, timeout = 4000) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), timeout);
    try {
        const resp = await fetch(url, {
            signal: ctrl.signal,
            mode: 'cors',
            headers: { 'Accept': 'text/html' }
        });
        clearTimeout(tm);
        return resp.ok ? await resp.text() : null;
    } catch {
        clearTimeout(tm);
        return null;
    }
}

/** 解析 500.com HTML 表格，提取最新一条开奖数据 */
function parse500Result(lotteryId, html) {
    // 去掉所有 HTML 标签，保留纯文本行
    const rows = html.replace(/<[^>]+>/g, '|').split(/\n/);
    let dataLine = null;
    for (const row of rows) {
        const cells = row.split('|').map(s => s.trim()).filter(Boolean);
        // 数据行特征：第一格是纯数字期号（如 26083）
        if (cells.length >= 8 && /^\d{5,6}$/.test(cells[0])) {
            dataLine = cells;
            break;
        }
    }
    if (!dataLine) return null;

    const common = { drawIssue: dataLine[0], drawDate: dataLine[dataLine.length - 1] || '' };

    switch (lotteryId) {
        case 'ssq':
            return { ...common, groups: [
                { key: 'red', nums: dataLine.slice(1, 7).map(Number) },
                { key: 'blue', nums: [Number(dataLine[7])] }
            ]};
        case 'dlt':
            return { ...common, groups: [
                { key: 'front', nums: dataLine.slice(1, 6).map(Number) },
                { key: 'back', nums: dataLine.slice(6, 8).map(Number) }
            ]};
        case 'qlc':
            return { ...common, groups: [
                { key: 'basic', nums: dataLine.slice(1, 8).map(Number) },
                { key: 'special', nums: [Number(dataLine[8])] }
            ]};
        case 'kl8':
            return { ...common, groups: [
                { key: 'numbers', nums: dataLine.slice(1, 21).map(Number) }
            ]};
        default:
            return null;
    }
}

// ==================== 彩种配置 ====================

const verifyLotteryData = {
    fc: {
        name: '福利彩票',
        lotteries: [
            { id: 'ssq', name: '双色球' },
            { id: 'qlc', name: '七乐彩' },
            { id: 'kl8', name: '快乐8' }
        ]
    },
    tc: {
        name: '体育彩票',
        lotteries: [
            { id: 'dlt', name: '大乐透' },
            { id: 'qxc', name: '七星彩' }
        ]
    }
};

// 各彩种的输入组配置
const verifyTypeConfig = {
    ssq: {
        name: '双色球',
        info: '红球33选6 + 蓝球16选1',
        groups: [
            { key: 'red',  label: '红球', cssClass: 'ball-red',   expected: 6, min: 1, max: 33 },
            { key: 'blue', label: '蓝球', cssClass: 'ball-blue',  expected: 1, min: 1, max: 16 }
        ],
        // 兑奖条件: { rank, red, blue, prize }
        prizes: [
            { rank: '一等奖', red: 6, blue: 1, prize: '浮动奖金' },
            { rank: '二等奖', red: 6, blue: 0, prize: '浮动奖金' },
            { rank: '三等奖', red: 5, blue: 1, prize: 3000 },
            { rank: '四等奖', red: 5, blue: 0, prize: 200 },
            { rank: '四等奖', red: 4, blue: 1, prize: 200 },
            { rank: '五等奖', red: 4, blue: 0, prize: 10 },
            { rank: '五等奖', red: 3, blue: 1, prize: 10 },
            { rank: '六等奖', red: 2, blue: 1, prize: 5 },
            { rank: '六等奖', red: 1, blue: 1, prize: 5 },
            { rank: '六等奖', red: 0, blue: 1, prize: 5 }
        ],
        // 每组选几个号组成一注
        pickCounts: [6, 1]
    },
    dlt: {
        name: '大乐透',
        info: '前区35选5 + 后区12选2',
        groups: [
            { key: 'front', label: '前区', cssClass: 'ball-red',   expected: 5, min: 1, max: 35 },
            { key: 'back',  label: '后区', cssClass: 'ball-blue',  expected: 2, min: 1, max: 12 }
        ],
        prizes: [
            { rank: '一等奖', front: 5, back: 2, prize: '浮动奖金' },
            { rank: '二等奖', front: 5, back: 1, prize: '浮动奖金' },
            { rank: '三等奖', front: 5, back: 0, prize: 10000 },
            { rank: '四等奖', front: 4, back: 2, prize: 3000 },
            { rank: '五等奖', front: 4, back: 1, prize: 300 },
            { rank: '六等奖', front: 3, back: 2, prize: 200 },
            { rank: '七等奖', front: 4, back: 0, prize: 100 },
            { rank: '八等奖', front: 3, back: 1, prize: 15 },
            { rank: '八等奖', front: 2, back: 2, prize: 15 },
            { rank: '九等奖', front: 3, back: 0, prize: 5 },
            { rank: '九等奖', front: 2, back: 1, prize: 5 },
            { rank: '九等奖', front: 1, back: 2, prize: 5 },
            { rank: '九等奖', front: 0, back: 2, prize: 5 }
        ],
        pickCounts: [5, 2]
    },
    qlc: {
        name: '七乐彩',
        info: '从01-30中选7个基本号 + 1个特别号',
        groups: [
            { key: 'basic',  label: '基本号',  cssClass: 'ball-red',   expected: 7, min: 1, max: 30 },
            { key: 'special',label: '特别号',  cssClass: 'ball-orange', expected: 1, min: 1, max: 30 }
        ],
        prizes: [
            { basic: 7, special: 0, rank: '一等奖', prize: '浮动' },
            { basic: 6, special: 1, rank: '二等奖', prize: '浮动' },
            { basic: 6, special: 0, rank: '三等奖', prize: 2000 },
            { basic: 5, special: 1, rank: '四等奖', prize: 500 },
            { basic: 5, special: 0, rank: '五等奖', prize: 50 },
            { basic: 4, special: 1, rank: '六等奖', prize: 10 },
            { basic: 4, special: 0, rank: '七等奖', prize: 5 }
        ],
        pickCounts: [7, 1]
    },
    kl8: {
        name: '快乐8',
        info: '从1-80中任选1-10个号码',
        groups: [
            { key: 'numbers', label: '所选号码', cssClass: 'ball-kl8', expected: 1, min: 1, max: 80 }
        ],
        // 快乐8的玩法由用户选择
        hasPlayType: true,
        prizes: {
            "1-1": 4.6, "2-2": 19, "3-3": 53, "3-2": 3,
            "4-4": 100, "4-3": 5, "4-2": 3,
            "5-5": 1000, "5-4": 21, "5-3": 3,
            "6-6": 3000, "6-5": 30, "6-4": 10, "6-3": 3,
            "7-7": 10000, "7-6": 350, "7-5": 55, "7-4": 10, "7-3": 3,
            "8-8": 15000, "8-7": 800, "8-6": 88, "8-5": 20, "8-4": 3,
            "9-9": 30000, "9-8": 2000, "9-7": 200, "9-6": 45, "9-5": 10, "9-4": 3,
            "10-10": 50000, "10-9": 4000, "10-8": 400, "10-7": 80, "10-6": 25, "10-5": 5
        },
        minPrizeMap: { 1:1, 2:2, 3:2, 4:2, 5:3, 6:3, 7:3, 8:4, 9:4, 10:5 }
    },
    qxc: {
        name: '七星彩',
        info: '7位数字定位匹配，每位0-9',
        groups: [
            { key: 'digits', label: '7位号码', cssClass: 'ball-green', expected: 7, min: 0, max: 9, fixedLength: 7 }
        ],
        prizes: [
            { front: 6, back: 1, rank: '一等奖', prize: '浮动' },
            { front: 6, back: 0, rank: '二等奖', prize: '浮动' },
            { front: 5, back: 1, rank: '三等奖', prize: 3000 },
            { front: 5, back: 0, rank: '四等奖', prize: 500 },
            { front: 4, back: 1, rank: '五等奖', prize: 30 },
            { front: 4, back: 0, rank: '六等奖', prize: 10 },
            { front: 3, back: 1, rank: '六等奖', prize: 10 },
            { front: 2, back: 1, rank: '七等奖', prize: 5 }
        ]
    }
};

// ==================== 工具函数 ====================

/** 解析用户输入的号码字符串为数字数组 */
function parseNumbers(input) {
    if (!input || !input.trim()) return [];
    // 支持逗号、中文逗号、空格、顿号分隔
    const parts = input.trim()
        .replace(/[，、\s]+/g, ',')
        .split(',')
        .filter(Boolean);
    const nums = parts.map(s => parseInt(s.trim(), 10));
    return nums.filter(n => !isNaN(n)).sort((a, b) => a - b);
}

/** 解析七星彩的7位数字（连写或逗号分隔） */
function parseDigits(input) {
    if (!input || !input.trim()) return [];
    const raw = input.trim();
    // 尝试以逗号/空格分隔
    const parts = raw.split(/[，,\s]+/).filter(Boolean);
    if (parts.length >= 7) {
        return parts.slice(0, 7).map(s => parseInt(s, 10));
    }
    // 否则当作连续数字串处理
    const digits = raw.replace(/\D/g, '').split('').map(s => parseInt(s, 10));
    return digits.slice(0, 7);
}

/** 计算两个数组的交集个数 */
function countMatches(myNums, winNums) {
    const winSet = new Set(winNums);
    return myNums.filter(n => winSet.has(n)).length;
}

/** 格式化球显示HTML */
function ballsHTML(nums, cssClass) {
    if (!nums || nums.length === 0) return '<span style="color:#999;font-size:13px;">未输入</span>';
    return nums.map(n => {
        const formatted = n.toString().padStart(2, '0');
        return `<span class="ball ${cssClass}">${formatted}</span>`;
    }).join('');
}

// ==================== 面板切换 ====================

function verifyUpdateLottery() {
    const category = document.getElementById('verify-category').value;
    const select = document.getElementById('verify-lottery');
    select.innerHTML = '';

    if (!category) {
        select.disabled = true;
        select.innerHTML = '<option value="">--请先选择分类--</option>';
        hideAllVerifyPanels();
        return;
    }

    const lotteries = verifyLotteryData[category].lotteries;
    select.disabled = false;
    select.innerHTML = '<option value="">--请选择彩票类型--</option>';
    lotteries.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        select.appendChild(opt);
    });
    hideAllVerifyPanels();
}

function hideAllVerifyPanels() {
    document.querySelectorAll('.lottery-panel').forEach(p => p.classList.remove('active'));
}

function verifySwitchLottery() {
    const id = document.getElementById('verify-lottery').value;
    hideAllVerifyPanels();
    if (!id) return;

    const panel = document.getElementById(`verify-panel-${id}`);
    if (panel) panel.classList.add('active');

    // 清空之前的结果
    document.getElementById('verify-result-section').classList.remove('show');
    document.getElementById('verify-result-section').style.display = 'none';

    // 隐藏所有draw-info，显示当前选中的
    document.querySelectorAll('.draw-info').forEach(el => el.style.display = 'none');
    const drawInfo = document.getElementById(`verify-draw-info-${id}`);
    if (drawInfo) drawInfo.style.display = 'none';
}

// ==================== 快乐8玩法切换 ====================

function verifyKL8PlayChange() {
    const playType = parseInt(document.getElementById('verify-kl8-type').value);
    document.getElementById('verify-kl8-hint').textContent =
        `选${playType}玩法：从1-80中选${playType}个号码，每注2元`;
}

// ==================== 核心核对逻辑 ====================

function verifyCheck() {
    const id = document.getElementById('verify-lottery').value;
    if (!id) { alert('请先选择彩票类型！'); return; }

    const config = verifyTypeConfig[id];
    const resultSection = document.getElementById('verify-result-section');
    const resultContent = document.getElementById('verify-result-content');
    resultSection.style.display = 'block';
    resultSection.classList.add('show');

    if (id === 'kl8') {
        verifyCheckKL8(config, resultContent);
    } else if (id === 'qxc') {
        verifyCheckQXC(config, resultContent);
    } else if (id === 'qlc') {
        verifyCheckQLC(config, resultContent);
    } else if (id === 'ssq') {
        verifyCheckSSQ(config, resultContent);
    } else if (id === 'dlt') {
        verifyCheckDLT(config, resultContent);
    }
}

// ==================== 双色球核对 ====================

function verifyCheckSSQ(config, resultContent) {
    const myReds = parseNumbers(document.getElementById('verify-ssq-red').value);
    const myBlues = parseNumbers(document.getElementById('verify-ssq-blue').value);
    const winReds = parseNumbers(document.getElementById('verify-ssq-win-red').value);
    const winBlues = parseNumbers(document.getElementById('verify-ssq-win-blue').value);

    // 验证
    if (myReds.length < 6 || winReds.length !== 6) {
        resultContent.innerHTML = '<div class="result-summary">❌ 红球至少投注6个，开奖号码必须为6个</div>';
        return;
    }
    if (myBlues.length < 1 || winBlues.length !== 1) {
        resultContent.innerHTML = '<div class="result-summary">❌ 蓝球至少投注1个，开奖号码必须为1个</div>';
        return;
    }

    validateRange(myReds, 1, 33, '红球');
    validateRange(myBlues, 1, 16, '蓝球');
    validateRange(winReds, 1, 33, '开奖红球');
    validateRange(winBlues, 1, 16, '开奖蓝球');

    const redHit = countMatches(myReds, winReds);
    const blueHit = countMatches(myBlues, winBlues);
    const betCount = comb(myReds.length, 6) * comb(myBlues.length, 1);
    const betAmount = betCount * 2;

    renderPrizeResult(config, resultContent, {
        hits: [
            { label: '红球命中', count: redHit, total: myReds.length, css: 'ball-red' },
            { label: '蓝球命中', count: blueHit, total: myBlues.length, css: 'ball-blue' }
        ],
        betCount, betAmount,
        calcFn: (prize) => {
            if (redHit < prize.red || blueHit < prize.blue) return null;
            const cR = comb(redHit, prize.red) * comb(myReds.length - redHit, 6 - prize.red);
            const cB = comb(blueHit, prize.blue) * comb(myBlues.length - blueHit, 1 - prize.blue);
            const bets = cR * cB;
            return bets > 0 ? { bets, prize: prize.prize, display: `${prize.red}红+${prize.blue}蓝` } : null;
        }
    }, config);
}

// ==================== 大乐透核对 ====================

function verifyCheckDLT(config, resultContent) {
    const myFront = parseNumbers(document.getElementById('verify-dlt-front').value);
    const myBack = parseNumbers(document.getElementById('verify-dlt-back').value);
    const winFront = parseNumbers(document.getElementById('verify-dlt-win-front').value);
    const winBack = parseNumbers(document.getElementById('verify-dlt-win-back').value);

    if (myFront.length < 5 || winFront.length !== 5) {
        resultContent.innerHTML = '<div class="result-summary">❌ 前区至少投注5个，开奖号码必须为5个</div>';
        return;
    }
    if (myBack.length < 2 || winBack.length !== 2) {
        resultContent.innerHTML = '<div class="result-summary">❌ 后区至少投注2个，开奖号码必须为2个</div>';
        return;
    }

    const frontHit = countMatches(myFront, winFront);
    const backHit = countMatches(myBack, winBack);
    const betCount = comb(myFront.length, 5) * comb(myBack.length, 2);
    const betAmount = betCount * 2;

    renderPrizeResult(config, resultContent, {
        hits: [
            { label: '前区命中', count: frontHit, total: myFront.length, css: 'ball-red' },
            { label: '后区命中', count: backHit, total: myBack.length, css: 'ball-blue' }
        ],
        betCount, betAmount,
        calcFn: (prize) => {
            if (frontHit < prize.front || backHit < prize.back) return null;
            const cF = comb(frontHit, prize.front) * comb(myFront.length - frontHit, 5 - prize.front);
            const cB = comb(backHit, prize.back) * comb(myBack.length - backHit, 2 - prize.back);
            const bets = cF * cB;
            return bets > 0 ? { bets, prize: prize.prize, display: `${prize.front}前+${prize.back}后` } : null;
        }
    }, config);
}

// ==================== 七乐彩核对 ====================

function verifyCheckQLC(config, resultContent) {
    const myBasic = parseNumbers(document.getElementById('verify-qlc-basic').value);
    const mySpecial = parseNumbers(document.getElementById('verify-qlc-special').value);
    const winBasic = parseNumbers(document.getElementById('verify-qlc-win-basic').value);
    const winSpecial = parseNumbers(document.getElementById('verify-qlc-win-special').value);

    if (myBasic.length < 7 || winBasic.length !== 7) {
        resultContent.innerHTML = '<div class="result-summary">❌ 基本号至少投注7个，开奖基本号必须为7个</div>';
        return;
    }
    if (mySpecial.length < 1 || winSpecial.length !== 1) {
        resultContent.innerHTML = '<div class="result-summary">❌ 特别号至少投注1个，开奖特别号必须为1个</div>';
        return;
    }

    const basicHit = countMatches(myBasic, winBasic);
    const specialHit = countMatches(mySpecial, winSpecial);
    const betCount = comb(myBasic.length, 7) * comb(mySpecial.length, 1);
    const betAmount = betCount * 2;

    // 七乐彩是单式核对（只判断是否中奖，无组合数）
    let html = buildMatchSummary(basicHit, myBasic.length, 'ball-red', '基本号', specialHit, mySpecial.length, 'ball-orange', '特别号');
    html += `<div class="result-summary" style="margin-top:12px;">🎟️ 共 ${betCount} 注，投注金额 ${betAmount} 元</div>`;

    let total = 0;
    let hasWin = false;
    const tableRows = [];

    config.prizes.forEach(p => {
        const hit = (basicHit === p.basic && specialHit === p.special);
        if (!hit) return;
        hasWin = true;
        const prizeVal = typeof p.prize === 'number' ? p.prize : 0;
        total += prizeVal;
        tableRows.push(`<tr>
            <td>${p.rank}</td>
            <td>${p.basic}基本号${p.special ? '+特别号' : ''}</td>
            <td>1</td>
            <td class="${typeof p.prize === 'string' ? 'prize-float' : ''}">${p.prize}</td>
            <td>${prizeVal > 0 ? prizeVal.toFixed(2) : '-'}</td>
        </tr>`);
    });

    if (!hasWin) {
        html += '<div class="result-summary" style="margin-top:12px;">😢 未中奖</div>';
    } else {
        html += `<div class="result-summary" style="margin-top:12px;">
            💰 中奖奖金：<span class="big win">${total.toFixed(2)}</span> 元
            ${total > 0 ? `<br>📉 净赚：<span class="highlight">${total >= betAmount ? '+' : ''}${(total - betAmount).toFixed(2)}</span> 元` : ''}
            <br><small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        </div>`;
        html += `<div class="result-table-wrapper"><table class="result-table">
            <thead><tr><th>奖级</th><th>中奖条件</th><th>中奖注数</th><th>单注奖金(元)</th><th>小计(元)</th></tr></thead>
            <tbody>${tableRows.join('')}</tbody></table></div>`;
    }

    resultContent.innerHTML = html;
}

// ==================== 快乐8核对 ====================

function verifyCheckKL8(config, resultContent) {
    const playType = parseInt(document.getElementById('verify-kl8-type').value);
    const myNums = parseNumbers(document.getElementById('verify-kl8-my').value);
    const winNums = parseNumbers(document.getElementById('verify-kl8-win').value);

    if (myNums.length < playType) {
        resultContent.innerHTML = `<div class="result-summary">❌ 选${playType}玩法至少需要投注${playType}个号码</div>`;
        return;
    }
    if (winNums.length !== 20) {
        resultContent.innerHTML = '<div class="result-summary">❌ 快乐8开奖号码必须为20个</div>';
        return;
    }
    validateRange(myNums, 1, 80, '号码');
    validateRange(winNums, 1, 80, '开奖号码');

    const hits = countMatches(myNums, winNums);
    const nonWin = myNums.length - hits;
    const n = playType;
    const minPrize = config.minPrizeMap[n];
    const betCount = comb(myNums.length, n);
    const betAmount = betCount * 2;

    let html = buildMatchSummary(hits, myNums.length, 'ball-kl8', '号码命中');
    html += `<div class="result-summary" style="margin-top:12px;">🎟️ 玩法：选${n} | 共 ${betCount} 注，投注金额 ${betAmount} 元</div>`;

    let total = 0;
    let hasWin = false;
    const tableRows = [];

    for (let k = n; k >= minPrize; k--) {
        if (hits < k) continue;
        const key = `${n}-${k}`;
        const prizePerBet = config.prizes[key];
        if (prizePerBet === undefined) continue;

        const cHit = comb(hits, k);
        const cNon = comb(nonWin, n - k);
        const bets = cHit * cNon;
        if (bets === 0) continue;

        const subTotal = bets * prizePerBet;
        total += subTotal;
        hasWin = true;
        tableRows.push(`<tr>
            <td>${k}个号</td>
            <td>${bets}</td>
            <td>${prizePerBet}</td>
            <td>${subTotal.toFixed(2)}</td>
        </tr>`);
    }

    if (!hasWin) {
        html += '<div class="result-summary" style="margin-top:12px;">😢 未中奖</div>';
    } else {
        const net = total - betAmount;
        html += `<div class="result-summary" style="margin-top:12px;">
            💰 总奖金：<span class="big win">${total.toFixed(2)}</span> 元
            <br>📉 净赚：<span class="highlight">${net >= 0 ? '+' : ''}${net.toFixed(2)}</span> 元
        </div>`;
        html += `<div class="result-table-wrapper"><table class="result-table">
            <thead><tr><th>中奖个数</th><th>中奖注数</th><th>单注奖金(元)</th><th>小计(元)</th></tr></thead>
            <tbody>${tableRows.join('')}</tbody></table></div>`;
    }

    resultContent.innerHTML = html;
}

// ==================== 七星彩核对 ====================

function verifyCheckQXC(config, resultContent) {
    const myDigits = parseDigits(document.getElementById('verify-qxc-my').value);
    const winDigits = parseDigits(document.getElementById('verify-qxc-win').value);

    if (myDigits.length !== 7) {
        resultContent.innerHTML = '<div class="result-summary">❌ 请输入7位投注号码</div>';
        return;
    }
    if (winDigits.length !== 7) {
        resultContent.innerHTML = '<div class="result-summary">❌ 请输入7位开奖号码</div>';
        return;
    }

    // 前6位匹配数
    let frontHit = 0;
    for (let i = 0; i < 6; i++) {
        if (myDigits[i] === winDigits[i]) frontHit++;
    }
    const backHit = myDigits[6] === winDigits[6] ? 1 : 0;

    let html = buildMatchSummary(frontHit, 6, 'ball-green', '前6位匹配', backHit, 1, 'ball-green', '最后一位');
    html += '<div class="result-summary" style="margin-top:12px;">🎟️ 共 1 注，投注金额 2 元</div>';

    let prizeVal = 0;
    let hasWin = false;
    let matchedRank = '';
    const tableRows = [];

    config.prizes.forEach(p => {
        if (frontHit === p.front && backHit === p.back) {
            hasWin = true;
            matchedRank = p.rank;
            const val = typeof p.prize === 'number' ? p.prize : 0;
            prizeVal = val;
            tableRows.push(`<tr>
                <td>${p.rank}</td>
                <td>前${p.front}位+后${p.back}位</td>
                <td>✅ 中奖</td>
                <td class="${typeof p.prize === 'string' ? 'prize-float' : ''}">${p.prize}</td>
            </tr>`);
        }
    });

    if (!hasWin) {
        html += '<div class="result-summary" style="margin-top:12px;">😢 未中奖</div>';
    } else {
        html += `<div class="result-summary" style="margin-top:12px;">
            💰 中奖奖金（${matchedRank}）：<span class="big win">${prizeVal > 0 ? prizeVal.toFixed(2) + ' 元' : '浮动奖金'}</span>
            ${prizeVal > 0 ? `<br>📉 净赚：<span class="highlight">+${(prizeVal - 2).toFixed(2)}</span> 元` : ''}
            <br><small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        </div>`;
        html += `<div class="result-table-wrapper"><table class="result-table">
            <thead><tr><th>奖级</th><th>中奖条件</th><th>是否中奖</th><th>单注奖金(元)</th></tr></thead>
            <tbody>${tableRows.join('')}</tbody></table></div>`;
    }

    resultContent.innerHTML = html;
}

// ==================== 通用渲染 ====================

/** 构建命中摘要 */
function buildMatchSummary(...items) {
    const total = [];
    for (let i = 0; i < items.length; i += 4) {
        const count = items[i], total_ = items[i+1], css = items[i+2], label = items[i+3] || '';
        total.push(`<span class="ball ${css}" style="display:inline-flex;width:auto;padding:2px 10px;border-radius:12px;font-size:13px;">
            ${count}/${total_} ${label}
        </span>`);
    }
    return `<div class="result-summary" style="margin-top:12px;">
        📊 命中情况：${total.join(' ')}
    </div>`;
}

/** 通用复式奖金渲染（双色球、大乐透） */
function renderPrizeResult(config, resultContent, data) {
    let html = buildMatchSummary(
        data.hits[0].count, data.hits[0].total, data.hits[0].css, data.hits[0].label,
        data.hits[1].count, data.hits[1].total, data.hits[1].css, data.hits[1].label
    );
    html += `<div class="result-summary" style="margin-top:12px;">🎟️ 共 ${data.betCount} 注，投注金额 ${data.betAmount} 元</div>`;

    let total = 0;
    let hasWin = false;
    const tableRows = [];

    config.prizes.forEach(p => {
        const result = data.calcFn(p);
        if (!result) return;
        hasWin = true;
        let subTotal = 0;
        let subDisplay = '-';
        if (typeof result.prize === 'number') {
            subTotal = result.bets * result.prize;
            total += subTotal;
            subDisplay = subTotal.toFixed(2);
        }
        tableRows.push(`<tr>
            <td>${p.rank}</td>
            <td>${result.display}</td>
            <td>${result.bets}</td>
            <td class="${typeof result.prize === 'string' ? 'prize-float' : ''}">${result.prize}</td>
            <td>${subDisplay}</td>
        </tr>`);
    });

    if (!hasWin) {
        html += '<div class="result-summary" style="margin-top:12px;">😢 未中奖</div>';
    } else {
        const net = total - data.betAmount;
        html += `<div class="result-summary" style="margin-top:12px;">
            💰 固定奖金合计：<span class="big win">${total.toFixed(2)}</span> 元
            <br>📉 净赚：<span class="highlight">${net >= 0 ? '+' : ''}${net.toFixed(2)}</span> 元
            <br><small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        </div>`;
        html += `<div class="result-table-wrapper"><table class="result-table">
            <thead><tr><th>奖级</th><th>中奖条件</th><th>中奖注数</th><th>单注奖金(元)</th><th>小计(元)</th></tr></thead>
            <tbody>${tableRows.join('')}</tbody></table></div>`;
    }

    resultContent.innerHTML = html;
}

/** 校验号码范围 */
function validateRange(nums, min, max, label) {
    for (const n of nums) {
        if (n < min || n > max) {
            alert(`❌ ${label}中的 ${n} 超出范围（${min}-${max}）`);
            return;
        }
    }
}

// ==================== 初始化 ====================

/** 当前选中的彩票类型 */
let currentVerifyType = 'ssq';

window.onload = function () {
    document.getElementById('verify-category').value = 'fc';
    verifyUpdateLottery();
    document.getElementById('verify-lottery').value = 'ssq';
    verifySwitchLottery();
};

// ==================== 自动获取开奖号码 ====================

/** 获取开奖号码并自动填入 */
async function fetchDrawAndFill(button) {
    const id = document.getElementById('verify-lottery').value;
    if (!id) { alert('请先选择彩票类型！'); return; }

    // 读取用户输入的期号（可选）
    const issueInput = document.getElementById(`verify-issue-${id}`);
    const issue = issueInput ? issueInput.value.trim() : '';

    const btn = button || document.querySelector(`#verify-panel-${id} .fetch-btn`) || document.querySelector('.fetch-btn');
    const origText = btn ? btn.textContent : '📡 获取开奖';
    if (btn) {
        btn.textContent = '⏳ 获取中...';
        btn.disabled = true;
    }

    try {
        const result = await fetchDrawResult(id);
        fillDrawNumbers(id, result);
        // 显示期号信息
        const issueEl = document.getElementById(`verify-draw-info-${id}`);
        if (issueEl) {
            const label = issue ? `📅 第${result.drawIssue}期` : `📅 最新 ${result.drawIssue}期`;
            issueEl.textContent = `${label} (${result.drawDate})`;
            issueEl.style.display = 'inline';
        }
        if (btn) {
            btn.textContent = '✅ 已获取';
            setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000);
        }
    } catch (e) {
        // 页内提示，不弹 alert，不打断用户操作
        const issueEl = document.getElementById(`verify-draw-info-${id}`);
        if (issueEl) {
            issueEl.textContent = '⚠️ 自动获取不可用，已在右侧预填示例号码，修改后点击"核对中奖"即可';
            issueEl.style.display = 'inline';
            issueEl.style.color = '#e67e22';
            setTimeout(() => {
                issueEl.style.color = '#667eea';
            }, 4000);
        }
        if (btn) {
            btn.textContent = '📡 获取开奖';
            btn.disabled = false;
        }
    }
}

/** 将获取的开奖号码填入对应输入框 */
function fillDrawNumbers(lotteryId, data) {
    switch (lotteryId) {
        case 'ssq': {
            const red = data.groups.find(g => g.key === 'red');
            const blue = data.groups.find(g => g.key === 'blue');
            if (red) document.getElementById('verify-ssq-win-red').value = red.nums.join(',');
            if (blue) document.getElementById('verify-ssq-win-blue').value = blue.nums.join(',');
            break;
        }
        case 'dlt': {
            const front = data.groups.find(g => g.key === 'front');
            const back = data.groups.find(g => g.key === 'back');
            if (front) document.getElementById('verify-dlt-win-front').value = front.nums.join(',');
            if (back) document.getElementById('verify-dlt-win-back').value = back.nums.join(',');
            break;
        }
        case 'qlc': {
            const basic = data.groups.find(g => g.key === 'basic');
            const special = data.groups.find(g => g.key === 'special');
            if (basic) document.getElementById('verify-qlc-win-basic').value = basic.nums.join(',');
            if (special) document.getElementById('verify-qlc-win-special').value = special.nums.join(',');
            break;
        }
        case 'kl8': {
            const nums = data.groups.find(g => g.key === 'numbers');
            if (nums) document.getElementById('verify-kl8-win').value = nums.nums.join(',');
            break;
        }
        case 'qxc': {
            const digits = data.groups.find(g => g.key === 'digits');
            if (digits) document.getElementById('verify-qxc-win').value = digits.nums.join(',');
            break;
        }
    }
}
