/**
 * 单文件打包器 —— 生成「双击就能打开」的 FoodLensCare-standalone.html
 *
 * 为什么需要它：
 *   浏览器在 file:// 协议下会以 CORS 为由拒绝加载 ES Module，直接双击
 *   index.html 会白屏，Service Worker 也无法注册。而参赛提交、发给评委、
 *   拷到别人电脑上演示时，不能要求对方先装 Python 起一个本地服务。
 *
 * 做法：
 *   把 src/ 下的模块装进一个约 40 行的模块注册表，把 import / export
 *   改写成运行时的取值与定义，再把 CSS 与结构一并内联进一个 HTML。
 *   **不改动任何业务代码**——同一份 src/ 既能多文件开发，也能打出单文件。
 *
 * 用法：
 *   node tools/bundle-standalone.mjs
 *   输出：FoodLensCare-standalone.html（根目录，双击即用）
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'FoodLensCare-standalone.html');
const ENTRY = 'src/app.js';

/* ------------------------------------------------------------ 收集模块 */

function walk(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/** 解析一个相对导入，返回相对仓库根目录的路径 */
function resolveSpecifier(fromRel, spec) {
  const base = join(ROOT, dirname(fromRel), spec);
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(ROOT, candidate).split(sep).join('/');
    }
  }
  throw new Error(`${fromRel}: 无法解析导入 ${spec}`);
}

/* ------------------------------------------------------------ 预处理 */

/**
 * 去掉注释，但保留代码长度（注释内容替换成等长空格，换行照旧）。
 *
 * 必须做这一步：JSDoc 里会出现 `import('./rules.js')` 这类示例，
 * 直接拿正则去匹配会把注释当成真代码，从而解析出不存在的模块。
 * 保留长度是为了不改动行号，出错时能对应回源文件。
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // 行注释
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    // 块注释
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    // 字符串与模板串：原样保留，跳过内部内容
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = source[i];
        if (c === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += c;
        i += 1;
        if (c === quote) break;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/* ------------------------------------------------------------ 语法改写 */

/** 依赖路径登记：只用于记录依赖关系，实际取值交给 __require */
function makeDependencyTable(fromRel) {
  const seen = new Set();
  return (spec) => {
    const rel = resolveSpecifier(fromRel, spec);
    seen.add(rel);
    return rel;
  };
}

/** 把 import 子句改写成运行时语句；rel 是该依赖模块在注册表里的 id */
function rewriteImportClause(clause, rel) {
  const call = `__require(${JSON.stringify(rel)})`;
  const trimmed = clause.trim().replace(/,\s*$/, '');
  if (!trimmed) return `/* 副作用导入 */ ${call};`;

  const star = trimmed.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
  if (star) return `const ${star[1]} = ${call};`;

  const braceStart = trimmed.indexOf('{');
  if (braceStart >= 0) {
    const defaultName = trimmed.slice(0, braceStart).replace(/,$/, '').trim();
    const braceEnd = trimmed.lastIndexOf('}');
    const props = trimmed
      .slice(braceStart + 1, braceEnd)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [orig, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
        return alias ? `${orig}: ${alias}` : orig;
      });

    const statements = [];
    if (defaultName) statements.push(`const ${defaultName} = ${call}.default;`);
    if (props.length) statements.push(`const { ${props.join(', ')} } = ${call};`);
    return statements.join(' ') || `/* 副作用导入 */ ${call};`;
  }

  const only = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
  if (only) return `const ${only[1]} = ${call}.default;`;
  return `/* 副作用导入 */ ${call};`;
}

/**
 * 改写单个模块。
 *
 * 具名导出用 `__exports.x = ...` 直接写属性，配合注册表上的 Proxy，
 * 保持与 ES Module 相同的 live binding 语义；函数声明会被提升，
 * 所以「先写导出、后写函数体」不会出问题。
 */
function transformModule(relPath, source) {
  const destructure = makeDependencyTable(relPath);
  const exportStatements = [];
  const deps = new Set();

  // 先把注释抹成等长空白：JSDoc 里的 import(...) 示例不能当成真代码
  let text = stripComments(source);

  /* ---- 1. import ... from '...'（含 import a, { b } from、import * as ns）---- */
  text = text.replace(
    /^[ \t]*import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?[ \t]*$/gm,
    (_match, clause, _quote, spec) => {
      const rel = destructure(spec);
      deps.add(rel);
      return `/* import ${spec} */ ${rewriteImportClause(clause, rel)}`;
    }
  );

  /* ---- 2. 纯副作用 import '...' ---- */
  text = text.replace(/^[ \t]*import\s+(['"])([^'"]+)\1\s*;?[ \t]*$/gm, (_match, _quote, spec) => {
    const rel = destructure(spec);
    deps.add(rel);
    return `/* import ${spec}（副作用） */ __require(${JSON.stringify(rel)});`;
  });

  /* ---- 3. 动态 import('...')：单文件里不必再异步，改成同步取值 ---- */
  text = text.replace(/import\(\s*(['"])(\.[^'"]+)\1\s*\)/g, (_match, _quote, spec) => {
    const rel = destructure(spec);
    deps.add(rel);
    return `__require(${JSON.stringify(rel)})`;
  });

  /* ---- 4. export default ---- */
  text = text.replace(/^([ \t]*)export\s+default\s+/gm, (_match, indent) => {
    return `${indent}__exports.default = `;
  });

  /* ---- 5. export { a, b as c } ---- */
  text = text.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (_match, names) => {
    const statements = [];
    for (const part of names.split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === 'default') continue;
      const [orig, alias] = trimmed.split(/\s+as\s+/).map((x) => x.trim());
      statements.push(`__exports.${alias || orig} = ${orig};`);
    }
    return statements.join(' ');
  });

  /* ---- 6. export function / const / class ... ----
     在同一行末尾追加导出语句，行号不变，也避免后续匹配互相干扰 */
  text = text.replace(
    /^([ \t]*)export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    (_match, indent, kind, name) => `${indent}${kind} ${name}`
  );

  /* ---- 7. 收尾自检 ---- */
  if (/^[ \t]*import\s/m.test(text)) {
    throw new Error(`${relPath}: 还有未处理的 import 语句`);
  }
  if (/^[ \t]*export\s+\*/m.test(text)) {
    throw new Error(`${relPath}: 暂不支持 export *，请改用具名导出`);
  }
  if (/^[ \t]*export\s/m.test(text)) {
    throw new Error(`${relPath}: 还有未处理的 export 语句`);
  }

  return { deps: [...deps], exportStatements, body: text };
}

/**
 * 找出源码里被 export 过的顶层声明名。
 * 与 transformModule 分开走一遍，逻辑更直白，也不怕改写顺序影响判断。
 */
function exportedDeclarationNames(source) {
  const names = [];
  const re = /^[ \t]*export\s+(?:async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(re)) names.push(match[1]);
  return names;
}

/* ------------------------------------------------------------ 注册表 */

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : ''))
    .join('\n');
}

/** 依赖优先排序：环形依赖允许存在，仅避免明显的定义顺序问题 */
function sortByDependency(ids, modules) {
  const visited = new Set();
  const visiting = new Set();
  const out = [];
  const visit = (id) => {
    if (visited.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const dep of modules.get(id)?.deps || []) {
      if (modules.has(dep)) visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    out.push(id);
  };
  for (const id of ids) visit(id);
  return out;
}

function buildRegistry(modules, ordered) {
  return ordered
    .map((rel) => {
      const record = modules.get(rel);
      const exportsBlock = record.exportStatements.length
        ? `\n${indent(record.exportStatements.join('\n'), 4)}`
        : '';
      return (
        `    // ── ${rel}\n` +
        `    ${JSON.stringify(rel)}: function (__exports, __require) {\n` +
        `${indent(record.body, 6)}${exportsBlock}\n` +
        `    },`
      );
    })
    .join('\n\n');
}

/* ------------------------------------------------------------ 产出 HTML */

function buildHtml({ registry, css, bodyHtml, fileCount, totalBytes }) {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const safeStamp = JSON.stringify(stamp);

  return `<!DOCTYPE html>
<html lang="zh-CN" data-text-size="large">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=3" />
<meta name="theme-color" content="#004726" />
<meta name="app-version" content="3.0.1-20261010" />
<meta name="description" content="食护家 FoodLensCare —— 面向老年家庭的食品标签智能解读工具。拍一张照片，用一句听得懂的话告诉您这个能不能吃。" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="format-detection" content="telephone=no" />
<title>食护家 FoodLensCare</title>
<!--
  食护家 FoodLensCare · 第三版 · 单文件版
  2026 年第十四届全国大学生数字媒体科技作品及创意竞赛 · 自主选题类 · 移动与网络应用开发

  这是「双击就能打开」的独立版本：${fileCount} 个源模块、约 ${Math.round(totalBytes / 1024)} KB 业务代码
  全部内联在这一个文件里，不需要服务器、不需要联网、不需要安装任何环境。

  生成时间：${stamp}
  生成方式：node tools/bundle-standalone.mjs
  对应源码：index.html + src/（多文件开发版，二者页面结构与样式完全一致）

  数据与隐私：游客资料和照片本机保存。家庭同步需要启动第三版服务，并由老人授权。
  边界声明：本工具只做日常饮食提醒，不做疾病诊断，也不替代医生或营养师的意见。
  判断依据：GB 7718-2025、GB 28050-2025、GB 2760、
           《中国居民膳食营养素参考摄入量（2023 版）》《中国居民膳食指南（2022）》。
-->
<style>
${css}
</style>
</head>
<body>
${bodyHtml}

<noscript>
  <p style="padding:24px;font-size:22px;line-height:1.6">
    本应用需要开启浏览器 JavaScript 才能运行。请在手机浏览器的设置中开启 JavaScript 后重新打开本页面。
  </p>
</noscript>

<script>
/* 启动守卫：万一某个模块出错，不能让老人对着白屏——先给一句人话，再给一行诊断信息。 */
window.__FLC_BOOT__ = { ok: false, at: ${safeStamp} };
window.addEventListener('error', function (event) {
  if (window.__FLC_BOOT__.ok) return;
  var view = document.getElementById('view');
  if (!view || view.children.length) return;
  view.innerHTML =
    '<section class="card"><h2 class="card-title">打开的时候出了点问题</h2>' +
    '<p>请把本页面重新打开一次。如果还是这样，把下面这行信息告诉技术人员：</p>' +
    '<p class="error-box">' + String(event.message || event.error || '未知错误') + '</p></section>';
});

/* ============================================================
   极简模块注册表
   等价于浏览器的 ES Module 语义：每个模块一个独立作用域，
   具名导出通过 Proxy 转发，保留 live binding 行为。
   ============================================================ */
(function () {
  'use strict';

  var __registry = {
${registry}
  };

  var __cache = Object.create(null);

  function __require(id) {
    if (__cache[id]) return __cache[id];

    var factory = __registry[id];
    if (!factory) throw new Error('找不到模块：' + id);

    var target = {};
    // 每访问一个导出名都实时从 target 上取，保证「先导出、后赋值」也能读到最新值
    var exportsObject = new Proxy(target, {
      get: function (obj, key) { return obj[key]; },
      set: function (obj, key, value) { obj[key] = value; return true; },
      has: function (obj, key) { return key in obj; }
    });

    __cache[id] = exportsObject;
    factory(exportsObject, __require);
    return exportsObject;
  }

  __require(${JSON.stringify(ENTRY)});
  window.__FLC_BOOT__.ok = true;
})();
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ 主流程 */

function main() {
  const sourceFiles = walk(join(ROOT, 'src')).sort();
  const modules = new Map();

  for (const file of sourceFiles) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const source = readFileSync(file, 'utf8');

    // 先取出「哪些顶层声明是导出的」，再改写正文
    const exportedNames = exportedDeclarationNames(source);
    const transformed = transformModule(rel, source);
    transformed.exportStatements.push(
      ...exportedNames.map((name) => `__exports.${name} = ${name};`)
    );
    modules.set(rel, transformed);
  }

  const ordered = sortByDependency([...modules.keys()], modules);

  const css = [
    readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8'),
    readFileSync(join(ROOT, 'src/styles/app.css'), 'utf8')
  ].join('\n');

  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/i);
  const bodyHtml = (bodyMatch ? bodyMatch[1] : '')
    // 单文件版没有外部文件，去掉脚本与清单/图标链接
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .trim();

  const registry = buildRegistry(modules, ordered);
  const totalBytes = sourceFiles.reduce((sum, f) => sum + statSync(f).size, 0);

  const html = buildHtml({
    registry,
    css,
    bodyHtml,
    fileCount: sourceFiles.length,
    totalBytes
  });

  writeFileSync(OUT_FILE, html, 'utf8');

  const sizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  console.log('单文件版已生成');
  console.log(`  模块数：${sourceFiles.length}`);
  console.log(`  输出：  ${relative(ROOT, OUT_FILE)}`);
  console.log(`  体积：  ${sizeKb} KB`);
  console.log('');
  console.log('  双击即可打开；也可以直接发给别人，或放到任意静态托管上。');
}

try {
  main();
} catch (error) {
  console.error('打包失败：', error?.message || error);
  process.exitCode = 1;
}
