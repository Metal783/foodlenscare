"""生成最新第三版界面预览；设计参考默认收起，应用入口明确可见。"""
from pathlib import Path
from html import escape
from hashlib import sha256
import shutil

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / '_qa' / '第三版截图'
PAGES = [
    ('欢迎登录', '5603209ee8317b7f4194165fcb9ce846', '01-欢迎登录', 'welcome'),
    ('身份选择', 'c94f731bb4d8299066effd394f5a05f2', '13-身份选择', 'identity'),
    ('基础资料', 'f8e6b030183c17fb2894ee6f43eb1a3d', '14-首次个人资料', 'profile'),
    ('老人首页', '56000d57a47fe594ba93c34587111d16', '02-老人首页', 'home'),
    ('健康记录', '85ee0b12e818652b5db5256fbc2bef9e', '03-健康记录', 'records'),
    ('老人设置', 'ed6797671c9e9f28ff7eb3775537b271', '05-老人设置', 'settings'),
    ('老人子女守护', 'aedcd6a1498f9aebd89a226dc2a2bce2', '06-老人子女守护', 'family'),
    ('子女守护概览', '52ebfbd48bc4bb0fbd40230e1e64c669', '07-子女守护概览', 'home'),
    ('子女食物记录', '77ee7683963efe9d565a60c1eb590b47', '08-子女食物记录', 'records'),
    ('识别记录详情', '0842c5e6346e4e9255b50c24e771a4e5', '09-子女记录详情', 'records'),
    ('发送关怀语音', '36fb95389344721b6a05efd40e71e84e', '15-关怀录音待发送', 'voices'),
    ('子女家人管理', 'acd9dea1f5a153c88674756e8bc32bdb', '11-子女家人管理', 'family'),
    ('子女设置', 'a0b32f1e2a93006354cec1a34aa44c3a', '12-子女设置', 'settings'),
]

def main():
    target = ROOT / 'docs' / 'screenshots'
    target.mkdir(parents=True, exist_ok=True)
    for photo in SHOTS.glob('*.png'):
        shutil.copy2(photo, target / photo.name)
    links = []
    cards = []
    for i, (title, reference, shot, route) in enumerate(PAGES, 1):
        photo = SHOTS / (shot + '.png')
        if not photo.exists():
            raise FileNotFoundError('请先运行 check-v3-browser.cjs：' + str(photo))
        design = ROOT.parent / 'UI界面' / (reference + '.png')
        design_hint = '原设计参考需放在项目同级的UI界面目录；最新版应用截图已包含在项目内。'
        if design.exists():
            design_html = f'<img loading="lazy" src="../UI界面/{reference}.png" alt="{escape(title)}原设计参考" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><p hidden>{design_hint}</p>'
        else:
            design_html = f'<p>{design_hint}</p>'
        stamp = sha256(photo.read_bytes()).hexdigest()[:12]
        links.append(f'<a href="#p{i}">{i:02d} {escape(title)}</a>')
        cards.append(f'''<section id="p{i}"><h2>{i:02d} · {escape(title)}</h2>
<figure><figcaption>最新版第三版 · 隔离测试截图</figcaption>
<img loading="lazy" src="_qa/第三版截图/{escape(shot)}.png?v={stamp}" alt="{escape(title)}最新版">
<figcaption><a href="http://127.0.0.1:5183/?v=20261010-2#/{route}">进入应用操作此页面 →</a></figcaption></figure>
<details><summary>展开原设计参考</summary>{design_html}</details></section>''')
    html = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="app-version" content="3.0.1-20261010">
<title>第三版最新界面与设计参考</title><style>
body{margin:0;background:#f7faf5;color:#003b20;font:16px/1.65 "Microsoft YaHei",sans-serif}
header,main{max-width:1000px;margin:auto;padding:24px}header{border-bottom:1px solid #dce7d9}
nav,.actions{display:flex;flex-wrap:wrap;gap:10px}a{color:#004726;background:#e8f5e9;padding:8px 12px;border-radius:8px;text-decoration:none}
.primary{background:#004726;color:white}.version{font-weight:bold}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}
section{scroll-margin-top:20px}figure{margin:0;background:white;border:1px solid #dce7d9;border-radius:16px;overflow:hidden}
figcaption{padding:14px;font-weight:bold}img{display:block;width:100%;height:auto}summary{padding:12px;cursor:pointer}
details{margin-top:10px;border:1px solid #dce7d9;border-radius:12px}p{color:#506657}.back{position:fixed;right:16px;bottom:16px}
@media(max-width:640px){header,main{padding:16px}main{grid-template-columns:1fr}}
</style></head><body><header><p class="version">当前版本 3.0.1 · 20261010-2</p>
<h1>第三版最新界面</h1><p>下面默认只展示更新后的13个界面。这里是截图预览，使用功能请进入应用。姓名、照片、记录和语音均为隔离测试数据，正式应用显示本人数据。</p>
<div class="actions"><a class="primary" href="http://127.0.0.1:5183/?v=20261010-2">打开最新版完整应用 →</a><a href="FoodLensCare-standalone.html">打开最新版单机体验 →</a></div>
<p>完整应用先双击“启动第三版.cmd”；子女页面需选择子女身份，详情需点击本人有权限的记录。单机体验无需启动服务，家庭登录与通信需完整应用。</p><nav>''' + ''.join(links) + '</nav></header><main>' + ''.join(cards) + '</main><a class="back" href="#">返回目录 ↑</a></body></html>'
    (ROOT / '第三版前端设计对照.html').write_text(html, encoding='utf-8')
    print(f'已生成最新界面预览：{len(PAGES)}页；docs截图：{len(list(target.glob("*.png")))}张')

if __name__ == '__main__':
    main()
