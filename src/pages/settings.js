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
import { currentAccount, updateAccount } from '../core/service.js';
import { card, note, person, linkButton, familyData, brandHeader, pageIntro, menuRow, toggle, statusTag } from '../ui/care.js';

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
  let alive = true;
  const familySummary = note('查看家人和共享设置');
  if (currentAccount()) familyData().then(families => { if (alive) familySummary.textContent = `已绑定 ${families.filter(f => f.amElder && f.status === 'bound').length} 位家人 · 联系与共享`; }).catch(() => {});
  const draw = () => {
    const prefs = ctx.state.prefs;
    const profile = ctx.state.profile;
    const fonts = h('details', { class: 'settings-expander font-options' }, [h('summary', { text: '字要大一点吗？' }),
      h('p', { class: 'preview-sentence', text: '这个饼干里有花生，您对花生过敏，别吃。' }),
      h('ul', { class: 'option-list' }, TEXT_SIZES.map(size => h('li', {}, [h('button', { class: 'option', type: 'button', 'aria-pressed': prefs.textSize === size.id ? 'true' : 'false', onClick: () => {
        const next = { ...ctx.state.prefs, textSize: size.id }; ctx.setState({ prefs: next }); savePrefs(next); applyTextSize(size.id);
        if (currentAccount()) updateAccount({ prefs: next }).catch(error => toast(`本机已保存，同步失败：${error.message}`));
        draw(); view.querySelector('.settings-expander').open = true;
      } }, [h('span', { class: 'option-mark', html: icon('check') }), h('span', { class: 'option-text' }, [h('span', { text: size.label }), h('span', { class: 'option-note', text: size.note })])])])))]);
    const voiceChange = async enabled => {
      const next = { ...ctx.state.profile, voiceOn: enabled };
      if (currentAccount()) await updateAccount({ profile: next });
      saveProfile(next); ctx.setState({ profile: next });
      if (enabled) { speech.unlock(); speech.speak('好的，我会念给您听。'); } else speech.stop();
    };
    fill(view, [brandHeader(), pageIntro('我的设置'),
      h('section', { class: 'card profile-summary' }, [h('button', { class: 'profile-summary-open', type: 'button', onClick: () => ctx.navigate('profile', { edit: '1' }) }, [person(profile, currentAccount()?.phone), h('span', { html: icon('chevron') })]),
        h('div', { class: 'profile-summary-tags' }, [...(profile.concerns || []).map(id => statusTag(CONCERNS.find(c => c.id === id)?.label || id)), h('button', { class: 'text-link', type: 'button', text: '编辑资料', onClick: () => ctx.navigate('profile', { edit: '1' }) })])]),
      card('看得清，听得懂', [menuRow('字体大小', 'textSize', () => { fonts.open = !fonts.open; }, { value: { large: '大字', xlarge: '更大', huge: '最大' }[prefs.textSize] || '大字' }), fonts,
        h('div', { class: 'notification-row' }, [h('span', { html: icon('speaker') }), toggle('语音播报', !!profile.voiceOn, voiceChange, '自动朗读食品识别结果')]),
        h('details', { class: 'settings-expander voice-extra' }, [h('summary', { text: '试听与更多朗读设置' }), note(speech.isSupported() ? '结论会在结果页自动朗读，也可随时重听。' : '这台设备不支持语音朗读，结论仍会以文字显示。'),
          ...VOICE_CHOICES.map(choice => button({ label: choice.label, variant: 'secondary', block: true, onClick: () => voiceChange(choice.id === 'on').catch(error => toast(error.message)) })),
          button({ label: '试听一句', iconHtml: icon('speaker'), variant: 'secondary', block: true, onClick: () => { speech.unlock(); if (!speech.speak('这个饼干里有花生，您对花生过敏，别吃。')) toast('这台设备不支持语音朗读。'); } })])]),
      card('基础信息', [menuRow('基础信息', 'person', () => ctx.navigate('profile', { edit: '1' }), { detail: '查看并修改姓名、手机号等信息' }),
        h('details', { class: 'settings-expander' }, [h('summary', { text: '我的情况 · 分项修改' }), profileRows(profile, ctx), note('只改选中的一项，其余设置保留。')])]),
      h('section', { class: 'card family-settings-entry' }, [menuRow('子女守护', 'shield', () => ctx.navigate('family')), familySummary]),
      card('隐私与帮助', [menuRow('隐私与共享权限', 'shield', () => ctx.navigate('privacy')), menuRow('帮助与使用指南', 'info', () => ctx.navigate('guide')),
        h('details', { class: 'settings-expander' }, [h('summary', { text: '更多设置' }), menuRow('求助号码设置', 'call', () => ctx.navigate('emergency')), menuRow('身份说明与切换', 'refresh', () => ctx.navigate('identity', { switch: '1' })), menuRow('适老化说明', 'textSize', () => ctx.navigate('help'))])]),
      note('食护家 Foodlenscare · 第三版 3.0.0')]);
  };
  draw(); return () => { alive = false; };
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
