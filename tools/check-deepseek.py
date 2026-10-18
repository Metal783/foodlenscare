"""Isolated API/unit checks. All upstream calls mocked, no real key or provider usage."""
import http.cookiejar
import importlib.util
import io
import json
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
import deepseek_analysis as ai

spec = importlib.util.spec_from_file_location('family_server', Path(__file__).parent / 'family_server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
checks = 0


def check(value, name):
    global checks
    assert value, name
    checks += 1
    print('PASS ' + name)


def failure(action, code):
    try:
        action()
    except ai.AnalysisError as error:
        return error.status == code and 'test-secret' not in error.message
    return False


sample = {'recommendation': 'not_recommended', 'summary': '含花生，与已填写的过敏原相符，不建议食用。', 'considerations': ['存在本人过敏风险。'], 'uncertainties': ['未提供糖含量。']}
label = {'productName': '测试食品', 'ingredientText': '花生、牛奶。电话13800138000',
         'nutritionPerServing': {'sodium': 300, 'sugar': None, 'fat': -1, 'extra': 999}, 'confidence': {'sodium': .95}, 'declaredPer': 'perServing', 'rawText': '私人文字'}
health = {'name': '私人姓名', 'phone': '13800138000', 'diseases': ['高血压'], 'allergens': ['花生']}
data = ai.evidence(label, health)
serialized = json.dumps(data, ensure_ascii=False)
check('私人' not in serialized and '13800138000' not in serialized, '请求剔除姓名、手机号、原始OCR')
check(data['food']['nutritionCandidates'] == {'sodium': 300}, '缺失值不补零，剔除负值和未知营养字段')
check(data['food']['nutritionBasis'] == 'perServing' and data['food']['nutritionUnits']['sodium'] == 'mg', '保留营养计量基础和单位')
check(ai.evidence(label, {**health, 'allergens': ['其他'], 'allergenOther': '芝麻', 'diseaseOther': '其他已填写疾病'})['healthSettings']['allergens'] == ['芝麻'], '其他过敏原取用户实际填写内容')
check('尚未注明' in str(ai.evidence(label, {'allergens': ['其他']})['healthSettings']), '未注明的其他过敏原不当作无过敏')
check(failure(lambda: ai.evidence({'ingredientText': ''}, health), 400), '无配料不发起分析')
check(failure(lambda: ai.evidence({'ingredientText': 'x' * 6001}, health), 400), '拒绝超长输入')
check(failure(lambda: ai.evidence(label, {'allergens': 'wrong'}), 400), '拒绝无效健康资料')


def response(content=sample, reason='stop'):
    return io.BytesIO(json.dumps({'choices': [{'finish_reason': reason, 'message': {'content': json.dumps(content)}}]}).encode())


with patch.object(ai.urllib.request, 'build_opener') as builder:
    opener = builder.return_value
    opener.open.return_value = response()
    result = ai.request_model('test-secret', 'deepseek-flash', data)
    request = opener.open.call_args.args[0]
    payload = json.loads(request.data)
    check(payload['thinking'] == {'type': 'disabled'} and payload['max_tokens'] >= 2000, '关闭默认思考并保留足够正文输出预算')
    check(request.full_url == ai.ENDPOINT and payload['response_format'] == {'type': 'json_object'}, '官方HTTPS端点、非流式JSON输出')
    check(result['provider'] == 'DeepSeek' and result['summary'] == sample['summary'] and result['generatedAt'], '结构化结果含模型来源与生成时间')
    check(result['formatVersion'] == 2, '五项结构带版本标记，旧记录不伪造新内容')
    insight = {'nutrient': 'sodium', 'condition': '高血压', 'explanation': '结合当天其他食物关注钠摄入。', 'value': 99999}
    opener.open.return_value = response({**sample, 'considerations': ['选择不含本人过敏原的同类食品。'], 'nutritionAnalysis': [insight]})
    enriched = ai.request_model('test-secret', 'deepseek-flash', data)
    item = enriched['nutritionAnalysis'][0]
    check(item['value'] == 300 and item['unit'] == 'mg' and item['basis'] == '每份', '营养含量单位和口径取OCR证据，不接受模型自填数值')
    check(enriched['considerations'] == ['选择不含本人过敏原的同类食品。'] and enriched['uncertainties'] == sample['uncertainties'], '具体建议与信息不足独立保留')
    for changes, test_data, message in [
        ({'nutrient': 'sugar'}, data, '没有识别到糖数值不展示糖的定量分析'),
        ({'condition': '糖尿病'}, data, '不分析本人没有填写的疾病'),
        ({'explanation': '超过2000毫克上限'}, data, '不接受模型新编数字或营养阈值'),
        ({}, {**data, 'healthSettings': {**data['healthSettings'], 'diseases': []}}, '没有相关疾病时不强行输出营养分析'),
        ({}, {**data, 'food': {**data['food'], 'nutritionBasis': 'unknown'}}, '计量基础不明时不定量解释营养'),
    ]:
        opener.open.return_value = response({**sample, 'nutritionAnalysis': [{**insight, **changes}]})
        check(ai.request_model('test-secret', 'deepseek-flash', test_data)['nutritionAnalysis'] == [], message)
    zero_data = {**data, 'food': {**data['food'], 'nutritionCandidates': {'sodium': 0}}}
    opener.open.return_value = response({**sample, 'nutritionAnalysis': [insight]})
    check(ai.request_model('test-secret', 'deepseek-flash', zero_data)['nutritionAnalysis'][0]['value'] == 0, '实际识别到零值仍保留，缺失不当成零')
    for content, reason, name in [({}, 'stop', '拒绝缺字段'), (sample, 'length', '拒绝截断结果'), ({**sample, 'recommendation': 'safe'}, 'stop', '拒绝不受支持的安全保证结论')]:
        opener.open.return_value = response(content, reason)
        check(failure(lambda: ai.request_model('test-secret', 'm', data), 502), name)
    for code, expected in [(401, 503), (402, 503), (429, 429), (500, 502), (302, 502)]:
        opener.open.side_effect = urllib.error.HTTPError(ai.ENDPOINT, code, 'test-secret', {}, None)
        check(failure(lambda: ai.request_model('test-secret', 'm', data), expected), f'上游HTTP{code}安全提示不泄密')
    opener.open.side_effect = TimeoutError()
    check(failure(lambda: ai.request_model('test-secret', 'm', data), 504), '超时保留本地结果提示')
    opener.open.side_effect = urllib.error.URLError('test-secret')
    check(failure(lambda: ai.request_model('test-secret', 'm', data), 503), '网络失败不泄漏原始错误')

with tempfile.TemporaryDirectory(prefix='flc-ai-') as folder, patch.object(ai, 'configuration', return_value=('', 'deepseek-flash')):
    server = app.create_server(port=0, database=Path(folder) / 'isolated.sqlite3')
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/api'
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None, headers=None):
        request = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json', **(headers or {})}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)
    def login(c, phone, role):
        _, code = api(c, '/auth/code', {'phone': phone})
        api(c, '/auth/login', {'phone': phone, 'code': code['testCode']})
        return api(c, '/me', {'role': role, 'profile': health}, 'PATCH')[1]['user']['id']
    try:
        elder, child, stranger = client(), client(), client()
        uid = login(elder, '13800610001', 'elder')
        login(child, '13800610002', 'child')
        check(api(stranger, '/analysis/status')[0] == 401, '匿名不能探测分析配置')
        check(api(child, '/analysis', {'consent': True, 'label': label})[0] == 403, '子女不能代替老人提交健康分析')
        check(api(elder, '/analysis/status')[1] == {'configured': False, 'provider': 'DeepSeek'}, '无密钥只返回未启用，不泄漏配置')
        check(api(elder, '/analysis', {'label': label})[0] == 400, '未明确同意不调用')
        check(api(elder, '/analysis', {'consent': True, 'label': label})[0] == 503, '未配置密钥如实提示')
        check(api(elder, '/analysis', {'automatic': True, 'consent': True, 'label': label})[0] == 403, '自动调用必须先取得持久授权')
        api(elder, '/me', {'prefs': {'smartAnalysisConsent': 'deepseek-v1'}}, 'PATCH')
        with patch.object(ai, 'configuration', return_value=('test-secret', 'deepseek-flash')), patch.object(ai, 'request_model', return_value={**sample, 'provider': 'DeepSeek', 'model': 'deepseek-flash', 'generatedAt': 'test'}) as upstream:
            code, value = api(elder, '/analysis', {'automatic': True, 'consent': True, 'label': label, 'profile': {'diseases': ['假档案']}})
            check(code == 200 and value['analysis']['provider'] == 'DeepSeek', '授权后真实路由使用上游结果（测试桩）')
            sent = upstream.call_args.args[2]
            check(sent['healthSettings']['diseases'] == ['高血压'] and '假档案' not in str(sent), '健康信息只取当前本人服务端档案')
            check(api(elder, '/analysis', {'consent': True, 'label': label})[0] == 429 and upstream.call_count == 1, '重复点击限流避免重复付费')
        api(elder, '/me', {'prefs': {'smartAnalysisConsent': ''}}, 'PATCH')
        check(api(elder, '/analysis', {'automatic': True, 'consent': True, 'label': label})[0] == 403, '关闭设置后服务端立即拒绝自动调用')
        check(api(elder, '/analysis', {'consent': True, 'label': label}, headers={'Origin': 'http://evil.invalid'})[0] == 403, '保留跨源请求限制')
        record = {'id': 'ai-test', 'aiAnalysis': {**sample, 'provider': 'DeepSeek'}, 'assessment': {'level': 'red'}, 'profileSnapshot': health}
        api(elder, '/records', {'record': record})
        check(api(elder, '/records')[1]['records'][0]['aiAnalysis']['summary'] == sample['summary'], '手动保存后本人历史保留AI结果')
        _, invite = api(elder, '/family/invite', {})
        _, relation = api(child, '/family/join', {'code': invite['code']})
        api(elder, '/family/' + relation['id'], {'status': 'bound', 'records_allowed': True, 'profile_allowed': False}, 'PATCH')
        shared = api(child, '/records?elder=' + uid)[1]['records'][0]
        check('aiAnalysis' not in shared and 'profileSnapshot' not in shared, '仅记录授权不能读取AI病史解释')
        api(elder, '/family/' + relation['id'], {'profile_allowed': True}, 'PATCH')
        check(api(child, '/records?elder=' + uid)[1]['records'][0]['aiAnalysis']['summary'] == sample['summary'], '双重授权才可共享个性化分析')
        api(elder, '/family/' + relation['id'], {'profile_allowed': False}, 'PATCH')
        check('aiAnalysis' not in api(child, '/records?elder=' + uid)[1]['records'][0], '撤销资料授权立即移除AI内容')
    finally:
        server.shutdown()
        server.server_close()

print(f'DeepSeek isolation checks: {checks} passed; zero external API calls.')
