/**
 * 拍照确认 —— 用「确认」代替「重来」
 *
 * 适老化考虑：老年人容易手抖拍糊，如果系统直接给出结论可能不准；
 * 但如果要求他们理解「置信度」，门槛又太高。
 * 折中做法是拍完先看一眼，由用户自己决定「重拍」还是「就用这张」，
 * 全程依然零输入。
 */

import { h, button, topbar, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pickPhoto, processPhoto, reportFailure } from '../core/flow.js';
import { measureImage, loadImage } from '../recognize/quality.js';

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderConfirm(view, _params, ctx) {
  const file = ctx.state.pendingFile;
  const origin = ctx.state.pendingOrigin || 'camera';

  if (!file) {
    ctx.navigate('home', {}, { replace: true });
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  let busy = false;

  const image = h('img', { src: previewUrl, alt: '刚拍的食品包装照片' });

  const qualityBox = h('div', { class: 'card', 'aria-live': 'polite' }, [
    h('p', { class: 'photo-meta', text: '正在看照片清不清楚……' })
  ]);

  const go = async () => {
    if (busy) return;
    busy = true;
    ctx.setState({ progressStage: 0, progressPhoto: { file, origin, previewUrl } });
    ctx.navigate('progress');
  };

  const retake = async () => {
    try {
      const next = await pickPhoto(origin);
      if (next) {
        ctx.setState({ pendingFile: next, pendingOrigin: origin });
        ctx.navigate('confirm', {}, { replace: true, force: true });
      }
    } catch (error) {
      reportFailure(error);
    }
  };

  fill(view, [
    topbar({ title: '这张拍得清楚吗？', onBack: () => ctx.navigate('home', {}, { replace: true }) }),
    h('section', { class: 'photo-frame' }, [image]),
    qualityBox,
    button({
      label: '就用这张，开始看标签',
      iconHtml: icon('check'),
      block: true,
      huge: true,
      onClick: go
    }),
    button({
      label: '重拍一张',
      iconHtml: icon('refresh'),
      variant: 'secondary',
      block: true,
      onClick: retake
    }),
    h('p', {
      class: 'footnote',
      text: '小提示：让配料表和营养成分表占满画面，光线亮一点，字会更清楚。'
    })
  ]);

  // 本地质量检测：只提示，不阻断，决定权留给用户
  loadImage(file)
    .then((img) => {
      const quality = measureImage(img);
      URL.revokeObjectURL(img.src);
      qualityBox.replaceChildren(
        h('h3', { class: 'card-title', text: quality.blurry || quality.tooDark || quality.tooBright || quality.tooSmall ? '照片可能不太清楚' : '照片很清楚' }),
        h('ul', { class: 'ingredient-lines' },
          quality.tips.map((tip) => h('li', {}, [h('span', { text: tip })]))
        ),
        h('p', {
          class: 'photo-meta',
          text: `清晰度 ${quality.sharpness}，亮度 ${quality.brightness}，分辨率 ${quality.width}×${quality.height}`
        }),
        h('p', {
          class: 'footnote',
          text: '如果实在不清楚，系统也会老实告诉您「看不清」，不会硬给一个结论。'
        })
      );
    })
    .catch(() => {
      qualityBox.replaceChildren(h('p', { class: 'photo-meta', text: '这张图片读不出内容，请重拍一张。' }));
    });
}
