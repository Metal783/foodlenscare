"""Version review fixes: isolated permissions, paging, lazy media and AI evidence."""
import base64
import http.cookiejar
import json
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
import family_server as app
import deepseek_analysis as ai

checks = 0
def check(value, label):
    global checks
    assert value, label
    checks += 1
    print('PASS ' + label)

label = {'ingredientText': '小麦粉、盐', 'declaredPer': 'per100g', 'nutritionPer100g': {'sodium': 220, 'fat': 8, 'sugar': 0}}
health = {'diseases': ['高血压'], 'allergens': []}
check(not ai.evidence(label, health)['food']['nutritionCandidates'], '无置信依据不向AI发送定量营养')
for confidence in (.01, .69, True, float('nan'), float('inf')):
    check(not ai.evidence({**label, 'confidence': {'sodium': confidence}}, health)['food']['nutritionCandidates'], '低/无效置信度排除 ' + str(confidence))
for extra in ({'conflict': True}, {'warning': True}):
    check(not ai.evidence({**label, 'nutritionEvidence': {'sodium': {'confidence': .99, **extra}}}, health)['food']['nutritionCandidates'], '冲突或单位警告排除')
good = {**label, 'nutritionEvidence': {'sodium': {'confidence': .99}, 'sugar': {'confidence': .9}, 'fat': {'confidence': .2}}}
check(ai.evidence(good, health)['food']['nutritionCandidates'] == {'sodium': 220, 'sugar': 0}, '保留可靠候选和真实零值，剔除低置信字段')
check(not ai.evidence({**good, 'declaredPer': 'unknown'}, health)['food']['nutritionCandidates'], '口径不明不向AI发送定量营养')
check('fat' not in ai.evidence({**good, 'confidence': {'fat': .99}, 'nutritionPer100g': {'fat': 101}}, health)['food']['nutritionCandidates'], '每100克数值采用物理范围检查')

with tempfile.TemporaryDirectory(prefix='flc-fixes-api-') as temp:
    server = app.create_server(port=0, database=Path(temp) / 'test.sqlite3')
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    def client(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None):
        request = urllib.request.Request(origin + '/api' + path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as response: return response.status, json.load(response)
        except urllib.error.HTTPError as error: return error.code, json.load(error)
    def login(c, phone, role):
        code = api(c, '/auth/code', {'phone': phone})[1]['testCode']
        user = api(c, '/auth/login', {'phone': phone, 'code': code})[1]['user']
        api(c, '/me', {'role': role, 'profile': {'name': '隔离修复测试', 'diseases': ['高血压'], 'completed': True}}, 'PATCH')
        return user['id']
    try:
        elder, child, stranger = client(), client(), client()
        uid = login(elder, '13800880001', 'elder'); login(child, '13800880002', 'child'); login(stranger, '13800880003', 'child')
        code = api(elder, '/family/invite', {'role': 'elder'})[1]['code']
        family = api(child, '/family/join', {'code': code})[1]['id']
        api(elder, '/family/' + family, {'status': 'bound', 'profile_allowed': True, 'records_allowed': False}, 'PATCH')
        check(api(child, '/shared-profile?elder=' + uid)[1]['profile']['diseases'] == ['高血压'], '只授权资料可以独立读取')
        check(api(child, '/records?elder=' + uid)[0] == 403, '独立资料授权不会放开记录')
        check(api(stranger, '/shared-profile?elder=' + uid)[0] == 403, '无关账号不能读取资料')
        photo = 'data:image/png;base64,' + base64.b64encode(b'isolated-photo').decode()
        for index in range(103):
            api(elder, '/records', {'record': {'id': f'fix-{index}', 'at': app.timestamp(), 'photoDataUrl': photo, 'label': {'ingredientText': '小麦粉', 'rawText': 'unneeded-ocr', 'ocrRows': ['big']}, 'aiAnalysis': {'recommendation': 'moderate'}, 'assessment': {'level': 'gray'}}})
        api(elder, '/family/' + family, {'records_allowed': True}, 'PATCH')
        first = api(child, '/records?elder=' + uid + '&compact=1&limit=50')[1]
        check(len(first['records']) == 50 and first['nextOffset'] == 50, '记录按页返回')
        check('base64,' not in json.dumps(first) and 'unneeded-ocr' not in json.dumps(first), '列表响应不含照片和原始OCR')
        unchanged = api(child, '/records?elder=' + uid + '&compact=1&ifVersion=' + first['version'])[1]
        check(unchanged == {'unchanged': True, 'version': first['version']}, '未变化轮询只返回版本标记')
        pages = list(first['records']); offset = first['nextOffset']
        while offset is not None:
            page = api(child, '/records?elder=' + uid + '&compact=1&limit=50&offset=' + str(offset))[1]
            pages.extend(page['records']); offset = page['nextOffset']
        check(len({r['id'] for r in pages}) == 103, '分页完整无重复')
        source = first['records'][0]['photoDataUrl'][4:]
        check(api(child, source)[1]['photoDataUrl'] == photo, '照片按需读取')
        check(api(stranger, source)[0] == 403, '照片接口检查调用者权限')
        audio = 'data:audio/wav;base64,' + base64.b64encode(b'isolated-audio').decode()
        voice = api(child, '/voices', {'recipient': uid, 'duration': 1, 'audioDataUrl': audio})[1]['id']
        metadata = api(elder, '/voices?metadata=1')[1]
        check('base64,' not in json.dumps(metadata), '语音轮询不传完整音频')
        audio_path = metadata['messages'][0]['audioDataUrl'][4:]
        check(api(elder, audio_path)[1]['audioDataUrl'] == audio, '播放前按需读取真实录音')
        check(api(stranger, audio_path)[0] == 403, '无关账号不能下载音频')
        receipt = api(elder, '/voices/' + voice + '/receipt', {'played': False, 'metadata': True})[1]
        check(receipt['message']['deliveredAt'] and not receipt['message']['playedAt'] and 'base64,' not in json.dumps(receipt), '轻量送达回执不冒充播放且不传音频')
        check(api(child, '/voices')[1]['messages'][0]['audioDataUrl'] == audio, '旧语音接口保持兼容')
        check(api(elder, '/records')[1]['records'][0]['photoDataUrl'] == photo, '旧记录接口保持完整数据兼容')
        api(elder, '/family/' + family, {'profile_allowed': False}, 'PATCH')
        check(api(child, '/shared-profile?elder=' + uid)[0] == 403, '撤销资料授权立即生效')
        changed = api(child, '/records?elder=' + uid + '&compact=1&ifVersion=' + first['version'])[1]
        check(not changed.get('unchanged') and all('aiAnalysis' not in r for r in changed['records']), '资料授权变化使旧版本失效并清除分析')
        api(elder, '/family/' + family, {'records_allowed': False}, 'PATCH')
        check(api(child, source)[0] == 403 and api(child, '/records?elder=' + uid + '&compact=1&ifVersion=' + first['version'])[0] == 403, '撤权后照片及版本检查都拒绝')
        api(elder, '/family/' + family, None, 'DELETE')
        check(api(child, audio_path)[0] == 403, '解绑后拒绝历史录音下载')
        check(api(child, '/auth/logout', {})[0] == 200 and api(child, '/auth/logout', {})[0] == 200, '退出接口幂等，过期或无会话也可退出')
    finally:
        server.shutdown(); server.server_close(); thread.join()
print(f'{checks} version-fix checks passed; isolated data, no model calls.')
