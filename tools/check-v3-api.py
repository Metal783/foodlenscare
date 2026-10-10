"""使用独立临时数据库检查两个家人的真实接口、权限撤回与语音回执。"""
import base64
import http.cookiejar
import json
import tempfile
import threading
import urllib.request
import urllib.error
from pathlib import Path
from family_server import create_server

def main():
    with tempfile.TemporaryDirectory(prefix='foodcare-v3-') as directory:
        server = create_server(port=0, database=Path(directory) / 'test.sqlite3')
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        def client():
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(path, method='GET', data=None, headers=None):
                payload = json.dumps(data).encode() if data is not None else None
                req = urllib.request.Request(origin + path, data=payload, method=method, headers={'Content-Type': 'application/json', **(headers or {})})
                try:
                    with opener.open(req) as response:
                        return response.status, json.load(response) if path.startswith('/api/') else response.read()
                except urllib.error.HTTPError as error:
                    return error.code, json.load(error) if path.startswith('/api/') else b''
            return request
        passed = 0
        def check(condition, message):
            nonlocal passed
            assert condition, message
            passed += 1
            print('PASS', message)
        try:
            elder, child, outsider = client(), client(), client()
            users = []
            for request, phone, role in [(elder, '13800002096', 'elder'), (child, '13800006628', 'child'), (outsider, '13900008016', 'child')]:
                status, result = request('/api/auth/code', 'POST', {'phone': phone})
                check(status == 200 and result['mode'] == 'local-test', '明确返回本地测试验证码')
                status, result = request('/api/auth/login', 'POST', {'phone': phone, 'code': result['testCode']})
                users.append(result['user']['id'])
                request('/api/me', 'PATCH', {'role': role, 'profile': {'name': role, 'completed': True, 'allergens': ['peanut']}})
            eid, cid, _ = users
            check(child(f'/api/records?elder={eid}')[0] == 403, '未绑定不能读取老人记录')
            _, result = child('/api/family/invite', 'POST', {'role': 'child'})
            _, relation = elder('/api/family/join', 'POST', {'code': result['code']})
            rid = relation['id']
            check(child(f'/api/records?elder={eid}')[0] == 403, '待确认关系不能读取')
            check(child(f'/api/family/{rid}', 'PATCH', {'status': 'bound', 'records_allowed': True})[0] == 403, '子女不能替老人确认授权')
            elder(f'/api/family/{rid}', 'PATCH', {'status': 'bound', 'records_allowed': True})
            record = {'id': 'scan_test', 'at': '2026-10-10T00:35:00Z', 'label': {'productName': '测试食品', 'ingredientText': '花生'}, 'profileSnapshot': {'allergens': ['peanut']}, 'assessment': {'level': 'red', 'headline': '本人花生过敏', 'basis': [{'text': '本人资料'}]}}
            check(elder('/api/records', 'POST', {'record': record})[0] == 200, '本人保存完整识别记录')
            status, result = child(f'/api/records?elder={eid}')
            check(status == 200 and len(result['records']) == 1, '授权后子女读取真实记录')
            check('profileSnapshot' not in result['records'][0] and result['profile'] is None and not result['records'][0]['assessment']['basis'], '未授权设置时不返回私人画像或依据')
            elder(f'/api/family/{rid}', 'PATCH', {'profile_allowed': True})
            check(child(f'/api/records?elder={eid}')[1]['profile']['allergens'] == ['peanut'], '饮食设置单独授权生效')
            check(outsider(f'/api/records?elder={eid}')[0] == 403, '无关账号不能读取共享记录')
            audio = 'data:audio/wav;base64,' + base64.b64encode(b'test-audio').decode()
            status, voice = child('/api/voices', 'POST', {'recipient': eid, 'audioDataUrl': audio, 'duration': 18})
            check(status == 200, '已绑定家人发送语音')
            check(not child('/api/voices')[1]['messages'][0]['deliveredAt'], '发送不冒充送达')
            vid = voice['id']
            check(child(f'/api/voices/{vid}/receipt', 'POST', {'played': True})[0] == 403, '发送者不能伪造接收者播放回执')
            elder(f'/api/voices/{vid}/receipt', 'POST', {'played': False})
            check(bool(child('/api/voices')[1]['messages'][0]['deliveredAt']), '接收端确认送达')
            elder(f'/api/voices/{vid}/receipt', 'POST', {'played': True})
            check(bool(child('/api/voices')[1]['messages'][0]['playedAt']), '接收端播放回执同步')
            elder('/api/family/share-all', 'POST', {'records_allowed': False})
            check(child(f'/api/records?elder={eid}')[0] == 403, '关闭共享立即拒绝读取')
            elder(f'/api/family/{rid}', 'DELETE')
            check(child('/api/voices')[1]['messages'] == [], '解除绑定后不能继续取得语音')
            check(elder('/api/me', 'PATCH', {'role': 'child'}, {'Origin': 'http://foreign.example'})[0] == 403, '跨来源写请求被拒绝')
            for path in ['/_local/family.sqlite3', '/assets/%2e%2e/tools/family_server.py', '/tools/family_server.py', '/assets/']:
                check(elder(path)[0] == 404, '私有文件与编码目录穿越不公开')
            check(elder('/api/auth/logout', 'POST', {})[0] == 200 and elder('/api/records')[0] == 401, '退出后会话失效')
            print(f'接口检查：{passed}项通过')
        finally:
            server.shutdown()
            server.server_close()

if __name__ == '__main__':
    main()
