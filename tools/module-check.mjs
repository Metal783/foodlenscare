/**
 * 模块图连通性检查
 *
 * 浏览器里的致命错误有一大半是「import 了一个并不存在的导出」，
 * 而这类错误在静态检查（node --check）阶段发现不了。
 * 本脚本把每个模块都真实 import 一次，并断言关键导出存在。
 *
 * 运行：node tools/module-check.mjs
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------ 浏览器 API 最小桩件 */

class StubClass {
  constructor() {
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        return () => undefined;
      }
    });
  }
}

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  location: { hash: '', search: '', protocol: 'http:', replace() {}, href: '' },
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  speechSynthesis: undefined
};
globalThis.document = {
  documentElement: { dataset: {} },
  createElement: () => new StubClass(),
  createTextNode: () => new StubClass(),
  getElementById: () => null,
  addEventListener() {},
  readyState: 'complete',
  activeElement: null
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.location = globalThis.window.location;
globalThis.localStorage = globalThis.window.localStorage;
// Node 21+ 自带只读的 globalThis.navigator，这里只在缺失时补一个桩
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}globalThis.Image = StubClass;
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};

/* ------------------------------------------------------------ 收集模块 */

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const files = walk(join(ROOT, 'src')).sort();

/* --------------------------------------------------- 关键导出断言表 */

const REQUIRED_EXPORTS = {
  'src/core/rules.js': ['evaluate', 'evaluateNutrient', 'matchAllergens', 'RISK_LEVELS', 'selfTest', 'headlineFor'],
  'src/core/store.js': [
    'emptyProfile', 'loadProfile', 'saveProfile', 'loadPrefs', 'savePrefs',
    'loadRecords', 'addRecord', 'removeRecord', 'recordsOfToday', 'todayTotals',
    'localDateKey', 'scaleNutrients'
  ],
  'src/core/router.js': ['define', 'setView', 'init', 'navigate', 'back', 'setNotFound'],
  'src/core/speech.js': ['isSupported', 'speak', 'stop', 'unlock', 'buildSpeechText'],
  'src/core/flow.js': [
    'pickPhoto', 'compressPhoto', 'processPhoto', 'processDemoCase',
    'evaluateLabel', 'speakAndRecord', 'recordResult', 'reportFailure'
  ],
  'src/recognize/index.js': ['recognizePhoto', 'recognizeDemoCase', 'crossCheck'],
  'src/recognize/quality.js': ['measureImage', 'loadImage', 'readDimensions'],
  'src/recognize/parse-label.js': [
    'parseNutrition', 'splitIngredientLines', 'parseLabelText',
    'extractIngredientSection', 'missingMandatoryFields'
  ],
  'src/recognize/demo.js': ['DEMO_PRESETS', 'caseToLabel', 'recognize', 'inferServing'],
  'src/recognize/mock.js': ['recognize'],
  'src/recognize/http.js': ['recognize', 'normalize', 'isConfigured', 'toDataUrl'],
  'src/recognize/ocr-huawei.js': ['recognize', 'sign', 'isConfigured', 'uploadToObs'],
  'src/recognize/config.js': ['CONFIG', 'VISION_PROMPT'],
  'src/recognize/channels.js': ['CHANNELS', 'CHANNEL_LIST'],
  'src/data/allergens.js': ['ALLERGENS', 'ALLERGEN_BY_ID', 'ALLERGEN_CHOICES'],
  'src/data/additives.js': ['ADDITIVES', 'collectAdditives', 'findAdditivesByCode'],
  'src/data/nutrition.js': [
    'NUTRIENT_FIELDS', 'DAILY_LIMITS', 'CONCERNS', 'CONDITIONS',
    'AGE_GROUPS', 'scaleIntake', 'gradeIntake'
  ],
  'src/data/sample-labels.js': ['SAMPLE_CASES', 'SAMPLE_BY_ID'],
  'src/data/contrast-report.js': ['CONTRAST_REPORT'],
  'src/ui/dom.js': ['h', 'button', 'topbar', 'stepDots', 'toast', 'announce', 'clear'],
  'src/ui/icons.js': ['ICONS', 'icon'],
  'src/pages/home.js': ['renderHome'],
  'src/pages/onboarding.js': ['renderOnboarding'],
  'src/pages/confirm.js': ['renderConfirm'],
  'src/pages/progress.js': ['renderProgress'],
  'src/pages/result.js': ['renderResult'],
  'src/pages/records.js': ['renderRecords'],
  'src/pages/settings.js': ['renderSettings', 'applyTextSize'],
  'src/pages/help.js': ['renderHelp']
};

/**
 * 「用了但没导入」静态检查。
 *
 * 这一类错误在浏览器里只会在真正渲染到那一页时才炸，前面几页可能一直正常，
 * 于是表现成「点某个按钮就白屏 / 没反应」。曾经 confirm.js 就是漏了 fill，
 * 结果「重拍照片」后整页报错。语法检查查不出来，这里用标识符清单交叉核对。
 */
const KNOWN_GLOBALS = new Set([
  // JS 内置
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Proxy', 'Reflect', 'Intl', 'Function', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame',
  'cancelAnimationFrame', 'console', 'globalThis', 'undefined', 'NaN', 'Infinity',
  // 浏览器 API
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'history',
  'fetch', 'Response', 'Request', 'Headers', 'FormData', 'URL', 'URLSearchParams', 'Blob', 'File',
  'FileReader', 'Image', 'ImageBitmap', 'createImageBitmap', 'HTMLImageElement', 'Element', 'Node',
  'HTMLElement', 'Event', 'CustomEvent', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder',
  'crypto', 'performance', 'speechSynthesis', 'SpeechSynthesisUtterance', 'WebSocket', 'Worker',
  'DataTransfer', 'PointerEvent', 'MouseEvent', 'KeyboardEvent', 'NodeFilter', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'getComputedStyle', 'alert', 'confirm', 'prompt',
  'MediaStream', 'AudioContext', 'CanvasRenderingContext2D', 'OffscreenCanvas', 'self', 'caches',
  'clients', 'importScripts', 'Notification', 'DOMParser', 'XMLSerializer', 'CSS', 'customElements',
  // 类型化数组与二进制
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView', 'SharedArrayBuffer',
  // 常见局部命名习惯（避免误报）
  'require', 'module', 'exports', 'process', 'Buffer', 'arguments'
]);

/** 语言关键字与声明关键字，出现在候选里要排除 */
const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
  'function', 'class', 'extends', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void',
  'yield', 'await', 'async', 'try', 'catch', 'finally', 'throw', 'const', 'let', 'var', 'this',
  'super', 'null', 'true', 'false', 'export', 'import', 'from', 'as', 'get', 'set', 'static'
]);

function undeclaredCheck() {
  const problems = [];

  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const source = stripCommentsForCheck(readFileSync(file, 'utf8'));

    /* 收集本文件里出现过的所有名字 */
    const declared = new Set();

    // import 进来的
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
      for (const part of match[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const [, alias] = trimmed.split(/\s+as\s+/).map((x) => x.trim());
        declared.add(alias || trimmed);
      }
    }
    for (const match of source.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
      declared.add(match[1]);
    }

    // 自己声明的：function / class / const / let / var / 具名函数参数
    for (const match of source.matchAll(
      /(?:^|[\s;{(,])(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm
    )) {
      declared.add(match[1]);
    }
    for (const match of source.matchAll(/(?:^|[\s;{(,])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      declared.add(match[1]);
    }
    // 解构声明里的名字
    for (const match of source.matchAll(/(?:const|let|var)\s*[{[][\s\S]*?[}\]]\s*=/g)) {
      for (const name of match[0].matchAll(/([A-Za-z_$][\w$]*)\s*(?::|,|\}|])/g)) {
        declared.add(name[1]);
      }
    }
    // 函数参数（单层括号，够用）
    for (const match of source.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
      for (const param of match[1].split(',')) {
        const name = param.trim().replace(/^\.\.\./, '').split(/[=:]/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
      }
    }
    // 单个参数的箭头函数
    for (const match of source.matchAll(/(?:^|[\s(,=])([A-Za-z_$][\w$]*)\s*=>/gm)) {
      declared.add(match[1]);
    }
    // catch (e) / for (const x of ...)
    for (const match of source.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(match[1]);

    /* 找出「被当成函数调用」的名字 */
    const called = new Set();
    for (const match of source.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm)) {
      called.add(match[1]);
    }

    // 对象字面量里的方法名 / 属性名（形如 `{ setState(patch) {` 或 `{ fill: ...`）不是标识符引用
    const objectKeys = new Set();
    for (const match of source.matchAll(/([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) {
      // 只收集「出现在对象字面量里」的那种：前面是 { 或 ,
      const before = source.slice(0, match.index).trimEnd();
      if (/[{,]$/.test(before) || /[{,]\s*$/.test(before) || before.endsWith('\n')) {
        objectKeys.add(match[1]);
      }
    }

    for (const name of called) {
      if (declared.has(name)) continue;
      if (KNOWN_GLOBALS.has(name)) continue;
      if (KEYWORDS.has(name)) continue;
      if (objectKeys.has(name)) continue;
      // 单字母名字噪音太大（回调参数等），跳过
      if (name.length <= 2) continue;
      problems.push(`${rel}: 调用了 ${name}()，但本文件既没有导入也没有声明它`);
    }
  }

  return [...new Set(problems)];
}

/** 去掉注释，避免注释里的示例被当成代码 */
function stripCommentsForCheck(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * 定向回归检查：把两个曾经真实踩过的坑固化成断言。
 *
 * 为什么用静态检查而不是跑浏览器：
 *  无头浏览器在临时沙箱里跑模块脚本不稳定（同样的代码在仓库里能跑、
 *  在沙箱里连模块都不执行），把回归验证押在它身上会得到一堆假警报。
 *  这两条都是有明确代码特征的实现约束，静态检查反而更准、更快。
 */
function regressionChecks() {
  const problems = [];

  /* 1. 选照片不能再用「窗口获得焦点 + 定时器」兜底。
        旧写法会在用户选照片较慢时（老人很常见）提前 resolve 成 null，
        表现就是「点了按钮没反应」，而且完全没有提示。 */
  const flow = readFileSync(join(ROOT, 'src/core/flow.js'), 'utf8');
  const pickStart = flow.indexOf('export function pickPhoto');
  const pickBody = pickStart >= 0 ? flow.slice(pickStart, pickStart + 2000) : '';
  if (/addEventListener\(\s*['"]focus['"]/.test(pickBody)) {
    problems.push('src/core/flow.js: pickPhoto 里又出现了 window focus 监听——这正是「点了没反应」的成因，请改用 change / cancel 事件');
  }
  if (!/addEventListener\(\s*['"]change['"]/.test(flow)) {
    problems.push('src/core/flow.js: pickPhoto 缺少 change 事件处理，选了照片也拿不到文件');
  }
  if (!/['"]cancel['"]/.test(flow)) {
    problems.push('src/core/flow.js: 缺少 cancel 事件处理，用户取消选择时不会有任何反馈');
  }

  /* 2. 任何页面调用 fill() 都必须先导入它。
        曾经 confirm.js 漏了导入，导致「重拍照片」后整页报错。 */
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (rel === 'src/ui/dom.js') continue; // fill 就是在这里定义的
    const source = readFileSync(file, 'utf8');
    const usesFill = /[^.\w$]fill\s*\(/.test(source);
    if (!usesFill) continue;
    const importLine = source.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*ui\/dom\.js['"]/);
    const names = importLine ? importLine[1].split(',').map((s) => s.trim()) : [];
    if (!names.includes('fill')) {
      problems.push(`${rel}: 用了 fill() 但没有从 ui/dom.js 导入它`);
    }
  }

  /* 3. 语音条靠 hidden 属性控制显示，CSS 必须显式处理 [hidden]，
        否则 display:flex 会把 hidden 盖掉，按钮跑到每一页上去。 */
  const css = readFileSync(join(ROOT, 'src/styles/app.css'), 'utf8');
  if (/\.speaker-bar\s*\{[^}]*display:\s*flex/.test(css) && !/\.speaker-bar\[hidden\]/.test(css)) {
    problems.push('src/styles/app.css: .speaker-bar 用了 display:flex 但没有写 [hidden] 规则，语音条会出现在所有页面');
  }

  /* 4. 按下反馈不能移动元素：触屏上会让浏览器丢弃这次点击 */
  const activeShift = css.match(/\.btn:active\s*\{[^}]*transform\s*:/);
  if (activeShift) {
    problems.push('src/styles/app.css: .btn:active 里出现了 transform，触屏上会导致点击被丢弃');
  }

  return problems;
}

let failed = 0;

/* ------------------------------------------- 静态检查：具名导入是否真的存在 */

/**
 * 「import 了一个不存在的具名导出」在浏览器里会让整个入口模块失效、页面白屏，
 * 而 node --check 只查语法、查不出来。这里做一次静态交叉核对。
 */
function staticImportCheck() {
  const problems = [];

  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const source = readFileSync(file, 'utf8');

    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(importRe)) {
      const names = match[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      const spec = match[2];
      const target = resolveSpecifier(file, spec);
      if (!target || !existsSync(target)) {
        problems.push(`${rel}: 找不到模块 ${spec}`);
        continue;
      }
      const targetSource = readFileSync(target, 'utf8');
      const targetRel = relative(ROOT, target).split(sep).join('/');
      for (const name of names) {
        // 目标文件里是否出现过这个名字的导出
        const exported =
          new RegExp(`export\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${escapeRe(name)}\\b`).test(targetSource) ||
          new RegExp(`export\\s*\\{[^}]*\\b${escapeRe(name)}\\b`).test(targetSource);
        if (!exported) {
          problems.push(`${rel}: 从 ${targetRel} 导入了不存在的 ${name}`);
        }
      }
    }
  }
  return problems;
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSpecifier(fromFile, spec) {
  const base = join(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

console.log(`导入 ${files.length} 个模块……\n`);
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  try {
    const mod = await import(pathToFileURL(file).href);
    const required = REQUIRED_EXPORTS[rel];
    if (required) {
      const missing = required.filter((name) => !(name in mod));
      if (missing.length) {
        failed += 1;
        console.log(`❌ ${rel} 缺少导出：${missing.join('、')}`);
        continue;
      }
      console.log(`✅ ${rel}  （${required.length} 个关键导出齐备）`);
    } else {
      console.log(`✅ ${rel}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`❌ ${rel}`);
    console.log(`     ${error?.message}`);
    if (error?.stack) {
      const line = error.stack.split('\n').find((l) => l.includes(rel.split('/').pop()));
      if (line) console.log(`     ${line.trim()}`);
    }
  }
}

console.log(`\n${'─'.repeat(56)}`);
console.log('静态交叉核对具名导入……');
const importProblems = staticImportCheck();
if (importProblems.length) {
  failed += importProblems.length;
  for (const p of importProblems) console.log(`❌ ${p}`);
} else {
  console.log('✅ 所有具名导入都能在目标模块里找到对应导出');
}

console.log(`\n${'─'.repeat(56)}`);
console.log('静态检查「用了但没导入」……');
const undeclared = undeclaredCheck();
if (undeclared.length) {
  failed += undeclared.length;
  for (const p of undeclared) console.log(`❌ ${p}`);
} else {
  console.log('✅ 没有发现未导入就调用的函数');
}

console.log(`\n${'─'.repeat(56)}`);
console.log('定向回归检查（历史踩过的坑）……');
const regressions = regressionChecks();
if (regressions.length) {
  failed += regressions.length;
  for (const p of regressions) console.log(`❌ ${p}`);
} else {
  console.log('✅ 选照片逻辑、fill 导入、语音条显示、按下反馈均符合约定');
}

console.log(`\n${'─'.repeat(56)}`);
console.log(failed ? `${failed} 个问题` : '全部模块导入成功，导出齐备，具名导入与调用全部有效。');
process.exitCode = failed ? 1 : 0;
