/**
 * 今日记录
 *
 * 方案 3.2 功能清单第 4 项：当天拍过的每件食品一行，记录名称、结论与时间。
 * 另外把「当日额度」用进度条直观呈现——这是橙色等级「今天已经吃过一次甜的了」
 * 这句话的数据来源。
 */

import { h, button, topbar, toast, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { RISK_LEVELS } from '../core/rules.js';
import { DAILY_LIMITS } from '../data/nutrition.js';
import { loadRecords, removeRecord, recordsOfToday, todayTotals, localDateKey } from '../core/store.js';
import * as speech from '../core/speech.js';

const NUTRIENT_TITLE = { sodium: '盐（钠）', sugar: '糖', saturatedFat: '油（饱和脂肪）' };

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderRecords(view, _params, ctx) {
  const records = loadRecords();
  const today = recordsOfToday(records);
  const totals = todayTotals(records);

  const draw = () => {
    const list = recordsOfToday(loadRecords()).slice().reverse();
    fill(view, [
      topbar({
        title: '今天的记录',
        onBack: () => {
          if (!ctx.back()) ctx.navigate('home', {}, { replace: true });
        }
      }),

      h('section', { class: 'card' }, [
        h('h3', { class: 'card-title', text: today.length ? `今天一共看了 ${today.length} 件` : '今天还没有记录' }),
        ...meterRows(todayTotals()),
        h('p', {
          class: 'footnote',
          text: '额度按 60 岁以上人群的建议上限自动扣减，只做提醒，不是医嘱。'
        })
      ]),

      list.length
        ? h('ul', { class: 'record-list' }, list.map((record) => recordItem(record, ctx, draw)))
        : h('section', { class: 'card empty-state' }, [
            h('span', { class: 'empty-icon', html: icon('clipboard') }),
            h('p', { text: '今天还没看过食品。回首页拍一张照片，看完会自动记在这里。' })
          ]),

      button({
        label: '回首页拍一张',
        iconHtml: icon('camera'),
        block: true,
        huge: true,
        onClick: () => ctx.navigate('home', {}, { replace: true })
      }),

      olderGroup(records)
    ]);
  };

  draw();
}

function recordItem(record, ctx, onChanged) {
  const meta = RISK_LEVELS[record.level] || RISK_LEVELS.gray;
  const at = new Date(record.at);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  return h('li', { class: 'record-item', dataset: { level: record.level } }, [
    h('div', { class: 'record-main' }, [
      h('p', { class: 'record-name', text: record.productName }),
      h('p', { class: 'record-line', text: record.headline }),
      h('p', { class: 'record-line record-time' }, [
        h('span', { text: `${meta.label} · ${meta.text}　${time}` }),
        record.servingGrams ? h('span', { text: `　一份约 ${record.servingGrams} g` }) : null
      ])
    ]),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem' } }, [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        style: { minHeight: '3rem', padding: '0.4rem 0.7rem' },
        'aria-label': `念一遍：${record.productName}`,
        onClick: () => {
          if (!speech.isSupported()) {
            toast('这台设备不支持语音朗读。', 2600);
            return;
          }
          speech.speak(`${record.productName}。${record.headline}`);
        }
      }, [h('span', { class: 'btn-icon', html: icon('speaker') })]),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        style: { minHeight: '3rem', padding: '0.4rem 0.7rem' },
        'aria-label': `删除记录：${record.productName}`,
        onClick: () => {
          removeRecord(record.id);
          toast('已经删掉了。');
          onChanged();
        }
      }, [h('span', { class: 'btn-icon', html: icon('close') })])
    ])
  ]);
}

function meterRows(totals) {
  return ['sodium', 'sugar', 'saturatedFat'].map((key) => {
    const limit = DAILY_LIMITS[key];
    const used = Math.min(totals[key] || 0, limit.limit);
    const ratio = limit.limit > 0 ? used / limit.limit : 0;
    const tone = ratio >= 1 ? 'high' : ratio >= 0.6 ? 'over' : 'ok';
    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-head' }, [
        h('span', { text: NUTRIENT_TITLE[key] }),
        h('span', {
          class: 'meter-value',
          text: ratio >= 1 ? '今天已经吃满了' : `还剩 ${Math.round((limit.limit - used) * 10) / 10} ${limit.unit}`
        })
      ]),
      h('div', { class: 'meter-track' }, [
        h('div', { class: 'meter-fill', dataset: { tone }, style: { width: `${Math.min(100, Math.round(ratio * 100))}%` } })
      ]),
      h('p', {
        class: 'photo-meta',
        text: `今天已经吃进 ${Math.round((totals[key] || 0) * 10) / 10} ${limit.unit}，一天的建议上限是 ${limit.limit} ${limit.unit}`
      })
    ]);
  });
}

/** 更早的记录只按天汇总，不做长期趋势图表（本期明确不做） */
function olderGroup(records) {
  const todayKey = localDateKey();
  const older = records.filter((r) => localDateKey(new Date(r.at)) !== todayKey);
  if (!older.length) return null;

  const byDay = new Map();
  for (const record of older) {
    const key = localDateKey(new Date(record.at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(record);
  }

  return h('details', { class: 'basis' }, [
    h('summary', {}, [h('span', { html: icon('clipboard') }), h('span', { text: `还有更早的 ${older.length} 条记录` })]),
    h('ul', { class: 'basis-list' },
      [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, items]) =>
          h('li', {}, [
            h('span', { text: `${day}：${items.length} 件` }),
            h('span', {
              class: 'basis-src',
              text: items.map((i) => i.productName).join('、')
            })
          ])
        )
    )
  ]);
}
