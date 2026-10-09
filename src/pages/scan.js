/**
 * 拍照读取配料表页 —— 对准包装上的配料表拍一张照片
 *
 * 这是首页「拍照读取配料表」入口对应的页面：让用户
 * 对准配料表（和营养成分表）拍一张照片，走与首页主拍照完全相同的
 * 「拍照 → 认标签 → 对画像 → 判风险 → 念出来」闭环。
 *
 * 与首页主拍照的区别在于引导文案更聚焦「配料表」：这里明确告诉用户
 * 把配料表和营养成分表拍进去，识别后同样进入结果页，由规则层给结论。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pickPhoto, reportFailure } from '../core/flow.js';
import { CONFIG } from '../recognize/config.js';

/* ------------------------------------------------------- 用户动作 */

/**
 * 拍照 / 从相册选一张配料表照片。
 * 复用首页主拍照的同一套流程：拍完进确认页，确认后识别出结论。
 * @param {'camera'|'album'} mode
 * @param {import('../core/router.js').RouteContext} ctx
 */
async function grab(mode, ctx, setBusy) {
  setBusy(true, mode === 'camera' ? '正在打开相机……' : '正在打开相册……');
  try {
    const file = await pickPhoto(mode);
    if (!file) {
      // 用户自己取消了，明确说一句，避免他以为程序没反应
      toast('没有选照片。再点一次就能重新拍。', 2600);
      return;
    }
    ctx.setState({ pendingFile: file, pendingOrigin: mode, pendingReturn: 'scan', result: null });
    ctx.navigate('confirm');
  } catch (error) {
    reportFailure(error);
  } finally {
    setBusy(false);
  }
}

/* ------------------------------------------------------------- 渲染 */

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderScan(view, _params, ctx) {
  const status = h('p', { class: 'footnote', text: '拍照或选择照片，然后确认，再查看配料原文。', role: 'status' });
  let busy = false;
  let cameraButton;
  let albumButton;
  const setBusy = (value, message) => {
    busy = value;
    cameraButton.disabled = value;
    albumButton.disabled = value;
    status.textContent = message || '拍照或选择照片，然后确认，再查看配料原文。';
  };
  const choose = (mode) => { if (!busy) return grab(mode, ctx, setBusy); };
  cameraButton = h('button', {
    class: 'shutter', type: 'button', onClick: () => choose('camera'),
    'aria-label': '拍一张食品配料表的照片'
  }, [
    h('span', { class: 'shutter-icon', html: icon('camera') }),
    h('span', { text: '拍配料表' }),
    h('span', { class: 'shutter-hint', text: '让字清楚地占满画面' })
  ]);
  albumButton = button({
    label: '从相册里选一张配料表照片', iconHtml: icon('album'),
    variant: 'secondary', block: true, onClick: () => choose('album')
  });
  fill(view, [
    topbar({
      title: '拍照读取配料表',
      onBack: () => {
        ctx.navigate('home', {}, { replace: true });
      }
    }),

    h('section', { class: 'card hero' }, [
      h('h2', { class: 'card-title', text: '对准配料表拍一张' }),
      h('p', {
        class: 'hero-sub',
        text: '对准包装背面的配料表，让文字清楚地占满画面。读取后可核对配料、查看过敏提醒；需要营养提醒时，可继续核对填写营养表。'
      }),
      cameraButton
    ]),

    albumButton,
    status,
    CONFIG.paddleOcr.enabled
      ? h('p', { class: 'footnote', text: '支持真实中文文字读取，照片在本机处理。识别后请对照照片核对；反光、小字或弯曲包装可能读错。' })
      : !CONFIG.vision.endpoint && !CONFIG.huaweiOcr.endpoint
      ? h('p', { class: 'error-box', text: '配料表读取服务尚未连接。您可以先拍照、预览和重拍；连接服务后才能读取照片上的真实文字。' })
      : null,

    h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: '怎么拍更清楚' }),
      h('ul', { class: 'ingredient-lines' }, [
        h('li', {}, [h('span', { text: '配料表一般在包装背面，靠近营养成分表。' })]),
        h('li', {}, [h('span', { text: '字越大越清楚，可以离近一点，让配料表占满画面。' })]),
        h('li', {}, [h('span', { text: '光线亮一点，别让影子挡住字。' })]),
        h('li', {}, [h('span', { text: '拍糊了也没关系，识别时会让您确认，还能重拍。' })])
      ])
    ]),

    h('p', {
      class: 'footnote',
      text: '拍完先确认清不清楚，再核对识别文字。营养信息不足时不判断摄入量。'
    })
  ]);
}
