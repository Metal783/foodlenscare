/** 老人端与子女端共用的资料、授权、状态组件。 */
import { h, button, toast } from './dom.js';
import { api, currentAccount } from '../core/service.js';
import { icon } from './icons.js';

/** 设计图的品牌、标题和分组行；图形为内联矢量，不依赖远程图片。 */
export function brandHeader() {
  return h('header', { class: 'design-brand' }, [h('span', { html: icon('brand') }), h('span', { text: '食护家 Foodlenscare' })]);
}
export function pageIntro(title, subtitle = '') {
  return h('div', { class: 'page-intro' }, [h('h1', { text: title }), subtitle ? note(subtitle) : null]);
}
export function flowHeader(title, onBack, subtitle = '') {
  return h('header', { class: 'flow-heading' }, [h('button', { class: 'round-back', type: 'button', 'aria-label': '返回上一步', onClick: onBack, html: icon('arrowLeft') }), pageIntro(title, subtitle)]);
}
export function cardHead(title, right) {
  return h('div', { class: 'design-card-head' }, [h('h2', { class: 'card-title', text: title }), right || null]);
}
export function menuRow(label, iconName, onClick, options = {}) {
  return h('button', { type: 'button', class: 'menu-row', onClick }, [h('span', { class: 'menu-icon', html: icon(iconName) }),
    h('span', { class: 'menu-copy' }, [h('span', { text: label }), options.detail ? note(options.detail) : null]),
    options.value ? h('span', { class: 'menu-value', text: options.value }) : null, h('span', { class: 'menu-chevron', html: icon('chevron') })]);
}
export function sharedBanner(member, detail) {
  return h('div', { class: 'shared-banner' }, [h('span', { class: 'person-avatar', text: (member?.name || '家人').slice(0, 1) }),
    h('div', {}, [h('strong', { text: member?.name || '家人' }), note(detail)])]);
}

export function card(title, children = []) {
  return h('section', { class: 'card' }, [title ? h('h2', { class: 'card-title', text: title }) : null, ...children]);
}
export function note(text) { return h('p', { class: 'footnote', text }); }
export function linkButton(label, route, ctx, params = {}, variant = 'secondary') {
  return button({ label, variant, block: true, onClick: () => ctx.navigate(route, params) });
}
export function field(label, input) { return h('label', { class: 'care-field' }, [h('span', { text: label }), input]); }
export function input(id, value = '', props = {}) { return h('input', { id, class: 'review-input', value: value ?? '', ...props }); }
export function maskPhone(phone = '') { return phone.length === 11 ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : phone; }
export function person(profile = {}, phone = '', label = '') {
  return h('div', { class: 'person-card' }, [h('span', { class: 'person-avatar', text: (profile.name || '家人').slice(0, 1) }),
    h('div', {}, [h('strong', { text: `${label}${profile.name || '家人'}` }), note([profile.age ? `${profile.age}岁` : '', maskPhone(phone)].filter(Boolean).join(' · '))])]);
}
export function statusTag(text, tone = 'ok') { return h('span', { class: 'care-tag', dataset: { tone }, text }); }
export function busyAction(label, work, options = {}) {
  let working = false;
  const control = button({ label, block: true, ...options, onClick: async () => {
    if (working) return;
    working = true; control.disabled = true;
    try { await work(); } catch (error) { toast(error.message, 5000); }
    finally { working = false; control.disabled = false; }
  } });
  return control;
}
export function toggle(label, checked, onChange, detail = '') {
  const checkbox = h('input', { type: 'checkbox', checked, role: 'switch', 'aria-label': label,
    onChange: async () => {
      checkbox.disabled = true;
      try { await onChange(checkbox.checked); }
      catch (error) { checkbox.checked = !checkbox.checked; toast(error.message, 5000); }
      finally { checkbox.disabled = false; }
    } });
  return h('label', { class: 'care-toggle' }, [h('span', {}, [h('strong', { text: label }), detail ? note(detail) : null]), checkbox]);
}
export function phoneLink(phone, label = '联系家人', iconName = 'call') {
  return /^\+?[\d -]{3,20}$/.test(phone || '') ? h('a', { class: 'btn btn-secondary btn-block contact-link', href: `tel:${phone.replace(/[ -]/g, '')}` }, [h('span', { html: icon(iconName) }), h('span', { text: label })]) : note('请先在家人管理中设置联系人。');
}
export function requireLogin(view, ctx, title = '家庭守护') {
  if (currentAccount()) return false;
  view.replaceChildren(brandHeader(), pageIntro(title), card('', [note('游客可以识别和保存本机记录。绑定家人、共享与语音需要登录本地测试账号。'), linkButton('手机号测试登录', 'welcome', ctx)]));
  return true;
}
export async function familyData() { return (await api('/family')).families; }
export function timeText(at) {
  return at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未同步';
}
/** 子女端每次进入重新查询授权，避免继续使用撤回前的资料缓存。 */
export async function selectElder(ctx, selected) {
  const families = (await familyData()).filter(f => !f.amElder && f.status === 'bound');
  const match = families.find(f => f.member.id === selected) || families.find(f => f.member.id === ctx.state.selectedElder) || families[0];
  ctx.setState({ selectedElder: match?.member.id || null });
  return { families, selected: match };
}
export function elderSelector(families, selected, onChange) {
  const select = h('select', { class: 'review-input', 'aria-label': '选择守护的老人', onChange: () => onChange(select.value) },
    families.map(f => h('option', { value: f.member.id, text: f.member.name || '家人' })));
  select.value = selected?.member.id || '';
  return field('正在守护', select);
}
