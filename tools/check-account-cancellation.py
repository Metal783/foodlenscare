"""账号注销安全检查；只使用临时数据库。"""
import importlib.util
import http.cookiejar
import json
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from contextlib import closing

spec = importlib.util.spec_from_file_location('family_server', Path(__file__).parent / 'family_server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = 0

def check(value, message):
    global checks
    assert value, message
    checks += 1
    print('PASS ' + message)

with tempfile.TemporaryDirectory(prefix='flc-cancellation-') as folder:
    server = module.create_server(port=0, database=Path(folder) / 'test.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/api'
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None):
        request = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)
    def login(c, phone, role):
        _, code = api(c, '/auth/code', {'phone': phone})
        _, result = api(c, '/auth/login', {'phone': phone, 'code': code['testCode']})
        api(c, '/me', {'role': role}, 'PATCH')
        return result['user']['id']
    def bind(elder, child, primary=False):
        _, invitation = api(elder, '/family/invite', {})
        _, relation = api(child, '/family/join', {'code': invitation['code'], 'relation': '儿子'})
        status, _ = api(elder, '/family/' + relation['id'], {'status': 'bound', 'records_allowed': True, 'is_primary': primary}, 'PATCH')
        assert status == 200
    try:
        elder, child, other, anonymous = client(), client(), client(), client()
        eid = login(elder, '13800310001', 'elder')
        cid = login(child, '13800310002', 'child')
        oid = login(other, '13800310003', 'child')
        bind(elder, child, True); bind(elder, other)
        api(elder, '/records', {'record': {'id': 'elder-record'}})
        api(child, '/records', {'record': {'id': 'child-record'}})
        api(child, '/voices', {'recipient': eid, 'audioDataUrl': 'data:audio/wav;base64,AA==', 'duration': 1})
        _, ticket = api(child, '/account/cancellation', {})
        body = {'token': ticket['token'], 'agreed': True}
        check(api(anonymous, '/account', body, 'DELETE')[0] == 401, '未登录不能注销')
        check(api(other, '/account', body, 'DELETE')[0] == 400, '其他账号不能使用注销令牌')
        check(api(child, '/account', body, 'DELETE')[0] == 409, '不足10秒服务端拒绝注销')
        with closing(sqlite3.connect(server.database)) as db, db:
            db.execute('UPDATE cancellations SET ready=? WHERE user_id=?', (time.time() - 1, cid))
        check(api(child, '/account', {**body, 'agreed': False}, 'DELETE')[0] == 400, '未同意协议不能注销')
        check(api(child, '/account', body, 'DELETE')[0] == 200, '子女本人注销成功')
        check(api(child, '/me')[1]['user'] is None, '注销后会话失效')
        _, families = api(elder, '/family')
        check(len(families['families']) == 1 and families['families'][0]['member']['id'] == oid and families['families'][0]['is_primary'], '剩余家人接任主要联系人')
        check(len(api(elder, '/records')[1]['records']) == 1, '家人自己的记录保留')
        check(not api(elder, '/voices')[1]['messages'], '关联语音和回执清除')
        with closing(sqlite3.connect(server.database)) as db, db:
            for table, where, args in [('users', 'id=?', (cid,)), ('sessions', 'user_id=?', (cid,)), ('records', 'owner=?', (cid,)), ('families', 'elder=? OR child=?', (cid, cid)), ('cancellations', 'user_id=?', (cid,))]:
                check(db.execute(f'SELECT COUNT(*) FROM {table} WHERE {where}', args).fetchone()[0] == 0, table + '无注销账号残留')
        check(login(child, '13800310002', 'child') != cid, '相同手机号重新登录创建新账号')
        _, ticket = api(elder, '/account/cancellation', {})
        with closing(sqlite3.connect(server.database)) as db, db:
            db.execute('UPDATE cancellations SET ready=?,expires=? WHERE user_id=?', (time.time() - 20, time.time() - 1, eid))
        check(api(elder, '/account', {'token': ticket['token'], 'agreed': True}, 'DELETE')[0] == 400, '过期注销令牌拒绝')
        _, ticket = api(elder, '/account/cancellation', {})
        with closing(sqlite3.connect(server.database)) as db, db:
            db.execute('UPDATE cancellations SET ready=? WHERE user_id=?', (time.time() - 1, eid))
        check(api(elder, '/account', {'token': ticket['token'], 'agreed': True}, 'DELETE')[0] == 200, '老人本人注销成功')
        check(not api(other, '/family')[1]['families'], '老人注销后子女家庭列表清空')
        check(api(other, '/records?elder=' + eid)[0] == 403, '注销后共享访问拒绝')
        print(f'{checks} checks passed')
    finally:
        server.shutdown(); server.server_close()
