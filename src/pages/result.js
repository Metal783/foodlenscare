/**
 * 第四步「判风险」+ 第五步「念出来」—— 结果页
 *
 * 这页是整个作品的门面，几个硬约束必须同时满足：
 *  1. 结论一句话，字号 ≥ 30 dp/pt（1.6 rem，基准 20 px 时即 32 px）；
 *  2. 风险等级同时用颜色、文字标签、图标、语音四种方式表达，颜色不是唯一载体；
 *  3. 每条结论都能展开看依据，并明确区分「规则判定」与「模型推测」；
 *  4. 进入页面即自动播报，另有常驻「再念一遍」大按钮；
 *  5. 灰色等级不给结论，只请用户补拍。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { RISK_LEVELS } from '../core/rules.js';
import { DAILY_LIMITS, NUTRIENT_FIELDS } from '../data/nutrition.js';
import { SAMPLE_BY_ID } from '../data/sample-labels.js';
import { loadRecords, todayTotals } from '../core/store.js';
import { speakAndRecord, processDemoCase, evaluateLabel, recordResult } from '../core/flow.js';
import { reviewLabel } from '../core/label-review.js';
import * as speech from '../core/speech.js';
import { updateHistory, syncHistory } from '../core/history.js';

const NUTRIENT_TITLE = {
  sodium: '盐（钠）',
  sugar: '糖',
  saturatedFat: '油（饱和脂肪）',
  fat: '脂肪'
};

/**
 * @param {HTMLElement} view
 * @param {Object} params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderResult(view, params, ctx) {
  const result = ctx.state.result;

  // 深链接：允许直接用 #/result?case=peanut-cookie 打开某个演示用例，
  // 方便录制演示视频时反复定位到同一个画面。
  if (!result && params?.case) {
    renderDeepLink(view, params.case, ctx);
    return;
  }

  if (!result) {
    ctx.navigate('home', {}, { replace: true });
    return;
  }

  const { photo, assessment } = result;
  const meta = RISK_LEVELS[assessment.level] || RISK_LEVELS.gray;
  const label = photo.label;

  /* 查看结果只播报；摄入记录必须由用户明确确认。
     （合并说明：此前这里会同步写入记录，于是「今天已吃进」把这一份算两次 ——
     盐一份 60 mg 显示成「已吃进 60、还剩 1380」而非 1440。记录改由「我已吃了」
     触发后，确认之前这一份不进当日累计，问题从根上消失。） */
  if (!result.spoken) {
    result.spoken = true;
    speakAndRecord(result, ctx.state.profile, { record: false });
  }

  const speakerBar = document.getElementById('speaker');
  const speakerBtn = document.getElementById('speaker-btn');
  if (speakerBar && speakerBtn) {
    speakerBar.hidden = false;
    speakerBtn.onclick = () => {
      if (!speech.isSupported()) {
        toast('这台设备的浏览器不支持语音朗读，可以看大字结论。', 3000);
        return;
      }
      speech.speak(speech.buildSpeechText(assessment));
      toast('正在念……');
    };
  }

  fill(view, [
    topbar({
      title: '看标签的结果',
      onBack: () => ctx.navigate('home', {}, { replace: true })
    }),

    /* ---------- 结论区：颜色 + 文字标签 + 图标 + 大字 ---------- */
    h('section', { class: 'risk-banner', dataset: { level: assessment.level } }, [
      h('span', { class: 'risk-icon', html: icon(iconNameFor(assessment.level)) }),
      h('div', { class: 'risk-body' }, [
        h('div', { class: 'risk-level' }, [
          h('span', { class: 'risk-level-label', text: label.nutritionPartial ? '部分营养已核对 · 缺失项目未知' : assessment.partial && assessment.allergenConflicts.length ? '配料过敏提醒 · 营养待核对' : label.readingOnly ? '配料读取 · 营养待核对' : label.channel === 'unavailable' ? '灰色 · 尚未读取' : `${meta.label} · ${meta.text}` }),
          label.productName ? h('span', { text: `　${label.productName}` }) : null
        ]),
        h('h2', { class: 'risk-headline', text: assessment.headline })
      ])
    ]),

    /* ---------- 该怎么办 ---------- */
    h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: assessment.level === 'gray' ? '接下来怎么做' : '该怎么办' }),
      h('p', { text: assessment.advice })
    ]),

    /* ---------- 当日额度 ---------- */
    (assessment.level !== 'gray' || label.nutritionConfirmed) && assessment.nutrients?.length
      ? budgetCard(assessment, result)
      : null,

    ...actionsFor(assessment, ctx),

    /* ---------- 看见的照片与识别通道 ---------- */
    photoCard(photo, label),

    result.historyId ? button({ label: '查看这次的识别记录', variant: 'secondary', block: true,
      onClick: () => ctx.navigate('record-detail', { id: result.historyId }) }) : null,

    label.channel === 'paddleOcr' && !result.consumptionRecordId ? reviewCard(result, ctx) : null,
    !label.readingOnly && (assessment.level !== 'gray' || label.nutritionConfirmed) ? consumptionCard(result, ctx) : null,

    /* ---------- 依据在哪 ---------- */
    ...(assessment.basis || []).map(basisBlock),

    /* ---------- 标签原文（配料表 + 营养成分，可朗读）---------- */
    label.ingredientText ? digitalLabelCard(label) : null,
    label.rawText ? h('details', { class: 'basis' }, [
      h('summary', { text: '照片识别全文（可展开朗读）' }),
      h('p', { class: 'footnote', text: '以下是实际 OCR 输出，可能有错字或漏字，请对照照片核对。' }),
      h('p', { text: label.rawText, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }),
      button({ label: '朗读照片上的文字', variant: 'secondary', block: true, onClick: () => {
        if (!speech.isSupported()) { toast('浏览器不支持朗读，请查看上方大字。'); return; }
        speech.unlock(); speech.speak(label.rawText);
      } })
    ]) : null,

    h('p', {
      class: 'footnote',
      html:
        '以上判断依据来自 GB 7718-2025、GB 28050-2025、GB 2760 与《中国居民膳食指南（2022）》，' +
        '只做日常饮食提醒，<strong>不做疾病诊断</strong>，也不替代医生或营养师的意见。'
    })
  ]);
}

/* ------------------------------------------------------------------ 分区 */

/**
 * 「看的是哪张照片」卡片。
 * 保留照片供用户核对；识别失败时也可以看到选择的原图。
 */
function photoCard(photo, label) {
  return h('section', { class: 'card' }, [
    h('h3', { class: 'card-title', text: '看的是哪张照片' }),
    photo.previewUrl
      ? h('div', { class: 'photo-frame' }, [h('img', { src: photo.previewUrl, alt: '识别用的照片' })])
      : h('p', { class: 'photo-meta', text: '（演示用例：没有照片，直接使用内置标签数据）' }),
    h('p', {
      class: 'photo-meta',
      text:
        `识别通道：${label.channelLabel || '未知'}　` +
        `耗时 ${(photo.elapsedMs || 0) / 1000 < 0.1 ? '< 0.1' : ((photo.elapsedMs || 0) / 1000).toFixed(1)} 秒` +
        (photo.quality?.sharpness !== undefined ? `　清晰度 ${photo.quality.sharpness}` : '')
    }),
    photo.fallbackReason ? h('p', { class: 'error-box', text: photo.fallbackReason }) : null
  ]);
}

/** 深链接入口：直接打开某个内置演示用例的结果页 */
function renderDeepLink(view, caseId, ctx) {
  const testCase = SAMPLE_BY_ID.get(caseId);
  if (!testCase) {
    ctx.navigate('home', {}, { replace: true });
    return;
  }

  fill(view, [
    topbar({
      title: '正在看标签',
      onBack: () => ctx.navigate('home', {}, { replace: true })
    }),
    h('section', { class: 'progress-wrap', 'aria-live': 'polite' }, [
      h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', { class: 'progress-text', text: `正在读「${testCase.productName}」……` }),
      h('p', { class: 'progress-note', text: '这是内置演示用例，不需要联网' })
    ])
  ]);

  processDemoCase(caseId, ctx.state.profile)
    .then((result) => {
      ctx.setState({ result, progressPhoto: null, pendingFile: null });
      ctx.navigate('result', {}, { replace: true, force: true });
    })
    .catch(() => ctx.navigate('home', {}, { replace: true }));
}

/**
 * 单指标结论的短措辞。
 *
 * 规则层的 INTAKE_TONE_TEXT 是给「依据在哪」区用的长句
 *（「已经达到或超过一天的建议上限」），卡片上放不下也不需要那么长。
 * 这里每一句都以「这一份」开头：右上方那个数字讲的是「吃完之后还剩多少」（累计），
 * 这一句讲的是「这一份自己占多少」（单份），基准不同，必须说清楚是哪一种。
 */
const VERDICT = {
  over: '这一份就到了一整天的量',
  high: '这一份占了今天的一大半',
  notice: '这一份占了今天的一部分',
  ok: '这一份占比不高',
  unknown: '这一份暂时算不出来'
};

/**
 * @param {object} assessment
 * @param {object} result 记录态与照片都在这里；`consumptionRecordId` 决定这一份是否已计入
 */
function budgetCard(assessment, result) {
  const totals = todayTotals();
  const recorded = Boolean(result.consumptionRecordId && loadRecords().some((r) => r.id === result.consumptionRecordId));
  // 份量口径的来源：这一份按包装标示折算，不是整包都吃完
  const serving = assessment.quantity?.servingGrams;
  const netContent = result.photo?.label?.netContent;
  const rows = assessment.nutrients.map((n) => {
    const limit = DAILY_LIMITS[n.key];
    if (!limit) return null;
    const usedBefore = Math.max(0, Math.min(totals[n.key] || 0, limit.limit));
    const additional = recorded ? 0 : n.amount;
    const after = Math.min(limit.limit, usedBefore + additional);
    const ratio = limit.limit > 0 ? after / limit.limit : 0;
    // 与首页同一套三档：正常品牌绿 / 将满黄 / 吃满橙。
    // 红色不参与——它属于过敏「别吃」那一级（合并前这里「吃满」用的是红/high，已改）。
    const tone = toneOf(ratio);
    const remaining = Math.max(0, Math.round((limit.limit - usedBefore - additional) * 10) / 10);
    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-head' }, [
        h('span', {
          class: 'meter-name',
          text: `${NUTRIENT_TITLE[n.key] || n.label}　这一份 ${n.amount} ${n.unit}`
        }),
        h('span', {
          class: 'meter-value',
          dataset: { tone },
          text: totals.unknown[n.key] ? '今日有缺失数据，余量无法确定' : remaining > 0 ? `${recorded ? '已记录，还剩' : '如果吃这一份，还剩'} ${remaining} ${n.unit}` : '达到今日建议上限'
        })
      ]),
      h('p', { class: 'meter-verdict', dataset: { tone }, text: VERDICT[n.grade] || VERDICT.unknown }),
      h('p', {
        class: 'meter-sub',
        text: `今天已知记录 ${Math.round(usedBefore * 10) / 10} ${n.unit}，一天的参考上限是 ${limit.limit} ${n.unit}${totals.unknown[n.key] ? '；另有记录未标示此项' : ''}`
      }),
      h('div', { class: 'meter-track' }, [
        h('div', {
          class: 'meter-fill',
          dataset: { tone },
          style: { width: `${Math.min(100, Math.round(ratio * 100))}%` }
        })
      ])
    ]);
  }).filter(Boolean);

  if (!rows.length) return null;
  return h('section', { class: 'card' }, [
    h('h3', { class: 'card-title', text: '这份占今天多少' }),
    // 份量口径要说清楚：老人看到「还剩 12 g」会以为整包都能吃
    serving
      ? h('p', {
          class: 'footnote',
          text: netContent
            ? `${netContent}。下面按「这一份 ${serving} 克／毫升」折算，不是整包都吃完。`
            : `下面按「这一份 ${serving} 克／毫升」折算，不是整包都吃完。`
        })
      : null,
    ...rows
  ]);
}

/**
 * 额度紧张度 → 三档。与首页、与 色板/色板定义-绿色主色.md 的「进度条配色」一致：
 * 正常品牌绿、将满黄、吃满橙，**没有红**。
 */
function toneOf(ratio) {
  if (ratio >= 1) return 'over';
  if (ratio >= 0.6) return 'watch';
  return 'ok';
}

function basisBlock(block) {
  const kindText = {
    rule: '规则判定',
    model: '模型推测',
    conflict: '不确定'
  }[block.kind] || '说明';

  return h('details', { class: 'basis' }, [
    h('summary', {}, [
      h('span', { html: icon(block.kind === 'model' ? 'info' : 'shield') }),
      h('span', { text: block.title })
    ]),
    h('ul', { class: 'basis-list' }, [
      h('li', {}, [
        h('span', { class: 'basis-tag', dataset: { kind: block.kind }, text: kindText }),
        h('span', { class: 'basis-src', text: `依据：${block.source}` })
      ]),
      ...block.lines.map((line) => h('li', {}, [h('span', { text: line })]))
    ])
  ]);
}

function actionsFor(assessment, ctx) {
  const gray = assessment.level === 'gray';
  const actions = [];

  if (gray || assessment.partial) {
    actions.push(
      button({
        label: ctx.state.result?.photo.label.readingOnly ? '再拍一张配料表' : '再拍一张清楚点的',
        iconHtml: icon('camera'),
        block: true,
        huge: true,
      onClick: () => ctx.navigate(ctx.state.pendingReturn || 'home', {}, { replace: true })
      })
    );
  } else {
    actions.push(
      button({
        label: '知道了，看看今天的记录',
        iconHtml: icon('clipboard'),
        block: true,
        huge: true,
        onClick: () => ctx.navigate('records')
      })
    );
    actions.push(
      button({
        label: '再拍一件食品',
        iconHtml: icon('camera'),
        variant: 'secondary',
        block: true,
        onClick: () => ctx.navigate('home', {}, { replace: true })
      })
    );
  }

  return actions;
}

function iconNameFor(level) {
  return {
    red: 'ban',
    orange: 'alert',
    yellow: 'info',
    green: 'check',
    gray: 'refresh'
  }[level] || 'info';
}

/**
 * 标签原文卡片。
 *
 * 展示本次拍照识别到的配料表与营养成分原文，并支持一键朗读。
 * 首页「拍照读取配料表」（pages/scan.js）与主拍照走同一条识别链路，
 * 识别后进入结果页（本页）查看标签内容与规则结论。
 */
function digitalLabelCard(label) {
  const nutrients = Object.entries(label.nutritionPer100g || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)));
  const lines = [
    `商品名称：${label.productName || '未识别'}`,
    label.netContent ? `净含量：${label.netContent}` : null,
    `配料表：${label.ingredientText || '未读到'}`,
    label.allergenDeclaration ? `致敏物质提示：${label.allergenDeclaration}` : '致敏物质提示：本次未读到',
    nutrients.length ? `营养成分表（${label.declaredPer === 'perServing' ? '每份' : label.declaredPer === 'unknown' ? '口径待核对' : label.servingUnit === 'ml' ? '每 100 毫升' : '每 100 克'}）：` : '营养数值尚未核对，可对照包装填写。',
    ...nutrients
      .map(([k, v]) => `　${NUTRIENT_NAMES[k] || k}　${v} ${NUTRIENT_UNITS[k] || ''}`)
  ].filter(Boolean);

  return h('details', { class: 'basis', open: true }, [
    h('summary', {}, [h('span', { html: icon('tag') }), h('span', { text: '标签原文（可朗读）' })]),
    h('ul', { class: 'basis-list' },
      lines.map((line) => h('li', {}, [h('span', { text: line })]))
    ),
    h('button', {
      class: 'btn btn-secondary btn-block',
      type: 'button',
      onClick: () => {
        if (!speech.isSupported()) {
          toast('这台设备不支持语音朗读。', 2600);
          return;
        }
        speech.speak(`下面念一下包装上的标签内容。${lines.join('。')}`);
      }
    }, [h('span', { class: 'btn-icon', html: icon('speaker') }), h('span', { text: '把标签念给我听' })]),
    h('p', {
      class: 'footnote',
      text: '说明：这里展示的是本次拍照识别到的配料表与营养成分；也可点「把标签念给我听」听完整标签。'
    })
  ]);
}

function reviewCard(result, ctx) {
  const label = result.photo.label;
  const ingredient = h('textarea', { id: 'review-ingredients', class: 'review-input', rows: 4, value: label.ingredientText || '' });
  const declaration = h('textarea', { id: 'review-allergens', class: 'review-input', rows: 2, value: label.allergenDeclaration || '' });
  const unit = h('select', { id: 'review-unit', class: 'review-input' }, [
    h('option', { value: '', text: '请选择包装口径' }), h('option', { value: 'g', text: '每 100 克' }), h('option', { value: 'ml', text: '每 100 毫升' })
  ]);
  unit.value = label.servingUnit || '';
  const inputs = {};
  const nutrientRows = NUTRIENT_FIELDS.map((field) => {
    const input = h('input', { id: `review-${field.key}`, class: 'review-input', type: 'number', min: 0, step: 'any', inputMode: 'decimal',
      value: label.nutritionConfirmed || label.nutritionCandidates ? label.nutritionPer100g[field.key] ?? '' : '', placeholder: '未标示请留空' });
    inputs[field.key] = input;
    const candidate = label.nutritionCandidates?.[field.key];
    return h('label', { class: 'review-field', htmlFor: input.id }, [h('span', { text: `${field.label}（${field.unit}）` }), input,
      candidate ? h('span', {class:'footnote',text:`识别原文：${candidate.text}${candidate.conflict ? '；同名项目数值冲突，请自行核对' : candidate.warning ? '；'+candidate.warning : ''}（待核对）`}) : null]);
  });
  const checked = h('input', { type: 'checkbox', id: 'review-checked' });
  const error = h('p', { class: 'error-box', role: 'alert', hidden: true });
  return h('details', { class: 'basis', open: !label.nutritionConfirmed }, [
    h('summary', { text: '核对配料，继续查看提醒' }),
    h('div', { class: 'review-form' }, [
      h('p', { class: 'footnote', text: '对照上方照片补齐错字、漏字。请查看包装的完整配料及致敏提示；没匹配到过敏成分不代表一定安全。' }),
      h('label', { class: 'review-field', htmlFor: ingredient.id }, [h('span', { text: '完整配料表' }), ingredient]),
      h('label', { class: 'review-field', htmlFor: declaration.id }, [h('span', { text: '包装致敏物质提示（无标示可留空）' }), declaration]),
      h('details', { class: 'basis', open: Boolean(label.nutritionCandidates) }, [
        h('summary', { text: '填写营养表（可选）' }),
        h('div', { class: 'review-form' }, [
          h('p', { class: 'footnote', text: '识别值是待核对候选，请对照包装检查含量和单位，不能填写 NRV%。支持每 100 克或每 100 毫升；包装列了几项就核对几项，未标示的项目留空，仅计算已核对的数据。' }),
          h('label', { class: 'review-field', htmlFor: unit.id }, [h('span', { text: '包装标示口径' }), unit]), ...nutrientRows
        ])
      ]),
      h('label', { class: 'review-check', htmlFor: checked.id }, [checked, h('span', { text: '我已对照包装核对完整配料、致敏提示和填写的营养值' })]),
      error,
      button({ label: '确认核对，重新查看提醒', block: true, onClick: () => {
        try {
          if (!checked.checked) throw new Error('请先对照包装核对，再勾选确认。');
          if (Object.values(inputs).some((input) => input.validity.badInput)) throw new Error('营养值请输入有效数字。');
          const next = reviewLabel(label, { ingredientText: ingredient.value, allergenDeclaration: declaration.value,
            nutrients: Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])), unit: unit.value || (Object.values(inputs).every(i=>i.value === '') ? 'g' : '') });
          result.photo.label = next;
          result.assessment = evaluateLabel(next, ctx.state.profile);
          if (result.historyId) {
            updateHistory(result.historyId, { label: next, assessment: result.assessment, profileSnapshot: ctx.state.profile });
            syncHistory().catch(() => {});
          }
          result.spoken = false;
          ctx.navigate('result', {}, { replace: true, force: true });
        } catch (cause) { error.textContent = cause.message; error.hidden = false; }
      } })
    ])
  ]);
}

function consumptionCard(result, ctx) {
  if (result.photo.origin === 'demo') return h('p', { class: 'footnote', text: '这是演示用例，不计入真实摄入记录。' });
  const saved = result.consumptionRecordId && loadRecords().some((r) => r.id === result.consumptionRecordId);
  if (saved) return h('section', { class: 'card' }, [h('p', { text: '本次食用已记录，不会重复扣减额度。' })]);
  const unit = result.photo.label.servingUnit === 'ml' ? '毫升' : '克';
  const quantity = h('input', { id: 'consumed-quantity', class: 'review-input', type: 'number', step: 'any', min: '0.01', inputMode: 'decimal',
    value: result.photo.label.servingGrams || 100 });
  const error = h('p', { class: 'error-box', role: 'alert', hidden: true });
  return h('section', { class: 'card' }, [
    h('h3', { class: 'card-title', text: '吃了以后再记下来' }),
    h('p', { class: 'footnote', text: '查看标签不会扣减额度。只有确认已经吃了，才把实际数量计入今天。' }),
    h('label', { class: 'review-field', htmlFor: quantity.id }, [h('span', { text: `实际吃了多少（${unit}）` }), quantity]), error,
    button({ label: '我已吃了，记入今天', block: true, onClick: () => {
      try {
        const amount = Number(quantity.value);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('请填写大于 0 的实际食用数量。');
        const previous = result.photo.label.servingGrams;
        result.photo.label.servingGrams = amount;
        result.assessment = evaluateLabel(result.photo.label, ctx.state.profile);
        try {
          if (!recordResult(result, { consumptionConfirmed: true })) throw new Error('营养信息还不完整，暂时不能计入摄入量。');
        } catch (cause) { result.photo.label.servingGrams = previous; result.assessment = evaluateLabel(result.photo.label, ctx.state.profile); throw cause; }
        ctx.navigate('result', {}, { replace: true, force: true });
        toast('已按实际食用数量记录。');
      } catch (cause) { error.textContent = cause.message; error.hidden = false; }
    } })
  ]);
}

const NUTRIENT_NAMES = {
  energy: '能量',
  protein: '蛋白质',
  fat: '脂肪',
  saturatedFat: '饱和脂肪',
  carbohydrate: '碳水化合物',
  sugar: '糖',
  sodium: '钠'
};

const NUTRIENT_UNITS = {
  energy: 'kJ',
  protein: 'g',
  fat: 'g',
  saturatedFat: 'g',
  carbohydrate: 'g',
  sugar: 'g',
  sodium: 'mg'
};
