/**
 * 构建 GitHub Pages 版本到 docs/：资源使用 /foodlenscare/ 子路径。
 * 本地启动器仍使用 dist/（根路径），两者互不影响。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(vite)) {
  console.error('未找到本地 vite，请先运行 npm.cmd ci 或 npm.cmd install。');
  process.exit(1);
}
fs.rmSync(path.join(root, 'docs'), { recursive: true, force: true });
const build = spawnSync(process.execPath, [vite, 'build', '--outDir', 'docs', '--emptyOutDir'], {
  cwd: root,
  env: { ...process.env, FIGMA_PUBLIC_URL: '/foodlenscare' },
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);
const prep = spawnSync(process.execPath, ['tools/prepare-offline.mjs', '--dist', 'docs', '--base', '/foodlenscare/'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(prep.status ?? 0);
