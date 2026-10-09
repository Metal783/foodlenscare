/**
 * 首页 —— 第一个动作页（拍包装）
 *
 * 结构对齐 `stitch出稿/01-首页-v3.html`（2026-10-09）：
 *  1. 取景框 + 首页唯一的主动作「拍一张照片」+「从相册里选一张」，同在一张卡里；
 *  2. 「今日摄入概览」= 卡片标题行（带「今天的记录 ›」链接）+ 一句话预警行 + 三条额度；
 *     每条额度 = 还剩多少 / 今天已吃与上限 / 进度条；
 *  3. 记录入口收进概览卡的标题行，不再单独占一张卡（省一屏高度）；
 *  4. 顶栏不放「设置」——底栏已经有，重复；
 *  5. 演示用例卡按决定移出界面。`DEMO_PRESETS` / `DEMO_PROFILES` 的数据仍留在
 *     src/recognize/demo.js 与 `#/result?case=<id>`、`?profile=allergy|none` 深链里，
 *     答辩要用时随时能加回。
 *
 * 适老化约束（方案 3.3）：
 *  - 每屏只呈现一个动作：这一屏只有「拍一张照片」是主操作；
 *  - 主操作按钮 96×96 dp/pt 起步，占据屏幕最大视觉权重；
 *  - 无侧边栏、无二级菜单、无广告、无弹窗。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { todayTotals } from '../core/store.js';
import { DAILY_LIMITS } from '../data/nutrition.js';
import { pickPhoto, reportFailure } from '../core/flow.js';
import * as speech from '../core/speech.js';

/** 三条额度的顺序与显示名（与 v3 一致：盐、糖、油） */
const METER_KEYS = ['sodium', 'sugar', 'saturatedFat'];

const METER_LABEL = {
  sodium: '盐（钠）',
  sugar: '糖',
  saturatedFat: '油（饱和脂肪）'
};

/** 预警行里用的短名：一行要放下「…已经到上限了」，名字越短越好 */
const METER_SHORT = { sodium: '盐', sugar: '糖分', saturatedFat: '油' };

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderHome(view, _params, ctx) {
  const profile = ctx.state.profile;
  const totals = todayTotals();

  // 接住「按钮真的被点到了」这件事：系统相机可能有一两秒才弹出来，
  // 中间完全没有反馈会让人以为没按上，于是又去戳一下。
  const shutterSub = h('span', { class: 'shutter-hint', text: '拍清楚就行，不用打字' });

  const setShutterNote = (text) => {
    shutterSub.textContent = text || '拍清楚就行，不用打字';
  };

  const grab = async (mode) => {
    setShutterNote('正在打开相机，请稍等……');
    try {
      const file = await pickPhoto(mode);
      setShutterNote('');
      if (!file) {
        // 用户自己取消了，明确说一句，避免他以为程序没反应
        toast('没有选照片。再点一次就能重新拍。', 2600);
        return;
      }
      ctx.setState({ pendingFile: file, pendingOrigin: mode });
      ctx.navigate('confirm');
    } catch (error) {
      setShutterNote('');
      reportFailure(error);
    }
  };

  fill(view, [
    // 顶栏只放品牌名：设置入口在底栏，不再重复一个按钮
    topbar({ title: '食护家' }),

    /* ---------- 1 · 取景框 + 首页唯一的主动作 ---------- */
    h('section', { class: 'card' }, [
      // 取景框是「示意」不是「可点」：告诉老人把包装放进这个范围，
      // 真正可点的只有下面那个大按钮。四个角标纯装饰。
      h('div', { class: 'viewfinder' }, [
        h('span', { class: 'vf-corner tl', 'aria-hidden': 'true' }),
        h('span', { class: 'vf-corner tr', 'aria-hidden': 'true' }),
        h('span', { class: 'vf-corner bl', 'aria-hidden': 'true' }),
        h('span', { class: 'vf-corner br', 'aria-hidden': 'true' }),
        h('span', { class: 'vf-icon', html: icon('camera'), 'aria-hidden': 'true' }),
        h('span', { class: 'vf-text', text: '把包装背面放进框里' })
      ]),

      h('button', {
        class: 'shutter',
        type: 'button',
        onClick: () => grab('camera'),
        'aria-label': '拍一张食品包装的照片'
      }, [
        h('span', { class: 'shutter-icon', html: icon('camera'), 'aria-hidden': 'true' }),
        h('span', { class: 'shutter-label', text: '拍一张照片' }),
        shutterSub
      ]),

      button({
        label: '从相册里选一张',
        iconHtml: icon('album'),
        variant: 'secondary',
        block: true,
        onClick: () => grab('album')
      })
    ]),

    /* ---------- 2 · 今日摄入概览 ---------- */
    overviewCard(totals),

    h('p', {
      class: 'footnote',
      html:
        '本工具只做日常饮食提醒，<strong>不做疾病诊断</strong>，也不替代医生或营养师的意见。' +
        '所有判断依据都能在结果页展开查看。'
    })
  ]);

  // 语音开关的状态要让用户随时看得见，而不是藏在菜单里
  if (!speech.isSupported() && profile.voiceOn) {
    toast('这台设备的浏览器不支持语音朗读，结论会加大显示。', 3200);
  }
}

/**
 * 「今日摄入概览」。
 *
 * 记录入口收进标题行（`今天的记录 ›`），不再单独占一张卡——v3 的做法，
 * 省下来的高度留给下面的额度条。
 */
function overviewCard(totals) {
  return h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [
      h('span', { class: 'head-icon', html: icon('chart'), 'aria-hidden': 'true' }),
      h('h3', { class: 'card-title', text: '今日摄入概览' }),
      h('a', { class: 'card-link', href: '#/records', 'aria-label': '看看今天的记录' }, [
        h('span', { text: '今天的记录' }),
        h('span', { class: 'icon-link', html: icon('arrowRight'), 'aria-hidden': 'true' })
      ])
    ]),

    alertRow(totals),

    h('div', { class: 'meters' }, METER_KEYS.map((key) => meterRow(key, totals[key] || 0))),

    h('p', { class: 'footnote', text: '按 60 岁以上人群的建议上限逐件扣减，只是提醒，不是医嘱。' })
  ]);
}

/**
 * 一句话预警行 —— v3 里最有价值的一块：老人不用去读三条进度条，
 * 一眼就知道「今天到底还行不行」。
 *
 * 配色只用风险五级里的绿 / 黄 / 橙，**不用红**：
 * 红色在全站只有一个含义——过敏命中「别吃」。
 * 三种状态都同时有「颜色 + 文字 + 图标 + 标签」，颜色不是唯一载体。
 */
function alertRow(totals) {
  // 今天还没看过东西：不预警，改成邀请（中性配色，不占用风险色）
  if (!totals.count) {
    return h('div', { class: 'alert-row', dataset: { tone: 'quiet' } }, [
      h('span', { class: 'alert-icon', html: icon('camera'), 'aria-hidden': 'true' }),
      h('span', { class: 'alert-body' }, [
        h('span', { class: 'alert-title', text: '今天还没看过东西' }),
        h('span', { class: 'alert-sub', text: '拍一张就能看到还剩多少' })
      ])
    ]);
  }

  const ranked = METER_KEYS
    .map((key) => ({ key, ratio: ratioOf(key, totals[key] || 0) }))
    .sort((a, b) => b.ratio - a.ratio);

  const worst = ranked[0];
  const others = ranked.slice(1);
  const otherNames = others.map((r) => METER_SHORT[r.key]).join('和');
  const othersQuiet = others.every((r) => r.ratio < 0.6);

  let tone;
  let title;
  let sub;
  let tag;

  if (worst.ratio >= 1) {
    tone = 'over';
    title = `${METER_SHORT[worst.key]}已经到上限了`;
    sub = othersQuiet ? `${otherNames}还正常` : `${otherNames}也快到了`;
    tag = '超标';
  } else if (worst.ratio >= 0.6) {
    tone = 'watch';
    title = `${METER_SHORT[worst.key]}快吃到上限了`;
    sub = othersQuiet ? `${otherNames}还正常` : `${otherNames}也在涨`;
    tag = '要当心';
  } else {
    tone = 'ok';
    title = '今天三样都还有余量';
    // 副文只说「哪一样最紧张」就够——再说「还剩不少」会和标题重复，而且会折行
    sub = `吃得最多的是${METER_SHORT[worst.key]}`;
    tag = '正常';
  }

  return h('div', { class: 'alert-row', dataset: { tone } }, [
    h('span', { class: 'alert-icon', html: icon(tone === 'ok' ? 'check' : 'alert'), 'aria-hidden': 'true' }),
    h('span', { class: 'alert-body' }, [
      h('span', { class: 'alert-title', text: title }),
      h('span', { class: 'alert-sub', text: sub })
    ]),
    h('span', { class: 'alert-tag', text: tag })
  ]);
}

/** 一条额度：还剩多少（大字）/ 今天已吃与上限（小字）/ 进度条 */
function meterRow(key, used) {
  const limit = DAILY_LIMITS[key];
  const capped = Math.min(used, limit.limit);
  const ratio = limit.limit > 0 ? capped / limit.limit : 0;
  const tone = toneOf(ratio);
  const remaining = Math.max(0, Math.round((limit.limit - capped) * 10) / 10);
  const eaten = Math.round(capped * 10) / 10;

  return h('div', { class: 'meter' }, [
    h('div', { class: 'meter-head' }, [
      h('span', { class: 'meter-name', text: METER_LABEL[key] }),
      h('span', {
        class: 'meter-value',
        dataset: { tone },
        // 「还剩多少」比「已摄入多少」直观，这是 v1 有、v2 砍掉、v3 补回来的
        text: remaining > 0 ? `还剩 ${remaining} ${limit.unit}` : '已经用完了'
      })
    ]),
    h('p', { class: 'meter-sub', text: `今天已吃 ${eaten} ${limit.unit}，上限 ${limit.limit} ${limit.unit}` }),
    h('div', { class: 'meter-track' }, [
      h('div', {
        class: 'meter-fill',
        dataset: { tone },
        style: { width: `${Math.min(100, Math.round(ratio * 100))}%` }
      })
    ])
  ]);
}

function ratioOf(key, used) {
  const limit = DAILY_LIMITS[key];
  if (!limit || !limit.limit) return 0;
  return Math.min(used, limit.limit) / limit.limit;
}

/**
 * 额度紧张度 → 档位。
 * 正常用品牌绿、将满用黄、吃满用橙，**没有红**。
 */
function toneOf(ratio) {
  if (ratio >= 1) return 'over';
  if (ratio >= 0.6) return 'watch';
  return 'ok';
}
