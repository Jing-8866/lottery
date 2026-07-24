/**
 * 彩票工具 - 共享函数
 */

// ==================== 数据路径（各页面共用） ====================

/** 本地路径（与页面同域，GitHub Pages 上可正常访问） */
const DATA_PATH_LOCAL = 'data';
/** 线上远程路径（data-auto 分支，通过 jsDelivr CDN 加速，国内可访问） */
const DATA_PATH_REMOTE = 'https://cdn.jsdelivr.net/gh/Jing-8866/lottery@data-auto/data';
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
 * 每次点击都尝试下载最新数据（带缓存刷新），下载失败时保留旧缓存。
 */
async function preloadDrawData() {
    const btn = document.getElementById('preload-btn');
    const statusEl = document.getElementById('preload-status');
    if (!statusEl) return;

    try {
        if (btn) { btn.disabled = true; statusEl.textContent = '⏳ 正在获取最新数据...'; }

        let success = 0;
        let failed = 0;

        for (const file of ALL_DATA_FILES) {
            statusEl.textContent = `⏳ 正在下载 ${file}...`;

            // 加时间戳参数绕过 CDN 缓存，确保拿到最新数据
            const url = `${DATA_PATH_REMOTE}/${file}?t=${Date.now()}`;
            let resp;
            try {
                resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
            } catch {
                // 网络请求失败，保留旧缓存
                failed++;
                continue;
            }
            if (!resp.ok) {
                failed++;
                continue;
            }

            const json = await resp.json();
            // 检查返回的数据是否有效（有期号才算有效）
            if (!json.data || json.data.length === 0) {
                failed++;
                continue;
            }

            localStorage.setItem('lottery-' + file, JSON.stringify(json));
            success++;
        }

        localStorage.setItem('lottery-cache-time', Date.now().toString());

        let msg;
        if (success > 0 && failed === 0) {
            msg = `✅ 已更新 ${success} 个文件到最新数据`;
        } else if (success > 0 && failed > 0) {
            msg = `⚠️ 已更新 ${success} 个，${failed} 个下载失败（已保留旧缓存）`;
        } else {
            msg = `❌ ${failed} 个文件全部下载失败，请检查网络后重试`;
        }
        statusEl.textContent = msg;
        if (btn) { btn.disabled = false; }
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
    if (urls.length === 0) return null;

    // 优先检查 localStorage 预加载缓存
    try {
        for (const url of urls) {
            const fileName = url.split('/').pop();
            const cached = localStorage.getItem('lottery-' + fileName);
            if (cached) {
                return new Response(cached, {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    } catch {
        // localStorage 不可用时（如隐私模式），直接降级到网络请求
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
    try {
        return localStorage.getItem('lottery-cache-time') || null;
    } catch {
        return null;
    }
}
