/**
 * 彩票查询工具 - 奖金计算逻辑
 */

// ==================== 双色球 ====================

const ssqPrizeConfig = [
    { rank: '一等奖', red: 6, blue: 1, prize: '浮动奖金' },
    { rank: '二等奖', red: 6, blue: 0, prize: '浮动奖金' },
    { rank: '三等奖', red: 5, blue: 1, prize: 3000 },
    { rank: '四等奖', red: 5, blue: 0, prize: 200 },
    { rank: '四等奖', red: 4, blue: 1, prize: 200 },
    { rank: '五等奖', red: 4, blue: 0, prize: 10 },
    { rank: '五等奖', red: 3, blue: 1, prize: 10 },
    { rank: '六等奖', red: 2, blue: 1, prize: 5 },
    { rank: '六等奖', red: 1, blue: 1, prize: 5 },
    { rank: '六等奖', red: 0, blue: 1, prize: 5 },
    // 派奖活动（奖池≥15亿时）：3+0也可中5元
    { rank: '福运奖(奖池≥15亿)', red: 3, blue: 0, prize: 5 }
];

function ssqShowPrizeList() {
    const tbody = document.getElementById("ssq-list");
    ssqPrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td><span class="red-ball">${item.red}红</span>+<span class="blue-ball">${item.blue}蓝</span></td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcSSQ() {
    const redCount = parseInt(document.getElementById("ssq-red").value) || 6;
    const blueCount = parseInt(document.getElementById("ssq-blue").value) || 1;
    const redHit = parseInt(document.getElementById("ssq-red-hit").value) || 0;
    const blueHit = parseInt(document.getElementById("ssq-blue-hit").value) || 0;

    const resultDiv = document.getElementById("result-ssq");
    const detailTable = document.getElementById("detail-ssq");
    const detailBody = document.getElementById("detail-body-ssq");
    detailBody.innerHTML = "";

    if (isNaN(redCount) || isNaN(blueCount) || isNaN(redHit) || isNaN(blueHit)) {
        resultDiv.innerText = "❌ 请输入有效的数字！";
        detailTable.style.display = "none";
        return;
    }
    if (redCount < 6 || redCount > 20) {
        resultDiv.innerText = "❌ 红球个数应在6-20之间！";
        detailTable.style.display = "none";
        return;
    }
    if (blueCount < 1 || blueCount > 16) {
        resultDiv.innerText = "❌ 蓝球个数应在1-16之间！";
        detailTable.style.display = "none";
        return;
    }
    if (redHit < 0 || redHit > redCount) {
        resultDiv.innerText = "❌ 红球中奖个数应在0-" + redCount + "之间！";
        detailTable.style.display = "none";
        return;
    }
    if (blueHit < 0 || blueHit > blueCount) {
        resultDiv.innerText = "❌ 蓝球中奖个数应在0-" + blueCount + "之间！";
        detailTable.style.display = "none";
        return;
    }

    const betCount = comb(redCount, 6) * comb(blueCount, 1);
    const betAmount = betCount * 2;

    let total = 0;
    let hasAny = false;

    ssqPrizeConfig.forEach(config => {
        if (redHit < config.red || blueHit < config.blue) return;

        const cRed = comb(redHit, config.red);
        const cRedMiss = comb(redCount - redHit, 6 - config.red);
        const cBlue = comb(blueHit, config.blue);
        const cBlueMiss = comb(blueCount - blueHit, 1 - config.blue);

        const bets = cRed * cRedMiss * cBlue * cBlueMiss;
        if (bets === 0) return;

        hasAny = true;
        let subTotal = 0;
        let prizeDisplay = config.prize;
        let subTotalDisplay = '-';

        if (typeof config.prize === 'number') {
            subTotal = bets * config.prize;
            total += subTotal;
            subTotalDisplay = subTotal.toFixed(2);
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${config.rank}</td>
            <td><span class="red-ball">${config.red}</span>红+<span class="blue-ball">${config.blue}</span>蓝</td>
            <td>${bets}</td>
            <td class="${typeof config.prize === 'string' ? 'prize-float' : ''}">${prizeDisplay}</td>
            <td>${subTotalDisplay}</td>
        `;
        detailBody.appendChild(tr);
    });

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：${betAmount} 元<br>😢 未中奖<br>`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：${betAmount} 元<br>
            💰 固定奖金合计：${total.toFixed(2)} 元<br>
            📉 净赚：${total >= betAmount ? '+' : ''}${(total - betAmount).toFixed(2)} 元<br>
            <small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 大乐透 ====================

const dltPrizeConfig = [
    { rank: "一等奖", front: 5, back: 2, prize: "浮动奖金" },
    { rank: "二等奖", front: 5, back: 1, prize: "浮动奖金" },
    { rank: "三等奖", front: 5, back: 0, prize: 10000 },
    { rank: "四等奖", front: 4, back: 2, prize: 3000 },
    { rank: "五等奖", front: 4, back: 1, prize: 300 },
    { rank: "六等奖", front: 3, back: 2, prize: 200 },
    { rank: "七等奖", front: 4, back: 0, prize: 100 },
    { rank: "八等奖", front: 3, back: 1, prize: 15 },
    { rank: "八等奖", front: 2, back: 2, prize: 15 },
    { rank: "九等奖", front: 3, back: 0, prize: 5 },
    { rank: "九等奖", front: 2, back: 1, prize: 5 },
    { rank: "九等奖", front: 1, back: 2, prize: 5 },
    { rank: "九等奖", front: 0, back: 2, prize: 5 }
];

function dltShowPrizeList() {
    const tbody = document.getElementById("dlt-list");
    dltPrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td><span class="red-ball">${item.front}前</span>+<span class="blue-ball">${item.back}后</span></td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcDLT() {
    const frontCount = parseInt(document.getElementById("dlt-front").value) || 5;
    const backCount = parseInt(document.getElementById("dlt-back").value) || 2;
    const frontHit = parseInt(document.getElementById("dlt-front-hit").value) || 0;
    const backHit = parseInt(document.getElementById("dlt-back-hit").value) || 0;

    const resultDiv = document.getElementById("result-dlt");
    const detailTable = document.getElementById("detail-dlt");
    const detailBody = document.getElementById("detail-body-dlt");
    detailBody.innerHTML = "";

    if (isNaN(frontCount) || isNaN(backCount) || isNaN(frontHit) || isNaN(backHit)) {
        resultDiv.innerText = "❌ 请输入有效的数字！";
        detailTable.style.display = "none";
        return;
    }
    if (frontCount < 5 || frontCount > 12) {
        resultDiv.innerText = "❌ 前区个数应在5-12之间！";
        detailTable.style.display = "none";
        return;
    }
    if (backCount < 2 || backCount > 12) {
        resultDiv.innerText = "❌ 后区个数应在2-12之间！";
        detailTable.style.display = "none";
        return;
    }
    if (frontHit < 0 || frontHit > frontCount) {
        resultDiv.innerText = "❌ 前区中奖个数应在0-" + frontCount + "之间！";
        detailTable.style.display = "none";
        return;
    }
    if (backHit < 0 || backHit > backCount) {
        resultDiv.innerText = "❌ 后区中奖个数应在0-" + backCount + "之间！";
        detailTable.style.display = "none";
        return;
    }

    const betCount = comb(frontCount, 5) * comb(backCount, 2);
    const betAmount = betCount * 2;

    let total = 0;
    let hasAny = false;

    dltPrizeConfig.forEach(config => {
        if (frontHit < config.front || backHit < config.back) return;

        const cFront = comb(frontHit, config.front);
        const cFrontMiss = comb(frontCount - frontHit, 5 - config.front);
        const cBack = comb(backHit, config.back);
        const cBackMiss = comb(backCount - backHit, 2 - config.back);

        const bets = cFront * cFrontMiss * cBack * cBackMiss;
        if (bets === 0) return;

        hasAny = true;
        let subTotal = 0;
        let prizeDisplay = config.prize;
        let subTotalDisplay = '-';

        if (typeof config.prize === 'number') {
            subTotal = bets * config.prize;
            total += subTotal;
            subTotalDisplay = subTotal.toFixed(2);
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${config.rank}</td>
            <td><span class="red-ball">${config.front}</span>前+<span class="blue-ball">${config.back}</span>后</td>
            <td>${bets}</td>
            <td class="${typeof config.prize === 'string' ? 'prize-float' : ''}">${prizeDisplay}</td>
            <td>${subTotalDisplay}</td>
        `;
        detailBody.appendChild(tr);
    });

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：${betAmount} 元<br>😢 未中奖<br>`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：${betAmount} 元<br>
            💰 固定奖金合计：${total.toFixed(2)} 元<br>
            📉 净赚：${total >= betAmount ? '+' : ''}${(total - betAmount).toFixed(2)} 元<br>
            <small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 快乐8 ====================

const kl8PrizeTable = {
    "1-1": 4.6,
    "2-2": 19,
    "3-3": 53,
    "3-2": 3,
    "4-4": 100,
    "4-3": 5,
    "4-2": 3,
    "5-5": 1000,
    "5-4": 21,
    "5-3": 3,
    "6-6": 3000,
    "6-5": 30,
    "6-4": 10,
    "6-3": 3,
    "7-7": 10000,
    "7-6": 350,
    "7-5": 55,
    "7-4": 10,
    "7-3": 3,
    "8-8": 15000,
    "8-7": 800,
    "8-6": 88,
    "8-5": 20,
    "8-4": 3,
    "9-9": 30000,
    "9-8": 2000,
    "9-7": 200,
    "9-6": 45,
    "9-5": 10,
    "9-4": 3,
    "10-10": 50000,
    "10-9": 4000,
    "10-8": 400,
    "10-7": 80,
    "10-6": 25,
    "10-5": 5
};

const kl8MinPrizeMap = {
    1: 1, 2: 2, 3: 2, 4: 2, 5: 3,
    6: 3, 7: 3, 8: 4, 9: 4, 10: 5
};

function kl8ShowPrizeList() {
    const tbody = document.getElementById("kl8-list");
    for (let i = 1; i <= 10; i++) {
        for (let j = i; j >= 0; j--) {
            const key = `${i}-${j}`;
            const prize = kl8PrizeTable[key];
            if (prize === undefined) continue;
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>选${i}</td><td>${j}</td><td>${prize}</td>`;
            tbody.appendChild(tr);
        }
    }
}

function calcKL8() {
    const playType = parseInt(document.getElementById("kl8-type").value) || 4;
    const numBets = parseInt(document.getElementById("kl8-bets").value) || 6;
    const numHits = parseInt(document.getElementById("kl8-hits").value) || 3;

    const resultDiv = document.getElementById("result-kl8");
    const detailTable = document.getElementById("detail-kl8");
    const detailBody = document.getElementById("detail-body-kl8");
    detailBody.innerHTML = "";

    if (isNaN(playType) || isNaN(numBets) || isNaN(numHits)) {
        resultDiv.innerText = "❌ 请输入有效的数字！";
        detailTable.style.display = "none";
        return;
    }
    if (playType < 1 || playType > 10) {
        resultDiv.innerText = "❌ 玩法应在1-10之间！";
        detailTable.style.display = "none";
        return;
    }
    if (numBets < playType) {
        resultDiv.innerText = "❌ 复式号码个数不能小于玩法数字！";
        detailTable.style.display = "none";
        return;
    }
    if (numHits < 0 || numHits > numBets) {
        resultDiv.innerText = "❌ 中奖个数应在0-" + numBets + "之间！";
        detailTable.style.display = "none";
        return;
    }

    const nonWin = numBets - numHits;
    const n = playType;
    const minPrize = kl8MinPrizeMap[n];

    let total = 0;
    let hasAny = false;

    const betCount = comb(numBets, n);
    const betAmount = betCount * 2;

    for (let k = n; k >= minPrize; k--) {
        if (numHits < k) continue;
        const key = `${n}-${k}`;
        const prizePerBet = kl8PrizeTable[key];
        if (prizePerBet === undefined) continue;

        const cHit = comb(numHits, k);
        const cNon = comb(nonWin, n - k);
        const bets = cHit * cNon;
        if (bets === 0) continue;

        const subTotal = bets * prizePerBet;
        total += subTotal;
        hasAny = true;

        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${k}个号</td><td>${bets}</td><td>${prizePerBet}</td><td>${subTotal.toFixed(2)}</td>`;
        detailBody.appendChild(tr);
    }

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：${betAmount} 元<br>😢 未中奖<br>`;
        detailTable.style.display = "none";
    } else {
        const netProfit = total - betAmount;
        resultDiv.innerHTML = `
            🎟️ 投注金额：${betAmount} 元<br>
            💰 总奖金（税前）：${total.toFixed(2)} 元<br>
            📉 净赚：${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} 元
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 七乐彩 ====================
// 官方奖级（已修正）：去除错误的3+1奖级
const qlcPrizeConfig = [
    { basic: 7, special: 0, rank: '一等奖', prize: '浮动' },
    { basic: 6, special: 1, rank: '二等奖', prize: '浮动' },
    { basic: 6, special: 0, rank: '三等奖', prize: 2000 },
    { basic: 5, special: 1, rank: '四等奖', prize: 500 },
    { basic: 5, special: 0, rank: '五等奖', prize: 50 },
    { basic: 4, special: 1, rank: '六等奖', prize: 10 },
    { basic: 4, special: 0, rank: '七等奖', prize: 5 }
    // ⚠️ 已删除原代码中错误的 { basic: 3, special: 1, rank: '七等奖', prize: 5 }
    // 七乐彩官方规则中无"3个基本号+特别号"的奖级
];

function qlcShowPrizeList() {
    const tbody = document.getElementById("qlc-list");
    qlcPrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        let condition = `${item.basic}个基本号`;
        if (item.special === 1) condition += '+特别号';
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${condition}</td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcQLC() {
    const basicHit = parseInt(document.getElementById("qlc-basic-hit").value) || 0;
    const specialHit = parseInt(document.getElementById("qlc-special-hit").value) || 0;

    const resultDiv = document.getElementById("result-qlc");
    const detailTable = document.getElementById("detail-qlc");
    const detailBody = document.getElementById("detail-body-qlc");
    detailBody.innerHTML = "";

    if (isNaN(basicHit) || basicHit < 0 || basicHit > 7) {
        resultDiv.innerText = "❌ 中奖基本号个数应在0-7之间！";
        detailTable.style.display = "none";
        return;
    }
    if (specialHit !== 0 && specialHit !== 1) {
        resultDiv.innerText = "❌ 特别号是否中奖应为0或1！";
        detailTable.style.display = "none";
        return;
    }

    const betAmount = 2;
    let prizeValue = 0;
    let hasAny = false;
    let matchedRank = '';

    qlcPrizeConfig.forEach(config => {
        const isWinner = (basicHit === config.basic && specialHit === config.special);
        if (!isWinner) return;

        hasAny = true;
        matchedRank = config.rank;
        const displayPrize = config.prize;

        const tr = document.createElement("tr");
        let condition = `${config.basic}个基本号`;
        if (config.special === 1) condition += '+特别号';
        tr.innerHTML = `
            <td>${config.rank}</td>
            <td>${condition}</td>
            <td>✅ 中奖</td>
            <td class="${typeof config.prize === 'string' ? 'prize-float' : ''}">${displayPrize}</td>
        `;
        detailBody.appendChild(tr);

        if (typeof config.prize === 'number') {
            prizeValue = config.prize;
        }
    });

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：2 元<br>😢 未中奖`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：2 元<br>
            💰 中奖奖金（${matchedRank}）：${prizeValue > 0 ? prizeValue.toFixed(2) : '浮动'} 元<br>
            ${prizeValue > 0 ? '📉 净赚：+' + (prizeValue - 2).toFixed(2) + ' 元' : ''}<br>
            <small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 七星彩 ====================
// 注：七星彩2020年改版后为"7位数字定位匹配"，此处按组合匹配方式（前6位+后1位）简化计算
const qxcPrizeConfig = [
    { front: 6, back: 1, rank: '一等奖', prize: '浮动' },
    { front: 6, back: 0, rank: '二等奖', prize: '浮动' },
    { front: 5, back: 1, rank: '三等奖', prize: 3000 },
    { front: 5, back: 0, rank: '四等奖', prize: 500 },
    { front: 4, back: 1, rank: '五等奖', prize: 30 },
    { front: 4, back: 0, rank: '六等奖', prize: 10 },
    { front: 3, back: 1, rank: '六等奖', prize: 10 },
    { front: 2, back: 1, rank: '七等奖', prize: 5 }
];

function qxcShowPrizeList() {
    const tbody = document.getElementById("qxc-list");
    qxcPrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td><span class="red-ball">前${item.front}位</span>+<span class="blue-ball">后${item.back}位</span></td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcQXC() {
    const frontHit = parseInt(document.getElementById("qxc-front-hit")?.value) || 3;
    const backHit = parseInt(document.getElementById("qxc-back-hit")?.value) || 1;

    const resultDiv = document.getElementById("result-qxc");
    const detailTable = document.getElementById("detail-qxc");
    const detailBody = document.getElementById("detail-body-qxc");
    
    if (!resultDiv || !detailTable || !detailBody) {
        // 如果七星彩面板不存在，忽略
        return;
    }
    detailBody.innerHTML = "";

    if (isNaN(frontHit) || isNaN(backHit)) {
        resultDiv.innerText = "❌ 请输入有效的数字！";
        detailTable.style.display = "none";
        return;
    }
    if (frontHit < 0 || frontHit > 6) {
        resultDiv.innerText = "❌ 前6位匹配个数应在0-6之间！";
        detailTable.style.display = "none";
        return;
    }
    if (backHit < 0 || backHit > 1) {
        resultDiv.innerText = "❌ 最后一位匹配应为0或1！";
        detailTable.style.display = "none";
        return;
    }

    const betAmount = 2;
    let prizeValue = 0;
    let hasAny = false;
    let matchedRank = '';

    qxcPrizeConfig.forEach(config => {
        if (frontHit === config.front && backHit === config.back) {
            hasAny = true;
            matchedRank = config.rank;
            const displayPrize = config.prize;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${config.rank}</td>
                <td><span class="red-ball">前${config.front}位</span>+<span class="blue-ball">后${config.back}位</span></td>
                <td>✅ 中奖</td>
                <td class="${typeof config.prize === 'string' ? 'prize-float' : ''}">${displayPrize}</td>
            `;
            detailBody.appendChild(tr);

            if (typeof config.prize === 'number') {
                prizeValue = config.prize;
            }
        }
    });

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：2 元<br>😢 未中奖`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：2 元<br>
            💰 中奖奖金（${matchedRank}）：${prizeValue > 0 ? prizeValue.toFixed(2) + ' 元' : '浮动奖金'}<br>
            ${prizeValue > 0 ? '📉 净赚：+' + (prizeValue - 2).toFixed(2) + ' 元' : ''}<br>
            <small style="color:#888;">注：一、二等奖为浮动奖金，需按开奖公告实际派发为准</small>
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 福彩3D ====================
// 规则：从000-999选一个3位数，直选1040元，组三346元，组六173元
const fc3dPrizeConfig = [
    { rank: '直选（定位）', match: 3, prize: 1040, desc: '3位全中且顺序一致' },
    { rank: '组选三', match: 3, prize: 346, desc: '3个号全中(有重复数字,不排序)' },
    { rank: '组选六', match: 3, prize: 173, desc: '3个号全中(无重复数字,不排序)' }
];

function fc3dShowPrizeList() {
    const tbody = document.getElementById("fc3d-list");
    if (!tbody) return;
    fc3dPrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${item.desc}</td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcFC3D() {
    const matchCount = parseInt(document.getElementById("fc3d-match").value) || 0;
    const hasRepeat = document.getElementById("fc3d-repeat")?.value === "1";

    const resultDiv = document.getElementById("result-fc3d");
    const detailTable = document.getElementById("detail-fc3d");
    const detailBody = document.getElementById("detail-body-fc3d");
    detailBody.innerHTML = "";

    if (isNaN(matchCount) || matchCount < 0 || matchCount > 3) {
        resultDiv.innerText = "❌ 匹配个数应在0-3之间！";
        detailTable.style.display = "none";
        return;
    }

    const betAmount = 2;
    let prizeValue = 0;
    let matchedRank = '';
    let hasAny = false;

    if (matchCount === 3) {
        // 直选
        hasAny = true;
        matchedRank = '直选（定位）';
        prizeValue = 1040;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>直选（定位）</td><td>3位全中且顺序一致</td><td>✅ 中奖</td><td>1040 元</td>`;
        detailBody.appendChild(tr);

        // 组选
        if (hasRepeat) {
            const tr2 = document.createElement("tr");
            tr2.innerHTML = `<td>组选三</td><td>3个号全中(有重复)</td><td>✅ 中奖</td><td>346 元</td>`;
            detailBody.appendChild(tr2);
        } else {
            const tr2 = document.createElement("tr");
            tr2.innerHTML = `<td>组选六</td><td>3个号全中(无重复)</td><td>✅ 中奖</td><td>173 元</td>`;
            detailBody.appendChild(tr2);
        }
    }

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：2 元<br>😢 未中奖`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：2 元<br>
            💰 中奖奖金（${matchedRank}）：${prizeValue} 元<br>
            📉 净赚：+${(prizeValue - 2).toFixed(2)} 元
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 排列3 ====================
// 规则同福彩3D
const pl3PrizeConfig = fc3dPrizeConfig;

function pl3ShowPrizeList() {
    const tbody = document.getElementById("pl3-list");
    if (!tbody) return;
    pl3PrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${item.desc}</td>
            <td>${item.prize}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcPL3() {
    const matchCount = parseInt(document.getElementById("pl3-match").value) || 0;
    const hasRepeat = document.getElementById("pl3-repeat")?.value === "1";

    const resultDiv = document.getElementById("result-pl3");
    const detailTable = document.getElementById("detail-pl3");
    const detailBody = document.getElementById("detail-body-pl3");
    detailBody.innerHTML = "";

    if (isNaN(matchCount) || matchCount < 0 || matchCount > 3) {
        resultDiv.innerText = "❌ 匹配个数应在0-3之间！";
        detailTable.style.display = "none";
        return;
    }

    const betAmount = 2;
    let prizeValue = 0;
    let matchedRank = '';
    let hasAny = false;

    if (matchCount === 3) {
        hasAny = true;
        matchedRank = '直选（定位）';
        prizeValue = 1040;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>直选（定位）</td><td>3位全中且顺序一致</td><td>✅ 中奖</td><td>1040 元</td>`;
        detailBody.appendChild(tr);

        if (hasRepeat) {
            const tr2 = document.createElement("tr");
            tr2.innerHTML = `<td>组选三</td><td>3个号全中(有重复)</td><td>✅ 中奖</td><td>346 元</td>`;
            detailBody.appendChild(tr2);
        } else {
            const tr2 = document.createElement("tr");
            tr2.innerHTML = `<td>组选六</td><td>3个号全中(无重复)</td><td>✅ 中奖</td><td>173 元</td>`;
            detailBody.appendChild(tr2);
        }
    }

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：2 元<br>😢 未中奖`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：2 元<br>
            💰 中奖奖金（${matchedRank}）：${prizeValue} 元<br>
            📉 净赚：+${(prizeValue - 2).toFixed(2)} 元
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 排列5 ====================
// 规则：从00000-99999选一个5位数，直选10万元
const pl5PrizeConfig = [
    { rank: '一等奖', match: 5, prize: 100000, desc: '5位全中且顺序一致' }
];

function pl5ShowPrizeList() {
    const tbody = document.getElementById("pl5-list");
    if (!tbody) return;
    pl5PrizeConfig.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${item.desc}</td>
            <td>${item.prize.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcPL5() {
    const matchCount = parseInt(document.getElementById("pl5-match").value) || 0;

    const resultDiv = document.getElementById("result-pl5");
    const detailTable = document.getElementById("detail-pl5");
    const detailBody = document.getElementById("detail-body-pl5");
    detailBody.innerHTML = "";

    if (isNaN(matchCount) || matchCount < 0 || matchCount > 5) {
        resultDiv.innerText = "❌ 匹配个数应在0-5之间！";
        detailTable.style.display = "none";
        return;
    }

    const betAmount = 2;
    let prizeValue = 0;
    let hasAny = false;

    if (matchCount === 5) {
        hasAny = true;
        prizeValue = 100000;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>一等奖</td><td>5位全中且顺序一致</td><td>✅ 中奖</td><td>100,000 元</td>`;
        detailBody.appendChild(tr);
    }

    if (!hasAny) {
        resultDiv.innerHTML = `🎟️ 投注金额：2 元<br>😢 未中奖`;
        detailTable.style.display = "none";
    } else {
        resultDiv.innerHTML = `
            🎟️ 投注金额：2 元<br>
            💰 中奖奖金（一等奖）：${prizeValue.toLocaleString()} 元<br>
            📉 净赚：+${(prizeValue - 2).toFixed(2)} 元
        `;
        detailTable.style.display = "table";
    }
}

// ==================== 面板切换 ====================

let currentLottery = null;

function updateLotterySelect() {
    const categorySelect = document.getElementById('category-select');
    const lotterySelect = document.getElementById('lottery-select');
    const category = categorySelect.value;

    lotterySelect.innerHTML = '';

    if (!category) {
        lotterySelect.disabled = true;
        lotterySelect.innerHTML = '<option value="">--请先选择分类--</option>';
        hideAllPanels();
        return;
    }

    const lotteries = lotteryData[category].lotteries;
    lotterySelect.disabled = false;
    lotterySelect.innerHTML = '<option value="">--请选择彩票类型--</option>';

    lotteries.forEach(lottery => {
        const option = document.createElement('option');
        option.value = lottery.id;
        option.textContent = lottery.name;
        lotterySelect.appendChild(option);
    });

    hideAllPanels();
}

function hideAllPanels() {
    document.querySelectorAll('.lottery-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.prize-wrapper').forEach(table => {
        table.style.display = 'none';
    });
}

function switchLottery() {
    const lotterySelect = document.getElementById('lottery-select');
    const lotteryId = lotterySelect.value;

    hideAllPanels();
    if (!lotteryId) return;

    currentLottery = lotteryId;

    const panel = document.getElementById(`panel-${lotteryId}`);
    if (panel) panel.classList.add('active');

    const table = document.getElementById(`table-${lotteryId}`);
    if (table) table.style.display = 'block';

    const resultDiv = document.getElementById(`result-${lotteryId}`);
    if (resultDiv) resultDiv.innerHTML = '请在上方输入后点击计算';

    const detailTable = document.getElementById(`detail-${lotteryId}`);
    if (detailTable) detailTable.style.display = 'none';
}

// ==================== 初始化 ====================

window.onload = function () {
    ssqShowPrizeList();
    dltShowPrizeList();
    kl8ShowPrizeList();
    qlcShowPrizeList();
    qxcShowPrizeList();
    fc3dShowPrizeList();
    pl3ShowPrizeList();
    pl5ShowPrizeList();

    document.getElementById('category-select').value = 'fc';
    updateLotterySelect();
    document.getElementById('lottery-select').value = 'ssq';
    switchLottery();
};
