"""Isolated record review / care draft checks; no real provider calls."""
import http.cookiejar
import json
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from unittest.mock import patch
import deepseek_analysis as ai
import record_insights as insights
import diet_index
import family_server as app

checks = 0
def check(value, label):
    global checks
    assert value, label
    checks += 1; print('PASS ' + label)

def record(identifier, at, ingredient='小麦粉、白砂糖、食盐', **extra):
    return {'id': identifier, 'at': at, 'productName': '测试食品', 'origin': 'album', 'label': {'ingredientText': ingredient, 'nutritionPer100g': {'sugar': 0, 'sodium': 220}, 'confidence': {'sugar': .95, 'sodium': .1}, 'declaredPer': 'per100g', 'servingLabel': '每100克'}, **extra}

source = [record('first', '2026-10-10T16:00:00Z'), record('last', '2026-10-17T15:59:59Z'), record('old', '2026-10-10T15:59:59Z'), record('future', '2026-10-17T16:00:00Z'), record('demo', '2026-10-17T00:00:00Z', origin='demo'), record('broken', 'wrong'), record('no-label', '2026-10-16T18:00:00Z', '')]
digest = insights.digest(source, date(2026, 10, 17))
check(digest['summary']['recordCount'] == 3 and digest['summary']['dayCount'] == 2, '上海日期边界与7天范围正确')
check(digest['summary']['undatedCount'] == 1, '无有效日期的历史单独说明，不混入近7天')
check(digest['summary']['readableCount'] == 2 and digest['summary']['unreadableCount'] == 1, '缺配料记录如实计为待补拍')
check(digest['summary']['nutritionCoverage']['sugar'] == 2 and digest['summary']['nutritionCoverage']['sodium'] == 0, '真实零值保留，低置信字段不计为可用')
check(next(c for c in digest['summary']['clues'] if c['key'] == 'sugar')['count'] == 2, '线索按标签次数计，不当作食用次数')
many = insights.digest([record(str(i), '2026-10-17T00:00:00Z') for i in range(37)], date(2026, 10, 17))
check(many['summary']['recordCount'] == 37 and len(many['samples']) == 30, '完整统计与模型样本上限分别保留')
check(not any(c['count'] for c in insights.digest([record('polyol', '2026-10-17T00:00:00Z', '赤藓糖醇')], date(2026, 10, 17))['summary']['clues']), '糖醇不误计为糖类配料')
check(insights.digest(source, date(2026, 10, 17))['version'] == digest['version'], '同一数据摘要版本稳定')
check(insights.digest(source[:-1], date(2026, 10, 17))['version'] != digest['version'], '删改记录使摘要版本变化')
three = insights.digest(source + [record('extra', '2026-10-15T10:00:00Z')], date(2026, 10, 17), days=3)
check(three['summary']['days'] == 3 and len(three['summary']['dayBreakdown']) == 3, '三天范围包含逐日分布且天数正确')
check(sum(day['count'] for day in three['summary']['dayBreakdown']) == 3 and three['summary']['dayBreakdown'][-1]['count'] == 2, '逐日分布按上海日期计数且保留空缺日')
check(three['summary']['index']['score'] is not None and three['summary']['index']['label'] != '数据不足，暂不评分', '三天摘要包含可计算的饮食健康指数')
low = diet_index.evaluate(7, 4, 4, 4, [{'sugar': 2, 'sodium': 80, 'fat': 2}] * 4)
check(low['sufficient'] and low['score'] >= 80 and low['level'] == 'good', '低糖低钠低脂标签得到较高参考分')
low_clue = diet_index.evaluate(7, 4, 4, 4, [{'sugar': 2, 'sodium': 80, 'fat': 2}] * 4, {'sugar': 4, 'salt': 4, 'oil': 4})
check(low_clue['score'] < low['score'], '重复糖盐油配料线索会降低参考分')
high = diet_index.evaluate(7, 4, 4, 4, [{'sugar': 30, 'sodium': 700, 'fat': 20}] * 4)
check(high['sufficient'] and high['score'] < 50 and high['level'] == 'attention', '高糖高钠高脂标签得到较低参考分')
missing = diet_index.evaluate(7, 4, 4, 4, [{}, {}, {}, {}])
check(not missing['sufficient'] and missing['score'] is None and missing['label'] == '数据不足，暂不评分', '缺少可靠营养字段时不强行评分')
check('健康' not in low['label'] and '健康' not in high['label'], '指数文案不冒充健康诊断')
sample = {'answer': '最近看过的食品包装，可以一起核对完整配料。也记得照顾好自己，有空聊聊天。', 'details': ['这份整理只反映保存的识别记录。'], 'followUps': []}
diet_sample = {'answer': '这段时间保存的包装里，糖和盐的线索都有出现，记录也有空缺；可以一起核对。',
               'observations': ['糖类配料线索出现在部分标签中。', '有几天没有保存记录，不能当作没有吃。'],
               'suggestions': ['下次买同类食品时一起看配料表。', '可以请老人补拍看不清的包装。'],
               'questions': ['最近哪几款包装最常买？', '哪几天方便一起看标签？']}
with tempfile.TemporaryDirectory(prefix='flc-insights-') as temp:
    server = app.create_server(port=0, database=Path(temp) / 'test.sqlite3')
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    def client(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c, path, body=None, method=None, headers=None):
        request = urllib.request.Request(origin + '/api' + path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json', **(headers or {})}, method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as response: return response.status, json.load(response)
        except urllib.error.HTTPError as error: return error.code, json.load(error)
    def login(c, phone, role):
        code = api(c, '/auth/code', {'phone': phone})[1]['testCode']; user = api(c, '/auth/login', {'phone': phone, 'code': code})[1]['user']
        api(c, '/me', {'role': role, 'profile': {'name': '私人姓名', 'phone': phone, 'diseases': ['私人疾病'], 'allergens': ['私人过敏']}}, 'PATCH')
        return user['id']
    try:
        elder, child, stranger, empty, anonymous = client(), client(), client(), client(), client()
        uid = login(elder, '13800930001', 'elder'); cid = login(child, '13800930002', 'child'); login(stranger, '13800930003', 'child'); empty_id = login(empty, '13800930004', 'elder')
        check(api(elder, '/records', {'record': record('actual', app.timestamp(), photoDataUrl='data:image/png;base64,cHJpdmF0ZS1waG90bw==', aiAnalysis={'secret': '私人分析'}, assessment={'level': 'red'}, profileSnapshot={'secret': '私人画像'})})[0] == 200, '保存隔离食品记录用于回顾')
        request = {'elder': uid, 'mode': 'review', 'consent': True, 'stats': {'recordCount': 999}, 'profile': {'diseases': ['伪造档案']}}
        check(api(anonymous, '/record-insights?elder=' + uid)[0] == 401, '匿名不能读取摘要')
        check(api(stranger, '/record-insights?elder=' + uid)[0] == 403, '无关账号不能读取摘要')
        check(api(elder, '/record-insights', {**request, 'consent': False})[0] == 400, '本人主动同意才调用模型')
        check(api(elder, '/record-insights', {**request, 'mode': 'care'})[0] == 403, '关怀草稿由子女端发起')
        check(api(elder, '/record-insights', request, headers={'Origin': 'http://evil.invalid'})[0] == 403, '禁止跨来源调用')
        invitation = api(elder, '/family/invite', {})[1]['code']; family = api(child, '/family/join', {'code': invitation})[1]['id']
        api(elder, '/family/' + family, {'status': 'bound', 'records_allowed': True, 'profile_allowed': True}, 'PATCH')
        check(api(child, '/record-insights?elder=' + uid)[0] == 403, '绑定和原资料共享不自动授权第三方整理')
        api(child, '/me', {'prefs': {'familyAssistantConsent': insights.FAMILY_AI_CONSENT}}, 'PATCH')
        check(api(child, '/record-insights?elder=' + uid)[0] == 403, '子女不能替老人开启新授权')
        api(elder, '/me', {'prefs': {'familyAssistantConsent': insights.FAMILY_AI_CONSENT}}, 'PATCH')
        api(elder, '/family/' + family, {'profile_allowed': False}, 'PATCH')
        check(api(child, '/record-insights?elder=' + uid)[0] == 200, '老人单独允许后，只共享记录也能整理非健康摘要')
        check(api(child, '/record-insights?elder=' + uid + '&days=3')[1]['summary']['days'] == 3, '可按三天范围读取摘要')
        check('index' in api(child, '/record-insights?elder=' + uid + '&days=3')[1]['summary'], '摘要包含饮食健康指数对象')
        check(api(child, '/record-insights?elder=' + uid + '&days=5')[0] == 400, '拒绝不支持的分析天数')
        check(api(child, '/family')[1]['families'][0]['member']['familyAiAllowed'], '家庭摘要可见老人授权状态')
        with patch.object(ai, 'configuration', return_value=('', 'test-model')), patch.object(ai, 'request_assistant_json') as cloud:
            check(api(elder, '/record-insights?elder=' + uid)[1]['summary']['recordCount'] == 1 and not cloud.called, '查看摘要不调用模型')
            check(api(elder, '/record-insights', request)[0] == 503, '没有密钥保留摘要并如实提示')
        with patch.object(ai, 'configuration', return_value=('test-secret', 'test-model')), patch.object(ai, 'request_assistant_json', return_value=sample) as cloud:
            def ask(c=elder, body=None, caller=uid):
                ai._recent.pop('assistant:' + caller, None)
                return api(c, '/record-insights', body or request)
            status, value = ask()
            check(status == 200 and value['summary']['recordCount'] == 1, '统计只取服务端记录，忽略客户端伪造次数')
            payload = cloud.call_args.args[3]; serialized = json.dumps(payload, ensure_ascii=False)
            check(payload['recordsOnly'] and all(s not in serialized for s in ('私人姓名', '13800930001', '私人疾病', '私人过敏', '私人分析', '私人画像', 'data:image/', '伪造档案', uid)), '模型仅收到最小化食品事实，不含健康资料及账号照片')
            check(api(elder, '/record-insights', request)[0] == 429, '本人请求限流')
            check(ask(child, {**request, 'mode': 'care', 'tone': 'warm'}, cid)[0] == 200 and cloud.call_args.args[3]['tone'] == '亲切问候', '子女按语气生成草稿，不自动发送')
            check(not api(child, '/voices')[1]['messages'], '生成草稿不写入语音或回执')
            diet_request = {'elder': uid, 'mode': 'diet', 'days': 3, 'consent': True}
            cloud.return_value = diet_sample
            status, value = ask(child, diet_request, cid)
            check(status == 200 and value['result']['observations'] and value['result']['suggestions'] and value['result']['questions'], '子女按范围生成饮食观察分析')
            payload = cloud.call_args.args[3]
            check(payload['mode'] == 'diet' and payload['days'] == 3 and payload['stats']['days'] == 3 and len(payload['stats']['dayBreakdown']) == 3, '饮食分析使用所选范围和逐日统计')
            check(payload['stats']['index']['basis']['days'] == 3, '饮食分析向模型提供程序计算的参考指数')
            serialized = json.dumps(payload, ensure_ascii=False)
            check(all(s not in serialized for s in ('私人姓名', '13800930001', '私人疾病', '私人过敏', uid)), '饮食分析不发送健康档案与账号信息')
            check(ask(elder, diet_request, uid)[0] == 403, '饮食观察分析仅子女端生成')
            check(ask(child, {**diet_request, 'days': 5}, cid)[0] == 400, '饮食分析拒绝不支持的天数')
            cloud.return_value = {**diet_sample, 'answer': '本周有12条识别记录，糖和盐都出现了。'}
            check(ask(child, diet_request, cid)[0] == 502, '拒绝饮食分析中的未经核对数字')
            cloud.return_value = {**diet_sample, 'answer': '老人最近吃得太咸，饮食不健康。'}
            check(ask(child, diet_request, cid)[0] == 502, '拒绝把识别记录误写为实际食用或健康判断')
            cloud.return_value = sample
            check(ask(body={**request, 'mode': 'wrong'})[0] == 400, '拒绝未知任务')
            check(ask(child, {**request, 'mode': 'care', 'tone': 'injected'}, cid)[0] == 400, '拒绝未知语气或注入指令')
            check(ask(empty, {**request, 'elder': empty_id}, empty_id)[0] == 400, '没有记录不生成假回顾')
            # An empty selected elder may still receive a generic non-factual greeting.
            api(elder, '/records/actual', None, 'DELETE')
            check(ask(child, {**request, 'mode': 'care'}, cid)[0] == 200 and cloud.call_args.args[3]['stats']['recordCount'] == 0, '无记录关怀仅使用空摘要生成通用问候')
            api(elder, '/records', {'record': record('actual', app.timestamp())})
            cloud.return_value = {**sample, 'answer': '您最近吃了太多，摄入超标。'}
            check(ask()[0] == 502, '拒绝将识别记录误写为食用或超标')
            cloud.return_value = sample
            def revoke(*args):
                api(elder, '/me', {'prefs': {'familyAssistantConsent': ''}}, 'PATCH')
                return sample
            cloud.side_effect = revoke
            check(ask(child, {**request, 'mode': 'care'}, cid)[0] == 403, '模型处理中撤销授权，不再返回生成结果')
            cloud.side_effect = None
            api(elder, '/me', {'prefs': {'familyAssistantConsent': insights.FAMILY_AI_CONSENT}}, 'PATCH')
            def changed(*args):
                api(elder, '/records', {'record': record('new', app.timestamp())})
                return sample
            cloud.side_effect = changed
            check(ask()[0] == 409, '处理中记录变化拒绝过期报告')
            cloud.side_effect = None
            api(elder, '/family/' + family, {'records_allowed': False}, 'PATCH')
            check(api(child, '/record-insights?elder=' + uid)[0] == 403 and ask(child, {**request, 'mode': 'care'}, cid)[0] == 403, '关闭记录共享后摘要和生成都拒绝')
    finally:
        server.shutdown(); server.server_close(); thread.join()
print(f'{checks} record-insight checks passed; no real model calls.')
