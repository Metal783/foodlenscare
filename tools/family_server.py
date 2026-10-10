#!/usr/bin/env python3
"""第三版本机/局域网服务：SQLite 持久保存，所有共享读取均在服务端检查授权。

测试验证码返回页面，仅用于本机/可信局域网演示，不是短信验证服务。
不提供公网部署模式；生产认证应替换为真实微信/短信服务。
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import http.cookies
import http.server
import json
import re
import secrets
import sqlite3
import sys
import time
from contextlib import closing
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, phone TEXT UNIQUE, profile TEXT NOT NULL DEFAULT '{}', role TEXT NOT NULL DEFAULT 'elder', prefs TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS codes(phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires REAL NOT NULL, sent REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, inviter TEXT NOT NULL, role TEXT NOT NULL, expires REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY, elder TEXT NOT NULL, child TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', records_allowed INTEGER NOT NULL DEFAULT 0, profile_allowed INTEGER NOT NULL DEFAULT 0, is_primary INTEGER NOT NULL DEFAULT 0, relation TEXT NOT NULL DEFAULT '家人', updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(id,owner));
CREATE TABLE IF NOT EXISTS voices(id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, audio TEXT NOT NULL, duration REAL NOT NULL, note TEXT NOT NULL, sent TEXT NOT NULL, delivered TEXT, played TEXT);
"""

def timestamp():
    return datetime.now(timezone.utc).isoformat()

def identifier():
    return secrets.token_hex(16)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status

def public_user(row, full=False):
    profile = json.loads(row['profile'])
    value = {'id': row['id'], 'phone': row['phone'], 'role': row['role'], 'name': profile.get('name') or '家人'}
    if full:
        value.update(profile=profile, prefs=json.loads(row['prefs']))
    else:
        value['age'] = profile.get('age')
    return value

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 不把手机号、验证码、会话和语音内容写进终端日志。
        return

    def send_json(self, value, status=200, cookie=None):
        encoded = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.dispatch('GET')
            return
        super().do_GET()

    def send_head(self):
        # 按最终解析路径检查，编码后的 ../ 也不能绕过；HEAD 和 GET 使用同一限制。
        path = urlsplit(self.path).path
        translated = Path(self.translate_path(path)).resolve()
        if not translated.is_relative_to(ROOT):
            self.send_error(404)
            return None
        relative = translated.relative_to(ROOT).as_posix()
        allowed = relative in ('.', 'index.html', 'sw.js', 'manifest.webmanifest', 'FoodLensCare-standalone.html') or relative.startswith(('src/', 'assets/'))
        if not allowed or translated.is_dir() and relative != '.':
            self.send_error(404)
            return None
        return super().send_head()

    def do_POST(self):
        self.dispatch('POST')

    def do_PATCH(self):
        self.dispatch('PATCH')

    def do_DELETE(self):
        self.dispatch('DELETE')

    def dispatch(self, method):
        try:
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', ''):
                raise APIError('请从本服务页面操作。', 403)
            if method != 'GET' and 'application/json' not in self.headers.get('Content-Type', ''):
                raise APIError('请求格式不正确。', 415)
            size = int(self.headers.get('Content-Length', 0))
            if size > 14 * 1024 * 1024:
                raise APIError('照片或录音太大，请缩短或重新拍摄。', 413)
            data = json.loads(self.rfile.read(size).decode('utf-8')) if size else {}
            if not isinstance(data, dict):
                raise APIError('请求格式不正确。')
            with closing(sqlite3.connect(self.server.database, timeout=15)) as db, db:
                db.row_factory = sqlite3.Row
                result, cookie = self.route(db, method, urlsplit(self.path).path, parse_qs(urlsplit(self.path).query), data)
            self.send_json(result, cookie=cookie)
        except APIError as error:
            self.send_json({'error': error.message}, error.status)
        except (ValueError, TypeError, KeyError, OverflowError):
            self.send_json({'error': '数据格式不正确，请检查后重试。'}, 400)
        except Exception:
            self.send_json({'error': '服务暂时无法完成操作，请重试。'}, 500)

    def session(self, db):
        cookie = http.cookies.SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie.get('flc_session')
        except http.cookies.CookieError:
            token = None
        if not token:
            return None
        return db.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?', (digest(token.value), time.time())).fetchone()

    def access(self, db, caller, elder, scope='records'):
        if caller == elder:
            return True
        row = db.execute("SELECT * FROM families WHERE elder=? AND child=? AND status='bound'", (elder, caller)).fetchone()
        return bool(row and row['records_allowed' if scope == 'records' else 'profile_allowed'])

    def family(self, db, uid, relation_id):
        row = db.execute('SELECT * FROM families WHERE id=? AND (elder=? OR child=?)', (relation_id, uid, uid)).fetchone()
        if not row:
            raise APIError('未找到您有权管理的家人。', 404)
        return row

    def voice_dict(self, row):
        return {'id': row['id'], 'sender': row['sender'], 'recipient': row['recipient'], 'audioDataUrl': row['audio'],
                'duration': row['duration'], 'note': row['note'], 'sentAt': row['sent'], 'deliveredAt': row['delivered'], 'playedAt': row['played']}

    def route(self, db, method, path, query, data):
        cookie = None
        if path == '/api/status' and method == 'GET':
            return {'mode': 'local-test', 'sms': False, 'wechat': False, 'version': '3.0.1', 'revision': '20261010-2'}, None
        if path == '/api/auth/code' and method == 'POST':
            phone = str(data.get('phone', ''))
            if not re.fullmatch(r'1[3-9]\d{9}', phone):
                raise APIError('请输入有效的11位手机号。')
            previous = db.execute('SELECT sent FROM codes WHERE phone=?', (phone,)).fetchone()
            now = time.time()
            if previous and now - previous['sent'] < 60:
                raise APIError('请间隔60秒再获取验证码。', 429)
            code = f'{secrets.randbelow(1000000):06}'
            db.execute('INSERT OR REPLACE INTO codes VALUES(?,?,?,?,0)', (phone, digest(code), now + 300, now))
            return {'testCode': code, 'expiresIn': 300, 'mode': 'local-test'}, None
        if path == '/api/auth/login' and method == 'POST':
            phone, code = str(data.get('phone', '')), str(data.get('code', ''))
            stored = db.execute('SELECT * FROM codes WHERE phone=?', (phone,)).fetchone()
            if not stored or stored['expires'] < time.time() or stored['attempts'] >= 5:
                raise APIError('验证码已失效，请重新获取。', 401)
            if not secrets.compare_digest(stored['code'], digest(code)):
                db.execute('UPDATE codes SET attempts=attempts+1 WHERE phone=?', (phone,))
                db.commit()
                raise APIError('验证码不正确。', 401)
            db.execute('DELETE FROM codes WHERE phone=?', (phone,))
            db.execute('INSERT OR IGNORE INTO users(id,phone) VALUES(?,?)', (identifier(), phone))
            user = db.execute('SELECT * FROM users WHERE phone=?', (phone,)).fetchone()
            token = secrets.token_urlsafe(32)
            db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), user['id'], time.time() + 7 * 86400))
            cookie = f'flc_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'
            return {'user': public_user(user, True)}, cookie
        user = self.session(db)
        if path == '/api/me' and method == 'GET':
            return {'user': public_user(user, True) if user else None}, None
        if not user:
            raise APIError('请先登录本地测试账号。', 401)
        uid = user['id']
        if path == '/api/auth/logout' and method == 'POST':
            cookies = http.cookies.SimpleCookie(self.headers.get('Cookie', ''))
            db.execute('DELETE FROM sessions WHERE token=?', (digest(cookies['flc_session'].value),))
            return {'ok': True}, 'flc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        if path == '/api/me' and method == 'PATCH':
            role = data.get('role', user['role'])
            if role not in ('elder', 'child'):
                raise APIError('身份不正确。')
            profile = data.get('profile', json.loads(user['profile']))
            prefs = data.get('prefs', json.loads(user['prefs']))
            if not isinstance(profile, dict) or not isinstance(prefs, dict) or len(json.dumps(profile)) > 20000:
                raise APIError('个人资料格式不正确。')
            db.execute('UPDATE users SET role=?,profile=?,prefs=? WHERE id=?', (role, json.dumps(profile, ensure_ascii=False), json.dumps(prefs), uid))
            return {'user': public_user(db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone(), True)}, None
        if path == '/api/family' and method == 'GET':
            result = []
            for row in db.execute("SELECT * FROM families WHERE (elder=? OR child=?) AND status NOT IN ('rejected','removed') ORDER BY updated DESC", (uid, uid)):
                other = row['child'] if row['elder'] == uid else row['elder']
                member = public_user(db.execute('SELECT * FROM users WHERE id=?', (other,)).fetchone())
                result.append({**dict(row), 'member': member, 'amElder': row['elder'] == uid})
            return {'families': result, 'syncedAt': timestamp()}, None
        if path == '/api/family/invite' and method == 'POST':
            role = data.get('role', user['role'])
            if role not in ('elder', 'child'):
                raise APIError('请先选择身份。')
            code = secrets.token_hex(4).upper()
            db.execute('INSERT INTO invites VALUES(?,?,?,?,0)', (code, uid, role, time.time() + 86400))
            return {'code': code, 'expiresIn': 86400}, None
        if path == '/api/family/share-all' and method == 'POST':
            # 一次事务更新所有本人作为老人的关系，不会出现只改了一半的开关。
            allowed = int(data.get('records_allowed') is True)
            db.execute("UPDATE families SET records_allowed=?,updated=? WHERE elder=? AND status='bound'", (allowed, timestamp(), uid))
            return {'ok': True}, None
        if path == '/api/family/join' and method == 'POST':
            invitation = db.execute('SELECT * FROM invites WHERE code=? AND used=0 AND expires>?', (str(data.get('code', '')).strip().upper(), time.time())).fetchone()
            if not invitation or invitation['inviter'] == uid:
                raise APIError('绑定码无效、已使用或不能绑定自己。')
            elder, child = (invitation['inviter'], uid) if invitation['role'] == 'elder' else (uid, invitation['inviter'])
            existing = db.execute("SELECT id FROM families WHERE elder=? AND child=? AND status IN ('pending','bound')", (elder, child)).fetchone()
            if existing:
                raise APIError('已经绑定或等待老人确认。')
            relation_id = identifier()
            db.execute('INSERT INTO families(id,elder,child,updated) VALUES(?,?,?,?)', (relation_id, elder, child, timestamp()))
            db.execute('UPDATE invites SET used=1 WHERE code=?', (invitation['code'],))
            return {'id': relation_id, 'status': 'pending'}, None
        match = re.fullmatch(r'/api/family/([a-f0-9]+)', path)
        if match and method in ('PATCH', 'DELETE'):
            row = self.family(db, uid, match[1])
            if method == 'DELETE':
                db.execute("UPDATE families SET status='removed',records_allowed=0,profile_allowed=0,updated=? WHERE id=?", (timestamp(), row['id']))
                return {'ok': True}, None
            if row['elder'] != uid:
                raise APIError('共享范围只能由老人本人决定。', 403)
            new_status = data.get('status', row['status'])
            if new_status not in ('bound', 'pending', 'rejected'):
                raise APIError('绑定状态不正确。')
            records_allowed = int(data.get('records_allowed', row['records_allowed']) is True or data.get('records_allowed', row['records_allowed']) == 1)
            profile_allowed = int(data.get('profile_allowed', row['profile_allowed']) is True or data.get('profile_allowed', row['profile_allowed']) == 1)
            if new_status != 'bound':
                records_allowed = profile_allowed = 0
            primary = int(bool(data.get('is_primary', row['is_primary'])))
            if primary:
                db.execute('UPDATE families SET is_primary=0 WHERE elder=?', (uid,))
            relation = str(data.get('relation', row['relation']))[:30]
            db.execute('UPDATE families SET status=?,records_allowed=?,profile_allowed=?,is_primary=?,relation=?,updated=? WHERE id=?', (new_status, records_allowed, profile_allowed, primary, relation, timestamp(), row['id']))
            return {'ok': True}, None
        if path == '/api/records' and method == 'POST':
            record = data.get('record')
            if not isinstance(record, dict) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', str(record.get('id', ''))):
                raise APIError('记录编号不正确。')
            photo = record.get('photoDataUrl')
            if photo and not str(photo).startswith(('data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,')):
                raise APIError('照片格式不支持。')
            # 归属从会话确定，不接受客户端指定其他老人。
            db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?)', (record['id'], uid, json.dumps(record, ensure_ascii=False), timestamp()))
            return {'ok': True, 'syncedAt': timestamp()}, None
        if path == '/api/records' and method == 'GET':
            elder = query.get('elder', [uid])[0]
            if not self.access(db, uid, elder):
                raise APIError('老人尚未授权食物记录，或已经关闭共享。', 403)
            records = []
            profile_access = self.access(db, uid, elder, 'profile')
            for row in db.execute('SELECT data FROM records WHERE owner=? ORDER BY updated DESC', (elder,)):
                record = json.loads(row['data'])
                if not profile_access:
                    record.pop('profileSnapshot', None)
                    record.pop('consumption', None)
                    # 依据中可能带有私人过敏/慢病信息，未获资料授权时只返回食品摘要。
                    assessment = record.get('assessment', {})
                    record['assessment'] = {'level': assessment.get('level'), 'headline': '请核对包装成分与食用份量', 'advice': '饮食相关设置未授权，不能查看个性化判断依据。', 'basis': []}
                records.append(record)
            owner = db.execute('SELECT * FROM users WHERE id=?', (elder,)).fetchone()
            return {'records': records, 'syncedAt': timestamp(), 'profile': json.loads(owner['profile']) if profile_access else None}, None
        match = re.fullmatch(r'/api/records/([a-zA-Z0-9_-]+)', path)
        if match and method == 'DELETE':
            db.execute('DELETE FROM records WHERE id=? AND owner=?', (match[1], uid))
            return {'ok': True}, None
        if path == '/api/voices' and method == 'POST':
            recipient = str(data.get('recipient', ''))
            family = db.execute("SELECT * FROM families WHERE status='bound' AND ((elder=? AND child=?) OR (elder=? AND child=?))", (uid, recipient, recipient, uid)).fetchone()
            if not family:
                raise APIError('只能给已确认绑定的家人发送语音。', 403)
            audio = str(data.get('audioDataUrl', ''))
            if not re.match(r'^data:(audio/(webm|mp4|ogg|wav)(;codecs=[a-zA-Z0-9.,_-]+)?|video/webm);base64,', audio):
                raise APIError('录音格式不支持。')
            base64.b64decode(audio.split(',', 1)[1], validate=True)
            duration = float(data.get('duration', 0))
            if not 0 < duration <= 120:
                raise APIError('录音需要在1—120秒以内。')
            voice_id = identifier()
            db.execute('INSERT INTO voices VALUES(?,?,?,?,?,?,?,NULL,NULL)', (voice_id, uid, recipient, audio, duration, str(data.get('note', ''))[:300], timestamp()))
            return {'id': voice_id, 'sentAt': timestamp()}, None
        if path == '/api/voices' and method == 'GET':
            rows = db.execute("SELECT v.* FROM voices v WHERE (v.sender=? OR v.recipient=?) AND EXISTS(SELECT 1 FROM families f WHERE f.status='bound' AND ((f.elder=v.sender AND f.child=v.recipient) OR (f.elder=v.recipient AND f.child=v.sender))) ORDER BY sent DESC LIMIT 100", (uid, uid))
            return {'messages': [self.voice_dict(row) for row in rows]}, None
        match = re.fullmatch(r'/api/voices/([a-f0-9]+)/receipt', path)
        if match and method == 'POST':
            row = db.execute('SELECT * FROM voices WHERE id=? AND recipient=?', (match[1], uid)).fetchone()
            if not row:
                raise APIError('只能确认本人收到的语音。', 403)
            bound = db.execute("SELECT 1 FROM families WHERE status='bound' AND ((elder=? AND child=?) OR (elder=? AND child=?))", (row['sender'], uid, uid, row['sender'])).fetchone()
            if not bound:
                raise APIError('家庭关系已解除。', 403)
            now = timestamp()
            db.execute('UPDATE voices SET delivered=COALESCE(delivered,?),played=CASE WHEN ? THEN COALESCE(played,?) ELSE played END WHERE id=?', (now, bool(data.get('played')), now, row['id']))
            return {'message': self.voice_dict(db.execute('SELECT * FROM voices WHERE id=?', (row['id'],)).fetchone())}, None
        raise APIError('接口不存在。', 404)

class FamilyServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

def create_server(host='127.0.0.1', port=5183, database=None):
    database = Path(database) if database else ROOT / '_local' / 'family.sqlite3'
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as db, db:
        db.executescript(SCHEMA)
        db.execute('PRAGMA journal_mode=WAL')
    server = FamilyServer((host, port), Handler)
    server.database = str(database)
    return server

def main():
    parser = argparse.ArgumentParser(description='食护家第三版本机/局域网测试服务')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5183)
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--database', help='指定测试数据库文件；默认保存于第三版/_local')
    args = parser.parse_args()
    for port in range(args.port, args.port + 20):
        try:
            server = create_server(args.host, port, args.database)
            break
        except OSError:
            continue
    else:
        raise SystemExit('没有可用端口。')
    url = f'http://127.0.0.1:{port}/?v=20261010-2'
    print(f'第三版已启动：{url}', flush=True)
    print('测试验证码会显示在页面，本服务仅供本机/可信局域网使用。', flush=True)
    print('手机录音要求 HTTPS 安全访问；电脑 localhost 可直接录音。', flush=True)
    if args.host == '0.0.0.0':
        from serve import local_ip
        print(f'局域网访问：http://{local_ip()}:{port}/?v=20261010-2', flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
