/**
 * 设置
 *
 * 三项都直接对应适老化要求：
 *  - 字体三档调节（规范要求「主要文字 ≥ 18dp/pt，最大字体 ≥ 30dp/pt」）；
 *  - 语音播报开关与语速（视力下降用户的主要信息通道）；
 *  - 画像修改入口（一次只问一件事的流程可重复进入）。
 *
 * 刻意不做二级菜单：设置页只有一个层级，自上而下滚动到底。
 * （2026-10-09 实测：390×844 视口下页面总高约 1.9 屏，「我的情况」正好落在折叠线
 *   以下、初始看不见。这是有意的取舍——宁可多滑一下，也不新增一个层级。
 *   所以本文件里不要再写「设置本身也在一屏之内」这类话，它不是事实。）
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { AGE_GROUPS, CONCERNS, CONDITIONS } from '../data/nutrition.js';
import { ALLERGEN_BY_ID } from '../data/allergens.js';
import { savePrefs, saveProfile } from '../core/store.js';
import * as speech from '../core/speech.js';

/**
 * 三档字号：只说体感，不说「磅」。
 *
 * 老人不知道「磅」是什么，也无法从 20/24/29 判断差别大不大；
 * 真正的反馈是卡片顶上那句会跟着变大变小的示例句（见 draw() 里的 .preview-sentence）。
 */
const TEXT_SIZES = [
  { id: 'large', label: '标准大字', note: '字小一点，看着不挤' },
  { id: 'xlarge', label: '更大', note: '字大一些，更省力' },
  { id: 'huge', label: '最大', note: '字最大，一行放不下几个字' }
];

/**
 * 语音播报的两个并列选项，与画像设置第 5 屏同一套说法。
 *
 * 这里曾经是一个「标签随状态变化」的开关：关闭时显示「不用念（已关闭）」，
 * 配一个空勾选框——勾了到底是念还是不念，看不出来。选项名必须固定。
 */
const VOICE_CHOICES = [
  { id: 'on', label: '要，念给我听', note: '看完标签自动念一遍结论' },
  { id: 'off', label: '不用念', note: '只看文字，不出声' }
];

/**
 * 「我的情况」四行。点哪一行就用单问题模式只改哪一项
 * （#/onboarding?step=xxx，见 pages/onboarding.js 的 singleMode）。
 */
const PROFILE_ROWS = [
  { key: 'ageGroup', label: '年纪', value: readAge },
  { key: 'concerns', label: '想注意', value: readConcerns },
  { key: 'allergens', label: '过敏', value: readAllergens },
  { key: 'conditions', label: '医生说过', value: readConditions }
];

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderSettings(view, _params, ctx) {
  /* prefs / profile 必须每次重绘都从 ctx.state 现取。
     setState 换的是**新对象**，如果在函数入口捕获一次，切换档位后
     aria-pressed 仍然读旧值——表现就是「点了没反应」。 */
  const draw = () => {
    const prefs = ctx.state.prefs;
    const profile = ctx.state.profile;

    fill(view, [
      /* 顶栏不给「返回」：设置与首页、记录是底栏的平级目的地（见 app.js 的 syncTabbar）。
         底栏导航模型里，目的地页面再放一个「返回」，老人不知道会退回哪里。
         流程页（确认 / 进度 / 结果 / 画像 / 说明）仍然保留返回，别一起改。 */
      topbar({ title: '设置' }),

      /* ---------------- 字体大小 ---------------- */
      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: '字要大一点吗？' }),
        /* 示例句从卡片底部搬到选项**上面**（搬，不是新增：原来那句脚注就是它）。
           改动档位时它立刻跟着变大变小，比「正文约 20 磅」直观得多。
           卡片高度要盯住：这一卡原本就有 425px，别再往里加东西。 */
        h('p', { class: 'footnote', text: '下面这句话会跟着变大变小，您看着舒服就行。' }),
        h('p', { class: 'preview-sentence', text: '这个饼干里有花生，您对花生过敏，别吃。' }),
        h('ul', { class: 'option-list' },
          TEXT_SIZES.map((size) =>
            h('li', {}, [
              h('button', {
                class: 'option',
                type: 'button',
                'aria-pressed': prefs.textSize === size.id ? 'true' : 'false',
                onClick: () => {
                  const next = { ...ctx.state.prefs, textSize: size.id };
                  ctx.setState({ prefs: next });
                  savePrefs(next);
                  applyTextSize(size.id);
                  draw();
                }
              }, [
                h('span', { class: 'option-mark', html: icon('check') }),
                h('span', { class: 'option-text' }, [
                  h('span', { text: size.label }),
                  h('span', { class: 'option-note', text: size.note })
                ])
              ])
            ])
          )
        )
      ]),

      /* ---------------- 语音播报 ---------------- */
      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: '语音播报' }),
        speech.isSupported()
          ? h('ul', { class: 'option-list' },
              VOICE_CHOICES.map((choice) => {
                const turnOn = choice.id === 'on';
                return h('li', {}, [
                  h('button', {
                    class: 'option',
                    type: 'button',
                    'aria-pressed': Boolean(profile.voiceOn) === turnOn ? 'true' : 'false',
                    onClick: () => {
                      const next = { ...ctx.state.profile, voiceOn: turnOn };
                      ctx.setState({ profile: next });
                      saveProfile(next);
                      if (turnOn) {
                        // 借这次点击完成语音权限解锁。
                        speech.unlock();
                        speech.speak('好的，我会念给您听。');
                      } else {
                        speech.stop();
                      }
                      draw();
                    }
                  }, [
                    h('span', { class: 'option-mark', html: icon('check') }),
                    h('span', { class: 'option-text' }, [
                      h('span', { text: choice.label }),
                      h('span', { class: 'option-note', text: choice.note })
                    ])
                  ])
                ]);
              })
            )
          : h('p', { class: 'error-box', text: '这台设备的浏览器不支持语音朗读。结论会用更大的字显示，其余功能不受影响。' }),
        button({
          label: '试听一句',
          iconHtml: icon('speaker'),
          variant: 'secondary',
          block: true,
          onClick: () => {
            if (!speech.isSupported()) {
              toast('这台设备不支持语音朗读。', 2600);
              return;
            }
            speech.unlock();
            speech.speak('这个饼干里有花生，您对花生过敏，别吃。');
          }
        })
      ]),

      /* ---------------- 我的情况 ---------------- */
      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: '我的情况' }),
        /* 四行都可点：点哪一行就只改哪一项。
           以前是「只读表格 + 一个大按钮」，看到填错了也只能把五屏重走一遍。 */
        profileRows(profile, ctx),
        h('p', { class: 'footnote', text: '点上面任意一行就能改那一项。这些内容只存在您的手机里，不会上传。' })
      ]),

      /* ---------------- 适老化自检与说明 ---------------- */
      button({
        label: '这个软件是怎么做适老化的',
        iconHtml: icon('info'),
        variant: 'ghost',
        block: true,
        onClick: () => ctx.navigate('help')
      })
    ]);
  };

  draw();
}

/**
 * 「我的情况」四行。每行是一个按钮，点进去进入单问题模式。
 *
 * 为什么不用表格：原来的表格展示得其实很清楚，问题是「看到填错了也没法改」。
 * 行本身即入口，值仍然并排显示，两件事一次解决。
 * 无障碍：按钮的可读名把「改什么 + 现在是什么」一起念出来。
 */
function profileRows(profile, ctx) {
  return h('ul', { class: 'setting-rows' },
    PROFILE_ROWS.map((row) => {
      const value = row.value(profile);
      return h('li', {}, [
        h('button', {
          class: 'setting-row',
          type: 'button',
          'aria-label': value ? `改「${row.label}」，现在是 ${value}` : `设置「${row.label}」`,
          onClick: () => ctx.navigate('onboarding', { step: row.key })
        }, [
          h('span', { class: 'setting-key', text: row.label }),
          h('span', { class: 'setting-value', text: value || '没有设置' }),
          h('span', { class: 'setting-go', html: icon('arrowRight'), 'aria-hidden': 'true' })
        ])
      ]);
    })
  );
}

/* 四行各自的取值文案。空字符串表示「没有设置」，由 profileRows 统一兜底。 */
function readAge(profile) {
  return AGE_GROUPS.find((a) => a.id === profile.ageGroup)?.label || '';
}

function readConcerns(profile) {
  return (profile.concerns || [])
    .map((id) => CONCERNS.find((c) => c.id === id)?.label)
    .filter(Boolean)
    .join('、');
}

function readAllergens(profile) {
  const ids = (profile.allergens || []).filter((id) => id !== 'none');
  const names = ids.map((id) => ALLERGEN_BY_ID.get(id)?.short).filter(Boolean);
  if (names.length) return names.join('、');
  /* 明确勾过「都不过敏」和「还没设置」是两件事，别混成一句话 */
  return (profile.allergens || []).includes('none') ? '都不过敏' : '';
}

function readConditions(profile) {
  const ids = (profile.conditions || []).filter((id) => id !== 'none');
  const names = ids.map((id) => CONDITIONS.find((c) => c.id === id)?.label).filter(Boolean);
  if (names.length) return names.join('、');
  return (profile.conditions || []).includes('none') ? '以上都没有' : '';
}

/** 把字号偏好写到 <html data-text-size>，全站以 rem 自动缩放 */
export function applyTextSize(id) {
  document.documentElement.dataset.textSize = TEXT_SIZES.some((s) => s.id === id) ? id : 'large';
}
