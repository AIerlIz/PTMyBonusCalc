// ==UserScript==
// @name         PT站点魔力计算器
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  在使用NexusPHP架构的PT站点显示每个种子的A值和每GB的A值。
// @author       neoblackxt, LaneLau
// @require      https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @require      https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
// @match        *://*.avgv.cc/torrents*
// @match        *://*.avgv.cc/AV*
// @match        *://*.avgv.cc/GV*
// @match        *://*.avgv.cc/LES*
// @match        *://*.avgv.cc/movie*
// @match        *://*.avgv.cc/teleplay*
// @match        *://*.beitai.pt/torrents*
// @match        *://*.pttime.org/torrents*
// @match        *://*.ptsbao.club/torrents*
// @match        *://*.pthome.net/torrents*
// @match        *://kp.m-team.cc/*
// @match        *://*.hddolby.com/torrents*
// @match        *://*.leaguehd.com/torrents*
// @match        *://*.hdhome.org/torrents*
// @match        *://*.hdsky.me/torrents*
// @match        *://*.ourbits.club/torrents*
// @match        *://*.u2.dmhy.org/torrents*
// @match        *://*.hdzone.me/torrents*
// @match        *://*.hdatmos.club/torrents*
// @match        *://*.pt.soulvoice.club/torrents*
// @match        *://*.pt.soulvoice.club/live*
// @match        *://*.discfan.net/torrents*
// @match        *://*.hdtime.org/torrents*
// @match        *://*.nicept.net/torrents*
// @match        *://*.pterclub.com/torrents*
// @match        *://*.hdarea.co/torrents*
// @match        *://*.hdfans.org/torrents*
// @match        *://pt.btschool.club/torrents*
// @match        *://*.1ptba.com/torrents*
// @match        *://www.oshen.win/torrents*
// @match        *://hdmayi.com/torrents*
// @match        *://pt.msg.vg/torrents*
// @match        *://*/mybonus.php*
// @match        *://ptchina.org/torrents*
// @match        *://52pt.site/torrents*
// @match        *://zmpt.cc/torrents*
// @match        *://carpt.net/torrents*
// @match        *://cyanbug.net/torrents*
// @license      GPL License
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL https://update.greasyfork.org/scripts/439369/PT%E7%AB%99%E7%82%B9%E9%AD%94%E5%8A%9B%E8%AE%A1%E7%AE%97%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/439369/PT%E7%AB%99%E7%82%B9%E9%AD%94%E5%8A%9B%E8%AE%A1%E7%AE%97%E5%99%A8.meta.js
// ==/UserScript==

function run() {
    var $ = jQuery;

    let host = window.location.host.match(/\b[^\.]+\.[^\.]+$/)[0]
    let isMybonusPage = window.location.toString().indexOf("mybonus.php")!=-1
    let argsReady = true;
    let T0 = GM_getValue(host + ".T0");
    let N0 = GM_getValue(host + ".N0");
    let B0 = GM_getValue(host + ".B0");
    let L = GM_getValue(host + ".L");
    if(!(T0 && N0 && B0 &&L)){
        argsReady = false
        if(!isMybonusPage){
            alert("未找到魔力值参数,请打开魔力值系统说明获取（/mybonus.php）");
        }
    }
    if (isMybonusPage){
        T0 = parseInt($("li:has(b:contains('T0'))")[1].innerText.split(" = ")[1]);
        N0 = parseInt($("li:has(b:contains('N0'))")[1].innerText.split(" = ")[1]);
        B0 = parseInt($("li:has(b:contains('B0'))")[1].innerText.split(" = ")[1]);
        L = parseInt($("li:has(b:contains('L'))")[1].innerText.split(" = ")[1]);

        GM_setValue(host + ".T0",T0);
        GM_setValue(host + ".N0",N0);
        GM_setValue(host + ".B0",B0);
        GM_setValue(host + ".L",L);

        let A = parseFloat($("div:contains(' (A = ')")[0].innerText.split(" = ")[1]);

        if(!argsReady){
            if(T0 && N0 && B0 && L){
                alert("魔力值参数已更新")
            }else{
                alert("魔力值参数获取失败")
            }
        }

//        function calcB(A){
//            return B0*(2/Math.PI)*Math.atan(A/L)
//        }

        let data = []
        for (let i=0; i<25*L; i=i+L/4){
            data.push([i,calcB(i)])
        }

        $("table+h1").before('<div id="main" style="width: 600px;height:400px; margin:auto;"></div>')

        var myChart = echarts.init(document.getElementById('main'));
        // 指定图表的配置项和数据
        var option = {
            title: {
                text: 'B - A 图',
                top: 'bottom',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross'
                },
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                position: function (pos, params, el, elRect, size) {
                    var obj = { top: 10 };
                    obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
                    return obj;
                },
                extraCssText: 'width: 170px'

            },
            xAxis: {
                name: 'A',
            },
            yAxis: {
                name: 'B'
            },
            axisPointer: {
                label: {
                    backgroundColor: '#777'
                }
            },
            series: [
                {
                    type: 'line',
                    data: data,
                    symbol: 'none'
                },
                {
                    type: 'line',
                    data:[[A,calcB(A)]],
                    symbolSize: 6
                }
            ]
        };

        // 使用刚指定的配置项和数据显示图表。
        myChart.setOption(option);
    }



    function calcA(T, S, N) {
        var c1 = 1 - Math.pow(10, -(T / T0));
        // 当断种时，显示续种后的实际值，因为当前状态值无意义
        N = N ? N : 1;
        // 当前状态值，加入做种后实际值会小于当前值
        // TODO: 改为双行显示为当前值和实际值
        var c2 = 1 + Math.pow(2, .5) * Math.pow(10, -(N - 1) / (N0 - 1));
        return c1 * S * c2;
    }

            function calcB(A){
            return B0*(2/Math.PI)*Math.atan(A/L)
        }

    function makeA($this, i_T, i_S, i_N) {
        var time = $this.children('td:eq(' + i_T + ')').find("span").attr("title");
        var T = (new Date().getTime() - new Date(time).getTime()) / 1e3 / 86400 / 7;
        var size = $this.children('td:eq(' + i_S + ')').text().trim();
        var size_tp = 1;
        var S = size.replace(/[KMGT]B/, function (tp) {
            if (tp == "KB") {
                size_tp = 1 / 1024 / 1024;
            } else if (tp == "MB") {
                size_tp = 1 / 1024;
            } else if (tp == "GB") {
                size_tp = 1;
            } else if (tp == "TB") {
                size_tp = 1024;
            }
            return "";
        });
        S = parseFloat(S) * size_tp;
        var number = $this.children('td:eq(' + i_N + ')').text().trim();
        var N = parseInt(number);
        var A = calcA(T, S, N).toFixed(2);
        var B = calcB(A).toFixed(2);
        var ave = (A / S).toFixed(2);
        if ((ave >= 2) && (N > 0)) {
            //标色A大于体积2倍且不断种的种子
            return '<span style="color:#ff0000;font-weight:900;">' + B + '@' + ave + '</span>'
        }else if ((ave >= 1) && (N > 0)) {
            //标色A大于体积1倍且不断种的种子
            return '<span style="color:#da70d6;font-weight:900;">' + B + '@' + ave + '</span>'
        }else if ((ave < 0.5) && (N > 0)) {
            //标色A小于体积0.5倍且不断种的种子
            return '<span style="color:#e6e6e6;font-weight:900;">' + B + '@' + ave + '</span>'
        } else {
            return '<span style="">' + B + '@' + ave + "</span>"
        }
    }

    var i_T, i_S, i_N
    $('.torrents:last-of-type>tbody>tr').each(function (row) {
        var $this = $(this);
        if (row == 0) {
            $this.children('td').each(function (col) {
                if ($(this).find('img.time').length) {
                    i_T = col
                } else if ($(this).find('img.size').length) {
                    i_S = col
                } else if ($(this).find('img.seeders').length) {
                    i_N = col
                }
            })
            if (!i_T || !i_S || !i_N) {
                alert('未能找到数据列')
                return
            }
            $this.children("td:last").before("<td class=\"colhead\" title=\"B值@每GB的A值\">B@A/GB</td>");
        } else {
            var textA = makeA($this, i_T, i_S, i_N)
            $this.children("td:last").before("<td class=\"rowfollow\">" + textA + "</td>");
        }
    });
}

run()
