/**
 * 首次使用画像设置 —— 逐屏单问题
 *
 * 对照方案 3.3 的三项额外设计：
 *  1. 一次只问一件事：五个问题分成五屏，每屏一个大按钮，不做长表单；
 *  2. 确认代替输入：全部为勾选，不存在键盘输入场景（页面里没有任何 input[type=text]）；
 *  3. 撤销始终可用：每屏都有「返回」，标注「可以跳过」的问题可跳过。
 */

import { h, button, topbar, stepDots, toast, announce, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { AGE_GROUPS, CONCERNS, CONDITIONS } from '../data/nutrition.js';
import { ALLERGEN_CHOICES } from '../data/allergens.js';
import * as speech from '../core/speech.js';
import { saveProfile } from '../core/store.js';

const TOTAL_STEPS = 5;

const STEPS = [
  {
    key: 'ageGroup',
    question: '您今年多大岁数？',
    hint: '不同年纪，吃盐吃糖的尺度不太一样。',
    single: true,
    options: AGE_GROUPS.map((a) => ({ id: a.id, label: a.label, emoji: a.emoji })),
    skippable: true
  },
  {
    key: 'concerns',
    question: '您平时最想注意哪几样？',
    hint: '可以多选，也可以先跳过，以后随时改。',
    single: false,
    options: CONCERNS.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji, note: c.note })),
    skippable: true
  },
  {
    key: 'allergens',
    question: '您吃东西过敏吗？',
    hint: '这一项最要紧，选中的东西系统会重点提醒。不知道就跳过。',
    single: false,
    options: [
      { id: 'none', label: '都不过敏', emoji: '✅', exclusive: true },
      ...ALLERGEN_CHOICES.map((a) => ({ id: a.id, label: a.label, emoji: a.emoji }))
    ],
    skippable: true
  },
  {
    key: 'conditions',
    question: '医生说过您有下面这些情况吗？',
    hint: '只是为了把提醒说得更贴切，不做任何诊断。',
    single: false,
    options: CONDITIONS.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji, exclusive: c.id === 'none' })),
    skippable: true
  },
  {
    key: 'voiceOn',
    question: '要不要念给您听？',
    hint: '打开以后，每次看完标签会自动念一遍结论。',
    single: true,
    options: [
      { id: 'on', label: '要，念给我听', emoji: '🔊' },
      { id: 'off', label: '不用念', emoji: '🔇' }
    ],
    skippable: false
  }
];

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderOnboarding(view, _params, ctx) {
  let stepIndex = 0;
  /** @type {Record<string, any>} */
  const draft = {
    ageGroup: null,
    concerns: [],
    allergens: [],
    conditions: [],
    voiceOn: true
  };

  function commit() {
    const profile = {
      ...ctx.state.profile,
      completed: true,
      ageGroup: draft.ageGroup,
      concerns: [...draft.concerns],
      allergens: [...draft.allergens],
      conditions: [...draft.conditions],
      voiceOn: draft.voiceOn
    };
    saveProfile(profile);
    ctx.setState({ profile });
    if (profile.voiceOn && !speech.isSupported()) {
      toast('这台设备的浏览器不支持语音朗读，文字会加大显示。', 3600);
    }
    ctx.navigate('home', {}, { replace: true });
  }

  function goNext() {
    if (stepIndex >= TOTAL_STEPS - 1) {
      commit();
      return;
    }
    stepIndex += 1;
    draw();
  }

  function goBack() {
    if (stepIndex === 0) {
      ctx.navigate('home', {}, { replace: true });
      return;
    }
    stepIndex -= 1;
    draw();
  }

  function toggle(step, optionId) {
    const stepKey = step.key;
    if (step.single) {
      if (stepKey === 'voiceOn') draft.voiceOn = optionId === 'on';
      else draft[stepKey] = optionId;
      if (stepKey === 'voiceOn' && optionId === 'on') {
        speech.unlock();          // 借这次点击完成语音权限解锁
        speech.speak('好的，我会念给您听。');
      }
      draw();
      return;
    }

    const list = draft[stepKey];
    const option = step.options.find((o) => o.id === optionId);
    if (option?.exclusive) {
      draft[stepKey] = list.includes(optionId) ? [] : [optionId];
    } else {
      const withoutNone = list.filter((id) => id !== 'none');
      draft[stepKey] = withoutNone.includes(optionId)
        ? withoutNone.filter((id) => id !== optionId)
        : [...withoutNone, optionId];
    }
    draw();
  }

  function isSelected(step, optionId) {
    if (step.single) {
      if (step.key === 'voiceOn') return draft.voiceOn === (optionId === 'on');
      return draft[step.key] === optionId;
    }
    return draft[step.key].includes(optionId);
  }

  function draw() {
    const step = STEPS[stepIndex];
    const last = stepIndex === TOTAL_STEPS - 1;

    const optionNodes = step.options.map((option) => {
      const selected = isSelected(step, option.id);
      return h('li', {}, [
        h('button', {
          class: 'option',
          type: 'button',
          'aria-pressed': selected ? 'true' : 'false',
          onClick: () => toggle(step, option.id)
        }, [
          h('span', { class: 'option-mark', html: icon('check') }),
          h('span', { class: 'option-text' }, [
            h('span', { text: `${option.emoji || ''} ${option.label}`.trim() }),
            option.note ? h('span', { class: 'option-note', text: option.note }) : null
          ])
        ])
      ]);
    });

    const actionLabel = last ? '好了，开始用' : '下一步';
    fill(view, [
      topbar({
        title: stepIndex === 0 ? '先认识一下您' : `还有 ${TOTAL_STEPS - stepIndex - 1} 个问题`,
        onBack: goBack
      }),
      stepDots(TOTAL_STEPS, stepIndex + 1),
      h('section', { class: 'card' }, [
        h('h2', { class: 'question', text: step.question }),
        h('p', { class: 'question-hint', text: step.hint }),
        h('ul', { class: 'option-list' }, optionNodes)
      ]),
      button({
        label: actionLabel,
        iconHtml: last ? icon('check') : icon('arrowRight'),
        block: true,
        huge: true,
        onClick: goNext
      }),
      step.skippable
        ? button({
            label: stepIndex === TOTAL_STEPS - 1 ? '先不设置' : '这个问题先跳过',
            variant: 'ghost',
            block: true,
            onClick: goNext
          })
        : null,
      h('p', {
        class: 'footnote',
        text:
          '这些问题只存在您自己的手机里，不会上传，也不会分享给别人。' +
          '以后想改，回到首页点右上角的「设置」就行。'
      })
    ]);
    announce(`第 ${stepIndex + 1} 步：${step.question}`);
  }

  draw();
}
