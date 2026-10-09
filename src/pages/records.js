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
import {
  loadRecords, removeRecord, clearRecords, recordsOfToday, todayTotals, localDateKey
} from '../core/store.js';
import * as speech from '../core/speech.js';

const NUTRIENT_TITLE = { sodium: '盐（钠）', sugar: '糖', saturatedFat: '油（饱和脂肪）' };

/**
 * @param {HTMLElement} view
 * @param {Object} _params
 * @param {import('../core/router.js').RouteContext} ctx
 */
export function renderRecords(view, _params, ctx) {
  // 每次重绘都重新读一遍存储：删掉一条记录或清空之后，额度条要立刻跟着变
  const draw = () => {
    const fresh = loadRecords();
    const list = recordsOfToday(fresh).slice().reverse();
    fill(view, [
      /* 顶栏不给「返回」：记录与首页、设置是底栏的平级目的地（见 app.js 的 syncTabbar）。
         底栏导航模型里，目的地页面不该再放一个「返回」——从底栏点进来时，
         「返回到哪」本来就没有确定答案。流程页保留返回，别一起改。 */
      topbar({ title: '今天的记录' }),

      h('section', { class: 'card' }, [
        h('h3', {
          class: 'card-title',
          text: list.length ? `今天有 ${list.length} 条记录` : '今天还没有记录'
        }),
        ...meterRows(todayTotals(fresh)),
        h('p', {
          class: 'footnote',
          text: '仅统计确认食用的记录。旧版自动扫描记录和演示记录保留供查看，不扣减额度；未记录的食物不在统计中。'
        })
      ]),

      list.length
        ? h('ul', { class: 'record-list' }, list.map((record) => recordItem(record, ctx, draw)))
        : h('section', { class: 'card empty-state' }, [
            h('span', { class: 'empty-icon', html: icon('clipboard') }),
            h('p', { text: '今天还没有食用记录。查看食品后，填写实际吃了多少，再确认记入今天。' })
          ]),

      button({
        label: '回首页拍一张',
        iconHtml: icon('camera'),
        block: true,
        huge: true,
        onClick: () => ctx.navigate('home', {}, { replace: true })
      }),

      // 撤销始终可用：记录也是可以清掉的，不让用户担心「记错了删不掉」
      fresh.length
        ? button({
            label: '把记录全部清空',
            variant: 'ghost',
            block: true,
            onClick: () => {
              clearRecords();
              toast('记录已经清空了，额度也一起归零。');
              draw();
            }
          })
        : null,

      olderGroup(fresh)
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
        record.servingGrams ? h('span', { text: `　${record.consumptionConfirmed ? '已食用' : '旧版查看记录'} ${record.servingGrams} ${record.servingUnit || 'g'}` }) : null
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
    // 与首页 / 结果页同一套三档：正常品牌绿、将满黄、吃满橙。
    // 红色不参与——它属于过敏「别吃」那一级（原来吃满配的是红，已改）。
    const tone = ratio >= 1 ? 'over' : ratio >= 0.6 ? 'watch' : 'ok';
    return h('div', { class: 'meter' }, [
      h('div', { class: 'meter-head' }, [
        h('span', { class: 'meter-name', text: NUTRIENT_TITLE[key] }),
        h('span', {
          class: 'meter-value',
          dataset: { tone },
          text: ratio >= 1 ? '今天已经吃满了' : `还剩 ${Math.round((limit.limit - used) * 10) / 10} ${limit.unit}`
        })
      ]),
      h('div', { class: 'meter-track' }, [
        h('div', { class: 'meter-fill', dataset: { tone }, style: { width: `${Math.min(100, Math.round(ratio * 100))}%` } })
      ]),
      h('p', {
        class: 'meter-sub',
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
