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
import { DAILY_LIMITS } from '../data/nutrition.js';
import { SAMPLE_BY_ID } from '../data/sample-labels.js';
import { todayTotals } from '../core/store.js';
import { speakAndRecord, processDemoCase } from '../core/flow.js';
import * as speech from '../core/speech.js';

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

  /* 「吃这一份**之前**」的当日累计，必须在写记录之前取。
     speakAndRecord() 会把这一份也写进当日记录（同步的），之后再取的话
     「今天已吃进」会把同一份算两次，右边「吃完还剩」就会少算一整份
     （实测：盐这一份 60 mg，却显示「已吃进 60 mg、还剩 1380」而非 1440）。
     所以顺序不能换：先快照 → 再写记录 → 再渲染。 */
  const totalsBefore = todayTotals();

  /* 只在第一次进入结果页时写入记录并播报，返回重看时不重复写 */
  if (!result.recorded) {
    result.recorded = true;
    speakAndRecord(result, ctx.state.profile);
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
          h('span', { class: 'risk-level-label', text: `${meta.label} · ${meta.text}` }),
          label.productName ? h('span', { text: `　${label.productName}` }) : null
        ]),
        h('h2', { class: 'risk-headline', text: assessment.headline })
      ])
    ]),

    /* ---------- 该怎么办 ---------- */
    h('section', { class: 'card' }, [
      h('h3', { class: 'card-title', text: assessment.level === 'gray' ? '怎么拍才看得清' : '该怎么办' }),
      h('p', { text: assessment.advice })
    ]),

    /* ---------- 当日额度 ---------- */
    assessment.level !== 'gray' && assessment.nutrients?.length
      ? budgetCard(assessment, label, totalsBefore)
      : null,

    /* ---------- 看见的照片与识别通道 ---------- */
    photoCard(photo, label),

    /* ---------- 依据在哪 ---------- */
    ...(assessment.basis || []).map(basisBlock),

    /* ---------- 数字标签入口（GB 7718-2025 鼓励的数字化手段）---------- */
    assessment.level === 'gray' ? null : digitalLabelCard(label),

    /* ---------- 配料表原文与行号 ---------- */
    label.ingredientLines?.length
      ? h('details', { class: 'basis' }, [
          h('summary', {}, [h('span', { html: icon('tag') }), h('span', { text: '包装上的配料表原文' })]),
          h('ul', { class: 'ingredient-lines' },
            label.ingredientLines.map((line) =>
              h('li', {}, [
                h('span', { class: 'line-no', text: `第 ${line.line} 行` }),
                h('span', { text: line.text })
              ])
            )
          ),
          label.allergenDeclaration
            ? h('p', { class: 'footnote', text: `包装致敏物质提示原文：${label.allergenDeclaration}` })
            : h('p', { class: 'footnote', text: '这张包装上没读到「致敏物质提示」。' })
        ])
      : null,

    /* ---------- 下一步动作 ---------- */
    ...actionsFor(assessment, ctx),

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
 * 灰色（看不清）时不渲染这张卡——那时候还没有可展示的识别结果，
 * 多一张卡只会让老人以为系统已经看懂了。
 */
function photoCard(photo, label) {
  const pending = !label.ingredientText && !Object.values(label.nutritionPer100g || {}).some((v) => Number.isFinite(Number(v)));
  if (pending) return null;

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
 * @param {object} label 用于显示净含量（份量口径要说清楚）
 * @param {object} totals 「吃这一份**之前**」的当日累计——必须在写记录之前取，
 *   否则会把这一份算两次（见 renderResult 里的注释）
 */
function budgetCard(assessment, label, totals) {
  const serving = assessment.quantity?.servingGrams;
  const netContent = label?.netContent;

  const rows = assessment.nutrients.map((n) => {
    const limit = DAILY_LIMITS[n.key];
    if (!limit) return null;
    const usedBefore = Math.max(0, Math.min(totals[n.key] || 0, limit.limit));
    const after = Math.min(limit.limit, usedBefore + n.amount);
    const ratio = limit.limit > 0 ? after / limit.limit : 0;
    // 与首页同一套三档：正常品牌绿 / 将满黄 / 吃满橙。
    // 红色不参与——它属于过敏「别吃」那一级（原来这里吃满配的是红，已改）。
    const tone = toneOf(ratio);
    const remaining = Math.max(0, Math.round((limit.limit - usedBefore - n.amount) * 10) / 10);

    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-head' }, [
        h('span', {
          class: 'meter-name',
          text: `${NUTRIENT_TITLE[n.key] || n.label}　这一份 ${n.amount} ${n.unit}`
        }),
        h('span', {
          class: 'meter-value',
          dataset: { tone },
          text: remaining > 0 ? `吃完还剩 ${remaining} ${n.unit}` : '这一份就吃满了'
        })
      ]),
      h('p', { class: 'meter-verdict', dataset: { tone }, text: VERDICT[n.grade] || VERDICT.unknown }),
      h('p', {
        class: 'meter-sub',
        text: `今天已吃进 ${Math.round(usedBefore * 10) / 10} ${n.unit}，一天的建议上限 ${limit.limit} ${n.unit}`
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

  if (gray) {
    actions.push(
      button({
        label: '再拍一张清楚点的',
        iconHtml: icon('camera'),
        block: true,
        huge: true,
        onClick: () => ctx.navigate('home', {}, { replace: true })
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
    gray: 'qr'
  }[level] || 'info';
}

/**
 * 数字标签入口。
 *
 * GB 7718-2025 鼓励预包装食品用二维码提供数字标签，并要求支持页面放大、
 * 语音识读、视频讲解——这一条几乎是为老年用户量身定制的，因此列为功能清单第 5 项。
 *
 * 本期实现范围：把识别到的标签内容做成可放大、可朗读的数字标签视图。
 * 「扫描包装上的二维码进入」这一入口尚未接入（需要相机实时解码），
 * 这里如实说明，不假装已实现。
 */
function digitalLabelCard(label) {
  const lines = [
    `商品名称：${label.productName || '未识别'}`,
    label.netContent ? `净含量：${label.netContent}` : null,
    `配料表：${label.ingredientText || '未读到'}`,
    label.allergenDeclaration ? `致敏物质提示：${label.allergenDeclaration}` : '致敏物质提示：包装上未标示',
    '营养成分表（每 100 g）：',
    ...Object.entries(label.nutritionPer100g || {})
      .filter(([, v]) => Number.isFinite(Number(v)))
      .map(([k, v]) => `　${NUTRIENT_NAMES[k] || k}　${v} ${NUTRIENT_UNITS[k] || ''}`)
  ].filter(Boolean);

  return h('details', { class: 'basis' }, [
    h('summary', {}, [h('span', { html: icon('qr') }), h('span', { text: '数字标签（可放大、可朗读）' })]),
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
      text: '说明：本期已实现「放大 + 朗读」的数字标签视图；扫描包装二维码直接进入的入口尚未接入，列入路线图。'
    })
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
