#!/usr/bin/env python3
"""
把本仓库推到 GitHub（含「仓库是否已创建」的检查）。

用法：
    python tools/push-to-github.py                 # 用默认地址 Metal783/foodlenscare
    python tools/push-to-github.py --repo 用户名/仓库名
    python tools/push-to-github.py --dry-run       # 只看要做什么，不真的推

为什么单独写这个脚本：
  1. `git push` 在仓库不存在时的报错很难看懂（一大段 remote 拒绝信息），
     这里先探一次仓库是否存在，把话说清楚再动手；
  2. 顺手校验工作区是否干净、remote 是否已配置，避免推上去一个半成品。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REPO = 'Metal783/foodlenscare'


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, cwd=ROOT, capture_output=True, text=True,
        encoding='utf-8', errors='replace', check=check,
    )


def repo_exists(full_name: str) -> tuple[bool, dict]:
    """查 GitHub 公开 API：仓库是否存在、是否为空。"""
    url = f'https://api.github.com/repos/{full_name}'
    request = urllib.request.Request(url, headers={'User-Agent': 'foodlenscare-push'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode('utf-8'))
            return True, data
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False, {}
        raise
    except Exception:
        # 网络不通时不阻塞，交给后面的 git push 去报错
        return True, {}


def main() -> int:
    parser = argparse.ArgumentParser(description='推送到 GitHub')
    parser.add_argument('--repo', default=DEFAULT_REPO, help=f'用户名/仓库名，默认 {DEFAULT_REPO}')
    parser.add_argument('--remote', default='origin', help='remote 名字，默认 origin')
    parser.add_argument('--dry-run', action='store_true', help='只检查，不真的推')
    args = parser.parse_args()

    print('推送前检查：\n')

    # 1. 是不是 git 仓库
    if not (ROOT / '.git').exists():
        print('  ❌ 当前目录不是 git 仓库。')
        return 1
    print('  ✅ 是 git 仓库')

    # 2. 有没有提交
    log = run(['git', 'log', '--oneline'])
    commits = [line for line in log.stdout.splitlines() if line.strip()]
    if not commits:
        print('  ❌ 还没有任何提交，先 commit 再推。')
        return 1
    print(f'  ✅ 已有 {len(commits)} 个提交，最新：{commits[0][:60]}')

    # 3. 工作区是否干净
    status = run(['git', 'status', '--porcelain']).stdout.strip()
    if status:
        print('  ⚠️  工作区还有未提交的改动：')
        for line in status.splitlines()[:8]:
            print(f'       {line}')
        print('     这些改动不会被推送。想一起推就先 commit。')
    else:
        print('  ✅ 工作区干净')

    # 4. 仓库是否存在
    exists, info = repo_exists(args.repo)
    if not exists:
        print(f'  ❌ GitHub 上还没有 {args.repo}')
        print()
        print('     请先创建一个空仓库（不要勾选 README / .gitignore / license）：')
        print(f'       https://github.com/new?name={args.repo.split("/")[-1]}')
        print()
        print('     建好之后重新运行本脚本即可。')
        return 1
    if info:
        visibility = '私有' if info.get('private') else '公开'
        empty = info.get('size', 0) == 0
        print(f'  ✅ 仓库存在：{info.get("full_name")}（{visibility}，'
              f'{"空仓库" if empty else "已有内容"}，默认分支 {info.get("default_branch")}）')

    # 5. 配置 remote
    url = f'https://github.com/{args.repo}.git'
    current = run(['git', 'remote', 'get-url', args.remote], check=False)
    if current.returncode == 0:
        existing = current.stdout.strip()
        if existing != url:
            print(f'  ℹ️  remote {args.remote} 原为 {existing}，改为 {url}')
            if not args.dry_run:
                run(['git', 'remote', 'set-url', args.remote, url])
    else:
        print(f'  ℹ️  配置 remote {args.remote} → {url}')
        if not args.dry_run:
            run(['git', 'remote', 'add', args.remote, url])

    if args.dry_run:
        print('\n（--dry-run：到此为止，没有真的推送）')
        return 0

    # 6. 推送
    branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).stdout.strip() or 'main'
    print(f'\n开始推送 {branch} → {args.remote} …\n')
    push = run(['git', 'push', '-u', args.remote, branch], check=False)
    output = (push.stdout + push.stderr).strip()
    for line in output.splitlines():
        print('   ', line)

    if push.returncode == 0:
        print()
        print('✅ 推送成功')
        print(f'   仓库地址：https://github.com/{args.repo}')
        print(f'   在线体验：https://{args.repo.split("/")[0].lower()}.github.io/{args.repo.split("/")[-1]}/')
        print()
        print('   最后一步：到 Settings → Pages 把 Source 选成 "Deploy from a branch"，')
        print('   Branch 选 main、文件夹选 /docs，保存后等 1—2 分钟即可访问上面的地址。')
        return 0

    print()
    print('❌ 推送失败。常见原因：')
    print('   · 没有登录 GitHub：先在浏览器登录一次，或配置 Personal Access Token')
    print('   · 仓库是空的但勾选了 README：先执行 git pull --rebase origin main 再推')
    print('   · 权限不足：确认这个仓库属于当前登录的账号')
    return 1


if __name__ == '__main__':
    sys.exit(main())
