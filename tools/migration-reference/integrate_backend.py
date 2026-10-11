from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / 'tools/family_server.py'
s = p.read_text(encoding='utf-8')
s = s.replace('第三版', '第四版').replace("'version': '3.0.1', 'revision': '20261010-2'", "'version': '4.0.0', 'revision': '20261011-1'")
s = s.replace("allowed = relative in ('.', 'index.html', 'sw.js', 'manifest.webmanifest', 'FoodLensCare-standalone.html') or relative.startswith(('src/', 'assets/'))", "allowed = relative in ('.', 'index.html', 'favicon.svg', 'sw.js') or relative.startswith(('assets/', 'audio/'))")
s = s.replace("directory=str(ROOT)", "directory=str(ROOT / 'dist')")
s = s.replace("if not translated.is_relative_to(ROOT):", "public_root = (ROOT / 'dist').resolve()\n        if not translated.is_relative_to(public_root):").replace("translated.relative_to(ROOT)", "translated.relative_to(public_root)")
s = s.replace("code = secrets.token_hex(4).upper()", "code = secrets.token_hex(3).upper()\n            while db.execute('SELECT 1 FROM invites WHERE code=?', (code,)).fetchone():\n                code = secrets.token_hex(3).upper()")
s = s.replace("if path == '/api/family/join' and method == 'POST':", """if path == '/api/family/lookup' and method == 'GET':
            invitation = db.execute('SELECT * FROM invites WHERE code=? AND used=0 AND expires>?', (query.get('code', [''])[0].strip().upper(), time.time())).fetchone()
            if not invitation or invitation['inviter'] == uid:
                raise APIError('绑定码无效、已使用或不能绑定自己。')
            person = public_user(db.execute('SELECT * FROM users WHERE id=?', (invitation['inviter'],)).fetchone())
            person['phone'] = person['phone'][:3] + ' **** ' + person['phone'][-4:]
            return {'member': person, 'role': invitation['role']}, None
        if path == '/api/auth/change-phone' and method == 'POST':
            phone, code = str(data.get('phone', '')), str(data.get('code', ''))
            stored = db.execute('SELECT * FROM codes WHERE phone=?', (phone,)).fetchone()
            if not stored or stored['expires'] < time.time() or stored['attempts'] >= 5:
                raise APIError('验证码已失效，请重新获取。', 401)
            if not secrets.compare_digest(stored['code'], digest(code)):
                db.execute('UPDATE codes SET attempts=attempts+1 WHERE phone=?', (phone,))
                db.commit()
                raise APIError('验证码不正确。', 401)
            conflict = db.execute('SELECT id FROM users WHERE phone=? AND id<>?', (phone, uid)).fetchone()
            if conflict:
                raise APIError('新手机号已有账号，不能合并两个账号。')
            profile = json.loads(user['profile'])
            profile['phone'] = phone
            db.execute('UPDATE users SET phone=?,profile=? WHERE id=?', (phone, json.dumps(profile, ensure_ascii=False), uid))
            db.execute('DELETE FROM codes WHERE phone=?', (phone,))
            return {'user': public_user(db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone(), True)}, None
        if path == '/api/family/join' and method == 'POST':""")
s = s.replace("db.execute('INSERT INTO families(id,elder,child,updated) VALUES(?,?,?,?)', (relation_id, elder, child, timestamp()))", "db.execute('INSERT INTO families(id,elder,child,relation,updated) VALUES(?,?,?,?,?)', (relation_id, elder, child, str(data.get('relation', '家人'))[:30], timestamp()))")
s = s.replace("match = re.fullmatch(r'/api/family/([a-f0-9]+)', path)", """match = re.fullmatch(r'/api/family/([a-f0-9]+)/relation-request', path)
        if match and method == 'POST':
            row = self.family(db, uid, match[1])
            if row['child'] != uid or row['status'] != 'bound':
                raise APIError('只有已绑定的子女可以申请关系更正。', 403)
            relation = str(data.get('relation', '')).strip()
            if relation not in ('女儿', '儿子', '其他'):
                raise APIError('请选择正确关系。')
            db.execute('UPDATE families SET requested_relation=?,updated=? WHERE id=?', (relation, timestamp(), row['id']))
            return {'ok': True}, None
        match = re.fullmatch(r'/api/family/([a-f0-9]+)', path)""")
s = s.replace("return {'ok': True}, None\n        if path == '/api/records'", "if data.get('resolve_relation'):\n                db.execute(\"UPDATE families SET requested_relation='' WHERE id=?\", (row['id'],))\n            return {'ok': True}, None\n        if path == '/api/records'", 1)
s = s.replace("record.pop('profileSnapshot', None)", "record.pop('profileSnapshot', None)\n                    record.pop('healthSnapshot', None)")
s = s.replace("raise APIError('接口不存在。', 404)", "raise APIError('接口不存在。', 404)")
s = s.replace("db.executescript(SCHEMA)", "db.executescript(SCHEMA)\n        if 'requested_relation' not in [r[1] for r in db.execute('PRAGMA table_info(families)')]:\n            db.execute(\"ALTER TABLE families ADD COLUMN requested_relation TEXT NOT NULL DEFAULT ''\")")
s = s.replace("default=5183", "default=5184").replace("port=5183", "port=5184").replace('20261010-2', '20261011-1')
s = s.replace('from serve import local_ip', "import socket\n        def local_ip():\n            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:\n                try:\n                    probe.connect(('192.0.2.1', 80))\n                    return probe.getsockname()[0]\n                except OSError:\n                    return '127.0.0.1'")
p.write_text(s, encoding='utf-8')
p = ROOT / 'package.json'
data = json.loads(p.read_text(encoding='utf-8'))
data.update(name='foodlenscare-v4', version='4.0.0')
data['scripts'].update(typecheck='tsc --noEmit', **{'test:rules': 'node tools/rule-selftest.mjs', 'serve': 'python -X utf8 tools/family_server.py --open'})
p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
p = ROOT / 'tsconfig.json'
data = json.loads(p.read_text(encoding='utf-8'))
data['compilerOptions'].update(allowJs=True, checkJs=False, target='ES2022', lib=['ES2022','DOM','DOM.Iterable'])
p.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
for p in (ROOT / 'tools').glob('*selftest.mjs'):
    p.write_text(p.read_text(encoding='utf-8').replace('../src/', '../src/legacy/'), encoding='utf-8')
print('服务、工具和项目配置已接入。')
