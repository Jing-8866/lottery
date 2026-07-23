/**
 * 彩票工具 - 共享函数
 */

// ==================== 数据路径（各页面共用） ====================

/** 本地开发路径 */
const DATA_PATH_LOCAL = 'data';
/** 线上部署路径（从 data-auto 分支读取） */
const DATA_PATH_REMOTE = 'https://raw.githubusercontent.com/Jing-8866/lottery/data-auto/data';
/** 所有彩种对应的 JSON 文件名 */
const ALL_DATA_FILES = ['ssq.json', 'dlt.json', 'qlc.json', 'kl8.json', 'qxc.json'];

// 组合数计算 C(n, r)
function comb(n, r) {
    if (r > n || r < 0) return 0;
    if (r === 0 || r === n) return 1;
    let res = 1;
    for (let i = 1; i <= r; i++) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res);
}

// 彩票分类配置
const lotteryData = {
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

/**
 * 预加载所有彩种的开奖数据到 localStorage。
 * 点击入口页的"加载历史开奖数据"按钮时调用。
 */
async function preloadDrawData() {
    const btn = document.getElementById('preload-btn');
    const statusEl = document.getElementById('preload-status');
    if (!statusEl) return;

    try {
        if (btn) { btn.disabled = true; }
        statusEl.textContent = '⏳ 正在下载开奖数据...';

        for (const file of ALL_DATA_FILES) {
            const url = `${DATA_PATH_REMOTE}/${file}`;
            statusEl.textContent = `⏳ 正在下载 ${file}...`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`${file} 下载失败 (HTTP ${resp.status})`);
            const json = await resp.json();
            localStorage.setItem('lottery-' + file, JSON.stringify(json));
        }

        localStorage.setItem('lottery-cache-time', Date.now().toString());
        statusEl.textContent = '✅ 所有开奖数据已缓存到本地！后续页面将优先使用缓存数据。';
        if (btn) { btn.textContent = '✅ 已加载'; btn.disabled = false; }
    } catch (e) {
        statusEl.textContent = `❌ 加载失败：${e.message}，请稍后重试`;
        if (btn) { btn.disabled = false; }
    }
}

/**
 * 从多个 URL 并行请求，返回第一个成功的 Response。
 * 优先从 localStorage 读取（预加载缓存），未命中再走网络请求。
 * @param {...string} urls
 * @returns {Promise<Response|null>}
 */
async function fastestFetch(...urls) {
    // 优先检查 localStorage 预加载缓存
    for (const url of urls) {
        const fileName = url.split('/').pop();
        const cached = localStorage.getItem('lottery-' + fileName);
        if (cached) {
            return new Response(cached, {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // 缓存未命中，并行请求所有 URL，取第一个成功的
    const controllers = urls.map(() => new AbortController());
    const results = await Promise.allSettled(
        urls.map((url, i) => fetch(url, { signal: controllers[i].signal }))
    );
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.ok) {
            return result.value;
        }
    }
    return null;
}

/** 获取预加载缓存的更新时间 */
function getCacheTime() {
    return localStorage.getItem('lottery-cache-time') || null;
}
