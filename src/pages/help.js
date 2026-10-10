/**
 * 说明页 —— 「这个软件是怎么做适老化的」
 *
 * 这一页是参赛材料的组成部分（对照表自检），也是答辩时可以现场翻给评委看的一页：
 * 把「我们做了适老化」从一句主张变成一组可核对的数字与条目。
 */

import { h, topbar, button, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { CONTRAST_REPORT } from '../data/contrast-report.js';
import { CONFIG } from '../recognize/config.js';
import { CHANNEL_LIST } from '../recognize/channels.js';
import { ALLERGENS } from '../data/allergens.js';
import { DAILY_LIMITS, NUTRIENT_FIELDS } from '../data/nutrition.js';
import { loadRecords } from '../core/store.js';

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderHelp(view, _params, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  fill(view, [
    topbar({
      title: '说明与自检',
      onBack: () => {
        if (!ctx.back()) ctx.navigate('home', {}, { replace: true });
      }
    }),

    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '这个软件做什么' }),
      h('p', {
        text:
          '拍一张食品包装背面的照片，系统替您把配料表和营养成分表读明白，' +
          '然后用一句听得懂的话告诉您「这个能不能吃、为什么」。'
      }),
      h('ol', { class: 'ingredient-lines' }, [
        h('li', {}, [h('span', { text: '一、举起手机，对着包装背面拍一张照片。' })]),
        h('li', {}, [h('span', { text: '二、系统认标签：读配料表，读营养成分表。' })]),
        h('li', {}, [h('span', { text: '三、系统比您的情况：过敏成分、控糖控盐控脂的目标。' })]),
        h('li', {}, [h('span', { text: '四、给一个风险等级和一句结论。' })]),
        h('li', {}, [h('span', { text: '五、念给您听，并记进今天的记录。' })])
      ]),
      h('p', {
        class: 'footnote',
        text: '整条流程里没有一处需要打字：要么点按钮，要么拍照。'
      })
    ]),

    /* ---------------- 适老化对照表 ---------------- */
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '适老化对照表（逐条自检）' }),
      h('p', {
        class: 'footnote',
        text: '依据：工信部《移动互联网应用（APP）适老化通用设计规范》。右列是本作品的实测实现。'
      }),
      h('table', { class: 'kv-table' }, [
        h('thead', {}, [
          h('tr', {}, [h('th', { text: '设计维度 / 规范要求' }), h('th', { text: '本作品实现' })])
        ]),
        h('tbody', {}, [
          row('字体：无衬线，主要文字 ≥ 18dp/pt，最大字体 ≥ 30dp/pt',
            `全站无衬线字体；正文三档：20 / 24 / 29 px；结论文字为正文 1.6 倍，最大档约 46 px`),
          row('行间距：行距 ≥ 1.3 倍，段落间距 ≥ 行距的 1.3 倍',
            '正文行距 1.5 倍，段间距 = 行距 × 1.3'),
          row('对比度：文本与图标 ≥ 4.5:1，大字号 ≥ 3:1',
            `最低实测 ${CONTRAST_REPORT.lowestTextRatio}:1（${CONTRAST_REPORT.lowestTextPair}）；正文字号下 ${CONTRAST_REPORT.bodyTextRatio}:1`),
          row('颜色用途：颜色不得作为唯一的信息载体',
            '风险等级同时用颜色、文字标签（红/橙/黄/绿/灰 + 别吃/要当心/留意一下/可以吃/看不清）、图标、语音四种方式表达'),
          row('点击区域：适老版主要组件 ≥ 60×60 dp/pt',
            `主操作按钮 96×96 px（基准字号下），次级按钮 ≥ 60×60 px；当前设备 DPR ${dpr}，可视宽度 ${cssWidth} px`),
          row('手势操作：避免需要 3 个及以上手指的复杂手势',
            '全站只使用单指点击与上下滑动；无长按、无双击、无滑动删除、无拖动排序'),
          row('信息层级：界面简约、流程一致',
            '每屏只呈现一个动作；全站单一主线；无侧边栏、无二级菜单、无抽屉导航'),
          row('禁止项：严禁广告、插件、随机弹窗与诱导按键',
            '零广告、零弹窗、零推荐位；取消确认一律用轻提示，不使用模态框'),
          row('额外：一次只问一件事',
            '画像设置拆成 5 屏单问题，每屏一个大按钮'),
          row('额外：确认代替输入',
            '全站没有输入框；所有需要填写的信息都转为勾选或拍照'),
          row('额外：撤销始终可用',
            '每一步都提供「返回上一步」，误触不会让人陷入困境')
        ])
      ])
    ]),

    /* ---------------- 对比度实测明细 ---------------- */
    h('details', { class: 'basis' }, [
      h('summary', {}, [h('span', { html: icon('textSize') }), h('span', { text: '对比度实测明细' })]),
      h('table', { class: 'kv-table' }, [
        h('thead', {}, [h('tr', {}, [h('th', { text: '文字与背景' }), h('th', { text: '实测对比度' })])]),
        h('tbody', {},
          CONTRAST_REPORT.rows.map((r) =>
            h('tr', {}, [
              h('th', { text: r.name }),
              h('td', { text: `${r.ratio.toFixed(2)}:1　${r.ratio >= 7 ? 'AAA 级' : r.ratio >= 4.5 ? 'AA 级' : '大字号可用'}` })
            ])
          )
        )
      ]),
      h('p', {
        class: 'footnote',
        text: 'WCAG 相对亮度公式计算；全部文字项均达到 AA 级（≥ 4.5:1），多数达到 AAA 级（≥ 7:1）。'
      })
    ]),

    /* ---------------- 数据与依据 ---------------- */
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '判断依据从哪来' }),
      h('table', { class: 'kv-table' }, [
        h('tbody', {}, [
          row('致敏物质', `${ALLERGENS.length} 类，依据 GB 7718-2025 附录 D；新国标将其列为强制标示`),
          row('营养字段', `${NUTRIENT_FIELDS.length} 项，依据 GB 28050-2025 的「1+6」强制标示`),
          row('营养阈值',
            `钠 ${DAILY_LIMITS.sodium.limit} mg、糖 ${DAILY_LIMITS.sugar.limit} g、饱和脂肪 ${DAILY_LIMITS.saturatedFat.limit} g、脂肪 ${DAILY_LIMITS.fat.limit} g（一天的建议上限）`),
          row('阈值依据', '《中国居民膳食营养素参考摄入量（2023 版）》《中国居民膳食指南（2022）》'),
          row('添加剂名词', 'GB 2760 常见品种与 INS 国际编码对照')
        ])
      ])
    ]),

    /* ---------------- 识别通道 ---------------- */
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '识别通道（双通道策略）' }),
      h('ul', { class: 'option-list' },
        CHANNEL_LIST.map((channel) =>
          h('li', {}, [
            h('div', { class: 'option' }, [
              h('span', { class: 'option-mark', html: icon('check') }),
              h('span', { class: 'option-text' }, [
                h('span', { text: `${channel.label}${isActive(channel.id) ? '（当前可用）' : ''}` }),
                h('span', { class: 'option-note', text: channel.description })
              ])
            ])
          ])
        )
      ),
      h('p', {
        class: 'footnote',
        text:
          '两个通道对同一字段的取值不一致时，系统降低该字段置信度并要求补拍，' +
          '而不是强行给出结论——这是「灰色等级」的技术来源。'
      })
    ]),

    /* ---------------- 隐私与合规 ---------------- */
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '隐私与边界' }),
      h('ul', { class: 'ingredient-lines' }, [
        h('li', {}, [h('span', { text: `本机已食用记录共 ${loadRecords().length} 条。游客资料在本机保存；登录后可保存到本人账号，家人查看需要老人授权。` })]),
        h('li', {}, [h('span', { text: '第三版提供本机/局域网测试账号，没有接入真实短信或微信验证，也没有埋点统计。' })]),
        h('li', {}, [h('span', { text: '只做日常饮食提醒，不做疾病诊断，不替代医生或营养师的意见。' })]),
        h('li', {}, [h('span', { text: '信息不足时主动要求补拍，不编造答案。' })])
      ])
    ]),

    /* ---------------- 生成式 AI 使用说明 ---------------- */
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '生成式人工智能工具使用说明（占位）' }),
      h('p', {
        class: 'footnote',
        text:
          '参赛材料要求如实提交 AI 工具使用情况。本文件按「工具名称 / 应用环节 / 生成流程 / ' +
          '提示词或工作流 / 人工筛选与修改过程 / 团队原创贡献 / 版权与数据合规」七项留出填写位。'
      }),
      h('table', { class: 'kv-table' }, [
        h('tbody', {}, [
          row('工具名称', '【待填写】'),
          row('应用环节', '【待填写，例如：界面文案初稿、规则表整理】'),
          row('生成流程', '【待填写】'),
          row('提示词或工作流', '见 src/recognize/config.js 中的 VISION_PROMPT（识别提示词，随代码留档）'),
          row('人工筛选与修改', '【待填写】'),
          row('团队原创贡献', '【待填写：产品判断、规则层设计、适老化交互均为团队独立完成】'),
          row('版权与数据合规', '数据来源为国家标准与公开数据库，不含商业授权内容与用户隐私数据')
        ])
      ])
    ]),

    button({
      label: '回到首页',
      iconHtml: icon('home'),
      block: true,
      huge: true,
      onClick: () => ctx.navigate('home', {}, { replace: true })
    }),

    h('p', {
      class: 'footnote',
      text: `食护家 FoodLensCare · 食品标签初版 · 当前视口 ${cssWidth}×${cssHeight} CSS px`
    })
  ]);
}

function isActive(channelId) {
  if (channelId === 'http') return Boolean(CONFIG.vision.endpoint);
  if (channelId === 'ocr') return Boolean(CONFIG.huaweiOcr.endpoint && CONFIG.huaweiOcr.ak);
  return true; // 演示与模拟通道始终可用
}

function row(left, right) {
  return h('tr', {}, [h('th', { text: left }), h('td', { text: right })]);
}
