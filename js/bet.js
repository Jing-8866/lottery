/**
 * 投注工具 - 号码生成逻辑（智能版）
 * 
 * 核心设计理念：模拟真实开奖号码的统计特征，不再是纯随机数
 * 
 * 智能策略:
 * 1. 区间分布 - 号码按区间均匀分布，避免扎堆
 * 2. 奇偶平衡 - 随机选择合理奇偶比（3:3/4:2/2:4等）
 * 3. 和值约束 - 号码和值控制在历史常见范围内
 * 4. 连号控制 - 最多允许2连号，杜绝3+连号
 * 5. 跨度控制 - 首尾号间距保持在合理范围
 * 6. 多策略随机 - 每次从多种生成策略中随机选择一种
 */

// ==================== 彩种配置 ====================

const lotteryConfig = {
    shuangseqiu: {
        name: '双色球',
        groups: [
            { key: 'red',  label: '红球', cssClass: 'mini-ball-red',   min: 1, max: 33, count: 6 },
            { key: 'blue', label: '蓝球', cssClass: 'mini-ball-blue',  min: 1, max: 16, count: 1 }
        ],
        // 红球区间划分（三区）
        zones: [[1,11], [12,22], [23,33]],
        // 红球合理和值范围
        sumRange: [80, 140],
        // 合理奇偶比组合（格式：[奇数个数, 偶数个数]）
        parityRatios: [[3,3], [4,2], [2,4], [5,1], [1,5]],
        // 合理跨度范围（最大号-最小号）
        spanRange: [18, 30]
    },
    daletou: {
        name: '大乐透',
        groups: [
            { key: 'front', label: '前区', cssClass: 'mini-ball-red',  min: 1, max: 35, count: 5 },
            { key: 'back',  label: '后区', cssClass: 'mini-ball-blue', min: 1, max: 12, count: 2 }
        ],
        zones: [[1,12], [13,24], [25,35]],
        sumRange: [50, 120],
        parityRatios: [[3,2], [2,3], [4,1], [1,4]],
        spanRange: [18, 32]
    },
    qilecai: {
        name: '七乐彩',
        groups: [
            { key: 'red',   label: '基本号', cssClass: 'mini-ball-red',    min: 1, max: 30, count: 7 },
            { key: 'blue',  label: '特别号', cssClass: 'mini-ball-orange', min: 1, max: 12, count: 1 }
        ],
        zones: [[1,10], [11,20], [21,30]],
        sumRange: [80, 150],
        parityRatios: [[4,3], [3,4], [5,2], [2,5]],
        spanRange: [18, 28]
    },
    kuail8: {
        name: '快乐8',
        cssClass: 'mini-ball-kl8',
        zones: [[1,20], [21,40], [41,60], [61,80]],
        plays: {
            1:  { name: '选一', count: 1 },
            2:  { name: '选二', count: 2 },
            3:  { name: '选三', count: 3 },
            4:  { name: '选四', count: 4 },
            5:  { name: '选五', count: 5 },
            6:  { name: '选六', count: 6 },
            7:  { name: '选七', count: 7 },
            8:  { name: '选八', count: 8 },
            9:  { name: '选九', count: 9 },
            10: { name: '选十', count: 10 }
        }
    }
};

// ==================== 工具函数 ====================

/** 号码格式化：补零到两位数 */
function fmt(n) {
    return n.toString().padStart(2, '0');
}

/** 生成单个球的 HTML */
function ballHTML(n, cssClass) {
    return `<div class="mini-ball ${cssClass}">${fmt(n)}</div>`;
}

/** 从数组中随机取一个元素 */
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 洗牌算法，返回新数组 */
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
// ==================== 历史走势数据加载 ====================

/** 投注类型 → JSON 文件映射 */
const BET_DATA_MAP = {
    shuangseqiu: { file: 'ssq.json', groups: [
        { key: 'red',  field: 'red' },
        { key: 'blue', field: 'blue' }
    ]},
    daletou: { file: 'dlt.json', groups: [
        { key: 'front', field: 'red' },
        { key: 'back',  field: 'blue' }
    ]},
    qilecai: { file: 'qlc.json', groups: [
        { key: 'basic',  field: 'red' },
        { key: 'special',field: 'blue' }
    ]},
    kuail8: { file: 'kl8.json', groups: [
        { key: 'numbers', field: 'red' }
    ]}
};

/** 缓存已加载的历史数据，避免重复请求 */
let historyDataCache = {};

/**
 * 加载某个彩种的历史开奖数据（并行尝试本地和远程，最快响应优先）。
 * 支持并发共享：多个调用同时请求同一彩种时只发起一次网络请求。
 * @param {string} betType  投注工具中的彩种 ID（如 shuangseqiu）
 * @returns {Promise<object[]>} 历史数据数组（最新期在前）
 */
async function loadHistoryData(betType) {
    const map = BET_DATA_MAP[betType];
    if (!map) return [];

    const localUrl = `${DATA_PATH_LOCAL}/${map.file}`;
    const remoteUrl = `${DATA_PATH_REMOTE}/${map.file}`;

    const resp = await fastestFetch(localUrl, remoteUrl);
    if (!resp) return [];

    try {
        const json = await resp.json();
        const data = json.data || [];
        if (data.length > 0) {
            localStorage.setItem('lottery-' + map.file, JSON.stringify(json));
        }
        return data;
    } catch {
        return [];
    }
}

/**
 * 分析某个号码组的历史频率
 * @param {object[]} history  历史数据数组
 * @param {string} field      JSON 中的字段名（如 'red'）
 * @param {number} [limit]    只分析最近 N 期
 * @returns {Map<number, number>} 号码 → 出现次数
 */
function analyzeFrequencies(history, field, limit) {
    const freq = new Map();
    const items = limit ? history.slice(0, limit) : history;

    for (const item of items) {
        const nums = item[field];
        if (!Array.isArray(nums)) continue;
        for (const n of nums) {
            const num = parseInt(n, 10);
            if (!isNaN(num)) {
                freq.set(num, (freq.get(num) || 0) + 1);
            }
        }
    }
    return freq;
}

/**
 * 计算每个号码的"冷热值" — 最近出现越少值越高（越冷）
 * @param {object[]} history  历史数据
 * @param {string} field      字段名
 * @param {number} totalRange 号码总数范围（如 33）
 * @param {number} [recent]   近期窗口期数
 * @returns {Map<number, number>} 号码 → 冷热评分（越高越冷）
 */
function analyzeColdHot(history, field, totalRange, recent = 20) {
    const scores = new Map();
    for (let i = 1; i <= totalRange; i++) scores.set(i, 0);

    if (!history || history.length === 0) return scores;

    // 近期权重高，远期权重低
    const maxLookback = Math.min(history.length, 100);
    for (let idx = 0; idx < maxLookback; idx++) {
        const item = history[idx];
        const nums = item[field];
        if (!Array.isArray(nums)) continue;

        // 越近权重越大：第0期权重=100，第99期权重=1
        const weight = Math.max(1, 100 - idx);
        for (const n of nums) {
            const num = parseInt(n, 10);
            if (!isNaN(num) && scores.has(num)) {
                scores.set(num, scores.get(num) + weight);
            }
        }
    }

    // 归一化：出现越多分数越高 → 热号分高，冷号分低
    // 转换为冷热值：返回原始的频率分数即可
    return scores;
}

/** 按权重随机抽取一个号码 */
function weightedPick(candidates, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return candidates[Math.floor(Math.random() * candidates.length)];

    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

// ==================== 走势策略：热号加权 ====================

/**
 * 基于历史频率加权抽取（热号更易出现）
 */
function strategyHotWeighted(min, max, count, freqMap) {
    const candidates = [];
    const weights = [];
    for (let i = min; i <= max; i++) {
        candidates.push(i);
        // 频率越高权重越大，+1 保证从未出现的号码也有机会
        weights.push((freqMap.get(i) || 0) + 1);
    }

    for (let attempt = 0; attempt < 15; attempt++) {
        const picked = new Set();
        const tempWeights = [...weights];
        const tempCands = [...candidates];

        while (picked.size < count) {
            const idx = weightedPick(tempCands, tempWeights);
            picked.add(tempCands[idx]);
            // 选过的置零权重
            tempWeights[idx] = 0;
        }

        const result = [...picked].sort((a, b) => a - b);
        if (!hasTooManyConsecutive(result)) return result;
    }
    return sample(min, max, count);
}

// ==================== 走势策略：冷号反弹 ====================

/**
 * 冷号反弹策略 — 长期未出的号码有更高概率出现
 */
function strategyColdRebound(min, max, count, coldHotScores) {
    // 计算平均分
    const scores = [];
    for (let i = min; i <= max; i++) {
        scores.push(coldHotScores.get(i) || 0);
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    const candidates = [];
    const weights = [];
    for (let i = min; i <= max; i++) {
        candidates.push(i);
        const score = coldHotScores.get(i) || 0;
        // 低于平均分的号码（冷号）获得反弹权重
        // 越冷权重越大：反弹权重 = 平均分 / (分数 + 1)
        const reboundWeight = score < avg ? Math.round((avg + 1) / (score + 1) * 10) : 1;
        weights.push(reboundWeight);
    }

    for (let attempt = 0; attempt < 15; attempt++) {
        const picked = new Set();
        const tempWeights = [...weights];
        const tempCands = [...candidates];

        while (picked.size < count) {
            const idx = weightedPick(tempCands, tempWeights);
            picked.add(tempCands[idx]);
            tempWeights[idx] = 0;
        }

        const result = [...picked].sort((a, b) => a - b);
        if (!hasTooManyConsecutive(result)) return result;
    }
    return sample(min, max, count);
}

// ==================== 走势策略：热冷混合 ====================

/**
 * 热冷混合策略 — 一部分热号 + 一部分冷号
 */
function strategyHotColdMix(min, max, count, freqMap, coldHotScores) {
    const avg = (() => {
        let sum = 0, n = 0;
        for (let i = min; i <= max; i++) {
            sum += coldHotScores.get(i) || 0;
            n++;
        }
        return sum / n;
    })();

    // 区分热号和冷号
    const hotNums = [];
    const coldNums = [];
    for (let i = min; i <= max; i++) {
        const score = coldHotScores.get(i) || 0;
        if (score >= avg) hotNums.push(i);
        else coldNums.push(i);
    }

    // 随机决定热号比例 (40%~70%)
    const hotRatio = 0.4 + Math.random() * 0.3;
    let hotCount = Math.round(count * hotRatio);
    let coldCount = count - hotCount;

    // 确保够选
    if (hotCount > hotNums.length) { hotCount = hotNums.length; coldCount = count - hotCount; }
    if (coldCount > coldNums.length) { coldCount = coldNums.length; hotCount = count - coldCount; }

    for (let attempt = 0; attempt < 12; attempt++) {
        const pickedHot = shuffle(hotNums).slice(0, Math.max(0, hotCount));
        const pickedCold = shuffle(coldNums).slice(0, Math.max(0, coldCount));
        const merged = [...pickedHot, ...pickedCold].sort((a, b) => a - b);

        if (merged.length === count && !hasTooManyConsecutive(merged)) {
            return merged;
        }
    }
    return sample(min, max, count);
}

// ==================== 走势策略：近期趋势跟随 ====================

/**
 * 近期趋势跟随 — 分析最近 N 期的区间分布、奇偶比等特征
 */
function strategyRecentTrend(min, max, count, history, field, opts) {
    if (!history || history.length < 5) return null; // 数据不足，交给其他策略

    const recent = history.slice(0, Math.min(history.length, 30));

    // 分析近期各区间出现密度
    const zoneHits = opts.zones ? opts.zones.map(() => 0) : null;
    if (zoneHits) {
        for (const item of recent) {
            const nums = item[field];
            if (!Array.isArray(nums)) continue;
            for (const n of nums) {
                const num = parseInt(n, 10);
                if (isNaN(num)) continue;
                for (let z = 0; z < opts.zones.length; z++) {
                    const [zMin, zMax] = opts.zones[z];
                    if (num >= zMin && num <= zMax) {
                        zoneHits[z]++;
                        break;
                    }
                }
            }
        }
    }

    // 根据区间热度分配抽取数量
    if (zoneHits && opts.zones) {
        const totalHits = zoneHits.reduce((a, b) => a + b, 0);
        if (totalHits > 0) {
            const perZone = opts.zones.map((_, i) => Math.round(count * zoneHits[i] / totalHits));

            // 调整确保总数 = count
            let sum = perZone.reduce((a, b) => a + b, 0);
            let diff = count - sum;
            let idx = 0;
            while (diff !== 0 && idx < 100) {
                for (let i = 0; i < perZone.length && diff !== 0; i++) {
                    if (diff > 0) { perZone[i]++; diff--; }
                    else if (perZone[i] > 0) { perZone[i]--; diff++; }
                }
                idx++;
            }

            // 每区抽取
            let result = [];
            for (let i = 0; i < opts.zones.length; i++) {
                const cnt = perZone[i];
                if (cnt > 0) {
                    const zoneMin = opts.zones[i][0];
                    const zoneMax = opts.zones[i][1];
                    // 在区内用热号加权
                    const zoneFreq = new Map();
                    for (const item of recent) {
                        const nums = item[field];
                        if (!Array.isArray(nums)) continue;
                        for (const n of nums) {
                            const num = parseInt(n, 10);
                            if (!isNaN(num) && num >= zoneMin && num <= zoneMax) {
                                zoneFreq.set(num, (zoneFreq.get(num) || 0) + 1);
                            }
                        }
                    }
                    result = result.concat(strategyHotWeighted(zoneMin, zoneMax, cnt, zoneFreq));
                }
            }

            const sorted = result.sort((a, b) => a - b);
            if (sorted.length === count && !hasTooManyConsecutive(sorted)) {
                return sorted;
            }
        }
    }

    return null; // 回退
}
// ==================== 智能号码生成引擎 ====================

/**
 * 从某个范围中随机抽取 count 个不同数字
 * @param {number} min 
 * @param {number} max 
 * @param {number} count 
 * @returns {number[]} 升序排列
 */
function sample(min, max, count) {
    const total = max - min + 1;
    const arr = new Array(total);
    for (let i = 0; i < total; i++) arr[i] = min + i;
    for (let i = 0; i < count; i++) {
        const j = i + Math.floor(Math.random() * (total - i));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count).sort((a, b) => a - b);
}

/**
 * 检查数组的连号情况（确定性判断，避免随机导致的不可预测重试）
 * 规则：4+连号 → 坚决拒绝；恰好3连号 → 允许
 */
function hasTooManyConsecutive(nums) {
    let consec = 1;
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] === 1) {
            consec++;
        } else {
            if (consec >= 4) return true;  // 4+连号 → 拒绝
            consec = 1;
        }
    }
    // 处理末尾的连号
    if (consec >= 4) return true;
    return false;
}

/**
 * 检查奇偶比是否符合目标比例之一
 */
function checkParity(nums, allowedRatios) {
    const oddCount = nums.filter(n => n % 2 === 1).length;
    const evenCount = nums.length - oddCount;
    return allowedRatios.some(([o, e]) => oddCount === o && evenCount === e);
}

/**
 * ---------------------------------------------------------------
 * 策略1：三区间均匀分布法
 * ---------------------------------------------------------------
 * 将号码范围分为三区，按比例从各区抽取，保证覆盖均匀。
 * 适用于双色球红球、大乐透前区、七乐彩基本号。
 */
function strategyZoneBalanced(zones, totalCount) {
    const perZone = Math.floor(totalCount / zones.length);
    const extra = totalCount - perZone * zones.length;
    // 分配每区抽取数量
    const counts = zones.map((_, i) => perZone + (i < extra ? 1 : 0));
    // 打乱分配顺序，避免固定模式
    const shuffledCounts = shuffle(counts);
    let result = [];
    for (let i = 0; i < zones.length; i++) {
        const cnt = shuffledCounts[i];
        if (cnt > 0) {
            const picked = sample(zones[i][0], zones[i][1], cnt);
            result = result.concat(picked);
        }
    }
    return result.sort((a, b) => a - b);
}

/**
 * ---------------------------------------------------------------
 * 策略2：奇偶牵引法
 * ---------------------------------------------------------------
 * 先确定奇偶比，分别从奇数和偶数池中抽取，再合并排序。
 * 能精确控制奇偶分布。
 */
function strategyParityDriven(min, max, count, allowedRatios) {
    const ratio = pickRandom(allowedRatios);
    const [oddTarget, evenTarget] = ratio;

    const odds = [];
    const evens = [];
    for (let i = min; i <= max; i++) {
        if (i % 2 === 1) odds.push(i);
        else evens.push(i);
    }

    // 最多重试 10 次
    for (let attempt = 0; attempt < 10; attempt++) {
        const pickedOdds = shuffle(odds).slice(0, oddTarget).sort((a, b) => a - b);
        const pickedEvens = shuffle(evens).slice(0, evenTarget).sort((a, b) => a - b);
        const merged = [...pickedOdds, ...pickedEvens].sort((a, b) => a - b);
        if (!hasTooManyConsecutive(merged)) {
            return merged;
        }
    }
    // 保底：简单采样
    return sample(min, max, count);
}

/**
 * ---------------------------------------------------------------
 * 策略3：和值导向法
 * ---------------------------------------------------------------
 * 先生成一组候选号码，检查和值是否在目标范围内，不在则调整。
 * 模拟真实开奖号码的和值分布特征。
 */
function strategySumGuided(min, max, count, sumRange) {
    for (let attempt = 0; attempt < 15; attempt++) {
        const nums = sample(min, max, count);
        const sum = nums.reduce((a, b) => a + b, 0);
        if (sum >= sumRange[0] && sum <= sumRange[1]
            && !hasTooManyConsecutive(nums)) {
            return nums;
        }
    }
    // 保底
    return sample(min, max, count);
}

/**
 * ---------------------------------------------------------------
 * 策略4：跨度优先法
 * ---------------------------------------------------------------
 * 先固定首尾号（跨度在合理范围内），再填充中间号码。
 * 保证号码有合理的离散度。
 */
function strategySpanFirst(min, max, count, spanRange) {
    for (let attempt = 0; attempt < 12; attempt++) {
        const first = min + Math.floor(Math.random() * (max - min - spanRange[0] + 1));
        const span = spanRange[0] + Math.floor(Math.random() * (spanRange[1] - spanRange[0] + 1));
        const last = Math.min(first + span, max);

        // 在 [first, last] 范围内选 count 个
        const innerMin = first;
        const innerMax = last;
        if (innerMax - innerMin + 1 < count) continue;

        const nums = sample(innerMin, innerMax, count);
        if (!hasTooManyConsecutive(nums)) {
            return nums;
        }
    }
    return sample(min, max, count);
}

/**
 * ---------------------------------------------------------------
 * 智能号码生成入口
 * ---------------------------------------------------------------
 * 根据配置信息，从多种策略中随机选择一种生成号码，
 * 每次生成的号码具有不同的分布特征，更加多样。
 * 
 * @param {number} min 范围最小值
 * @param {number} max 范围最大值
 * @param {number} count 生成个数
 * @param {object} opts 策略参数
 * @param {number[][]} [opts.zones] 区间划分
 * @param {number[]} [opts.sumRange] 和值范围
 * @param {number[][]} [opts.parityRatios] 允许的奇偶比组合
 * @param {number[]} [opts.spanRange] 跨度范围
 * @param {object} [opts.trend] 走势数据
 * @param {object[]} [opts.trend.history] 历史开奖数据
 * @param {Map} [opts.trend.freqMap] 频率统计
 * @param {Map} [opts.trend.coldHotMap] 冷热评分
 * @param {string} [opts.trend.field] JSON 字段名
 * @returns {number[]} 升序排列的号码数组
 */
function smartGenerate(min, max, count, opts) {
    if (count <= 1) return sample(min, max, count);

    const strategies = [];
    const trend = opts.trend;

    // 走势策略（如有历史数据）
    if (trend && trend.freqMap && trend.freqMap.size > 0) {
        strategies.push(() => strategyHotWeighted(min, max, count, trend.freqMap));
        strategies.push(() => strategyColdRebound(min, max, count, trend.coldHotMap));
        strategies.push(() => strategyHotColdMix(min, max, count, trend.freqMap, trend.coldHotMap));
        if (trend.history && trend.history.length >= 5 && opts.zones) {
            strategies.push(() =>
                strategyRecentTrend(min, max, count, trend.history, trend.field, opts) || sample(min, max, count)
            );
        }
    }

    // 传统统计策略
    if (opts.zones && count >= opts.zones.length) {
        strategies.push(() => strategyZoneBalanced(opts.zones, count));
    }
    if (opts.parityRatios) {
        strategies.push(() => strategyParityDriven(min, max, count, opts.parityRatios));
    }
    if (opts.sumRange) {
        strategies.push(() => strategySumGuided(min, max, count, opts.sumRange));
    }
    if (opts.spanRange) {
        strategies.push(() => strategySpanFirst(min, max, count, opts.spanRange));
    }

    // 兜底策略
    strategies.push(() => sample(min, max, count));

    // 权重分配：走势策略权重更高
    const weights = strategies.map((_, i) => {
        if (i < 4 && trend && trend.freqMap) return 4; // 走势策略权重 4
        const nonTrendIdx = i - (trend && trend.freqMap ? 4 : 0);
        return [3, 2, 2, 1, 1][nonTrendIdx] || 1;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let selectedIdx = strategies.length - 1;
    for (let i = 0; i < strategies.length; i++) {
        r -= weights[i] || 1;
        if (r <= 0) { selectedIdx = i; break; }
    }

    return strategies[selectedIdx]();
}

/**
 * ---------------------------------------------------------------
 * 快乐8智能生成
 * ---------------------------------------------------------------
 * 快乐8号码多（最多选10个），采用"四区间均匀分布"策略。
 * 注意：快乐8每次开奖20个号，连号是正常现象，故不限制连号规则。
 */
function smartGenerateKL8(count) {
    if (count <= 2) return sample(1, 80, count);

    // 四区间分布
    const zones = [[1,20], [21,40], [41,60], [61,80]];
    const perZone = Math.floor(count / zones.length);
    const extra = count - perZone * zones.length;
    const counts = zones.map((_, i) => perZone + (i < extra ? 1 : 0));
    const shuffledCounts = shuffle(counts);

    // 快乐8号码多（每次开20个号），连号是正常现象，不限制连号规则
    let result = [];
    for (let i = 0; i < zones.length; i++) {
        const cnt = shuffledCounts[i];
        if (cnt > 0) {
            result = result.concat(sample(zones[i][0], zones[i][1], cnt));
        }
    }
    return result.sort((a, b) => a - b);
}

// ==================== 渲染函数 ====================

/** 生成一组智能号码球的 HTML */
function smartGroupBallsHTML(min, max, count, cssClass, opts) {
    const nums = opts
        ? smartGenerate(min, max, count, opts)
        : sample(min, max, count);
    return nums.map(n => ballHTML(n, cssClass)).join('');
}

/** 生成一组快乐8号码球的 HTML（走势版） */
function kl8GroupBallsHTML(count, cssClass, trend) {
    if (trend && trend.freqMap && trend.freqMap.size > 0 && count > 2) {
        const nums = smartGenerate(1, 80, count, {
            zones: [[1,20], [21,40], [41,60], [61,80]],
            trend
        });
        return nums.map(n => ballHTML(n, cssClass)).join('');
    }
    return smartGenerateKL8(count).map(n => ballHTML(n, cssClass)).join('');
}

// ==================== UI 交互 ====================

// 缓存 DOM 引用（只查询一次）
const domCache = {
    batchType:       document.getElementById('batchType'),
    batchCount:      document.getElementById('batchCount'),
    batchKL8Play:    document.getElementById('batchKL8PlayType'),
    kl8PlayGroup:    document.getElementById('kl8PlayTypeGroup'),
    batchResults:    document.getElementById('batchResults'),
    generateBtn:     document.querySelector('.confirm-btn')
};

/** 是否正在生成中（防止重复点击） */
let isGenerating = false;

/** 处理彩种类型变化：切换快乐8玩法选择区的显隐 */
function handleBatchTypeChange() {
    const isKL8 = domCache.batchType.value === 'kuail8';
    domCache.kl8PlayGroup.classList.toggle('hidden', !isKL8);
}

/** 生成批量号码（分块异步执行，避免卡顿） */
async function generateBatch() {
    // 防止重复点击
    if (isGenerating) return;
    isGenerating = true;
    if (domCache.generateBtn) domCache.generateBtn.disabled = true;

    // 整体超时保护：30秒后自动终止，防止意外卡死
    const timeoutId = setTimeout(() => {
        isGenerating = false;
        if (domCache.generateBtn) domCache.generateBtn.disabled = false;
        const rd = domCache.batchResults;
        if (rd) rd.innerHTML += '<div class="stats" style="text-align:center;color:#e74c3c;">⏰ 生成超时，请重试</div>';
    }, 30000);

    try {
        const type = domCache.batchType.value;
        let count = parseInt(domCache.batchCount.value);
        if (isNaN(count) || count < 1) count = 1;
        if (count > 50) count = 50;

        const config = lotteryConfig[type];
        const resultsDiv = domCache.batchResults;
        resultsDiv.classList.remove('hidden');

        // 已有缓存（内存或 localStorage）时不显示加载提示，直接生成
        // 只在实际需要网络请求时才显示，避免每次闪一下"加载历史走势数据"
        let hasCache = false;
        try { hasCache = !!localStorage.getItem('lottery-' + (BET_DATA_MAP[type] ? BET_DATA_MAP[type].file : '')); } catch {}
        if (!hasCache) {
            resultsDiv.innerHTML = '<div class="stats" style="text-align:center;color:#888;">⏳ 加载历史走势数据...</div>';
            // 让浏览器有机会渲染"加载中"提示
            await new Promise(r => setTimeout(r, 0));
        }

    // 异步加载历史数据
    const history = await loadHistoryData(type);
    const dataMap = BET_DATA_MAP[type];

    // 构建走势数据（主要分析红球/前区/基本号）
    let mainTrend = null;
    let subTrend = null;
    if (history.length > 0 && dataMap) {
        const mainField = dataMap.groups[0].field;
        const range = config.groups[0];
        const freqMap = analyzeFrequencies(history, mainField, 80);
        const coldHotMap = analyzeColdHot(history, mainField, range.max, 30);
        mainTrend = { history, freqMap, coldHotMap, field: mainField };

        // 也分析蓝球/后区/特别号走势
        if (dataMap.groups.length > 1) {
            const subField = dataMap.groups[1].field;
            const subRange = config.groups[1];
            const subFreq = analyzeFrequencies(history, subField, 80);
            const subColdHot = analyzeColdHot(history, subField, subRange.max, 30);
            subTrend = { history, freqMap: subFreq, coldHotMap: subColdHot, field: subField };
        }
    }

    const titleText = type === 'kuail8'
        ? `【${config.name}-${config.plays[parseInt(domCache.batchKL8Play.value)].name}】`
        : `【${config.name}】`;

    // 清空结果区，先显示标题
    resultsDiv.innerHTML = '';
    const titleDiv = document.createElement('div');
    titleDiv.className = 'stats';
    titleDiv.textContent = titleText;
    resultsDiv.appendChild(titleDiv);

    // 显示走势摘要
    if (mainTrend) {
        const trendInfo = document.createElement('div');
        trendInfo.className = 'stats';
        trendInfo.style.cssText = 'font-size:12px;color:#888;text-align:center;margin-bottom:8px;';
        const hotNums = [...mainTrend.freqMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([n]) => fmt(n));
        const coldSnums = [...mainTrend.coldHotMap.entries()]
            .sort((a, b) => a[1] - b[1])
            .slice(0, 5)
            .map(([n]) => fmt(n));
        trendInfo.textContent = `🔥 热号 ${hotNums.join(',')}  |  🧊 冷号 ${coldSnums.join(',')}`;
        resultsDiv.appendChild(trendInfo);
    }

    // 生成进度提示
    const progressDiv = document.createElement('div');
    progressDiv.className = 'stats';
    progressDiv.style.cssText = 'font-size:12px;color:#888;text-align:center;margin-bottom:8px;';
    progressDiv.textContent = `⏳ 正在生成 ${count} 注...`;
    resultsDiv.appendChild(progressDiv);

    // 分块异步生成（每块5注，避免阻塞主线程）
    const CHUNK_SIZE = 5;
    for (let start = 0; start < count; start += CHUNK_SIZE) {
        // 让出主线程，让浏览器有机会处理UI事件
        await new Promise(r => setTimeout(r, 0));

        const end = Math.min(start + CHUNK_SIZE, count);
        const fragment = document.createDocumentFragment();

        if (type === 'kuail8') {
            const playCount = config.plays[parseInt(domCache.batchKL8Play.value)].count;
            const kl8Trend = mainTrend ? {
                history, freqMap: mainTrend.freqMap, coldHotMap: mainTrend.coldHotMap, field: 'red'
            } : null;
            for (let i = start; i < end; i++) {
                const item = document.createElement('div');
                item.className = 'batch-item';
                item.innerHTML = `<div class="batch-balls">${kl8GroupBallsHTML(playCount, config.cssClass, kl8Trend)}</div>`;
                fragment.appendChild(item);
            }
        } else {
            for (let i = start; i < end; i++) {
                const item = document.createElement('div');
                item.className = 'batch-item';
                const ballsHtml = config.groups.map(g => {
                    const isSub = (g.key === 'blue' || g.key === 'back' || g.key === 'special');
                    if (isSub && subTrend) {
                        return smartGroupBallsHTML(g.min, g.max, g.count, g.cssClass, {
                            trend: { ...subTrend }
                        });
                    }
                    if (mainTrend) {
                        return smartGroupBallsHTML(g.min, g.max, g.count, g.cssClass, {
                            zones: config.zones,
                            sumRange: config.sumRange,
                            parityRatios: config.parityRatios,
                            spanRange: config.spanRange,
                            trend: { ...mainTrend }
                        });
                    }
                    if (isSub) {
                        return sample(g.min, g.max, g.count)
                            .map(n => ballHTML(n, g.cssClass)).join('');
                    }
                    return smartGroupBallsHTML(g.min, g.max, g.count, g.cssClass, {
                        zones: config.zones,
                        sumRange: config.sumRange,
                        parityRatios: config.parityRatios,
                        spanRange: config.spanRange
                    });
                }).join('');
                item.innerHTML = `<div class="batch-balls">${ballsHtml}</div>`;
                fragment.appendChild(item);
            }
        }

        resultsDiv.appendChild(fragment);

        // 更新进度
        progressDiv.textContent = `⏳ 正在生成 ${count} 注... (${Math.min(end, count)}/${count})`;
    }

    // 生成完成
    progressDiv.textContent = `✅ 已生成 ${count} 注`;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
    clearTimeout(timeoutId);
    } catch (e) {
    clearTimeout(timeoutId);
        console.error('生成号码失败:', e);
        try {
            const errMsg = (e && e.message) ? e.message : String(e);
            const rd = domCache.batchResults;
            if (rd) rd.innerHTML = '<div class="stats" style="text-align:center;color:#e74c3c;">❌ 生成失败：' + errMsg + '，请重试</div>';
        } catch (_) {}
    } finally {
        clearTimeout(timeoutId);
        isGenerating = false;
        try { if (domCache.generateBtn) domCache.generateBtn.disabled = false; } catch (_) {}
    }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    handleBatchTypeChange();
    // 页面加载后立即预取默认彩种的数据，用户点击生成时无需等待
    loadHistoryData(domCache.batchType.value).catch(() => {});
});
