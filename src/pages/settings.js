/**
 * 设置
 *
 * 三项都直接对应适老化要求：
 *  - 字体三档调节（规范要求「主要文字 ≥ 18dp/pt，最大字体 ≥ 30dp/pt」）；
 *  - 语音播报开关与语速（视力下降用户的主要信息通道）；
 *  - 画像修改入口（一次只问一件事的流程可重复进入）。
 *
 * 刻意不做二级菜单：设置本身也在一屏之内，只有上下滑动。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { AGE_GROUPS, CONCERNS, CONDITIONS } from '../data/nutrition.js';
import { ALLERGEN_CHOICES, ALLERGEN_BY_ID } from '../data/allergens.js';
import { savePrefs, saveProfile } from '../core/store.js';
import { CONFIG } from '../recognize/config.js';
import * as speech from '../core/speech.js';

const TEXT_SIZES = [
  { id: 'large', label: '标准大字', note: '正文约 20 磅，适合大多数情况' },
  { id: 'xlarge', label: '更大', note: '正文约 24 磅' },
  { id: 'huge', label: '最大', note: '正文约 29 磅，结论字号超过 40 磅' }
];

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderSettings(view, _params, ctx) {
  const prefs = ctx.state.prefs;
  const profile = ctx.state.profile;

  const draw = () => {
    fill(view, [
      topbar({
        title: '设置',
        onBack: () => {
          if (!ctx.back()) ctx.navigate('home', {}, { replace: true });
        }
      }),

      /* ---------------- 字体大小 ---------------- */
      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: '字要大一点吗？' }),
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
        ),
        h('p', { class: 'footnote', text: '当前示例文字：这个饼干里有花生，您对花生过敏，别吃。' })
      ]),

      /* ---------------- 语音播报 ---------------- */
      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: '语音播报' }),
        speech.isSupported()
          ? h('ul', { class: 'option-list' }, [
              h('li', {}, [
                h('button', {
                  class: 'option',
                  type: 'button',
                  'aria-pressed': profile.voiceOn ? 'true' : 'false',
                  onClick: () => {
                    const next = { ...ctx.state.profile, voiceOn: !profile.voiceOn };
                    ctx.setState({ profile: next });
                    saveProfile(next);
                    if (next.voiceOn) {
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
                    h('span', { text: profile.voiceOn ? '念给我听（已打开）' : '不用念（已关闭）' }),
                    h('span', { class: 'option-note', text: '打开后，看完标签会自动念一遍结论' })
                  ])
                ])
              ])
            ])
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
        profileSummary(profile),
        button({
          label: '重新设置我的情况',
          iconHtml: icon('sliders'),
          variant: 'secondary',
          block: true,
          onClick: () => ctx.navigate('onboarding')
        }),
        h('p', { class: 'footnote', text: '这些内容只存在您的手机里，不会上传。' })
      ]),

      /* ---------------- 适老化自检与说明 ---------------- */
      button({
        label: '这个软件是怎么做适老化的',
        iconHtml: icon('info'),
        variant: 'ghost',
        block: true,
        onClick: () => ctx.navigate('help')
      }),

      h('p', {
        class: 'footnote',
        text: `当前识别通道：${describeChannel()}。答辩或断网时可以在首页直接使用内置演示用例。`
      })
    ]);
  };

  draw();
}

function profileSummary(profile) {
  const rows = [];

  const age = AGE_GROUPS.find((a) => a.id === profile.ageGroup);
  rows.push(['年纪', age ? age.label : '没有设置']);

  const concerns = (profile.concerns || [])
    .map((id) => CONCERNS.find((c) => c.id === id)?.label)
    .filter(Boolean);
  rows.push(['想注意', concerns.length ? concerns.join('、') : '没有设置']);

  const allergens = (profile.allergens || [])
    .filter((id) => id !== 'none')
    .map((id) => ALLERGEN_BY_ID.get(id)?.short)
    .filter(Boolean);
  rows.push(['过敏', allergens.length ? allergens.join('、') : '没有设置（或都不过敏）']);

  const conditions = (profile.conditions || [])
    .filter((id) => id !== 'none')
    .map((id) => CONDITIONS.find((c) => c.id === id)?.label)
    .filter(Boolean);
  rows.push(['医生说过', conditions.length ? conditions.join('、') : '没有设置']);

  return h('table', { class: 'kv-table' }, [
    h('tbody', {}, rows.map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: v })])))
  ]);
}

function describeChannel() {
  if (CONFIG.vision.endpoint) return '真实多模态识别接口';
  if (CONFIG.huaweiOcr.endpoint && CONFIG.huaweiOcr.ak) return '华为云 OCR 兜底通道';
  return '模拟识别（尚未配置真实接口）';
}

/** 把字号偏好写到 <html data-text-size>，全站以 rem 自动缩放 */
export function applyTextSize(id) {
  document.documentElement.dataset.textSize = TEXT_SIZES.some((s) => s.id === id) ? id : 'large';
}

export const TEXT_SIZE_CHOICES = ALLERGEN_CHOICES;
