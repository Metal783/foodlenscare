/** 关怀语音：录音与朗读分开，送达和播放状态来自接收端。 */
import { h, topbar, fill, toast } from '../ui/dom.js';
import { card, note, field, input, busyAction, requireLogin, familyData, timeText, person, pageIntro, sharedBanner, cardHead } from '../ui/care.js';
import { icon } from '../ui/icons.js';
import { api, currentAccount, receivedMessages } from '../core/service.js';
import { blobDataUrl } from '../core/history.js';

export function messageCard(message, names = {}, options = {}) {
  const incoming = message.recipient === currentAccount()?.id;
  const status = h('span', { class: 'care-tag', text: message.playedAt ? '已送达 · 已播放' : message.deliveredAt ? '已送达 · 待播放' : '已发送 · 待送达' });
  const audio = h('audio', { controls: true, preload: 'metadata', src: message.audioDataUrl, 'aria-label': '关怀语音', onPlay: async () => {
    if (!incoming || message.playedAt) return;
    try {
      const payload = await api(`/voices/${message.id}/receipt`, { method: 'POST', body: { played: true } });
      Object.assign(message, payload.message); status.textContent = '已送达 · 已播放';
    } catch (error) { toast(error.message); }
  } });
  const play = h('button', { class: options.compact ? 'round-play' : 'voice-play', type: 'button', 'aria-label': '播放关怀语音', html: icon('play'), onClick: () => { if (audio.paused) audio.play().catch(() => toast('这段语音暂时无法播放，请重试。')); else audio.pause(); } });
  audio.addEventListener('play', () => { play.setAttribute('aria-label', '暂停关怀语音'); play.innerHTML = '<span aria-hidden="true">Ⅱ</span>'; });
  const resetPlay = () => { play.setAttribute('aria-label', '播放关怀语音'); play.innerHTML = icon('play'); };
  audio.addEventListener('pause', resetPlay); audio.addEventListener('ended', resetPlay);
  if (options.compact) { audio.hidden = true; return h('div', { class: 'compact-voice' }, [h('span', { class: 'voice-sender-icon', html: icon('people') }), h('strong', { text: `${names[message.sender] || '家人'}发来关怀语音` }), play, audio]); }
  return h('article', { class: 'voice-message' }, [message.note ? h('p', { class: 'voice-quote', text: `“${message.note}”` }) : note(incoming ? `${names[message.sender] || '家人'}的关怀` : `发送给${names[message.recipient] || '家人'}`),
    h('div', { class: 'voice-message-meta' }, [play, note(`${timeText(message.sentAt)} · ${Math.round(message.duration)}秒`), status]),
    h('details', { class: 'voice-player-details' }, [h('summary', { text: '播放与进度' }), audio])]);
}

export function renderVoices(view, params, ctx) {
  let alive = true; let recorder; let stream; let timer; let blob; let previewUrl; let recordedSeconds = 0;
  const stopTracks = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const cleanup = () => { alive = false; clearInterval(timer); if (recorder?.state === 'recording') recorder.stop(); stopTracks(); if (previewUrl) URL.revokeObjectURL(previewUrl); };
  if (requireLogin(view, ctx, '关怀语音')) return cleanup;
  fill(view, [topbar({ title: '关怀语音', onBack: () => ctx.navigate('home') }), card('正在读取家人')]);
  const load = async () => {
    const families = (await familyData()).filter(f => f.status === 'bound');
    const messages = await receivedMessages();
    if (!alive) return;
    const names = Object.fromEntries(families.map(f => [f.member.id, f.member.name]));
    const recipient = h('select', { class: 'review-input', id: 'voice-recipient', 'aria-label': '选择语音接收人' }, families.map(f => h('option', { value: f.member.id, text: f.member.name })));
    recipient.value = families.some(f => f.member.id === params.recipient) ? params.recipient : families[0]?.member.id || '';
    const status = h('p', { role: 'status', text: '准备录音' });
    status.className = 'record-status care-tag';
    const clock = h('strong', { class: 'record-clock', text: '00:00' });
    const formatClock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const recordStage = h('section', { class: 'card recording-card', dataset: { state: 'idle' } });
    const duration = input('voice-duration', '', { type: 'number', min: 1, max: 120, step: 'any', placeholder: '自动读取；无法读取时请填写' });
    const description = input('voice-note', '', { maxLength: 300, placeholder: '例如：早餐提醒（可不填）' });
    const preview = h('audio', { controls: true, hidden: true, 'aria-label': '试听录音' });
    const previewBox = h('details', { class: 'record-preview-controls', hidden: true }, [h('summary', { text: '播放进度' }), preview]);
    const receivePreview = recording => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      blob = recording; previewUrl = URL.createObjectURL(recording); preview.src = previewUrl; preview.hidden = false;
      previewBox.hidden = false;
      status.textContent = '录音完成，试听后发送。'; duration.value = recordedSeconds || '';
      recordStage.dataset.state = 'ready'; clock.textContent = formatClock(Math.round(recordedSeconds)); previewPlay.disabled = false;
    };
    const start = busyAction('开始录音', async () => {
      if (recorder?.state === 'recording') throw new Error('正在录音，请先停止。');
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('当前浏览器不能录音。电脑请用localhost打开；手机可选择已有录音文件。');
      const candidate = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive) { candidate.getTracks().forEach(track => track.stop()); return; }
      stream = candidate;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new globalThis.MediaRecorder(stream, mimeType ? { mimeType } : {});
      const chunks = []; const started = performance.now();
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { clearInterval(timer); stopTracks(); if (alive) { start.disabled = false; stop.disabled = true; status.textContent = '录音失败，请重新录制或选择文件。'; } };
      recorder.onstop = () => {
        clearInterval(timer); stopTracks();
        if (!alive) return;
        recordedSeconds = Math.min(120, Math.max(1, (performance.now() - started) / 1000));
        receivePreview(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); start.disabled = false; stop.disabled = true;
      };
      recorder.start(); start.disabled = true; stop.disabled = false;
      recordStage.dataset.state = 'recording'; status.textContent = '正在录音'; clock.textContent = '00:00'; previewPlay.disabled = true;
      timer = setInterval(() => { const elapsed = Math.floor((performance.now() - started) / 1000); clock.textContent = formatClock(elapsed); if (elapsed >= 120) recorder.stop(); }, 250);
    }, { variant: 'secondary' });
    const stop = busyAction('停止录音', async () => { if (recorder?.state === 'recording') recorder.stop(); }, { variant: 'secondary', attrs: { disabled: true } });
    const file = input('voice-file', '', { type: 'file', accept: 'audio/webm,audio/mp4,audio/ogg,audio/wav,video/webm', onChange: () => {
      if (recorder?.state === 'recording') { file.value = ''; toast('请先停止录音。'); return; }
      const recording = file.files?.[0]; if (!recording) return;
      if (recording.size > 8 * 1024 * 1024 || !/^(audio\/(webm|mp4|ogg|wav)|video\/webm)/.test(recording.type)) { toast('请选择8MB以内的webm、mp4、ogg或wav录音。'); return; }
      recordedSeconds = 0; receivePreview(recording);
      preview.onloadedmetadata = () => { if (Number.isFinite(preview.duration)) { duration.value = Math.round(preview.duration * 10) / 10; clock.textContent = formatClock(Math.round(preview.duration)); } };
    } });
    const history = h('div', { class: 'voice-history' }, messages.map(message => messageCard(message, names)));
    const previewPlay = busyAction('试听', async () => { if (!blob) throw new Error('请先录音或选择录音文件。'); await preview.play(); }, { variant: 'secondary', iconHtml: icon('play'), attrs: { disabled: true } });
    const clear = busyAction('重新录制', async () => { if (recorder?.state === 'recording') throw new Error('请先停止录音。'); blob = null; preview.pause(); preview.removeAttribute('src'); preview.hidden = true; previewBox.hidden = true; duration.value = ''; file.value = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; status.textContent = '请重新开始录音。'; recordStage.dataset.state = 'idle'; clock.textContent = '00:00'; previewPlay.disabled = true; }, { variant: 'secondary', iconHtml: icon('refresh'), attrs: { 'aria-label': '重新录制 / 清除当前录音' } });
    const send = busyAction('发送给家人', async () => {
          if (recorder?.state === 'recording') throw new Error('请先停止并试听录音。');
          if (!blob || !recipient.value) throw new Error('请先准备录音并选择家人。');
          if (!duration.value || !duration.checkValidity()) throw new Error('请填写1—120秒的录音时长。');
          await api('/voices', { method: 'POST', body: { recipient: recipient.value, audioDataUrl: await blobDataUrl(blob), duration: Number(duration.value), note: description.value } });
          toast('语音已发送，家人收到和播放后会更新状态。'); ctx.navigate('voices', { recipient: recipient.value }, { force: true, replace: true });
        }, { iconHtml: icon('send') });
    fill(recordStage, [status, h('span', { class: 'record-mic', html: icon('mic') }), clock,
      h('div', { class: 'record-wave', 'aria-hidden': 'true' }, [12,22,34,48,28,58,40,24,46,60,32,48,24,42,54,30,38,20,32,18].map(height => h('i', { style: { height: `${height}px` } }))),
      note('最长录音2分钟。录好后请先试听，再发送。'), h('div', { class: 'care-filters recording-actions' }, [start, stop]), h('div', { class: 'care-filters recording-preview-actions' }, [previewPlay, clear]), previewBox]);
    const recipientBanner = h('section', { class: 'voice-recipient-banner' }, [sharedBanner(families.find(f => f.member.id === recipient.value)?.member, '向已绑定家人发送关怀'), field('发送给', recipient)]);
    recipient.addEventListener('change', () => { const first = recipientBanner.firstChild; first.replaceWith(sharedBanner(families.find(f => f.member.id === recipient.value)?.member, '向已绑定家人发送关怀')); });
    fill(view, [topbar({ title: '发送语音', onBack: () => ctx.navigate('home') }), pageIntro('把关心，说给家人听', `发送者：${ctx.state.profile.name || '本人'}`),
      families.length ? [recipientBanner, recordStage,
        h('details', { class: 'voice-upload card' }, [h('summary', { text: '选择已有录音 / 添加语音标题' }), field('也可选择已有录音', file), field('录音时长 / 秒', duration), field('语音标题（选填）', description), note('普通手机局域网HTTP不能申请麦克风时，可选择录音文件发送。')]),
        send] : card('还没有已绑定家人', [note('老人确认绑定后即可发送语音。'), busyAction('添加家人', async () => ctx.navigate('family'))]),
      h('div', { class: 'heart-note' }, [h('span', { html: icon('heart') }), note('聊聊今天的饭菜、问候与陪伴。饮食关怀不替代医生的建议。')]),
      card('', [cardHead('最近的关怀语音', busyAction('刷新送达和播放状态', async () => {
        const fresh = await receivedMessages(); if (alive) fill(history, fresh.map(message => messageCard(message, names))); toast('状态已更新。');
      }, { variant: 'ghost', attrs: { class: 'text-link', title: '刷新送达和播放状态', 'aria-label': '刷新送达和播放状态' } })), history, messages.length ? null : note('还没有关怀语音。')])]);
  };
  load().catch(error => { if (alive) fill(view, [topbar({ title: '关怀语音', onBack: () => ctx.navigate('home') }), card('无法连接', [note(error.message)])]); });
  return cleanup;
}
