/**
 * 第二步「认标签」的进度页
 *
 * 老年人对「正在处理」的容忍度很低，必须给明确、口语化的进度反馈，
 * 而不是一个转圈图标。文案全部是「正在看标签」这种听得懂的说法。
 */

import { h, topbar, button, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { processPhoto, reportFailure } from '../core/flow.js';
import { current } from '../core/router.js';


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
  const controller = new AbortController();
  let waitingResult = null;
  const started = performance.now();
  const active = () => !controller.signal.aborted && ctx.state.progressPhoto === pending && current().split('?')[0] === 'progress';
  const leave = () => {
    controller.abort();
    timers.forEach(clearTimeout);
    ctx.setState({ progressPhoto: null });
    ctx.navigate(pending.returnTo || 'home', {}, { replace: true });
  };

  const textEl = h('p', { class: 'progress-text', text: '正在看标签……' });
  const noteEl = h('p', { class: 'progress-note', text: '把照片上的字读出来' });

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
      label: '取消读取，返回',
      variant: 'ghost',
      block: true,
      onClick: leave
    })
  ]);

  const timers = [];

  processPhoto(pending.file, pending.origin, ctx.state.profile, {
    signal: controller.signal,
    onProgress: (progress) => {
      if (!active()) return;
      textEl.textContent = progress.text;
      noteEl.textContent = progress.note;
    }
  })
    .then((result) => {
      timers.forEach(clearTimeout);
      if (!active()) {
        if (result.photo.previewUrl) URL.revokeObjectURL(result.photo.previewUrl);
        return;
      }
      // 保证「正在看标签」至少显示 1.2 秒，避免闪一下就过去，老人来不及看清
      const wait = Math.max(0, 1200 - (performance.now() - started));
      waitingResult = result;
      timers.push(setTimeout(() => {
        if (!active()) {
          if (result.photo.previewUrl) URL.revokeObjectURL(result.photo.previewUrl);
          return;
        }
        ctx.setState({ result, progressPhoto: null, pendingFile: null });
        waitingResult = null;
        ctx.navigate('result', {}, { replace: true });
      }, wait));
    })
    .catch((error) => {
      timers.forEach(clearTimeout);
      if (!active()) return;
      const message = reportFailure(error);
      fill(view, [
        topbar({ title: '没看成', onBack: leave }),
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
          onClick: leave
        })
      ]);
    });
  return () => {
    controller.abort();
    timers.forEach(clearTimeout);
    if (waitingResult?.photo.previewUrl) URL.revokeObjectURL(waitingResult.photo.previewUrl);
    if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    if (ctx.state.progressPhoto === pending) ctx.setState({ progressPhoto: null });
  };
}
