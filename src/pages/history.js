/** 识别记录、周统计和详情；摄入量继续使用独立的已食用记录。 */
import { h, button, topbar, fill, toast } from '../ui/dom.js';
import { card, note, linkButton, busyAction, timeText, person, phoneLink, selectElder, elderSelector, requireLogin, brandHeader, pageIntro, cardHead, sharedBanner, statusTag } from '../ui/care.js';
import { icon } from '../ui/icons.js';
import { loadHistory, getHistory, getPhoto, deleteHistory, updateHistory, historyStats, needsAttention, syncHistory } from '../core/history.js';
import { localDateKey } from '../core/store.js';
import { api, currentAccount } from '../core/service.js';
import * as speech from '../core/speech.js';
import { ALLERGEN_BY_ID } from '../data/allergens.js';
import { evaluateLabel } from '../core/flow.js';

function riskName(record) {
  return { red: '注意过敏', orange: '需留意', yellow: '留意份量', green: '适量食用', gray: '尚待核对' }[record.assessment?.level] || '尚待核对';
}
export function statsCard(records) {
  const stats = historyStats(records);
  return card('', [cardHead('本周识别概览', note(stats.weekLabel)), h('div', { class: 'care-stats' }, [
    h('div', {}, [h('strong', { text: stats.week }), note('食物已识别')]),
    h('div', {}, [h('strong', { text: stats.streak }), note('连续记录天数')]),
    h('div', {}, [h('strong', { text: stats.attention }), note('需留意食物')])
  ]), h('details', { class: 'stats-explanation' }, [h('summary', { text: '统计说明' }), note('周一至周日统计；需留意包含过敏、营养提醒和待核对记录。')])]);
}
export function historyItem(record, ctx, remoteElder = '', urls = []) {
  const image = h('img', { class: 'history-thumb', alt: '识别时拍摄的食品照片', hidden: true });
  if (record.photoDataUrl) { image.src = record.photoDataUrl; image.hidden = false; }
  else if (record.photoSaved) getPhoto(record.id).then(blob => {
    if (!blob || !image.isConnected) return;
    const url = URL.createObjectURL(blob); urls.push(url); image.src = url; image.hidden = false;
  }).catch(() => {});
  return h('li', { class: 'history-item' }, [h('button', { class: 'history-open', type: 'button', onClick: () => ctx.navigate('record-detail', { id: record.id, elder: remoteElder }) }, [
    h('span', { class: 'history-picture' }, [h('span', { class: 'history-picture-fallback', html: icon('tag') }), image]),
    h('div', { class: 'history-copy' }, [h('strong', { text: record.label?.productName || '未识别名称的食品' }), note(`${timeText(record.at)} · ${record.meal || '未选择餐次'}`), remoteElder ? h('span', { class: 'card-link', text: '查看详情 ›' }) : null]),
    h('span', { class: 'history-chevron', html: icon('chevron') }),
    h('div', { class: 'history-summary' }, [statusTag(riskName(record), record.assessment?.level), note(record.assessment?.headline || '请核对包装')])])]);
}

export function renderHistory(view, params, ctx) {
  let alive = true; const urls = []; let range = params.all ? 'all' : 'week'; let date = ''; let attention = false; let showDate = false; let showFilters = !!params.all;
  const draw = async () => {
    urls.splice(0).forEach(URL.revokeObjectURL);
    let records = loadHistory(); let selected; let families = []; let syncAt;
    if (ctx.state.profile.role === 'child') {
      if (requireLogin(view, ctx, '食物识别记录')) return;
      try {
        ({ selected, families } = await selectElder(ctx, params.elder));
        if (!alive) return;
        if (!selected) { fill(view, [brandHeader(), pageIntro('食物识别记录', '看见每一餐，关心日常饮食。'), card('还没有绑定老人', [linkButton('添加家人', 'family', ctx)])]); return; }
        const payload = await api(`/records?elder=${encodeURIComponent(selected.member.id)}`);
        records = payload.records; syncAt = payload.syncedAt;
      } catch (error) { if (alive) fill(view, [brandHeader(), pageIntro('食物识别记录'), card('暂时无法查看', [note(error.message), linkButton('查看共享权限', 'family', ctx)])]); return; }
    }
    if (!alive) return;
    const filtered = records.filter(r => {
      if (attention && !needsAttention(r)) return false;
      if (date) return localDateKey(new Date(r.at)) === date;
      if (range === 'week') { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6); return new Date(r.at) >= start; }
      return true;
    }).sort((a, b) => new Date(b.at) - new Date(a.at));
    const groups = new Map();
    for (const record of filtered) { const day = localDateKey(new Date(record.at)); if (!groups.has(day)) groups.set(day, []); groups.get(day).push(record); }
    const dateInput = h('input', { id: 'history-date', type: 'date', class: 'review-input', hidden: !showDate, value: date, 'aria-label': '选择记录日期',
      onChange: () => { date = dateInput.value; draw(); } });
    fill(view, [brandHeader(), selected ? pageIntro('家人的食物记录', '看见每一餐，关心日常饮食。') : null,
      selected ? h('section', { class: 'record-owner' }, [sharedBanner(selected.member, '食物识别记录已获授权'), elderSelector(families, selected, id => { ctx.setState({ selectedElder: id }); params.elder = id; draw(); })]) : null,
      selected ? null : statsCard(records),
      selected ? null : button({ label: '全部记录', block: true, onClick: () => { range = 'all'; date = ''; showFilters = true; draw(); } }),
      selected || showFilters ? h('div', { class: 'care-filters record-filters' }, [button({ label: '最近7天', variant: range === 'week' && !date ? 'primary' : 'secondary', onClick: () => { range = 'week'; date = ''; draw(); } }),
        button({ label: date ? '已选日期' : '选择日期', variant: date ? 'primary' : 'secondary', onClick: () => { showDate = !showDate; draw(); } }),
        button({ label: attention ? '✓ 需留意' : '需留意', variant: attention ? 'primary' : 'secondary', onClick: () => { attention = !attention; draw(); } })]) : null,
      dateInput,
      selected ? h('button', { type: 'button', class: 'text-link all-history-link', text: '查看全部记录', onClick: () => { range = 'all'; date = ''; draw(); } }) : null,
      selected ? [...groups].map(([day, items]) => h('section', { class: 'history-day' }, [cardHead(day === localDateKey(new Date()) ? `今天 · ${day.slice(5).replace('-', '月')}日` : day, note(`${items.length}条记录`)), h('ul', { class: 'history-list' }, items.map(r => historyItem(r, ctx, selected.member.id, urls)))]))
        : filtered.length ? card('最近识别记录', [h('ul', { class: 'history-list' }, filtered.map(r => historyItem(r, ctx, '', urls)))]) : null,
      filtered.length ? null : card('暂无记录', [note('这个范围没有识别记录。拍过的食品会保存在这里，是否吃过单独确认。')]),
      selected ? note(`记录已获授权 · ${timeText(syncAt)}同步`) : card('识别与食用分开记录', [note('查看食品不增加摄入量。'), linkButton('查看今天已吃的记录和额度', 'intake', ctx),
        currentAccount() ? busyAction('同步到本人账号', async () => { await syncHistory(); toast('记录已同步。'); draw(); }, { variant: 'secondary' }) : note('游客记录只保存在这台设备。')]),
      h('div', { class: 'privacy-note' }, [h('span', { html: icon('shield') }), note('照片识别仅供饮食参考，请核对实物包装。')])]);
  };
  draw();
  return () => { alive = false; urls.forEach(URL.revokeObjectURL); };
}

export function renderRecordDetail(view, params, ctx) {
  let alive = true; let photoUrl;
  fill(view, [topbar({ title: '识别记录详情', onBack: () => ctx.navigate('records') }), card('正在读取记录')]);
  const load = async () => {
    let record; let profile; let member;
    if (params.elder) {
      const { selected } = await selectElder(ctx, params.elder);
      if (!selected || selected.member.id !== params.elder) throw new Error('这位老人尚未授权。');
      member = selected.member;
      const payload = await api(`/records?elder=${encodeURIComponent(params.elder)}`);
      record = payload.records.find(r => r.id === params.id); profile = payload.profile;
    } else { record = getHistory(params.id); profile = record?.profileSnapshot; }
    if (!record) throw new Error('记录已删除或不在当前账号中。');
    if (!params.elder) {
      const blob = await getPhoto(record.id).catch(() => null);
      if (blob) photoUrl = URL.createObjectURL(blob);
    } else photoUrl = record.photoDataUrl;
    if (!alive) { if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl); return; }
    const label = record.label || {}; const assessment = record.assessment || {};
    const meal = h('select', { class: 'review-input', 'aria-label': '设置餐次', onChange: () => { updateHistory(record.id, { meal: meal.value }); syncHistory().catch(() => {}); toast('餐次已保存。'); } },
      ['未选择', '早餐', '午餐', '晚餐', '加餐'].map(text => h('option', { value: text, text })));
    meal.value = record.meal || '未选择';
    fill(view, [topbar({ title: '识别记录详情', onBack: () => ctx.navigate('records', { elder: params.elder }) }),
      member ? sharedBanner(member, '食物识别记录已获授权') : null,
      h('section', { class: 'card record-product' }, [photoUrl ? h('img', { class: 'history-photo', src: photoUrl, alt: '保存的识别照片' }) : note('这条记录没有保存照片。'),
        cardHead(label.productName || '未识别名称的食品', statusTag(riskName(record), assessment.level)), note(`${timeText(record.at)} · ${record.meal || '未选择餐次'}`), params.elder ? null : meal]),
      card('包装成分识别', [h('div', { class: 'recognition-note' }, [h('span', { html: icon('clipboard') }), note(label.ingredientsConfirmed || label.nutritionConfirmed ? '已人工核对，请仍以实物包装为准。' : '以下为识别候选，尚需核对包装。')]),
        h('dl', { class: 'ingredient-pairs' }, [h('dt', { text: '配料' }), h('dd', { text: label.ingredientText || '未读到' }), h('dt', { text: '过敏原提示' }), h('dd', { text: label.allergenDeclaration || '未读到，不能视为无过敏原' }), h('dt', { text: '净含量' }), h('dd', { text: label.netContent || '未读到' })]),
        label.rawText ? h('details', {}, [h('summary', { text: '查看识别原文' }), h('p', { class: 'raw-text', text: label.rawText })]) : null]),
      card('饮食提醒', [h('p', { text: assessment.headline || '请核对包装' }), h('p', { text: assessment.advice || '' }),
        busyAction('念给我听', async () => { if (!speech.speak(`${assessment.headline || ''}。${assessment.advice || ''}`)) throw new Error('浏览器不支持朗读。'); }, { variant: 'secondary' })]),
      card('饮食相关设置', [profile ? h('div', {}, [note('来自本人填写的设置，不是照片检测结果。'),
        h('p', { text: `关注方向：${(profile.concerns || []).map(id => ({ sugar: '控糖', salt: '控盐', fat: '控脂' }[id] || id)).join('、') || '未设置'}` }),
        h('p', { text: `医生说过：${(profile.conditions || []).map(id => ({ hypertension: '高血压', diabetes: '糖尿病', hyperlipidemia: '高血脂', coronary: '冠心病', none: '以上都没有' }[id] || id)).join('、') || '未设置'}` }),
        h('p', { text: `过敏设置：${(profile.allergens || []).map(id => id === 'none' ? '无已知过敏' : ALLERGEN_BY_ID.get(id)?.short || id).join('、') || '未设置'}${profile.otherAllergens ? `；${profile.otherAllergens}` : ''}` })]) : note('饮食相关设置尚未授权，不能查看。')]),
      h('div', { class: 'privacy-note' }, [h('span', { html: icon('shield') }), note('识别结果仅供参考，请核对包装。照片识别不做诊断，也不能测量血压或血糖。')]),
      params.elder ? button({ label: '发送语音提醒家人', iconHtml: icon('mic'), block: true, onClick: () => ctx.navigate('voices', { recipient: params.elder }) }) : linkButton('继续核对或确认食用', 'resume-record', ctx, { id: record.id }),
      member ? phoneLink(member.phone, `联系${member.name}`) : busyAction('删除这条识别记录', async () => { await deleteHistory(record.id); toast('识别记录已删除，已食用记录保留。'); ctx.navigate('records'); }, { variant: 'ghost' }),
      ]);
  };
  load().catch(error => { if (alive) fill(view, [topbar({ title: '识别记录详情', onBack: () => ctx.navigate('records') }), card('无法查看', [note(error.message)])]); });
  return () => { alive = false; if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl); };
}

export function renderResumeRecord(view, params, ctx) {
  let alive = true;
  const record = getHistory(params.id);
  if (!record) { ctx.navigate('records'); return; }
  fill(view, [card('正在打开保存的照片')]);
  getPhoto(record.id).then(blob => {
    if (!alive) return;
    const previewUrl = blob ? URL.createObjectURL(blob) : null;
    ctx.setState({ result: { historyId: record.id, consumptionRecordId: record.consumptionRecordId,
      photo: { label: structuredClone(record.label), file: blob, origin: record.origin, previewUrl, quality: {} }, assessment: record.consumptionRecordId ? structuredClone(record.assessment) : evaluateLabel(record.label, ctx.state.profile) } });
    ctx.navigate('result');
  }).catch(error => { if (alive) fill(view, [card('无法打开', [note(error.message)])]); });
  return () => { alive = false; };
}
