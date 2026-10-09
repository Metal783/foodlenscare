/**
 * 食护家 FoodLensCare · 应用入口
 *
 * 面向老年家庭的食品标签智能解读工具（食品标签初版）
 * 2026 年第十四届全国大学生数字媒体科技作品及创意竞赛 · 自主选题类 · 移动与网络应用开发
 *
 * 架构（方案 4.1）：
 *   交互层  src/pages/*.js     拍照、结果展示、语音播报、画像设置
 *   感知层  src/recognize/*    标签图像 → 结构化字段（双通道 + 本地质量检测）
 *   规则层  src/core/rules.js  过敏匹配、营养阈值、风险分级（纯本地执行）
 *   数据层  src/data/*         致敏物质词典、添加剂对照、营养阈值、内置用例
 *   状态层  src/core/store.js  画像与当日记录，全部本地存储
 */

import { define, setNotFound, setView, init, navigate, back } from './core/router.js';
import { loadProfile, saveProfile, loadPrefs, savePrefs, clearRecords } from './core/store.js';
import * as speech from './core/speech.js';
import { pickPhoto, processDemoCase } from './core/flow.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderHome } from './pages/home.js';
import { renderConfirm } from './pages/confirm.js';
import { renderProgress } from './pages/progress.js';
import { renderResult } from './pages/result.js';
import { renderRecords } from './pages/records.js';
import { renderSettings, applyTextSize } from './pages/settings.js';
import { renderHelp } from './pages/help.js';
import { renderScan } from './pages/scan.js';
import { h, button, topbar } from './ui/dom.js';
import { icon } from './ui/icons.js';

/* ------------------------------------------------------------ 全局状态 */

const state = {
  profile: loadProfile(),
  prefs: loadPrefs(),
  /** 待处理的照片（确认页用） */
  pendingFile: null,
  pendingOrigin: 'camera',
  pendingReturn: 'home',
  /** 进度页上下文 */
  progressPhoto: null,
  /** 最近一次识别结果 { photo, assessment } */
  result: null,
};

/**
 * URL 参数预设画像：?profile=allergy / ?profile=plain / ?profile=none
 *
 * 用途一：答辩演示时一条链接直接进入指定画像，不必现场走五步设置；
 * 用途二：录制演示视频时反复定位到同一个画面；
 * 用途三：自动化截图与回归检查。
 * 效果等同于用户自己在画像设置里勾选，写入的也是真实的本地画像。
 *
 * 注意：它会**覆盖并保存**本地画像，所以用了 allergy 之后再打开别的用例，
 * 过敏设置仍然生效。想回到「什么都不过敏」就用 ?profile=none。
 */
function applyProfileFromUrl() {
  let preset = null;
  try {
    preset = new URLSearchParams(window.location.search).get('profile');
  } catch {
    return;
  }
  if (!preset) return;

  const PRESETS = {
    // 花生 + 牛奶过敏，控糖控盐：用来看「红色警示」
    allergy: {
      completed: true,
      ageGroup: 'age70',
      concerns: ['sugar', 'salt'],
      allergens: ['peanut', 'milk'],
      conditions: [],
      voiceOn: true
    },
    // 无过敏、只留意血压：用来看同一件食品换个人的结论
    plain: {
      completed: true,
      ageGroup: 'age70',
      concerns: ['salt'],
      allergens: [],
      conditions: ['hypertension'],
      voiceOn: true
    },
    // 什么都不设：用来看「纯绿色」的基准结论
    none: {
      completed: true,
      ageGroup: 'age70',
      concerns: [],
      allergens: [],
      conditions: [],
      voiceOn: true
    }
  };
  const next = PRESETS[preset];
  if (!next) return;
  state.profile = { ...next };
  saveProfile(state.profile);
}

/**
 * URL 参数 ?reset=1：先把当日记录清空。
 *
 * 为什么需要：演示用例的结论依赖「今天已经吃了多少」。同一个演示用例
 * 第二次打开时，额度已被上一次扣减，牛奶可能从绿色变成橙色——引擎没错，
 * 但答辩现场很难解释。加上这个参数就能反复演示同一套用例。
 */
function applyResetFromUrl() {
  let shouldReset = false;
  try {
    shouldReset = new URLSearchParams(window.location.search).get('reset') === '1';
  } catch {
    return false;
  }
  if (shouldReset) clearRecords();
  return shouldReset;
}

/* -------------------------------------------------------------- 上下文 */

const ctx = {
  state,
  navigate,
  back,
  setState(patch) {
    Object.assign(state, patch);
  },
  speak(text) {
    if (!state.profile.voiceOn) return false;
    return speech.speak(text);
  },
  rerender() {
    navigate(currentRoute(), {}, { force: true });
  }
};

let lastRoute = 'home';
function currentRoute() {
  return lastRoute;
}

/* ---------------------------------------------------------------- 路由 */

const ROUTES = {
  home: renderHome,
  onboarding: renderOnboarding,
  confirm: renderConfirm,
  progress: renderProgress,
  result: renderResult,
  records: renderRecords,
  settings: renderSettings,
  help: renderHelp,
  scan: renderScan,
};

for (const [name, render] of Object.entries(ROUTES)) {
  define(name, (view, params, context) => {
    lastRoute = name;
    hideSpeakerUnless(name === 'result');
    return render(view, params, context);
  });
}

setNotFound((view, _params, context) => {
  view.replaceChildren(
    topbar({ title: '页面不存在' }),
    h('section', { class: 'card' }, [
      h('h2', { class: 'card-title', text: '这个页面找不到了' }),
      h('p', { text: '请回到首页重新操作。' })
    ]),
    button({
      label: '回首页',
      iconHtml: icon('home'),
      block: true,
      huge: true,
      onClick: () => context.navigate('home', {}, { replace: true })
    })
  );
});

/** 语音条只在结果页出现，避免其他页面出现无意义的按钮 */
function hideSpeakerUnless(keep) {
  const bar = document.getElementById('speaker');
  if (bar && !keep) bar.hidden = true;
}

/* ---------------------------------------------------------------- 启动 */

function boot() {
  // URL 参数可以预设画像与清空当日记录（演示与自动化用），必须在挂路由之前处理
  applyResetFromUrl();
  applyProfileFromUrl();

  // 全站字号由 <html data-text-size> 驱动，rem 自动缩放
  applyTextSize(state.prefs.textSize);
  savePrefs({ ...state.prefs, textSize: state.prefs.textSize });

  setView(document.getElementById('view'));
  init({
    start: state.profile.completed ? 'home' : 'onboarding',
    ctx
  });

  registerServiceWorker();

  // 开发与自检便利：控制台可直接跑规则层自测
  window.FoodLensCare = {
    state,
    ctx,
    /** 内部动作的调试入口，供 tools/check-interaction.py 这类自动化测试使用 */
    debug: { pickPhoto, processDemoCase, speak: (text) => speech.speak(text) },
    async selfTest() {
      const [{ selfTest }, { SAMPLE_CASES }] = await Promise.all([
        import('./core/rules.js'),
        import('./data/sample-labels.js')
      ]);
      const results = selfTest(SAMPLE_CASES);
      console.table(results);
      const failed = results.filter((r) => r.pass === false);
      console.log(failed.length ? `❌ ${failed.length} 条用例不符合预期` : '✅ 全部用例通过');
      return results;
    }
  };
}

/** PWA：注册 Service Worker，保证二次打开无需网络（答辩现场防断网） */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((error) => console.info('[FoodLensCare] Service Worker 未注册：', error?.message));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
