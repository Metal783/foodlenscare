/**
 * 第二步「认标签」的进度页
 *
 * 老年人对「正在处理」的容忍度很低，必须给明确、口语化的进度反馈，
 * 而不是一个转圈图标。文案全部是「正在看标签」这种听得懂的说法。
 */

import { h, topbar, button, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { processPhoto, reportFailure } from '../core/flow.js';

/** 进度文案按时间推进，让等待有节奏感 */
const STAGES = [
  { at: 0, text: '正在看标签……', note: '把照片上的字读出来' },
  { at: 700, text: '正在念配料表……', note: '找出里面有哪些东西' },
  { at: 1500, text: '正在比您的身体情况……', note: '看看和您有没有冲突' },
  { at: 2400, text: '马上就出结果了', note: '给您一句听得懂的话' }
];

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderProgress(view, _params, ctx) {
  const pending = ctx.state.progressPhoto;
  if (!pending) {
    ctx.navigate('home', {}, { replace: true });
    return;
  }

  const textEl = h('p', { class: 'progress-text', text: STAGES[0].text });
  const noteEl = h('p', { class: 'progress-note', text: STAGES[0].note });

  fill(view, [
    topbar({ title: '正在看标签' }),
    h('section', { class: 'progress-wrap', 'aria-live': 'polite' }, [
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      textEl,
      noteEl,
      pending.previewUrl
        ? h('div', { class: 'photo-frame', style: { maxWidth: '16rem' } }, [
            h('img', { src: pending.previewUrl, alt: '正在识别的照片' })
          ])
        : null
    ]),
    button({
      label: '取消，回首页',
      variant: 'ghost',
      block: true,
      onClick: () => ctx.navigate('home', {}, { replace: true })
    })
  ]);

  const timers = STAGES.slice(1).map((stage) =>
    setTimeout(() => {
      textEl.textContent = stage.text;
      noteEl.textContent = stage.note;
    }, stage.at)
  );

  processPhoto(pending.file, pending.origin, ctx.state.profile)
    .then((result) => {
      timers.forEach(clearTimeout);
      // 保证「正在看标签」至少显示 1.2 秒，避免闪一下就过去，老人来不及看清
      const wait = Math.max(0, 1200 - (result.photo.elapsedMs || 0));
      setTimeout(() => {
        ctx.setState({ result, progressPhoto: null, pendingFile: null });
        ctx.navigate('result', {}, { replace: true });
      }, wait);
    })
    .catch((error) => {
      timers.forEach(clearTimeout);
      const message = reportFailure(error);
      fill(view, [
        topbar({ title: '没看成', onBack: () => ctx.navigate('home', {}, { replace: true }) }),
        h('section', { class: 'card' }, [
          h('h2', { class: 'card-title', text: '这张照片没处理好' }),
          h('p', { class: 'error-box', text: message }),
          h('p', { text: '可以换一张更清楚的照片，或者先看看今天的记录。' })
        ]),
        button({
          label: '重新拍一张',
          iconHtml: icon('camera'),
          block: true,
          huge: true,
          onClick: () => ctx.navigate('home', {}, { replace: true })
        })
      ]);
    });
}
