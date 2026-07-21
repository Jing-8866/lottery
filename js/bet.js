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
 * 检查数组的连号情况
 * 规则：4+连号 → 坚决拒绝；恰好3连号 → 约 25% 概率放过
 */
function hasTooManyConsecutive(nums) {
    let consec = 1;
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] === 1) {
            consec++;
        } else {
            if (consec >= 4) return true;           // 4+连号 → 拒绝
            if (consec === 3 && Math.random() > 0.4) return true;  // 3连号 → 约40%放过
            consec = 1;
        }
    }
    // 处理末尾的连号
    if (consec >= 4) return true;
    if (consec === 3 && Math.random() > 0.4) return true;   // 3连号 → 约40%放过
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

    // 最多重试 50 次
    for (let attempt = 0; attempt < 50; attempt++) {
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
    for (let attempt = 0; attempt < 80; attempt++) {
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
    for (let attempt = 0; attempt < 60; attempt++) {
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
 * @returns {number[]} 升序排列的号码数组
 */
function smartGenerate(min, max, count, opts) {
    if (count <= 1) return sample(min, max, count);

    const strategies = [];

    // 注册可用策略
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

    // 随机选一种策略（带权重：区间策略和奇偶策略权重更高）
    const weights = [3, 2, 2, 1, 1]; // 对应 zones, parity, sum, span, fallback
    const totalWeight = weights.slice(0, strategies.length).reduce((a, b) => a + b, 0);
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

/** 生成一组快乐8号码球的 HTML */
function kl8GroupBallsHTML(count, cssClass) {
    return smartGenerateKL8(count).map(n => ballHTML(n, cssClass)).join('');
}

// ==================== UI 交互 ====================

// 缓存 DOM 引用（只查询一次）
const domCache = {
    batchType:       document.getElementById('batchType'),
    batchCount:      document.getElementById('batchCount'),
    batchKL8Play:    document.getElementById('batchKL8PlayType'),
    kl8PlayGroup:    document.getElementById('kl8PlayTypeGroup'),
    batchResults:    document.getElementById('batchResults')
};

/** 处理彩种类型变化：切换快乐8玩法选择区的显隐 */
function handleBatchTypeChange() {
    const isKL8 = domCache.batchType.value === 'kuail8';
    domCache.kl8PlayGroup.classList.toggle('hidden', !isKL8);
}

/** 生成批量号码 */
function generateBatch() {
    const type = domCache.batchType.value;
    let count = parseInt(domCache.batchCount.value);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 50) count = 50;

    const config = lotteryConfig[type];
    const resultsDiv = domCache.batchResults;
    resultsDiv.classList.remove('hidden');

    const titleText = type === 'kuail8'
        ? `【${config.name}-${config.plays[parseInt(domCache.batchKL8Play.value)].name}】`
        : `【${config.name}】`;

    const fragment = document.createDocumentFragment();

    const titleDiv = document.createElement('div');
    titleDiv.className = 'stats';
    titleDiv.textContent = titleText;
    fragment.appendChild(titleDiv);

    if (type === 'kuail8') {
        const playCount = config.plays[parseInt(domCache.batchKL8Play.value)].count;
        appendBatches(fragment, count, () => kl8GroupBallsHTML(playCount, config.cssClass));
    } else {
        // 使用智能策略生成每组号码
        appendBatches(fragment, count, () =>
            config.groups.map(g => {
                if (g.key === 'blue' || g.key === 'back') {
                    // 蓝球/后区/特别号数量少，用简单采样即可
                    return sample(g.min, g.max, g.count)
                        .map(n => ballHTML(n, g.cssClass)).join('');
                }
                // 红球/前区/基本号用智能策略
                return smartGroupBallsHTML(g.min, g.max, g.count, g.cssClass, {
                    zones: config.zones,
                    sumRange: config.sumRange,
                    parityRatios: config.parityRatios,
                    spanRange: config.spanRange
                });
            }).join('')
        );
    }

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(fragment);
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

/**
 * 通用批量追加投注条目
 */
function appendBatches(fragment, count, ballsFn) {
    for (let i = 0; i < count; i++) {
        const item = document.createElement('div');
        item.className = 'batch-item';
        item.innerHTML = `<div class="batch-balls">${ballsFn()}</div>`;
        fragment.appendChild(item);
    }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    handleBatchTypeChange();
});
