"""安卓Bearer会话回归；临时数据库，不输出登录令牌。"""
import importlib.util
import json
import tempfile
import threading
import urllib.request
import urllib.error
from pathlib import Path

spec = importlib.util.spec_from_file_location('family_server', Path(__file__).parent / 'family_server.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='flc-native-api-') as folder:
    server = module.create_server(port=0, database=Path(folder) / 'test.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/api'
    def api(path, data=None, token='', method=None, extra=None):
        headers = {'Content-Type': 'application/json', 'X-FLC-Native-Client': 'android-v1'}
        if token: headers['Authorization'] = 'Bearer ' + token
        headers.update(extra or {})
        req = urllib.request.Request(origin + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method or ('POST' if data is not None else 'GET'))
        try:
            with urllib.request.urlopen(req) as response: return response.status, json.load(response), response.headers
        except urllib.error.HTTPError as error: return error.code, json.load(error), error.headers
    def login(phone, role):
        _, code, _ = api('/auth/code', {'phone': phone})
        _, payload, headers = api('/auth/login', {'phone': phone, 'code': code['testCode']})
        assert 'Set-Cookie' not in headers
        token = payload['sessionToken']
        api('/me', {'role': role, 'profile': {'name': '原生隔离测试', 'completed': True}}, token, 'PATCH')
        return token, payload['user']['id']
    try:
        elder, eid = login('13800350001', 'elder'); child, cid = login('13800350002', 'child')
        assert api('/me', token=elder)[1]['user']['id'] == eid
        assert api('/me', token=child)[1]['user']['id'] == cid
        assert api('/records', token='invalid')[0] == 401
        assert api('/me', token='x'*43)[1]['user'] is None
        assert api('/records?elder='+eid, token=child)[0] == 403
        _, invitation, _ = api('/family/invite', {}, elder)
        _, relation, _ = api('/family/join', {'code': invitation['code'], 'relation': '女儿'}, child)
        assert api('/family/'+relation['id'], {'status':'bound'}, child, 'PATCH')[0] == 403
        assert api('/family/'+relation['id'], {'status':'bound','records_allowed':True}, elder, 'PATCH')[0] == 200
        api('/records', {'record': {'id': 'native-record','photoDataUrl':'data:image/png;base64,AA=='}}, elder)
        assert len(api('/records?elder='+eid, token=child)[1]['records']) == 1
        _, voice, _ = api('/voices', {'recipient':eid,'audioDataUrl':'data:audio/wav;base64,AA==','duration':1}, child)
        assert api('/voices/'+voice['id']+'/receipt', {'played':True}, child)[0] == 403
        assert api('/voices/'+voice['id']+'/receipt', {'played':True}, elder)[0] == 200
        assert api('/voices', token=child)[1]['messages'][0]['playedAt']
        assert api('/me', token=child, extra={'Origin':'https://untrusted.example'})[0] == 403
        assert api('/auth/logout', {}, child)[0] == 200
        assert api('/me', token=child)[1]['user'] is None
        assert api('/records', token=child)[0] == 401
        print('PASS Native session: no Cookie, isolated accounts, permissions, binding, pictures, voice receipts, cross-origin rejection, logout')
    finally: server.shutdown(); server.server_close()
