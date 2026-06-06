// ==UserScript==
// @name         PT站点魔力计算器
// @namespace    https://github.com/AIerlIz/PTMyBonusCalc
// @version      2.4.0
// @description  在NexusPHP架构的PT站点显示每个种子的B值(时魔)、A值和每GB的A值。支持userdetails做种列表显示。通用匹配，自动适配。
// @author       AIerlIz (forked from neoblackxt, LaneLau)
// @require      https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @require      https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
// === M-Team（SPA架构，需特殊处理，匹配所有页面） ===
// @match        *://kp.m-team.cc/*
// @match        *://zp.m-team.io/*
// === 通用匹配：自动适配所有 NexusPHP 架构的 PT 站点 ===
//    *torrents* 覆盖 /torrents、/torrents.php、/xxx/torrents 等所有变体
// @match        *://*/*torrents*
// @match        *://*/*mybonus*
//    *userdetails* 覆盖 /userdetails、/userdetails.php 等所有变体
// @match        *://*/*userdetails*
// === 排除站点 ===
// @exclude      *hdarea.club*
// @exclude      *hhanclub.net*
// @exclude      *qingwapt.com*
// @exclude      *haidan.cc*
// @exclude      totheglory.im*
// @exclude      *springsunday.net*
// @exclude      *rousi.pro*
// === TJUPT 兼容（魔力值页面 URL 为 bonus.php） ===
// @match        *://*/*bonus.php*
// @license      GPL License
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        window.onurlchange
// ==/UserScript==

// ============================================================
// 第 1 层：常量与站点配置
// ============================================================

/**
 * B|A@A/GB 中 A/GB 值不同范围对应的显示颜色及字体粗细。
 *
 * A/GB（每GB的A值）越高，代表该种子单位体积的魔力值收益越高，越值得挂种。
 * 颜色同时作用于整列（包括 B 值和 A 值），方便用户一眼识别优质种子。
 *
 * 颜色含义：
 *   - [0, 1):   默认色（黑色），普通种子，收益一般
 *   - [1, 1.5): 蓝色加粗，较好种子
 *   - [1.5, 2): 棕色更粗，优质种子
 *   - [2, ∞):   红色最粗，极品种子，值得优先挂种
 */
const COLORS_OF_AVE = [
    { min: 0, max: 1, color: null, fontWeight: 700 },
    { min: 1, max: 1.5, color: '#00008B', fontWeight: 700 },
    { min: 1.5, max: 2, color: '#8B4513', fontWeight: 800 },
    { min: 2, max: Infinity, color: '#ff0000', fontWeight: 900 },
];

/**
 * 站点配置表。
 *
 * 每个站点一个 profile，定义该站的 DOM 结构特征和特殊逻辑。
 * 新增站点只需添加一个新的 profile 对象，无需修改核心代码。
 *
 * match 函数按数组顺序匹配，首个匹配成功即停止，最后一个为默认兜底。
 */
const SITE_PROFILES = [
    {
        // ---- M-Team：自定义 SPA 前端，DOM 结构与 NexusPHP 不同 ----
        id: 'm-team',
        match: (host) => host.includes('m-team'),
        isSPA: true,

        // 种子表格
        seedTable: {
            // 数据行选择器（不含表头，表头在 thead 中）
            rowSelector: 'div.mt-4>table>tbody>tr',
            // 表头选择器（独立于数据行）
            headerSelector: 'div.mt-4>table>thead>tr>th',
            // 列识别策略：position = 固定偏移量，icon = 图标识别
            colStrategy: 'position',
            // 从末尾列往前数的偏移量
            colOffsets: { timeFromEnd: 5, sizeFromEnd: 4, seedersFromEnd: 3 },
            // 表头单元格标签名
            headerTag: 'th',
            // 新列插入模式：'after-last' 在最后一列之后，'before-last' 在最后一列之前
            insertMode: 'after-last',
            // 已添加列检测用文字
            colTitle: 'B|A@A/GB',
        },

        // mybonus 页面：M-Team 需要从 B 值反推 A 值
        mybonus: {
            // 提取当前 B 值（页面显示的"基本獎勵"）
            extractCurrentB($) {
                return parseFloat($("td:contains('基本獎勵')+td+td")[0].innerText);
            },
            // M-Team 的 B 值包含了做种数奖励，需要扣除
            adjustB($, rawB) {
                const matches = $("h5:contains('做種每小時將得到如下的魔力值')")
                    .next().children().first().text()
                    .match(/(\d+(\.\d+)?)個魔力值.*最多計(\d+)個/);
                const seedingBonusPerSeed = parseFloat(matches[1]);
                const seedingBonusLimit = parseInt(matches[3]);
                const currentSeedingNode = $("span:contains('當前活動')").parent().clone();
                currentSeedingNode.find('img').replaceWith(function () { return "img"; });
                const currentSeeding = parseInt(currentSeedingNode.text().match(/(\d+)/)[1]);
                return rawB - (currentSeeding > seedingBonusLimit
                    ? seedingBonusPerSeed * seedingBonusLimit
                    : seedingBonusPerSeed * currentSeeding);
            },
            // 图表插入位置的选择器
            chartInsertSelector: 'ul+table',
        },

        // M-Team 的有效页面
        validPages: ['mybonus', 'browse'],
    },

    {
        // ---- NexusPHP 通用站点：默认兜底 ----
        id: 'nexusphp',
        match: (_host) => true,
        isSPA: false,

        seedTable: {
            rowSelector: '.torrents:last-of-type>tbody>tr',
            headerSelector: null,  // 表头是 rowSelector 的第一行
            colStrategy: 'icon',
            iconClasses: { time: 'time', size: 'size', seeders: 'seeders' },
            headerTag: 'td',
            insertMode: 'before-last',
            colTitle: 'B|A@A/GB',
            headerClass: 'colhead',
            dataClass: 'rowfollow',
        },

        mybonus: {
            extractCurrentA($) {
                return parseFloat($("div:contains(' (A = ')")[0].innerText.split(" = ")[1]);
            },
            chartInsertSelector: 'table+h1',
        },

        // userdetails.php 做种/下载/上传表格配置
        // #ka  = 已上传, #ka1 = 当前做种, #ka2 = 当前下载
        // #ka3（已完成）和 #ka4（未完成）没有做种数列，无法计算 B|A@A/GB
        userdetails: {
            containerSelectors: ['#ka', '#ka1', '#ka2'],
        },

        validPages: null,  // 所有页面均有效
    },
];

// ============================================================
// 第 2 层：存储管理（封装 Tampermonkey GM_* API）
// ============================================================

const StorageManager = {
    /**
     * 获取站点的魔力值参数。
     * @param {string} host - 站点二级域名
     * @returns {{ T0: number, N0: number, B0: number, L: number, ready: boolean }}
     */
    getParams(host) {
        const T0 = GM_getValue(host + '.T0');
        const N0 = GM_getValue(host + '.N0');
        const B0 = GM_getValue(host + '.B0');
        const L = GM_getValue(host + '.L');
        return { T0, N0, B0, L, ready: !!(T0 && N0 && B0 && L) };
    },

    /**
     * 持久化站点魔力值参数。
     */
    saveParams(host, params) {
        GM_setValue(host + '.T0', params.T0);
        GM_setValue(host + '.N0', params.N0);
        GM_setValue(host + '.B0', params.B0);
        GM_setValue(host + '.L', params.L);
    },

    /**
     * 检查该站点是否已被标记为"无法自动获取参数"。
     */
    isBlocked(host) {
        return !!GM_getValue(host + '.bonus_blocked');
    },

    /**
     * 设置站点的 blocked 标记。
     */
    setBlocked(host, blocked) {
        GM_setValue(host + '.bonus_blocked', blocked);
    },
};

// ============================================================
// 第 3 层：计算引擎（纯函数，无副作用，不依赖 DOM 或存储）
// ============================================================

const CalcEngine = {
    /**
     * 计算种子 A 值（魔力值潜力）。
     *
     * 公式：A = (1 - 10^(-T/T0)) * S * (1 + √2 * 10^(-(N-1)/(N0-1)))
     *
     * @param {number} T  - 种子已存活时间（周）
     * @param {number} S  - 种子体积（GB）
     * @param {number} N  - 当前做种人数（0 表示断种，按 1 计算）
     * @param {number} T0 - 站点时间参数
     * @param {number} N0 - 站点做种人数参数
     * @returns {number} A 值
     */
    calcA(T, S, N, T0, N0) {
        const c1 = 1 - Math.pow(10, -(T / T0));
        N = N || 1;
        const c2 = 1 + Math.pow(2, 0.5) * Math.pow(10, -(N - 1) / (N0 - 1));
        return c1 * S * c2;
    },

    /**
     * 根据 A 值计算 B 值（时魔：每小时魔力值收益）。
     *
     * 公式：B = B0 * (2/π) * arctan(A/L)
     *
     * @param {number} A  - A 值
     * @param {number} B0 - 站点 B0 参数（时魔上限）
     * @param {number} L  - 站点 L 参数
     * @returns {number} B 值
     */
    calcB(A, B0, L) {
        return B0 * (2 / Math.PI) * Math.atan(A / L);
    },

    /**
     * 从 B 值反推 A 值。
     *
     * 公式：A = L * tan(B / (B0 * 2/π))
     *
     * @param {number} B  - B 值
     * @param {number} B0 - 站点 B0 参数
     * @param {number} L  - 站点 L 参数
     * @returns {number} A 值
     */
    calcAbyB(B, B0, L) {
        return Math.tan(B / (B0 * (2 / Math.PI))) * L;
    },

    /**
     * 格式化 B|A@A/GB 单元格的值，并根据 A/GB 值着色。
     *
     * @param {number} B   - 时魔
     * @param {number} A   - A 值
     * @param {number} ave - A/GB（单位体积收益率）
     * @returns {string} 带样式的 HTML 字符串
     */
    formatCell(B, A, ave) {
        const text = B + '|' + A + '@' + ave;
        for (const c of COLORS_OF_AVE) {
            if (ave >= c.min && ave < c.max && (c.color !== null || c.fontWeight !== null)) {
                let style = '';
                if (c.color !== null) style += 'color:' + c.color + ';';
                if (c.fontWeight !== null) style += 'font-weight:' + c.fontWeight + ';';
                return '<span style="' + style + '">' + text + '</span>';
            }
        }
        return '<span>' + text + '</span>';
    },
};

// ============================================================
// 第 4 层：DOM 解析器（从页面提取种子数据和站点参数）
// ============================================================

const DOMParser = {
    /**
     * 从种子行提取发布时间并转为周数。
     *
     * 支持多种时间格式：
     *   - span[title] 属性中的时间字符串（NexusPHP 标准格式）
     *   - span 文本中的时间（M-Team）
     *   - td 内 HTML 中 <br> 分隔的时间（TJUPT、userdetails）
     *
     * @param {jQuery} $td - 时间列的 td/th jQuery 对象
     * @returns {number} 已存活周数
     */
    extractTimeWeeks($td) {
        let time = $td.find('span').attr('title');
        if (time === undefined || time === '') {
            time = $td.find('span').text();
        }
        if (time === undefined || time === '') {
            time = $td.html().replace(/<br\s*\/?>/gi, ' ').trim();
        }
        return (new Date().getTime() - new Date(time).getTime()) / 1000 / 86400 / 7;
    },

    /**
     * 从种子行提取体积并转为 GB。
     *
     * 支持 KB/KiB、MB/MiB、GB/GiB、TB/TiB 单位。
     *
     * @param {jQuery} $td - 体积列的 td/th jQuery 对象
     * @returns {number} 体积（GB）
     */
    extractSizeGB($td) {
        const sizeText = $td.text().trim();
        let factor = 1;
        const numStr = sizeText.replace(/[KMGT]i?B/, function (unit) {
            if (unit === 'KB' || unit === 'KiB') factor = 1 / 1024 / 1024;
            else if (unit === 'MB' || unit === 'MiB') factor = 1 / 1024;
            else if (unit === 'GB' || unit === 'GiB') factor = 1;
            else if (unit === 'TB' || unit === 'TiB') factor = 1024;
            return '';
        });
        return parseFloat(numStr) * factor;
    },

    /**
     * 从种子行提取做种人数。
     *
     * @param {jQuery} $td - 做种人数列的 td/th jQuery 对象
     * @returns {number} 做种人数（NaN 时返回 0）
     */
    extractSeeders($td) {
        const numStr = $td.text().trim().replace(/,/g, '');
        return parseInt(numStr) || 0;
    },

    /**
     * 从魔力值说明页面提取站点参数（T0, N0, B0, L）。
     *
     * 适用于所有使用 NexusPHP 魔力值说明页格式的站点（包括 M-Team）。
     *
     * @param {jQuery} $ - jQuery 实例
     * @returns {{ T0: number, N0: number, B0: number, L: number }|null}
     */
    extractParams($) {
        try {
            const T0 = parseInt($("li:has(b:contains('T0'))")[1].innerText.split(' = ')[1]);
            const N0 = parseInt($("li:has(b:contains('N0'))")[1].innerText.split(' = ')[1]);
            const B0 = parseInt($("li:has(b:contains('B0'))")[1].innerText.split(' = ')[1]);
            const L = parseInt($("li:has(b:contains('L'))")[1].innerText.split(' = ')[1]);
            return { T0, N0, B0, L };
        } catch (error) {
            console.error('[PTMyBonusCalc] 参数提取失败:', error);
            return null;
        }
    },

    /**
     * 从表头行识别列索引（icon 策略：通过 img.time/size/seeders 图标）。
     *
     * @param {jQuery} $headerCells - 表头单元格的 jQuery 集合
     * @param {{ time: string, size: string, seeders: string }} iconClasses
     * @returns {{ i_T: number, i_S: number, i_N: number }|null}
     */
    detectColumnsByIcon($headerCells, iconClasses) {
        let i_T, i_S, i_N;
        $headerCells.each(function (col) {
            if ($(this).find('img.' + iconClasses.time).length) i_T = col;
            else if ($(this).find('img.' + iconClasses.size).length) i_S = col;
            else if ($(this).find('img.' + iconClasses.seeders).length) i_N = col;
        });
        if (i_T === undefined || i_S === undefined || i_N === undefined) return null;
        return { i_T, i_S, i_N };
    },

    /**
     * 从数据行识别时间列索引（date-pattern 策略：查找匹配 YYYY-MM-DD 格式的列）。
     *
     * 用于 userdetails 页面等没有 img.time 图标的场景。
     *
     * @param {jQuery} $rows - 所有行（含表头和数据行）的 jQuery 集合
     * @returns {number|undefined}
     */
    detectTimeColByDatePattern($rows) {
        let i_T;
        $rows.each(function (row) {
            if (row === 0) return;  // 跳过表头
            $(this).children('td').each(function (col) {
                if ($(this).text().match(/\d{4}-\d{2}-\d{2}/)) {
                    i_T = col;
                    return false;
                }
            });
            if (i_T !== undefined) return false;
        });
        return i_T;
    },
};

// ============================================================
// 第 5 层：渲染器（DOM 操作，插入列和图表）
// ============================================================

const Renderer = {
    /**
     * 为种子表格添加 B|A@A/GB 列。
     *
     * 统一处理 NexusPHP、M-Team、userdetails 三种场景的表格列插入。
     *
     * @param {object} options - 配置选项
     * @param {jQuery} options.$headerRow - 表头行 jQuery 对象
     * @param {jQuery} options.$dataRows - 数据行 jQuery 集合
     * @param {object} options.cols - { i_T, i_S, i_N } 列索引
     * @param {object} options.params - { T0, N0, B0, L } 站点参数
     * @param {object} options.tableCfg - 站点 seedTable 配置
     * @param {boolean} [options.updateOnly] - 是否仅更新已存在的列（翻页场景）
     */
    addTableColumn({ $headerRow, $dataRows, cols, params, tableCfg, updateOnly }) {
        const { i_T, i_S, i_N } = cols;
        const { T0, N0, B0, L } = params;

        // --- 添加表头 ---
        if (!updateOnly) {
            const headerHtml = '<' + tableCfg.headerTag
                + (tableCfg.headerClass ? ' class="' + tableCfg.headerClass + '"' : '')
                + ' align="center" title="时魔|A值@每GB的A值">'
                + tableCfg.colTitle + '</' + tableCfg.headerTag + '>';

            if (tableCfg.insertMode === 'after-last') {
                $headerRow.children(tableCfg.headerTag + ':last').after(headerHtml);
            } else {
                $headerRow.children(tableCfg.headerTag + ':last').before(headerHtml);
            }
        }

        // --- 为每行添加/更新数据 ---
        $dataRows.each(function () {
            const $row = $(this);
            const $timeTd = $row.children('td:eq(' + i_T + ')');
            const $sizeTd = $row.children('td:eq(' + i_S + ')');
            const $seedTd = $row.children('td:eq(' + i_N + ')');

            const T = DOMParser.extractTimeWeeks($timeTd);
            const S = DOMParser.extractSizeGB($sizeTd);
            const N = DOMParser.extractSeeders($seedTd);

            const A = CalcEngine.calcA(T, S, N, T0, N0).toFixed(2);
            const ave = (A / S).toFixed(2);
            const B = CalcEngine.calcB(A, B0, L).toFixed(2);

            const cellHtml = CalcEngine.formatCell(B, A, ave);

            if (updateOnly) {
                $row.children('td:last').html(cellHtml);
            } else if (tableCfg.insertMode === 'after-last') {
                $row.children('td:last').after(
                    '<td' + (tableCfg.dataClass ? ' class="' + tableCfg.dataClass + '"' : '')
                    + ' align="center">' + cellHtml + '</td>');
            } else {
                $row.children('td:last').before(
                    '<td' + (tableCfg.dataClass ? ' class="' + tableCfg.dataClass + '"' : '')
                    + ' align="center">' + cellHtml + '</td>');
            }
        });
    },

    /**
     * 在魔力值页面渲染 B-A 曲线图（使用 ECharts）。
     *
     * @param {object} options
     * @param {jQuery} options.$insertBefore - 图表插入位置前的元素
     * @param {number} options.A - 当前种子的 A 值
     * @param {number} options.B - 当前种子的 B 值
     * @param {number} options.B0 - 站点 B0 参数
     * @param {number} options.L - 站点 L 参数
     */
    renderChart({ $insertBefore, A, B, B0, L }) {
        // 生成 B-A 曲线数据点
        const data = [];
        const xMax = 1.1 * A > 25 * L ? 1.1 * A : 25 * L;
        for (let i = 0; i < xMax; i += L / 4) {
            data.push([i, CalcEngine.calcB(i, B0, L)]);
        }

        // 插入图表容器
        $insertBefore.before('<div id="ptmybonuscalc-chart" style="width:600px;height:400px;margin:auto;"></div>');

        const chart = echarts.init(document.getElementById('ptmybonuscalc-chart'));
        chart.setOption({
            title: { text: 'B - A 图', top: 'bottom', left: 'center' },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                position: function (pos, _params, _el, _elRect, size) {
                    const obj = { top: 10 };
                    obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
                    return obj;
                },
                extraCssText: 'width: 170px',
            },
            xAxis: { name: 'A' },
            yAxis: { name: 'B' },
            axisPointer: { label: { backgroundColor: '#777' } },
            series: [
                { type: 'line', data: data, symbol: 'none' },
                { type: 'line', data: [[A, B]], symbolSize: 6 },
            ],
        });
    },
};

// ============================================================
// 第 6 层：页面处理器
// ============================================================

/**
 * 处理魔力值说明页（/mybonus）：
 *   1. 自动提取站点魔力值参数（T0/N0/B0/L）并持久化
 *   2. 绘制 B-A 曲线图
 */
function handleMybonusPage($, host, profile, stored) {
    let params = stored;

    // --- 参数提取 ---
    if (!params.ready && !StorageManager.isBlocked(host)) {
        const extracted = DOMParser.extractParams($);
        if (extracted && extracted.T0 && extracted.N0 && extracted.B0 && extracted.L) {
            console.log('[PTMyBonusCalc] 参数提取成功:', extracted.T0, extracted.N0, extracted.B0, extracted.L);
            params = { T0: extracted.T0, N0: extracted.N0, B0: extracted.B0, L: extracted.L, ready: true };
            StorageManager.setBlocked(host, false);
            if (!stored.ready) {
                alert('魔力值参数已更新');
            }
        } else {
            // 提取失败：标记站点，后续不再自动提取
            StorageManager.setBlocked(host, true);
            StorageManager.saveParams(host, { T0: 0, N0: 0, B0: 0, L: 0 });
            alert('魔力值参数获取失败，该站点已记录，后续不再自动获取。请将Tampermonkey的配置模式修改为高级后手动修改存储配置参数，详见说明文档');
            return;
        }
        StorageManager.saveParams(host, { T0: params.T0, N0: params.N0, B0: params.B0, L: params.L });
    }

    if (!params.ready) return;

    const { T0, N0, B0, L } = params;

    // --- 获取当前 A、B 值 ---
    let A, B;
    const mbCfg = profile.myonus || {};

    if (mbCfg.extractCurrentB) {
        // M-Team：从页面提取 B 值，然后反推 A
        let rawB = mbCfg.extractCurrentB($);
        B = mbCfg.adjustB ? mbCfg.adjustB($, rawB) : rawB;
    } else {
        // NexusPHP：从页面提取 A 值，然后计算 B
        A = mbCfg.extractCurrentA ? mbCfg.extractCurrentA($) : 0;
        B = CalcEngine.calcB(A, B0, L);
    }

    // 防止 B 值溢出（B 理论上不可达到 B0）
    B = B >= B0 ? B0 * 0.98 : B;

    // M-Team 需从修正后 B 值反推 A
    if (mbCfg.extractCurrentB) {
        A = CalcEngine.calcAbyB(B, B0, L);
    }

    // --- 渲染图表 ---
    const chartInsertSelector = mbCfg.chartInsertSelector || 'table+h1';
    const $insertBefore = $(chartInsertSelector);
    if ($insertBefore.length) {
        Renderer.renderChart({ $insertBefore, A, B, B0, L });
    }
}

/**
 * 处理种子列表页（/torrents）：
 *   为每行种子添加 B|A@A/GB 列。
 */
function handleTorrentsPage($, profile, params) {
    const cfg = profile.seedTable;
    let $headerCells, $dataRows;

    if (cfg.headerSelector) {
        // M-Team：表头和内容分离
        $headerCells = $(cfg.headerSelector);
        $dataRows = $(cfg.rowSelector);
    } else {
        // NexusPHP：表头是第一行
        const $allRows = $(cfg.rowSelector);
        if ($allRows.length < 2) return;
        $headerCells = $allRows.first().children(cfg.headerTag);
        $dataRows = $allRows.slice(1);
    }

    // --- 检测列索引 ---
    let cols;
    if (cfg.colStrategy === 'position') {
        // 固定偏移策略
        const allHeaders = cfg.headerSelector
            ? $(cfg.headerSelector)
            : $(cfg.rowSelector).first().children(cfg.headerTag);
        const colLen = allHeaders.length;
        // 检查是否已添加过 B|A@A/GB 列
        const alreadyAdded = allHeaders.last().text().indexOf(cfg.colTitle) !== -1;
        if (alreadyAdded) {
            // 仅更新数据列
            const adjLen = colLen - 1;
            cols = {
                i_T: adjLen - cfg.colOffsets.timeFromEnd,
                i_S: adjLen - cfg.colOffsets.sizeFromEnd,
                i_N: adjLen - cfg.colOffsets.seedersFromEnd,
            };
            Renderer.addTableColumn({
                $headerRow: cfg.headerSelector ? $(cfg.headerSelector).parent() : $headerCells.parent(),
                $dataRows, cols, params, tableCfg: cfg, updateOnly: true,
            });
            return;
        }
        cols = {
            i_T: colLen - cfg.colOffsets.timeFromEnd,
            i_S: colLen - cfg.colOffsets.sizeFromEnd,
            i_N: colLen - cfg.colOffsets.seedersFromEnd,
        };
    } else {
        // 图标识别策略
        cols = DOMParser.detectColumnsByIcon($headerCells, cfg.iconClasses);
        if (!cols) {
            console.log('[PTMyBonusCalc] 未检测到 NexusPHP 种子表格，跳过。');
            return;
        }
    }

    // --- 添加列 ---
    const $headerRow = cfg.headerSelector
        ? $(cfg.headerSelector).parent()
        : $(cfg.rowSelector).first();

    Renderer.addTableColumn({ $headerRow, $dataRows, cols, params, tableCfg: cfg });
}

/**
 * 处理用户详情页（/userdetails）：
 *   监听 AJAX 加载的做种表格，动态添加 B|A@A/GB 列。
 */
function handleUserdetailsPage($, profile, params) {
    const udCfg = profile.userdetails;
    if (!udCfg) {
        console.log('[PTMyBonusCalc] 当前站点未配置 userdetails 支持。');
        return;
    }

    const tableCfg = profile.seedTable;
    const containers = udCfg.containerSelectors || [udCfg.containerSelector];

    /**
     * 为 userdetails 做种/下载表格添加 B|A@A/GB 列。
     * userdetails 页面的表格时间列没有 img.time 图标，需要通过日期格式识别。
     */
    function processTable($table) {
        const $rows = $table.find('tr');
        if ($rows.length < 2) return;

        const $headerCells = $rows.first().children('td');

        // 通过图标识别 size 和 seeders 列
        let i_S, i_N;
        $headerCells.each(function (col) {
            if ($(this).find('img.size').length) i_S = col;
            else if ($(this).find('img.seeders').length) i_N = col;
        });
        if (i_S === undefined || i_N === undefined) {
            console.log('[PTMyBonusCalc] 无法识别 userdetails 表格的 size/seeders 列，跳过。');
            return;
        }

        // 通过日期格式识别时间列
        const i_T = DOMParser.detectTimeColByDatePattern($rows);
        if (i_T === undefined) {
            console.log('[PTMyBonusCalc] 无法识别 userdetails 表格的时间列，跳过。');
            return;
        }

        // 检查是否已添加过列
        const alreadyAdded = $headerCells.last().text().indexOf(tableCfg.colTitle) !== -1;

        Renderer.addTableColumn({
            $headerRow: $rows.first(),
            $dataRows: $rows.slice(1),
            cols: { i_T, i_S, i_N },
            params,
            tableCfg,
            updateOnly: alreadyAdded,
        });
    }

    /**
     * 为指定容器设置 MutationObserver，监听 AJAX 加载的表格。
     */
    function setupContainerObserver(selector) {
        const $container = $(selector);
        if (!$container.length) {
            console.log('[PTMyBonusCalc] 未找到表格容器 ' + selector);
            return;
        }

        // 如果表格已存在（页面已展开），立即处理
        const $existingTable = $container.find('table');
        if ($existingTable.length) {
            processTable($existingTable);
        }

        // MutationObserver 监听 AJAX 加载和翻页
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.tagName === 'TABLE') {
                            processTable($(node));
                        } else if (node.querySelectorAll) {
                            $(node).find('table').each(function () {
                                processTable($(this));
                            });
                        }
                    });
                }
            });
        });

        observer.observe($container[0], { childList: true, subtree: true });
        console.log('[PTMyBonusCalc] 表格容器监听已启动: ' + selector);
    }

    // 为每个容器（做种 #ka1、下载 #ka2 等）设置监听
    containers.forEach(setupContainerObserver);
}

// ============================================================
// 第 7 层：应用控制器
// ============================================================

const App = {
    /** @type {object} 当前站点配置 */
    profile: null,
    /** @type {string} 站点二级域名，用作存储键 */
    host: '',
    /** @type {string} 当前页面类型 */
    pageType: '',

    /**
     * 初始化：检测站点和页面类型。
     * @returns {boolean} 是否应该继续运行
     */
    init() {
        const $ = jQuery;
        this.host = window.location.host.match(/\b[^.]+\.[^.]+$/)[0];
        const url = window.location.toString();

        // --- 匹配站点配置 ---
        for (const p of SITE_PROFILES) {
            if (p.match(this.host)) {
                this.profile = p;
                break;
            }
        }

        // --- 检测页面类型 ---
        if (url.indexOf('mybonus') !== -1) {
            this.pageType = 'mybonus';
        } else if (url.indexOf('bonus.php') !== -1 && url.indexOf('tjupt.org') !== -1) {
            // TJUPT 兼容：魔力值页面 URL 为 bonus.php
            this.pageType = 'mybonus';
        } else if (url.indexOf('userdetails') !== -1) {
            this.pageType = 'userdetails';
        } else if (url.indexOf('torrents') !== -1 || url.indexOf('browse') !== -1) {
            this.pageType = 'torrents';
        } else {
            this.pageType = 'unknown';
        }

        // 检查页面是否在该站点的有效范围内（如 M-Team 仅限 mybonus/browse）
        if (this.profile.validPages) {
            // 'torrents' 类型的 URL 可能是 browse 也可能是 torrents，统一映射检查
            const pageKey = (this.pageType === 'torrents' && url.indexOf('browse') !== -1)
                ? 'browse' : this.pageType;
            if (!this.profile.validPages.includes(pageKey)) return false;
        }

        return true;
    },

    /**
     * 主运行入口。
     */
    run() {
        const $ = jQuery;

        // 更新页面类型（SPA 页面切换时可能变化）
        const url = window.location.toString();
        if (url.indexOf('mybonus') !== -1) {
            this.pageType = 'mybonus';
        } else if (url.indexOf('bonus.php') !== -1 && url.indexOf('tjupt.org') !== -1) {
            this.pageType = 'mybonus';
        } else if (url.indexOf('torrents') !== -1 || url.indexOf('browse') !== -1) {
            this.pageType = 'torrents';
        } else if (url.indexOf('userdetails') !== -1) {
            this.pageType = 'userdetails';
        }

        // --- 获取魔力值参数 ---
        const stored = StorageManager.getParams(this.host);

        // --- 按页面类型分发处理 ---
        switch (this.pageType) {
            case 'mybonus':
                handleMybonusPage($, this.host, this.profile, stored);
                break;

            case 'userdetails':
                if (!stored.ready) {
                    alert('未找到魔力值参数，请先打开魔力值系统说明页面获取（/mybonus）');
                    return;
                }
                handleUserdetailsPage($, this.profile, stored);
                break;

            case 'torrents':
                if (!stored.ready) {
                    alert('未找到魔力值参数，请先打开魔力值系统说明页面获取（/mybonus）');
                    return;
                }
                handleTorrentsPage($, this.profile, stored);
                break;

            default:
                // 未知页面类型，静默退出
                break;
        }
    },

    /**
     * SPA 页面加载检测与运行（M-Team 专用）。
     *
     * M-Team 使用 SPA 架构，页面内导航不会触发完整页面刷新。
     * 通过三层轮询检测 DOM 变化，等待种子表格加载完成后执行。
     */
    runWithSPAWait() {
        const $ = jQuery;
        const self = this;
        let count = 0;
        let tableBlured = false;
        let T0Found = false;
        let seedTableFound = false;

        // 更新页面类型
        self.pageType = window.location.toString().indexOf('mybonus') !== -1 ? 'mybonus' : 'torrents';

        // 第一层：等待魔力值参数元素或种子表格出现
        const itv = setInterval(() => {
            if (self.pageType === 'mybonus') {
                T0Found = $("li:has(b:contains('T0'))")[1];
            }
            if (T0Found || seedTableFound || count >= 100) {
                clearInterval(itv);
                self.run();
            }
            count++;
        }, 100);

        // 第二层：检测表格是否进入加载状态（模糊遮罩出现）
        let count2 = 0;
        const itvBlur = setInterval(() => {
            if ($('div.ant-spin-blur')[0] || count2 >= 50) {
                tableBlured = true;
                clearInterval(itvBlur);
            }
            count2++;
        }, 100);

        // 第三层：检测表格加载完成（遮罩消失）
        let count3 = 0;
        const itvUnblur = setInterval(() => {
            if ((tableBlured && !$('div.ant-spin-blur')[0]) || count3 >= 100) {
                seedTableFound = $(self.profile.seedTable.rowSelector)[1];
                if (seedTableFound || count3 >= 100) {
                    clearInterval(itvUnblur);
                }
            }
            count3++;
        }, 100);
    },
};

// ============================================================
// 入口
// ============================================================

(function () {
    if (!App.init()) return;

    if (App.profile.isSPA) {
        App.runWithSPAWait();

        // SPA URL 变化监听（页面内导航时重新执行）
        if (window.onurlchange === null) {
            window.addEventListener('urlchange', function () {
                App.runWithSPAWait();
            });
        }
    } else {
        App.run();
    }
})();
