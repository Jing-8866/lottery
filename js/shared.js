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
            statusEl.textContent = `⏳ 正在下载 ${file}...`;

            // 先尝试远程（data-auto分支），超时10秒；失败则降级到本地
            let resp;
            try {
                resp = await fetch(`${DATA_PATH_REMOTE}/${file}`, {
                    signal: AbortSignal.timeout(10000)
                });
                // 远程返回非200也算失败，触发降级
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            } catch {
                // 远程失败，尝试本地
                try {
                    resp = await fetch(`${DATA_PATH_LOCAL}/${file}`, {
                        signal: AbortSignal.timeout(5000)
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                } catch (e2) {
                    throw new Error(`${file} 下载失败，远程和本地均不可用 (${e2.message})`);
                }
            }

            const json = await resp.json();
            localStorage.setItem('lottery-' + file, JSON.stringify(json));
        }

        localStorage.setItem('lottery-cache-time', Date.now().toString());
        statusEl.textContent = '✅ 所有开奖数据已缓存到本地！后续页面将优先使用缓存数据。';
        if (btn) { btn.textContent = '✅ 已加载'; btn.disabled = false; }
    } catch (e) {
        statusEl.textContent = `❌ 加载失败：${e.message}`;
        if (btn) { btn.disabled = false; }
    }
}

/**
 * 从多个 URL 并行请求，返回第一个成功的 Response。
 * 优先从 localStorage 读取（预加载缓存），未命中再走网络请求。
 * 使用"先成功优先"策略：第一个成功的响应到达即返回，失败的不阻塞。
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

    // 先成功优先：第一个成功的响应到来即返回，不等所有请求完成
    const controllers = urls.map(() => new AbortController());
    return new Promise(resolve => {
        let settled = 0;
        for (let i = 0; i < urls.length; i++) {
            const idx = i;
            fetch(urls[idx], { signal: controllers[idx].signal })
                .then(resp => {
                    if (resp.ok) {
                        controllers.forEach((c, j) => { if (j !== idx) c.abort(); });
                        resolve(resp);
                    } else if (++settled >= urls.length) {
                        resolve(null);
                    }
                })
                .catch(() => {
                    if (++settled >= urls.length) resolve(null);
                });
        }
    });
}

/** 获取预加载缓存的更新时间 */
function getCacheTime() {
    return localStorage.getItem('lottery-cache-time') || null;
}
