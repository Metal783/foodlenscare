/**
 * 内联 SVG 图标集
 * 全部为单色描边图形，随字号缩放，避免位图在小屏上模糊。
 * 图标不单独承载语义——风险等级同时用颜色、文字标签、图标与语音表达。
 */

const wrap = (paths, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${paths}</svg>`;

export const ICONS = {
  camera: wrap(
    '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.6 4h6.8a1 1 0 0 1 .9.4l1 1.6h1.2A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/>' +
      '<circle cx="12" cy="13" r="3.6"/>'
  ),
  album: wrap(
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/>' +
      '<circle cx="8.5" cy="9.5" r="1.6"/>' +
      '<path d="M4 17.5l5.2-4.8a1.5 1.5 0 0 1 2 0L16 17m1.5-2.2 1.2-1.1a1.5 1.5 0 0 1 2 0l.8.8"/>'
  ),
  speaker: wrap(
    '<path d="M4 9.5h3l4.2-3.4A1 1 0 0 1 13 6.9v10.2a1 1 0 0 1-1.8.8L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/>' +
      '<path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6M19 6.4a8 8 0 0 1 0 11.2"/>'
  ),
  mute: wrap(
    '<path d="M4 9.5h3l4.2-3.4A1 1 0 0 1 13 6.9v10.2a1 1 0 0 1-1.8.8L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/>' +
      '<path d="m16.5 9.5 4 5m0-5-4 5"/>'
  ),
  check: wrap('<path d="m4.5 12.5 5 5L19.5 7"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  arrowLeft: wrap('<path d="M19 12H5m6-7-7 7 7 7"/>'),
  arrowRight: wrap('<path d="M5 12h14m-6-7 7 7-7 7"/>'),
  alert: wrap('<path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>'),
  ban: wrap('<circle cx="12" cy="12" r="8.5"/><path d="m6.2 6.2 11.6 11.6"/>', 'stroke-width="2.2"'),
  info: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>'),
  clipboard: wrap(
    '<rect x="5.5" y="4.5" width="13" height="16" rx="2.2"/>' +
      '<path d="M9 4.5V3.6A1.1 1.1 0 0 1 10.1 2.5h3.8A1.1 1.1 0 0 1 15 3.6v.9z"/>' +
      '<path d="M8.6 10h6.8M8.6 13.6h6.8M8.6 17.2h4.2"/>'
  ),
  sliders: wrap('<path d="M5 8h9M18 8h1M5 16h4M13 16h6"/><circle cx="16" cy="8" r="2.2"/><circle cx="11" cy="16" r="2.2"/>'),
  refresh: wrap('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>'),
  shield: wrap('<path d="M12 3.2 19 6v6.2c0 4.2-3 7.2-7 8.6-4-1.4-7-4.4-7-8.6V6z"/><path d="m8.8 12.2 2.4 2.4 4-4.6"/>'),
  home: wrap('<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>'),
  tag: wrap('<path d="M4 4.8A1.8 1.8 0 0 1 5.8 3h5.4a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 4 10.2z"/><circle cx="8.4" cy="8.4" r="1.4"/>'),
  chart: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12z"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  textSize: wrap('<path d="M3 19 8 5l5 14M5 14h6M15 19l3-9 3 9M16.2 16h3.6"/>')
};

/**
 * @param {keyof typeof ICONS} name
 * @param {string} [className]
 */
export function icon(name, className = '') {
  const svg = ICONS[name] || ICONS.info;
  return className ? svg.replace('class="icon"', `class="icon ${className}"`) : svg;
}
