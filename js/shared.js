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
