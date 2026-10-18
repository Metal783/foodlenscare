"""Food assistant checks with an isolated database and a mocked provider only."""
import base64
import http.cookiejar
import io
import json
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
import deepseek_analysis as ai
import food_assistant as assistant
import family_server as app

checks = 0
def check(value, label):
    global checks
    assert value, label
    checks += 1
    print('PASS ' + label)

label = {'productName': '测试甲', 'ingredientText': '小麦粉、食盐', 'declaredPer': 'per100g', 'servingLabel': '每100克',
         'nutritionPer100g': {'sodium': 200, 'sugar': 0}, 'confidence': {'sodium': .99, 'sugar': .9}, 'rawText': '原始个人文字', 'photoDataUrl': 'private-photo'}
health = {'diseases': ['高血压'], 'allergens': []}
first = ai.evidence(label, health)['food']
second = ai.evidence({**label, 'declaredPer': 'perServing', 'servingLabel': '每份（50g）', 'nutritionPerServing': {'sodium': 100, 'sugar': 0}}, health)['food']
rows = assistant.comparison(first, second)
check(all(r['comparable'] and r['first'] == r['second'] for r in rows), '每份明确重量统一换算，保留零值')
other_unit = ai.evidence({**label, 'servingLabel': '每100毫升'}, health)['food']
check(not any(r['comparable'] for r in assistant.comparison(first, other_unit)), '克与毫升不直接排名')
unknown = ai.evidence({**label, 'declaredPer': 'perServing', 'servingLabel': '每份', 'nutritionPerServing': {'sodium': 100}}, health)['food']
check(not any(r['comparable'] for r in assistant.comparison(first, unknown)), '每份无重量不换算')
missing = ai.evidence({**label, 'nutritionPer100g': {'sodium': 100}}, health)['food']
check(next(r for r in assistant.comparison(first, missing) if r['nutrient'] == 'sugar')['second'] is None, '缺失不补零')
check(assistant.allergy_hits({'ingredientText': '乳粉、芝麻、小麦粉', 'allergenDeclaration': ''}, {'allergens': ['牛奶', '芝麻']}) == ['牛奶', '芝麻'], '词典别名和自填过敏原共同生效')
sample = {'answer': '请先核对标签口径和配料，再结合您的饮食安排判断。', 'details': ['缺少字段不能当作没有该成分。'], 'followUps': ['哪些信息还需要核对？']}
for malformed in ({}, {**sample, 'answer': '含钠999mg'}, {**sample, 'details': ['https://fake.invalid']}, {**sample, 'followUps': ['x'] * 4}):
    try: assistant.validate_answer(malformed); valid = True
    except ai.AnalysisError: valid = False
    check(not valid, '拒绝无效回答、模型新编数字或链接')
provider = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(sample)}}]}
with patch.object(ai.urllib.request, 'build_opener') as factory:
    factory.return_value.open.return_value = io.BytesIO(json.dumps(provider).encode())
    check(ai.request_assistant_json('test-secret', 'test-model', assistant.SYSTEM, {'question': '测试'}) == sample, 'JSON传输解析真实结构')
    request = factory.return_value.open.call_args.args[0]
    check(request.full_url == ai.ENDPOINT and json.loads(request.data)['stream'] is False, '复用官方端点及非流式JSON')

with tempfile.TemporaryDirectory(prefix='flc-assistant-') as temp:
    server = app.create_server(port=0, database=Path(temp) / 'test.sqlite3')
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    def client(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None, headers=None):
        request = urllib.request.Request(origin + '/api' + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json', **(headers or {})}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as response: return response.status, json.load(response)
        except urllib.error.HTTPError as error: return error.code, json.load(error)
    def login(c, phone, role):
        code = api(c, '/auth/code', {'phone': phone})[1]['testCode']; user = api(c, '/auth/login', {'phone': phone, 'code': code})[1]['user']
        api(c, '/me', {'role': role, 'profile': {'name': '私人姓名', 'birthDate': '1958-01-01', 'phone': phone, **health}}, 'PATCH')
        return user['id']
    try:
        elder, child, other, anonymous = client(), client(), client(), client()
        uid = login(elder, '13800910001', 'elder'); login(child, '13800910002', 'child'); other_id = login(other, '13800910003', 'elder')
        body = {'mode': 'ask', 'question': '为什么这样建议？', 'label': label, 'consent': True, 'profile': {'diseases': ['伪造疾病']}}
        check(api(anonymous, '/food-assistant', body)[0] == 401, '匿名不能调用食品助手')
        check(api(child, '/food-assistant', body)[0] == 403, '子女不能代调或传入别人资料')
        check(api(elder, '/food-assistant', {**body, 'consent': False})[0] == 400, '单独同意后才发送问题与健康资料')
        check(api(elder, '/food-assistant', {**body, 'question': ''})[0] == 400, '空问题不调用')
        check(api(elder, '/food-assistant', {**body, 'mode': 'unknown'})[0] == 400, '拒绝不支持的任务')
        check(api(elder, '/food-assistant', body, headers={'Origin': 'http://evil.invalid'})[0] == 403, '跨源请求被拒绝')
        with patch.object(ai, 'configuration', return_value=('', 'test-model')):
            check(api(elder, '/food-assistant', body)[0] == 503, '没有密钥如实提示不可用')
        with patch.object(ai, 'configuration', return_value=('test-secret', 'test-model')), patch.object(ai, 'request_assistant_json', return_value=sample) as upstream:
            def ask(c=elder, value=None, owner=uid):
                ai._recent.pop('assistant:' + owner, None)
                return api(c, '/food-assistant', value or body)
            status, result = ask()
            check(status == 200 and result['result']['turnsRemaining'] == 5, '问题得到结构化回答与对话编号')
            context = upstream.call_args.args[3]
            check(context['healthSettings']['diseases'] == ['高血压'] and '伪造疾病' not in str(context), '健康信息只取当前本人服务端档案')
            check(all(text not in json.dumps(context, ensure_ascii=False) for text in ('私人姓名', '13800910001', '1958-01-01', 'private-photo', '原始个人文字')), '请求剔除姓名生日号码照片和原始OCR')
            check(api(elder, '/food-assistant', body)[0] == 429, '频繁请求限流')
            token = result['result']['conversationId']
            check(ask(value={**body, 'question': '刚才说的口径是什么意思？', 'conversationId': token})[0] == 200 and len(upstream.call_args.args[3]['history']) == 1, '连续追问保留服务器历史上下文')
            check(ask(other, {**body, 'conversationId': token}, other_id)[0] == 409, '对话不能跨账号使用')
            check(ask(value={**body, 'label': {**label, 'ingredientText': '另一款配料'}, 'conversationId': token})[0] == 409, '食品变化不能沿用旧对话')
            claim = {**body, 'mode': 'claims', 'question': '无蔗糖是什么意思？'}
            check(ask(value=claim)[0] == 200 and upstream.call_args.args[3]['mode'] == 'claims', '包装说法任务传入具体用户问题')
            for mode in ('shopping', 'pairing'):
                value = {**body, 'mode': mode, 'question': '希望准备简单一些，请给出核对方向。', 'preference': '不应作为额外字段发送'}
                check(api(child, '/food-assistant', value)[0] == 403 and api(elder, '/food-assistant', {**value, 'consent': False})[0] == 400, mode + '仅限老人本人且另行同意')
                code, planned = ask(value=value)
                context = upstream.call_args.args[3]
                check(code == 200 and context['mode'] == mode and len(context['foods']) == 1 and context['question'] == value['question'], mode + '任务明确且只围绕当前食品')
                check(context['healthSettings']['diseases'] == health['diseases'] and 'preference' not in context, mode + '不接受额外资料/偏好字段替换档案')
                check(bool(planned['result']['taskNotes']) and not planned['result']['comparison'], mode + '程序提供用途限制，不产生虚假比较')
                check(ask(value={**body, 'conversationId': planned['result']['conversationId']})[0] == 409, mode + '对话不能与其他任务混用')
            api(other, '/records', {'record': {'id': 'other-record', 'label': label}})
            check(ask(value={**body, 'mode': 'compare', 'secondRecordId': 'other-record'})[0] == 403, '不能通过记录编号读取他人食品')
            saved_label = {**label, 'productName': '测试乙', 'nutritionCandidates': {'sodium': {'confidence': .99}, 'sugar': {'confidence': .99}}}
            api(elder, '/records', {'record': {'id': 'own-second', 'label': saved_label}})
            code, compared = ask(value={**body, 'mode': 'compare', 'secondRecordId': 'own-second', 'secondLabel': {'ingredientText': '伪造配料'}})
            check(code == 200 and upstream.call_args.args[3]['foods'][1]['productName'] == '测试乙', '历史对比食品来自服务端本人记录，不信任替换字段')
            check(next(row for row in compared['result']['comparison'] if row['nutrient'] == 'sodium')['first'] == 200, '比较数值由程序生成，不由模型填写')
            allergy = {**body, 'label': {**label, 'ingredientText': '花生、小麦粉'}}
            api(elder, '/me', {'profile': {**health, 'allergens': ['花生']}}, 'PATCH')
            upstream.return_value = {**sample, 'answer': '可以少量尝试。'}
            allergy_response = ask(value=allergy)[1]['result']
            check('少量尝试' not in allergy_response['answer'] and allergy_response['safetyNotes'], '本人过敏规则覆盖模型宽松建议')
            for mode in ('shopping', 'pairing'):
                reply = ask(value={**allergy, 'mode': mode})[1]['result']
                check(reply['safetyNotes'] and '少量尝试' not in str(reply) and reply['taskNotes'], mode + '不能通过替代或搭配绕过本人过敏提醒')
            api(elder, '/me', {'profile': health}, 'PATCH'); upstream.return_value = sample
            expire_token = ask()[1]['result']['conversationId']; assistant._conversations[expire_token]['updated'] -= assistant.CONVERSATION_TTL + 1
            check(ask(value={**body, 'conversationId': expire_token})[0] == 409, '到期对话不能继续')
            six = ''
            for _ in range(6): six = ask(value={**body, 'conversationId': six})[1]['result']['conversationId']
            check(ask(value={**body, 'conversationId': six})[0] == 409, '每轮限制追问次数')
            api(elder, '/auth/logout', {})
            check(not any(v['uid'] == uid for v in assistant._conversations.values()), '退出清除本人临时对话')
    finally:
        server.shutdown(); server.server_close(); thread.join()
print(f'{checks} food-assistant checks passed; zero real model calls.')
