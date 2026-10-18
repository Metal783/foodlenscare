"""Birthday calculations and account API regression using an isolated database."""
import importlib.util
import json
import tempfile
import threading
import urllib.request
import urllib.error
import http.cookiejar
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location('family_server', Path(__file__).parent / 'family_server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for birthday, today, expected in [
    ('1958-10-17', date(2026, 10, 16), '67'), ('1958-10-17', date(2026, 10, 17), '68'),
    ('2000-02-29', date(2025, 2, 28), '24'), ('2000-02-29', date(2025, 3, 1), '25'),
    ('2026-10-17', date(2026, 10, 17), '0'), ('1905-10-18', date(2026, 10, 17), '120'),
]:
    assert module.age_from_birth_date(birthday, today) == expected
for value in ('2025-02-29', '2026-10-18', '1905-10-17', '2000-2-29', None):
    try:
        module.age_from_birth_date(value, date(2026, 10, 17))
        raise AssertionError(value)
    except ValueError:
        pass
with tempfile.TemporaryDirectory(prefix='flc-birthday-') as temp:
    server = module.create_server(port=0, database=Path(temp) / 'test.sqlite3')
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}/api'
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None):
        request = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json'}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)
    def login(c, phone, role):
        _, code = api(c, '/auth/code', {'phone': phone})
        _, result = api(c, '/auth/login', {'phone': phone, 'code': code['testCode']})
        api(c, '/me', {'role': role}, 'PATCH')
        return result['user']['id']
    try:
        elder, child = client(), client()
        uid = login(elder, '13800650001', 'elder')
        login(child, '13800650002', 'child')
        for c in (elder, child):
            status, saved = api(c, '/me', {'profile': {'name': '隔离生日测试', 'birthDate': '2000-02-29', 'age': '999', 'completed': True}}, 'PATCH')
            assert status == 200 and saved['user']['profile']['age'] == module.age_from_birth_date('2000-02-29')
            for invalid in ('2999-01-01', '2025-02-29', '1800-01-01', 20000101, None):
                status, _ = api(c, '/me', {'profile': {'birthDate': invalid}}, 'PATCH')
                assert status == 400, invalid
            # Legacy APK payload must neither remove the birthday nor override derived age.
            _, saved = api(c, '/me', {'profile': {'name': '旧客户端兼容', 'age': '999'}}, 'PATCH')
            assert saved['user']['profile']['birthDate'] == '2000-02-29'
            assert saved['user']['profile']['age'] == module.age_from_birth_date('2000-02-29')
        _, invite = api(elder, '/family/invite', {'role': 'elder'})
        _, found = api(child, '/family/lookup?code=' + invite['code'])
        assert 'birthDate' not in found['member']
        _, joined = api(child, '/family/join', {'code': invite['code'], 'relation': '女儿'})
        api(elder, '/family/' + joined['id'], {'status': 'bound', 'records_allowed': True, 'profile_allowed': False}, 'PATCH')
        _, family = api(child, '/family')
        assert 'birthDate' not in family['families'][0]['member']
        assert family['families'][0]['member']['age'] == module.age_from_birth_date('2000-02-29')
        _, records = api(child, '/records?elder=' + uid)
        assert records['profile'] is None
        api(elder, '/family/' + joined['id'], {'profile_allowed': True}, 'PATCH')
        _, records = api(child, '/records?elder=' + uid)
        assert records['profile']['birthDate'] == '2000-02-29'
        assert records['profile']['age'] == module.age_from_birth_date('2000-02-29')
        api(elder, '/me', {'profile': {'name': '清除生日', 'birthDate': '', 'age': '999'}}, 'PATCH')
        _, me = api(elder, '/me')
        assert me['user']['profile']['age'] == ''
        api(elder, '/me', {'profile': {'name': '原有年龄', 'age': '68'}}, 'PATCH')
        _, me = api(elder, '/me')
        assert me['user']['profile']['age'] == '68' and not me['user']['profile'].get('birthDate')
        _, family = api(child, '/family')
        assert family['families'][0]['member']['age'] == '', 'No birthday means no displayed legacy age'
        evidence = module.deepseek_analysis.evidence({'ingredientText': '小麦粉'}, {'birthDate': '2000-02-29', 'age': '999', 'diseases': [], 'allergens': []})
        assert 'birthDate' not in json.dumps(evidence) and '999' not in json.dumps(evidence)
        print('PASS birthday API: both roles, derived age not trusted from client, invalid dates rejected, legacy APK compatible, birthday permission protected, clearing birthday, legacy age retained, no DOB sent to model')
    finally:
        server.shutdown(); server.server_close(); thread.join()
