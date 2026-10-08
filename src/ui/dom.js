/**
 * 轻量 DOM 工具
 *
 * 刻意保持极小体积且不引入任何依赖：作品定位为「扫码即用的 H5」，
 * 首屏体积与离线可用性优先于框架便利性。
 */

import { icon } from './icons.js';

/**
 * 创建元素。
 * @param {string} tag
 * @param {Object} [props] 属性；class / text / html / dataset / on* 事件
 * @param {(Node|string|null|undefined|false)[]} [children]
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      el.className = String(value);
    } else if (key === 'text') {
      el.textContent = String(value);
    } else if (key === 'html') {
      el.innerHTML = String(value);
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv === null || dv === undefined) continue;
        el.dataset[dk] = String(dv);
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list' && typeof value !== 'object') {
      try {
        el[key] = value;
      } catch {
        el.setAttribute(key, String(value));
      }
    } else {
      el.setAttribute(key, String(value));
    }
  }

  append(el, children);
  return el;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/**
 * 内容容器：过滤掉 null / undefined / false 之后再交给 replaceChildren。
 *
 * 为什么必须这样写：原生 `element.replaceChildren(...list)` 会把 `null`
 * 转成字符串 "null" 插进 DOM，页面上就会冒出一个莫名其妙的 null。
 * 页面里大量使用 `cond ? node : null` 的写法，所以统一走这个函数。
 *
 * @param {Element} parent
 * @param {any[]} children
 */
export function fill(parent, children) {
  const flat = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || value === undefined || value === false || value === '') return;
    flat.push(value instanceof Node ? value : document.createTextNode(String(value)));
  };
  visit(children);
  parent.replaceChildren(...flat);
  return parent;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * 大按钮。适老版主操作按钮默认 96×96 dp/pt 起步（96px @ 20px 基准字号）。
 * @param {Object} options
 */
export function button({
  label,
  sub,
  iconHtml,
  variant = 'primary',
  block = false,
  huge = false,
  onClick,
  attrs = {}
}) {
  const classes = ['btn'];
  if (variant === 'secondary') classes.push('btn-secondary');
  if (variant === 'ghost') classes.push('btn-ghost');
  if (variant === 'speak') classes.push('btn-speak');
  if (block) classes.push('btn-block');
  if (huge) classes.push('btn-huge');

  return h('button', {
    class: classes.join(' '),
    type: 'button',
    onClick,
    ...attrs
  }, [
    iconHtml ? h('span', { class: 'btn-icon', html: iconHtml }) : null,
    h('span', { text: label }),
    sub ? h('span', { class: 'shutter-hint', text: sub }) : null
  ]);
}

/**
 * 顶部标题区。全站单一主线，不放二级菜单。
 * @param {{title:string, onBack?:Function, right?:Node}} options
 */
export function topbar({ title, onBack, right }) {
  return h('header', { class: 'topbar' }, [
    onBack
      ? h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          style: { minHeight: '3rem', padding: '0.4rem 0.7rem' },
          'aria-label': '返回上一步',
          onClick: onBack
        }, [h('span', { class: 'btn-icon', html: icon('arrowLeft') }), h('span', { text: '返回' })])
      : h('span', { class: 'brand-mark', text: '食' }),
    h('h1', { text: title }),
    right || null
  ]);
}

/** 进度点：让老人知道「还有几步」，但每屏仍然只问一件事 */
export function stepDots(total, current) {
  return h('ol', { class: 'step-dots', 'aria-label': `第 ${current} 步，共 ${total} 步` },
    Array.from({ length: total }, (_, i) =>
      h('li', { dataset: { on: i < current ? '1' : '0' } })
    )
  );
}

/* ------------------------------------------------------------------ 提示 */

let toastTimer = null;
/**
 * 非打断式轻提示。不使用模态弹窗、不使用确认框，符合适老化禁止项要求。
 * @param {string} message
 * @param {number} [ms]
 */
export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

/** 屏幕阅读器播报（与语音播报区分：一个走无障碍通道，一个走喇叭） */
export function announce(message) {
  const el = document.getElementById('aria-live');
  if (el) el.textContent = message;
}
