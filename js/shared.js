/**
 * 彩票工具 - 共享函数
 */

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
 * 从多个 URL 并行请求，返回最先成功的 Response（自动取消其他请求）
 * @param {...string} urls
 * @returns {Promise<Response|null>}
 */
async function fastestFetch(...urls) {
    const controllers = urls.map(() => new AbortController());
    const promises = urls.map((url, i) =>
        fetch(url, { signal: controllers[i].signal })
            .then(resp => {
                if (resp.ok) {
                    controllers.forEach((c, j) => { if (j !== i) c.abort(); });
                    return resp;
                }
                return Promise.reject();
            })
    );
    try {
        return await Promise.race(promises);
    } catch {
        return null;
    }
}
