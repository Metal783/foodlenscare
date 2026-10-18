const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const names = ['只启动后端.cmd', '启动第四版.cmd', '启动第四版局域网.cmd'];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flc-launcher-'));
try {
  // Substitute Python only, avoiding live servers, user data and browser windows.
  fs.writeFileSync(path.join(temp, 'python.cmd'), '@echo off\r\necho BACKEND_STUB %*\r\nexit /b 0\r\n');
  for (const name of names) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert(!source.startsWith('\ufeff'));
    assert(!/(?<!\r)\n/.test(source), 'CMD needs CRLF: ' + name);
    const result = spawnSync('cmd.exe', ['/d', '/c', name], {
      cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
      env: { ...process.env, PATH: temp + path.delimiter + process.env.PATH },
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.match(result.stdout, /BACKEND_STUB -X utf8 tools\\family_server.py/);
    assert(!result.stdout.includes('\ufffd'));
    if (name === names[0]) {
      assert.match(result.stdout, /仅启动局域网后端，不自动打开浏览器/);
      assert(!result.stdout.includes('--open'));
    }
    console.log('PASS UTF-8/CRLF CMD: ' + name);
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
