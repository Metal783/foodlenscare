/**
 * 首页 —— 第一个动作页（拍包装）
 *
 * 适老化约束（方案 3.3）：
 *  - 每屏只呈现一个动作：这一屏只有「拍一张照片」是主操作；
 *  - 主操作按钮 96×96 dp/pt 起步，占据屏幕最大视觉权重；
 *  - 无侧边栏、无二级菜单、无广告、无弹窗；
 *  - 单一主线，其余入口（相册、记录、设置、看标签）全部是次级大按钮。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { DEMO_PRESETS } from '../recognize/demo.js';
import { loadRecords, recordsOfToday, todayTotals, saveProfile } from '../core/store.js';
import { DAILY_LIMITS } from '../data/nutrition.js';
import { pickPhoto, processPhoto, processDemoCase, reportFailure } from '../core/flow.js';
import * as speech from '../core/speech.js';

/**
 * 两组演示画像。
 *
 * 存在的理由：答辩现场最需要展示的一句话是「同一张标签，不同的人结论不一样」。
 * 如果每次都要现场走五屏画像设置，演示节奏会被打断；这里给一个一键切换。
 * 切换后写入的是真实的本地画像，和用户自己设置的效果完全一致。
 */
const DEMO_PROFILES = [
  {
    id: 'allergy',
    label: '我：花生和牛奶过敏，还控糖',
    note: '看含花生的饼干会变成红色警示',
    profile: {
      completed: true,
      ageGroup: 'age70',
      concerns: ['sugar', 'salt'],
      allergens: ['peanut', 'milk'],
      conditions: [],
      voiceOn: true
    }
  },
  {
    id: 'plain',
    label: '我：什么都不过敏，只留意血压',
    note: '同一块饼干变成黄色提醒',
    profile: {
      completed: true,
      ageGroup: 'age70',
      concerns: ['salt'],
      allergens: [],
      conditions: ['hypertension'],
      voiceOn: true
    }
  }
];

function isDemoProfileActive(demo, profile) {
  const a = [...(profile.allergens || [])].sort().join(',');
  const b = [...(demo.profile.allergens || [])].sort().join(',');
  return a === b && [...(profile.concerns || [])].sort().join(',') === [...demo.profile.concerns].sort().join(',');
}

function switchProfile(demo, ctx) {
  const next = { ...demo.profile, voiceOn: ctx.state.profile.voiceOn };
  ctx.setState({ profile: next, result: null });
  saveProfile(next);
  toast(`已切换为「${demo.label}」，再点一次演示用例就能看到不同的结论。`, 4200);
  ctx.rerender();
}

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderHome(view, _params, ctx) {
  const profile = ctx.state.profile;
  const today = recordsOfToday(loadRecords());
  const totals = todayTotals();

  // 接住「按钮真的被点到了」这件事：系统相机可能有一两秒才弹出来，
  // 中间完全没有反馈会让人以为没按上，于是又去戳一下。
  const shutterSub = h('span', { class: 'shutter-hint', text: '对准配料表和营养成分表' });

  const setShutterNote = (text) => {
    shutterSub.textContent = text || '对准配料表和营养成分表';
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

  const runDemo = async (caseId) => {
    try {
      const result = await processDemoCase(caseId, profile);
      ctx.setState({ result });
      ctx.navigate('result');
    } catch (error) {
      reportFailure(error);
    }
  };

  const budgetLine = buildBudgetLine(totals);

  fill(view, [
    topbar({
      title: '食护家 FoodLensCare',
      right: h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        style: { minHeight: '3rem', padding: '0.4rem 0.8rem' },
        onClick: () => ctx.navigate('settings'),
        'aria-label': '设置'
      }, [h('span', { class: 'btn-icon', html: icon('sliders') }), h('span', { text: '设置' })])
    }),

    h('section', { class: 'card hero' }, [
      h('h2', { class: 'card-title', text: '举起手机，对准包装背面' }),
      h('p', { class: 'hero-sub', text: '拍一张照片就行，不用打字。我来告诉您这个能不能吃。' }),
      h('button', {
        class: 'shutter',
        type: 'button',
        onClick: () => grab('camera'),
        'aria-label': '拍一张食品包装的照片'
      }, [
        h('span', { class: 'shutter-icon', html: icon('camera') }),
        h('span', { text: '拍一张照片' }),
        shutterSub
      ])
    ]),

    button({
      label: '从相册里选一张',
      iconHtml: icon('album'),
      variant: 'secondary',
      block: true,
      onClick: () => grab('album')
    }),

    budgetLine,

    h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: '今天的记录' }),
      today.length
        ? h('p', { text: `今天已经看过 ${today.length} 件食品，最近一件：${today[today.length - 1].productName}。` })
        : h('p', { text: '今天还没看过东西。看完会自动记下来，方便您回头查。' }),
      button({
        label: '看看今天的记录',
        iconHtml: icon('clipboard'),
        variant: 'secondary',
        block: true,
        onClick: () => ctx.navigate('records')
      })
    ]),

    h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: '没带包装？用演示用例试试' }),
      h('p', { class: 'footnote', text: '这三条数据已经存在手机里，不用联网也能演示，答辩和断网时最稳。' }),
      h('div', { class: 'option-list' },
        DEMO_PRESETS.map((preset) =>
          h('button', {
            class: 'option',
            type: 'button',
            onClick: () => runDemo(preset.id)
          }, [
            h('span', { class: 'option-mark', html: icon('arrowRight') }),
            h('span', { class: 'option-text' }, [
              h('span', { text: preset.title }),
              h('span', { class: 'option-note', text: preset.hint })
            ])
          ])
        )
      ),
      h('hr', { class: 'divider' }),
      h('p', { class: 'footnote', text: '换一个「我」来看同一件食品：同一张标签，不同的人结论不一样，这就是规则层在起作用。' }),
      h('div', { class: 'option-list' },
        DEMO_PROFILES.map((demo) =>
          h('button', {
            class: 'option',
            type: 'button',
            'aria-pressed': isDemoProfileActive(demo, profile) ? 'true' : 'false',
            onClick: () => switchProfile(demo, ctx)
          }, [
            h('span', { class: 'option-mark', html: icon(isDemoProfileActive(demo, profile) ? 'check' : 'arrowRight') }),
            h('span', { class: 'option-text' }, [
              h('span', { text: demo.label }),
              h('span', { class: 'option-note', text: demo.note })
            ])
          ])
        )
      )
    ]),

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

/** 「今日还剩多少额度」——把阈值变成老人看得懂的剩余量 */
function buildBudgetLine(totals) {
  if (!totals.count) {
    return h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: '今天的额度' }),
      h('div', { class: 'record-total' }, [
        h('span', { text: `盐 ${DAILY_LIMITS.sodium.limit} ${DAILY_LIMITS.sodium.unit}` }),
        h('span', { text: `糖 ${DAILY_LIMITS.sugar.limit} ${DAILY_LIMITS.sugar.unit}` }),
        h('span', { text: `饱和脂肪 ${DAILY_LIMITS.saturatedFat.limit} ${DAILY_LIMITS.saturatedFat.unit}` })
      ]),
      h('p', { class: 'footnote', text: '这是 60 岁以上人群一天的建议上限，每看一件食品就自动扣减。' })
    ]);
  }

  const rows = ['sodium', 'sugar', 'saturatedFat'].map((key) => {
    const limit = DAILY_LIMITS[key];
    const used = Math.min(totals[key] || 0, limit.limit);
    const ratio = limit.limit > 0 ? used / limit.limit : 0;
    const tone = ratio >= 1 ? 'high' : ratio >= 0.6 ? 'over' : 'ok';
    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-head' }, [
        h('span', { text: `${limitLabel(key)}今天还能吃` }),
        h('span', {
          class: 'meter-value',
          text: `还剩 ${Math.max(0, Math.round((limit.limit - used) * 10) / 10)} ${limit.unit}`
        })
      ]),
      h('div', { class: 'meter-track' }, [
        h('div', {
          class: 'meter-fill',
          dataset: { tone },
          style: { width: `${Math.min(100, Math.round(ratio * 100))}%` }
        })
      ])
    ]);
  });

  return h('section', { class: 'card' }, [
    h('h3', { class: 'card-title', text: '今天的额度' }),
    ...rows,
    h('p', { class: 'footnote', text: '按 60 岁以上人群的建议上限逐件扣减，只是提醒，不是医嘱。' })
  ]);
}

function limitLabel(key) {
  return { sodium: '盐', sugar: '糖', saturatedFat: '油（饱和脂肪）' }[key] || key;
}
