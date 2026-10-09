/**
 * 极简哈希路由
 *
 * 设计取舍：全站只有一个主线和六个页面，引入框架只会增加首屏体积与
 * 离线缓存复杂度。这里用 hash 路由 + 渲染函数，天然支持「返回上一步」，
 * 也方便答辩现场直接改地址栏切换页面。
 */

/**
 * @typedef {Object} RouteContext
 * @property {(name:string, params?:Object, options?:{replace?:boolean,force?:boolean}) => void} navigate
 * @property {() => boolean} back
 * @property {(patch:Object) => void} setState
 * @property {(text:string, options?:Object) => void} speak
 * @property {() => void} rerender
 * @property {Object} state
 */

const routes = new Map();
let viewEl = null;
let notFound = null;
/** 内部返回栈：记录访问过的路径，保证「撤销始终可用」 */
let stack = [];
let currentPath = '';
let context = null;
let cleanup = null;
let renderRevision = 0;

export function define(name, render) {
  routes.set(name, render);
}

export function setNotFound(render) {
  notFound = render;
}

export function setView(el) {
  viewEl = el;
}

export function init({ start, ctx }) {
  context = ctx;
  window.addEventListener('hashchange', () => {
    const parsed = parseHash();
    if (!parsed) return;
    if (parsed.path === currentPath) return;
    stack.push(currentPath || start);
    currentPath = parsed.path;
    render(parsed.name, parsed.params);
  });
  const parsed = parseHash() || { name: start, params: {}, path: start };
  currentPath = parsed.path;
  window.location.replace(`#/${parsed.path}`);
  render(parsed.name, parsed.params);
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return null;
  const [name, query] = raw.split('?');
  const params = {};
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  const path = query ? `${name}?${query}` : name;
  return { name, params, path };
}

function buildPath(name, params = {}) {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!usable.length) return name;
  return `${name}?${new URLSearchParams(usable).toString()}`;
}

/**
 * 跳转。
 * @param {string} name
 * @param {Object} [params]
 * @param {{replace?:boolean}} [options]
 */
export function navigate(name, params = {}, options = {}) {
  const path = buildPath(name, params);
  if (path === currentPath && !options.force) {
    render(name, params);
    return;
  }
  if (options.replace || !currentPath) {
    if (currentPath) stack.pop();
    window.location.replace(`#/${path}`);
    currentPath = path;
    render(name, params);
    return;
  }
  stack.push(currentPath);
  currentPath = path;
  window.location.hash = `#/${path}`;
  // 部分浏览器 hashchange 不同步触发，这里直接渲染，保证点击反馈即时
  render(name, params);
}

/** 返回上一步。回答 false 表示已无处可退。 */
export function back() {
  const prev = stack.pop();
  if (!prev) return false;
  const parsed = parseHashFromPath(prev);
  currentPath = prev;
  window.location.hash = `#/${prev}`;
  render(parsed.name, parsed.params);
  return true;
}

function parseHashFromPath(path) {
  const [name, query] = String(path).split('?');
  const params = {};
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { name, params };
}

export function current() {
  return currentPath;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function render(name, params) {
  const renderFn = routes.get(name) || notFound;
  if (!viewEl || !renderFn) return;
  const revision = ++renderRevision;
  const previousCleanup = cleanup;
  cleanup = null;
  previousCleanup?.();

  const previous = document.activeElement;
  window.scrollTo({ top: 0, behavior: 'auto' });

  try {
    const dispose = renderFn(viewEl, params, context);
    if (typeof dispose === 'function') {
      if (renderRevision === revision) cleanup = dispose;
      else dispose();
    }
  } catch (error) {
    console.error('[FoodLensCare] 页面渲染失败：', error);
    // 出问题时把页面名和具体错误一起写出来：只写「出了点问题」会让人无从下手，
    // 而现场演示时这一行就是唯一的线索。整页刷新即可回到正常状态。
    viewEl.innerHTML =
      '<section class="card"><h2 class="card-title">页面出了点问题</h2>' +
      '<p>请点上方的「返回」重新操作。如果一直这样，重新打开本页面即可。</p>' +
      `<p class="error-box">${escapeHtml(name)}：${escapeHtml(error?.message || String(error))}</p>` +
      '</section>';
  }

  // 无障碍：切换页面后把焦点移到标题，键盘与读屏用户都能立刻感知页面变化
  const heading = viewEl.querySelector('h1, .question');
  if (heading && previous !== heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}
