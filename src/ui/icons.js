/**
 * 内联 SVG 图标集
 * 全部为单色描边图形，随字号缩放，避免位图在小屏上模糊。
 * 图标不单独承载语义——风险等级同时用颜色、文字标签、图标与语音表达。
 */

const wrap = (paths, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${paths}</svg>`;

export const ICONS = {
  brand: '<svg class="icon brand-logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M8 34 28 9q4-5 8 0l20 25" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M12 38h40c-1 13-9 19-20 19S13 51 12 38Z" fill="currentColor"/><path d="M29 38c-1-10-8-15-15-14 1 8 6 12 15 14Zm3-1c-3-12 2-20 11-21 1 10-3 17-11 21Z" fill="#79A887"/><path d="M29 55h6v5h-6z" fill="currentColor"/></svg>',
  person: wrap('<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'),
  phone: wrap('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>'),
  call: wrap('<path d="m7 3 3 5-3 3a15 15 0 0 0 6 6l3-3 5 3-1 4C10 23 1 14 3 4z"/>'),
  mic: wrap('<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>'),
  emergency: wrap('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" stroke-width="3.5"/>'),
  play: wrap('<path d="m7 3 14 9-14 9z"/>'),
  send: wrap('<path d="m3 10 19-8-8 20-3-9zM11 13 22 2"/>'),
  heart: wrap('<path d="M20.5 5.5a5 5 0 0 0-8.5 1 5 5 0 0 0-8.5-1C-1 10 6 16 12 21c6-5 13-11 8.5-15.5Z"/>'),
  chevron: wrap('<path d="m9 5 7 7-7 7"/>'),
  gear: wrap('<path d="M9 3h6l1 3 3 1 2 4-2 2v3l-3 1-1 4H9l-1-4-3-1v-3L3 11l2-4 3-1z"/><circle cx="12" cy="12" r="3"/>'),
  bars: wrap('<path d="M5 20v-6M10 20V7M15 20V3M20 20v-9" stroke-width="3"/>'),
  bell: wrap('<path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4"/>'),
  wave: wrap('<path d="M3 10v4M7 6v12M11 2v20M15 6v12M19 9v6M23 11v2"/>'),
  wechat: '<svg class="icon" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M13 3C6 3 1 7.5 1 13c0 3.3 1.8 6.2 4.8 8l-1 4 4.5-2.2 3.7.3c-.7-1.3-1-2.6-1-4.1 0-5 4.5-9 10-9h.2C21 6 17.5 3 13 3Zm-4 7a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 9 10Zm8 0a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 17 10Z"/><path d="M31 19c0-4.4-4-8-9-8s-9 3.6-9 8 4 8 9 8l3-.4 3.5 1.8-.7-3A7.8 7.8 0 0 0 31 19Zm-12-3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>',
  people: wrap('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M19 20v-2a6 6 0 0 0-3-5"/>'),
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
