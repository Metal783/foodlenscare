/** 登录、身份、基础资料、家庭绑定及子女概览。 */
import { h, topbar, button, fill, toast } from '../ui/dom.js';
import { card, note, input, field, linkButton, busyAction, toggle, person, phoneLink, requireLogin, familyData, selectElder, elderSelector, timeText, statusTag, brandHeader, pageIntro, flowHeader, cardHead, menuRow, sharedBanner } from '../ui/care.js';
import { icon } from '../ui/icons.js';
import { api, currentAccount, login, logout, updateAccount, receivedMessages } from '../core/service.js';
import { saveProfile, loadProfile, loadPrefs, savePrefs, emptyProfile } from '../core/store.js';
import { CONCERNS, CONDITIONS } from '../data/nutrition.js';
import { ALLERGEN_CHOICES } from '../data/allergens.js';
import { historyStats, syncHistory } from '../core/history.js';
import { statsCard, historyItem } from './history.js';

export function renderWelcome(view, _params, ctx) {
  const phone = input('login-phone', '', { type: 'tel', inputMode: 'tel', autocomplete: 'tel', maxLength: 11, placeholder: '11位手机号' });
  const code = input('login-code', '', { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '6位测试验证码' });
  const agree = h('input', { type: 'checkbox', id: 'login-agree' });
  const hint = h('p', { class: 'footnote', role: 'status', text: '当前为本机/局域网测试版，验证码显示在页面，不发送短信。' });
  const consent = () => { if (!agree.checked) throw new Error('请先阅读并勾选同意用户协议和隐私说明。'); };
  const phonePanel = h('section', { class: 'phone-login-panel', hidden: true }, [flowHeader('手机号登录', () => { phonePanel.hidden = true; splash.hidden = false; }, '使用本机测试账号，和家人一起守护。'),
    card('', [
      field('手机号', phone), busyAction('获取测试验证码', async () => { consent(); const payload = await api('/auth/code', { method: 'POST', body: { phone: phone.value } }); hint.textContent = `本地测试验证码：${payload.testCode}，5分钟有效。未发送短信。`; }, { variant: 'secondary' }),
      hint, field('测试验证码', code), h('label', { class: 'review-check' }, [agree, h('span', { text: '我已阅读并同意用户协议与隐私说明' })]),
      h('div', { class: 'care-filters' }, [linkButton('用户协议', 'legal', ctx, { section: 'terms' }), linkButton('隐私说明', 'legal', ctx, { section: 'privacy' })]),
      busyAction('手机号测试登录', async () => {
        consent(); const account = await login(phone.value, code.value);
        const profile = { ...emptyProfile(), ...account.profile, role: account.role };
        saveProfile(profile); ctx.setState({ account, profile, prefs: loadPrefs(), result: null, selectedElder: null });
        ctx.navigate(profile.completed ? 'home' : 'identity');
      })]), note('游客可使用本机识别和记录；家庭绑定、共享和语音需要登录。')]);
  const splash = h('section', { class: 'welcome-splash' }, [
    h('div', { class: 'welcome-brand' }, [h('div', { class: 'welcome-logo' }, [h('span', { html: icon('brand') }), h('h1', { text: '食护家' }), h('span', { class: 'welcome-english', text: 'Foodlenscare' })]),
      h('div', { class: 'welcome-word', text: 'welcome' }), note('每一餐安心，每一天有伴。')]),
    h('div', { class: 'welcome-actions' }, [h('button', { class: 'login-method', type: 'button', onClick: () => toast('本机测试版尚未接入微信登录，请使用手机号登录或暂时跳过。', 5000) }, [h('span', { class: 'login-method-icon wechat-icon', html: icon('wechat') }), h('strong', { text: '微信登录' })]),
      h('button', { class: 'login-method', type: 'button', onClick: () => { splash.hidden = true; phonePanel.hidden = false; phone.focus(); } }, [h('span', { class: 'login-method-icon phone-icon', html: icon('phone') }), h('strong', { text: '手机号登录' })])]),
    h('button', { class: 'welcome-skip', type: 'button', text: '暂时跳过', onClick: () => ctx.navigate('identity', { guest: '1' }) }),
    h('div', { class: 'welcome-legal' }, [note('登录即表示您需阅读并同意'), h('div', {}, [h('button', { class: 'text-link', type: 'button', text: '《用户协议》', onClick: () => ctx.navigate('legal', { section: 'terms' }) }), h('span', { text: '与' }), h('button', { class: 'text-link', type: 'button', text: '《隐私说明》', onClick: () => ctx.navigate('legal', { section: 'privacy' }) })])])]);
  fill(view, [splash, phonePanel]);
}

export function renderIdentity(view, params, ctx) {
  let role = ctx.state.profile.role || 'elder';
  const draw = () => fill(view, [flowHeader('请选择您的身份', () => ctx.navigate(params.switch ? 'settings' : 'welcome'), '为家人送去关怀，或照顾自己的每一餐。请选择最适合您的身份。'),
    h('div', { class: 'role-options' }, [{ id: 'child', title: '我是子女', text: '关心父母的饮食与健康，让关怀陪伴家人的每一天。', icon: 'people' }, { id: 'elder', title: '我是老人', text: '记录自己的饮食与健康，让每一餐吃得安心、放心。', icon: 'person' }].map(item =>
      h('button', { type: 'button', class: 'card role-choice', 'aria-pressed': role === item.id ? 'true' : 'false', onClick: () => { role = item.id; draw(); } }, [h('div', { class: 'role-choice-head' }, [h('span', { class: 'role-icon', html: icon(item.icon) }), h('h2', { text: item.title }), h('span', { class: 'role-check', html: role === item.id ? icon('check') : '' })]), note(item.text)]))),
    h('div', { class: 'heart-note' }, [h('span', { html: icon('heart') }), note('无论哪种身份，都有一份安心陪伴。')]),
    busyAction('继续', async () => {
      const profile = { ...ctx.state.profile, role };
      if (currentAccount()) await updateAccount({ role });
      saveProfile(profile); ctx.setState({ profile, selectedElder: null, result: null });
      ctx.navigate(params.switch || profile.completed ? 'home' : 'profile');
    }), note(params.switch ? '身份切换不会新增共享权限，资料与授权仍由本人管理。' : '下一步：设置您的基础信息')]);
  draw();
}

export function renderProfile(view, params, ctx) {
  const draft = structuredClone(ctx.state.profile);
  const name = input('profile-name', draft.name, { maxLength: 30, autocomplete: 'name', required: true });
  const phone = input('profile-phone', currentAccount()?.phone || '', { type: 'tel', readOnly: true });
  const age = input('profile-age', draft.age, { type: 'number', min: 1, max: 120, inputMode: 'numeric' });
  const weight = input('profile-weight', draft.weight, { type: 'number', min: 1, max: 300, step: 'any', inputMode: 'decimal' });
  const gender = h('select', { id: 'profile-gender', class: 'review-input' }, ['未填写', '女', '男'].map(text => h('option', { value: text === '未填写' ? '' : text, text })));
  gender.value = draft.gender || '';
  gender.hidden = true;
  const genderButtons = h('div', { class: 'gender-options' }, ['女', '男'].map(value => h('button', { type: 'button', class: 'gender-choice', text: `${gender.value === value ? '✓ ' : ''}${value}`, 'aria-pressed': gender.value === value ? 'true' : 'false', onClick: event => {
    gender.value = gender.value === value ? '' : value;
    genderButtons.querySelectorAll('button').forEach((control, i) => { const text = ['女', '男'][i]; control.textContent = `${gender.value === text ? '✓ ' : ''}${text}`; control.setAttribute('aria-pressed', gender.value === text ? 'true' : 'false'); });
  } })));
  const otherConditions = input('profile-other-conditions', draft.otherConditions, { maxLength: 100, placeholder: '其他情况（选填）' });
  const otherAllergens = input('profile-other-allergens', draft.otherAllergens, { maxLength: 100, placeholder: '其他过敏原（选填）' });
  const choices = (key, options) => h('div', { class: 'care-choices' }, options.map(option => {
    const checkbox = h('input', { type: 'checkbox', checked: (draft[key] || []).includes(option.id), onChange: () => {
      draft[key] = checkbox.checked ? [...new Set([...(draft[key] || []), option.id])] : (draft[key] || []).filter(id => id !== option.id);
      if (checkbox.checked && option.id === 'none') { draft[key] = ['none']; checkbox.closest('.care-choices').querySelectorAll('input').forEach(i => { if (i !== checkbox) i.checked = false; }); }
      else if (checkbox.checked) { draft[key] = draft[key].filter(id => id !== 'none'); checkbox.closest('.care-choices').querySelector('input[data-none]')?.removeAttribute('checked'); const none = checkbox.closest('.care-choices').querySelector('input[data-none]'); if (none) none.checked = false; }
    }, dataset: { none: option.id === 'none' ? '1' : null } });
    return h('label', { class: 'care-choice' }, [checkbox, h('span', { text: option.label })]);
  }));
  const withUnit = (control, unit) => h('span', { class: 'input-unit' }, [control, h('span', { text: unit })]);
  fill(view, [flowHeader(params.edit ? '编辑基础信息' : '设置您的基础信息', () => ctx.navigate(params.edit ? 'settings' : 'identity'), '让我们更好地认识您，陪伴日常健康。'),
    card('', [cardHead('个人信息', note('姓名必填')), field('姓名 / 称呼', name), field('手机号', withUnit(phone, currentAccount() ? '本地测试验证' : '未登录')),
      note(currentAccount() ? '已填入您的本地测试登录号码' : '游客可以跳过手机号'), currentAccount() ? null : menuRow('登录以绑定手机号', 'phone', () => ctx.navigate('welcome')),
      field('年龄（选填）', withUnit(age, '岁')), field('性别（选填）', h('span', {}, [gender, genderButtons])), field('体重（选填）', withUnit(weight, '公斤')),
      draft.role === 'child' ? null : h('div', { class: 'profile-diet' }, [h('h3', { text: '基础疾病（可多选）' }), choices('conditions', CONDITIONS),
        h('h3', { text: '过敏原（可多选）' }), choices('allergens', [{ id: 'none', label: '无已知过敏' }, ...ALLERGEN_CHOICES]),
        h('details', { class: 'profile-extras' }, [h('summary', { text: '关注方向与其他说明（选填）' }), h('h3', { text: '平时想注意' }), choices('concerns', CONCERNS), field('其他疾病说明', otherConditions), field('其他过敏说明', otherAllergens), note('其他说明供本人和获授权家人核对，不自动扩展判断规则。')])])]),
    h('div', { class: 'privacy-note' }, [h('span', { html: icon('shield') }), note('信息仅用于本人饮食提醒。未经您的同意，不向家人或其他人公开。')]),
    busyAction(params.edit ? '保存资料' : '完成设置，开始使用', async () => {
      if (!name.value.trim()) throw new Error('请填写姓名或称呼。');
      if (age.value && (!age.checkValidity() || !Number.isInteger(Number(age.value)))) throw new Error('年龄需填写1—120之间的整数。');
      if (weight.value && !weight.checkValidity()) throw new Error('体重需填写1—300之间的有效数字。');
      const profile = { ...draft, completed: true, name: name.value.trim(), age: age.value ? Number(age.value) : null,
        ageGroup: age.value ? Number(age.value) < 70 ? 'age60' : Number(age.value) < 80 ? 'age70' : 'age80' : draft.ageGroup,
        gender: gender.value, weight: weight.value ? Number(weight.value) : null, otherConditions: otherConditions.value.trim(), otherAllergens: otherAllergens.value.trim() };
      if (currentAccount()) await updateAccount({ profile });
      if (!saveProfile(profile)) throw new Error('资料无法保存，请检查浏览器存储权限。');
      ctx.setState({ profile, account: currentAccount() }); ctx.navigate(params.edit ? 'settings' : 'home');
    }), note('以后可在「我的设置 → 基础信息」中查看和修改，不用担心填错。')]);
}

export function renderFamily(view, _params, ctx) {
  let alive = true;
  const expanded = new Set();
  const draw = async () => {
    if (requireLogin(view, ctx, '家人管理')) return;
    let families;
    try { families = await familyData(); } catch (error) { if (alive) fill(view, [topbar({ title: '家人管理' }), card('无法连接', [note(error.message)])]); return; }
    if (!alive) return;
    const inviteResult = h('p', { class: 'invite-code', role: 'status' });
    const joinCode = input('family-code', '', { placeholder: '输入家人的8位绑定码', maxLength: 8 });
    const ownElder = ctx.state.profile.role !== 'child';
    const visible = families.filter(f => f.amElder === ownElder);
    fill(view, [brandHeader(), ownElder ? h('button', { class: 'breadcrumb', type: 'button', text: '‹ 我的设置', onClick: () => ctx.navigate('settings') }) : null,
      pageIntro(ownElder ? '子女守护' : '家人管理', ownElder ? '' : `${ctx.state.profile.name || '您好'}，和家人一起守护。`),
      visible.length ? card('', [cardHead(ownElder ? '我的家人' : '已绑定家人', h('a', { class: 'text-link', href: '#family-add', text: ownElder ? '＋ 添加家人' : `${visible.length}位`, onClick: event => { event.preventDefault(); const add = view.querySelector('#family-add'); add.open = true; add.scrollIntoView({ behavior: 'smooth', block: 'start' }); } })),
      ...visible.map(f => h('article', { class: 'family-member' }, [h('div', { class: 'family-person-row' }, [person(f.member, f.member.phone, `${f.relation} · `),
        statusTag(f.status === 'pending' ? '等待老人确认' : f.is_primary ? '主要联系人' : '已绑定', f.status === 'pending' ? 'gray' : 'ok')]),
        f.status === 'pending' && f.amElder ? busyAction('确认是我的家人', async () => { await api(`/family/${f.id}`, { method: 'PATCH', body: { status: 'bound' } }); toast('绑定已确认，请分别选择共享范围。'); draw(); }) : null,
        f.status === 'pending' && f.amElder ? busyAction('拒绝这次绑定', async () => { await api(`/family/${f.id}`, { method: 'PATCH', body: { status: 'rejected' } }); draw(); }, { variant: 'ghost' }) : null,
        f.status === 'bound' && !f.amElder ? phoneLink(f.member.phone, `联系${f.member.name}`) : null,
        h('details', { class: 'family-controls', open: f.status === 'pending' || expanded.has(f.id), onToggle: event => { if (event.currentTarget.isConnected) { if (event.currentTarget.open) expanded.add(f.id); else expanded.delete(f.id); } } }, [h('summary', { text: '共享与绑定管理' }),
        f.status === 'bound' && f.amElder ? h('div', {}, [
          toggle('共享食物识别记录', !!f.records_allowed, async checked => { expanded.add(f.id); await api(`/family/${f.id}`, { method: 'PATCH', body: { records_allowed: checked } }); await draw(); }),
          toggle('共享饮食相关设置', !!f.profile_allowed, async checked => { expanded.add(f.id); await api(`/family/${f.id}`, { method: 'PATCH', body: { profile_allowed: checked } }); await draw(); }),
          f.is_primary ? null : busyAction('设为主要联系人', async () => { await api(`/family/${f.id}`, { method: 'PATCH', body: { is_primary: true } }); draw(); }, { variant: 'secondary' }),
          busyAction('关系称呼：' + f.relation, async () => { ctx.navigate('family-relation', { id: f.id }); }, { variant: 'ghost' })]) : null,
        !f.amElder ? note(`食物识别记录：${f.records_allowed ? '已授权' : '未授权'}；饮食相关设置：${f.profile_allowed ? '已授权' : '未授权'}；健康测量：本版未启用。`) : null,
        note(`最近关系更新：${timeText(f.updated)}`), busyAction(f.status === 'pending' ? '取消这次绑定' : '解除绑定', async () => { await api(`/family/${f.id}`, { method: 'DELETE' }); toast('绑定已解除，共享访问已关闭。'); draw(); }, { variant: 'ghost' })])]))]) : null,
      visible.length ? null : card('还没有家人', [note('生成绑定码交给家人，或输入家人给您的绑定码。绑定后仍需老人确认和授权。')]),
      ownElder && visible.some(f => f.status === 'bound') ? card('与家人共享记录', [toggle('所有已绑定家人共享食物记录', visible.filter(f => f.status === 'bound').every(f => f.records_allowed), async checked => { await api('/family/share-all', { method: 'POST', body: { records_allowed: checked } }); draw(); }, '饮食相关设置仍由上面的单独开关决定。')]) : null,
      !ownElder ? visible.filter(f => f.status === 'bound').map(f => card('', [cardHead('共享记录设置', note('由老人管理')),
        h('div', { class: 'scope-row' }, [h('span', { html: icon('clipboard') }), h('span', { text: '食物识别记录' }), statusTag(f.records_allowed ? '已授权' : '未授权', f.records_allowed ? 'ok' : 'gray')]),
        h('div', { class: 'scope-row' }, [h('span', { html: icon('shield') }), h('span', { text: '基础信息中的饮食相关设置' }), statusTag(f.profile_allowed ? '已授权' : '未授权', f.profile_allowed ? 'ok' : 'gray')]),
        h('div', { class: 'scope-row' }, [h('span', { html: icon('info') }), h('span', { text: '健康测量等其他记录' }), statusTag('未启用', 'gray')]), note('共享范围由老人确认，未授权的资料不可查看。')])) : null,
      h('details', { class: 'card family-add', id: 'family-add', open: !visible.length }, [h('summary', { text: ownElder ? '添加家人' : '把关怀带给更多家人' }),
        h('div', { class: 'family-add-body' }, [busyAction('生成我的邀请绑定码', async () => { const { code } = await api('/family/invite', { method: 'POST', body: { role: ctx.state.profile.role } }); inviteResult.textContent = `${code}（24小时有效，一次使用）`; }), inviteResult,
        field('家人的绑定码', joinCode), busyAction('提交绑定申请', async () => { await api('/family/join', { method: 'POST', body: { code: joinCode.value } }); toast('申请已提交，由老人确认后选择共享范围。'); draw(); }, { variant: 'secondary' })]),
        h('ol', { class: 'binding-steps' }, [h('li', { text: '发送邀请，将绑定码交给家人。' }), h('li', { text: '由老人在本人的页面确认身份与关系。' }), h('li', { text: '同意共享后，再查看获准的记录。' })])]),
      h('div', { class: 'privacy-note' }, [h('span', { html: icon('shield') }), note('绑定不等于授权。家人只能查看获准内容，老人可随时关闭共享。')])]);
  };
  draw(); return () => { alive = false; };
}

export function renderFamilyRelation(view, params, ctx) {
  const value = input('family-relation', '', { maxLength: 30, placeholder: '例如：女儿、儿子、妈妈' });
  fill(view, [topbar({ title: '设置家人称呼', onBack: () => ctx.navigate('family') }), card('', [field('关系 / 称呼', value),
    busyAction('保存称呼', async () => { if (!value.value.trim()) throw new Error('请填写关系称呼。'); await api(`/family/${params.id}`, { method: 'PATCH', body: { relation: value.value.trim() } }); ctx.navigate('family'); })])]);
}

export function renderChildHome(view, _params, ctx) {
  let alive = true; const urls = [];
  const draw = async () => {
    if (requireLogin(view, ctx, '守护概览')) return;
    try {
      const { selected, families } = await selectElder(ctx);
      if (!alive) return;
      if (!selected) { fill(view, [brandHeader(), pageIntro(`${ctx.state.profile.name || '您好'}，欢迎`, '一份关怀，陪家人好好吃每一餐。'), card('和家人一起守护', [note('先添加一位家人，老人确认并授权后即可查看饮食记录。'), linkButton('添加家人', 'family', ctx)])]); return; }
      let records = []; let syncAt = ''; let authorized = false;
      if (selected.records_allowed) { const payload = await api(`/records?elder=${selected.member.id}`); records = payload.records; syncAt = payload.syncedAt; authorized = true; }
      const messages = await receivedMessages();
      if (!alive) return;
      const recent = messages.filter(m => m.sender === currentAccount().id && m.recipient === selected.member.id)[0];
      const stats = historyStats(records);
      fill(view, [brandHeader(), pageIntro(`${ctx.state.profile.name || '您好'}，${new Date().getHours() < 12 ? '早上好' : '您好'}`, '一份关怀，陪家人好好吃每一餐。'),
        h('section', { class: 'card elder-overview' }, [h('div', { class: 'elder-overview-head' }, [person(selected.member, selected.member.phone), elderSelector(families, selected, id => { ctx.setState({ selectedElder: id }); draw(); })]),
          h('div', { class: 'sync-note' }, [h('span', { html: icon('shield') }), note(authorized ? `食物记录已共享 · ${timeText(syncAt)}同步` : '尚未授权食物记录')])]),
        h('section', { class: 'card voice-prompt' }, [h('div', { class: 'voice-prompt-head' }, [h('span', { class: 'voice-prompt-icon', html: icon('mic') }), h('div', {}, [h('h2', { class: 'card-title', text: '让家人听见您的关心' }), note('说一句问候，陪伴家人的每一餐。')])]),
          button({ label: '发送语音', iconHtml: icon('mic'), variant: 'secondary', block: true, onClick: () => ctx.navigate('voices', { recipient: selected.member.id }) })]),
        authorized ? card('', [cardHead('食物识别概览', note(stats.weekLabel)), h('div', { class: 'care-stats' }, [h('div', {}, [h('strong', { text: stats.today }), note('今日已识别')]), h('div', {}, [h('strong', { text: stats.week }), note('本周已识别')]), h('div', {}, [h('strong', { text: stats.attention }), note('本周需留意')])])]) : card('等待家人授权', [note('绑定成功后，仍需老人开启食物记录共享。'), linkButton('查看共享范围', 'family', ctx)]),
        authorized ? card('', [cardHead('家人最近拍了什么', h('button', { class: 'text-link', type: 'button', text: '查看全部 ›', onClick: () => ctx.navigate('records', { elder: selected.member.id }) })), h('ul', { class: 'history-list' }, records.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 3).map(r => historyItem(r, ctx, selected.member.id, urls))), records.length ? null : note('还没有识别记录。')]) : null,
        card('', [cardHead('最近的关怀', h('button', { class: 'text-link', type: 'button', text: '语音记录 ›', onClick: () => ctx.navigate('voices', { recipient: selected.member.id }) })),
          recent?.note ? h('p', { class: 'voice-quote', text: `“${recent.note}”` }) : null,
          h('div', { class: 'recent-voice-meta' }, [note(recent ? `${timeText(recent.sentAt)} · ${Math.round(recent.duration)}秒` : '还没有发送语音。'), recent ? statusTag(recent.playedAt ? '已送达 · 已播放' : recent.deliveredAt ? '已送达 · 待播放' : '已发送 · 待送达', recent.playedAt ? 'ok' : 'yellow') : null])]),
        phoneLink(selected.member.phone, `联系${selected.member.name}`)]);
    } catch (error) { if (alive) fill(view, [topbar({ title: '守护概览' }), card('暂时无法连接', [note(error.message), linkButton('家人管理', 'family', ctx)])]); }
  };
  draw(); return () => { alive = false; urls.forEach(URL.revokeObjectURL); };
}

export function renderChildSettings(view, _params, ctx) {
  let alive = true;
  const prefs = ctx.state.prefs;
  const elderBanner = h('div', { hidden: true });
  if (currentAccount()) selectElder(ctx).then(({ selected }) => { if (alive && selected) { elderBanner.hidden = false; fill(elderBanner, [sharedBanner(selected.member, selected.records_allowed ? '食物记录已共享，关怀与家人同在' : '共享范围由老人本人管理')]); } }).catch(() => {});
  const preference = async (key, checked) => {
    const next = { ...ctx.state.prefs, [key]: checked };
    if (currentAccount()) await updateAccount({ prefs: next });
    savePrefs(next); ctx.setState({ prefs: next });
  };
  fill(view, [brandHeader(), pageIntro('我的设置'), card('', [person(ctx.state.profile, currentAccount()?.phone), statusTag('子女端'), statusTag('仅查看老人授权内容')]), elderBanner,
    card('我的资料与家人', [menuRow('基础信息', 'person', () => ctx.navigate('profile', { edit: '1' }), { detail: '查看和修改自己的姓名、手机号' }), menuRow('家人管理', 'people', () => ctx.navigate('family'), { detail: '已绑定家人 · 共享范围由老人管理' })]),
    card('语音通知', [h('div', { class: 'notification-row' }, [h('span', { html: icon('bell') }), toggle('语音送达通知', prefs.deliveryNotice !== false, checked => preference('deliveryNotice', checked), '家人收到后在本应用内提醒我')]),
      h('div', { class: 'notification-row' }, [h('span', { html: icon('wave') }), toggle('语音播放通知', prefs.playNotice !== false, checked => preference('playNotice', checked), '家人开始播放后在本应用内提醒我')])]),
    card('隐私与帮助', [menuRow('隐私与共享权限', 'shield', () => ctx.navigate('privacy')), menuRow('帮助与使用指南', 'info', () => ctx.navigate('guide'))]),
    card('', [menuRow('身份说明与切换', 'refresh', () => ctx.navigate('identity', { switch: '1' }), { value: '我是子女' }), note('子女端用于沟通与查看已授权记录。切换身份不会增加权限，老人的资料仍由本人管理。')]),
    currentAccount() ? busyAction('退出登录', async () => { await logout(); ctx.setState({ account: null, profile: loadProfile(), prefs: loadPrefs(), selectedElder: null, result: null }); ctx.navigate('welcome'); }, { variant: 'ghost' }) : linkButton('手机号测试登录', 'welcome', ctx),
    note('食护家 · 第三版 3.0.0 · 本机/局域网测试版')]);
  return () => { alive = false; };
}

export function renderLegal(view, params, ctx) {
  const privacy = params.section !== 'terms';
  fill(view, [topbar({ title: privacy ? '隐私说明' : '用户协议', onBack: () => { if (!ctx.back()) ctx.navigate('welcome'); } }),
    card(privacy ? '数据如何保存与共享' : '本机测试版使用约定', [
      note('本版用于本机和可信局域网体验。验证码直接显示在页面，没有接入真实短信或微信身份验证。'),
      h('p', { text: '游客的资料、识别历史和照片保存在当前浏览器。登录后，资料和本人识别记录可保存到这台电脑的家庭服务；照片仍在浏览器本机完成 OCR。' }),
      h('p', { text: '家庭绑定必须由老人确认；食物记录和饮食相关设置分别授权。关闭共享或解除绑定后，服务端拒绝家人继续读取。家人已看到的内容不能从记忆中撤回。' }),
      h('p', { text: '关怀语音只向已绑定家人发送，接收端取得消息后确认送达，开始播放后确认播放。通知为应用内提示，不是系统推送。' }),
      h('p', { text: '家庭服务数据存于第三版/_local/family.sqlite3。服务器不公开这个目录。不要把本地测试身份验证直接部署到公网。' }),
      h('p', { text: '识别可能有错字或漏字，请核对包装。提醒不做疾病诊断，也不替代医生建议。' })])]);
}

export function renderPrivacy(view, _params, ctx) {
  fill(view, [topbar({ title: '隐私与共享权限', onBack: () => ctx.navigate('settings') }),
    card('共享由本人决定', [note('绑定与授权分别管理。老人本人可以在子女守护里开启或关闭每一位家人的共享范围。子女无法替老人授权。'), linkButton('管理家人和共享范围', 'family', ctx)]),
    card('本人数据', [linkButton('查看识别记录', 'records', ctx), linkButton('查看和编辑本人资料', 'profile', ctx, { edit: '1' }), linkButton('完整隐私说明', 'legal', ctx, { section: 'privacy' })]),
    card('登录状态', [currentAccount() ? busyAction('退出当前账号', async () => { await logout(); ctx.setState({ account: null, profile: loadProfile(), prefs: loadPrefs(), result: null, selectedElder: null }); ctx.navigate('welcome'); }, { variant: 'ghost' }) : linkButton('登录本地测试账号', 'welcome', ctx)]),
    note('健康测量与其他记录本版没有启用，也不会因为绑定而授权。')]);
}

export function renderGuide(view, _params, ctx) {
  fill(view, [topbar({ title: '帮助与使用指南', onBack: () => ctx.navigate('settings') }),
    card('1. 看清食品包装', [h('p', { text: '点拍照或从相册选图，对准包装背面的配料和营养表。识别候选需核对；未读到的项目保持未知。' })]),
    card('2. 记录拍过和吃过的食品', [h('p', { text: '拍照识别后自动保存识别历史。核对后填写实际食用数量，点击“我已吃了”才累计摄入。健康记录可选日期、筛选需留意、重看照片并设置餐次。' })]),
    card('3. 和家人一起守护', [h('p', { text: '登录本地测试账号，生成绑定码交给家人。另一位家人提交后由老人确认，再分别选择共享食物记录和饮食设置。两台设备需访问同一台电脑的家庭服务。' })]),
    card('4. 发送关怀语音', [h('p', { text: '选择已绑定家人，录音或选择已有录音，试听后发送。电脑 localhost 可使用麦克风；普通局域网 HTTP 下可选录音文件。老人取得消息后反馈送达，开始播放后反馈已播放。' })]),
    card('5. 联系与求助', [h('p', { text: '家人确认绑定后可点联系人拨号。紧急求助号码由本人设置，点击会打开设备拨号功能，网页不会自动派出救援。' })]),
    linkButton('适老化说明与识别依据', 'help', ctx)]);
}

export function renderEmergency(view, _params, ctx) {
  const phone = input('emergency-phone', ctx.state.profile.emergencyPhone, { type: 'tel', inputMode: 'tel', maxLength: 20, placeholder: '家人、家医或本人确认的求助号码' });
  fill(view, [topbar({ title: '求助号码设置', onBack: () => ctx.navigate('settings') }), card('紧急求助联系人', [field('拨打的号码', phone),
    note('请填写本人确认的号码。首页点击紧急求助后打开拨号，网页不会自动派出救援。'),
    busyAction('保存求助号码', async () => { if (phone.value && !/^\+?[\d -]{3,20}$/.test(phone.value)) throw new Error('号码格式不正确。'); const profile = { ...ctx.state.profile, emergencyPhone: phone.value.trim() }; if (currentAccount()) await updateAccount({ profile }); saveProfile(profile); ctx.setState({ profile }); ctx.navigate('home'); })])]);
}
