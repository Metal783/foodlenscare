"""第四版新增接口回归，使用临时数据库与三个独立会话。"""
import importlib.util
import json
import tempfile
import threading
import urllib.request
import urllib.error
import http.cookiejar
import sqlite3
import time
from contextlib import closing
from pathlib import Path

spec=importlib.util.spec_from_file_location('family_server',Path(__file__).parent/'family_server.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
checks=0
def check(condition,label):
    global checks
    assert condition,label
    checks+=1;print('PASS '+label)
with tempfile.TemporaryDirectory(prefix='flc-v4-api-') as temp:
    server=module.create_server(port=0,database=Path(temp)/'test.sqlite3')
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    origin=f'http://127.0.0.1:{server.server_port}'
    def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(c,path,body=None,method=None):
        request=urllib.request.Request(origin+'/api'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'},method=method or ('POST' if body is not None else 'GET'))
        try:
            with c.open(request) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def login(c,phone,role):
        _,code=api(c,'/auth/code',{'phone':phone})
        _,data=api(c,'/auth/login',{'phone':phone,'code':code['testCode']})
        api(c,'/me',{'role':role,'profile':{'name':'隔离接口测试'+role,'healthConsent':True,'completed':True}},'PATCH')
        return data['user']['id']
    try:
        elder,child,other=client(),client(),client()
        elder_id=login(elder,'13800280001','elder');child_id=login(child,'13800280002','child');login(other,'13800280003','child')
        _,invitation=api(elder,'/family/invite',{'role':'elder'})
        check(len(invitation['code'])==6,'绑定码长度兼容原前端输入框')
        check(invitation['code'].isdigit() and invitation['expiresIn']==300 and 0 < invitation['expiresAt']/1000-time.time() <= 300,'随机数字绑定码5分钟有效')
        _,existing=api(elder,'/family/invite');check(existing['code']==invitation['code'],'重新打开页面可以取回当前有效码')
        old_code=invitation['code'];_,invitation=api(elder,'/family/invite',{'role':'elder'})
        status,_=api(child,'/family/lookup?code='+old_code);check(status==400 and invitation['code']!=old_code,'重新生成立即使旧绑定码失效')
        status,_=api(elder,'/family/invite',{'role':'child'});check(status==400,'邀请码身份不能冒充另一端')
        _,found=api(child,'/family/lookup?code='+invitation['code'])
        check(found['member']['name'].startswith('隔离') and '****' in found['member']['phone'] and 'profile' not in found['member'],'核对绑定码只返回必要身份信息')
        status,_=api(elder,'/family/lookup?code='+invitation['code']);check(status==400,'不能查询并绑定自己的邀请')
        _,request=api(child,'/family/join',{'code':invitation['code'],'relation':'女儿'})
        family_id=request['id'];api(elder,'/family/'+family_id,{'status':'bound','records_allowed':True,'profile_allowed':False},'PATCH')
        _,family=api(elder,'/family');check(family['families'][0]['relation']=='女儿','绑定申请保存真实关系')
        _,expired=api(elder,'/family/invite',{'role':'elder'})
        with closing(sqlite3.connect(server.database)) as db, db:db.execute('UPDATE invites SET expires=? WHERE code=?',(time.time()-1,expired['code']))
        status,_=api(other,'/family/lookup?code='+expired['code']);check(status==400,'服务端拒绝已超过5分钟的邀请')
        status,_=api(other,'/family/join',{'code':expired['code']});check(status==400,'过期码不能建立关系')
        _,second_invite=api(elder,'/family/invite',{'role':'elder'})
        _,second_request=api(other,'/family/join',{'code':second_invite['code'],'relation':'儿子'})
        second_family=second_request['id'];api(elder,'/family/'+second_family,{'status':'bound','is_primary':True,'records_allowed':True},'PATCH')
        _,family=api(elder,'/family');check(sum(f['is_primary'] for f in family['families'])==1 and next(f for f in family['families'] if f['is_primary'])['id']==second_family,'设置主要联系人保持唯一')
        status,_=api(child,'/family/'+family_id,{'is_primary':True},'PATCH');check(status==403,'子女不能替老人切换主要联系人')
        api(other,'/family/'+second_family,None,'DELETE');_,family=api(elder,'/family')
        check(len(family['families'])==1 and family['families'][0]['is_primary']==1,'子女解绑主要联系人后剩余家人接任')
        status,_=api(elder,'/family/'+second_family,{'status':'bound'},'PATCH');check(status==403,'不能通过旧关系接口恢复已经解除的绑定')
        status,_=api(other,'/records?elder='+elder_id);check(status==403,'解除绑定即时撤销共享读取')
        status,_=api(child,'/family/lookup?code='+invitation['code']);check(status==400,'邀请使用后失效')
        status,_=api(child,'/family/'+family_id+'/relation-request',{'relation':'儿子'});check(status==200,'子女可以申请关系更正')
        _,family=api(elder,'/family');check(family['families'][0]['requested_relation']=='儿子' and family['families'][0]['relation']=='女儿','更正待确认不会直接修改关系')
        status,_=api(other,'/family/'+family_id+'/relation-request',{'relation':'其他'});check(status==404,'无关账号无法更正家庭关系')
        api(elder,'/family/'+family_id,{'relation':'儿子','resolve_relation':True},'PATCH')
        _,family=api(child,'/family');check(family['families'][0]['relation']=='儿子' and not family['families'][0]['requested_relation'],'老人确认关系更正并清除待确认状态')
        api(elder,'/records',{'record':{'id':'privacy-v4','label':{'ingredientText':'测试配料'},'assessment':{'level':'red','basis':['私人资料']},'profileSnapshot':{'allergens':['私人']},'healthSnapshot':{'diseases':['私人']}}})
        _,records=api(child,'/records?elder='+elder_id);record=records['records'][0]
        check('healthSnapshot' not in record and 'profileSnapshot' not in record and record['assessment']['basis']==[],'不同版本健康快照都遵守独立授权')
        _,code=api(child,'/auth/code',{'phone':'13800280004'})
        status,data=api(child,'/auth/change-phone',{'phone':'13800280004','code':code['testCode']})
        check(status==200 and data['user']['id']==child_id and data['user']['phone']=='13800280004','验证码更换手机号保留账号与家庭关系')
        _,family=api(child,'/family');check(family['families'][0]['id']==family_id,'更换手机号后家庭关系仍可读取')
        _,code=api(child,'/auth/code',{'phone':'13800280003'})
        status,_=api(child,'/auth/change-phone',{'phone':'13800280003','code':code['testCode']});check(status==400,'不将两个手机号已有账号合并')
        for path in ('/_local/family.sqlite3','/tools/family_server.py','/src/backend.ts','/public/assets/dd0c1.png', '/assets/%2e%2e/_local/family.sqlite3', '/assets/paddle/%2e%2e/%2e%2e/tools/family_server.py', '/assets/paddle/'):
            try:other.open(origin+path);status=200
            except urllib.error.HTTPError as e:status=e.code
            check(status==404,'不公开私人文件或目录：'+path)
        for path in ('/assets/17d08.svg', '/assets/paddle/manifest.json', '/audio/care-demo-12s.wav', '/favicon.svg'):
            with other.open(origin+path) as response:
                check(response.status==200 and bool(response.read()), '单份公共资源正常提供：'+path)
        with other.open(urllib.request.Request(origin+'/assets/paddle/ort-wasm-simd-threaded.jsep.wasm', method='HEAD')) as response:
            check(response.status==200 and response.headers['Content-Type']=='application/wasm' and int(response.headers['Content-Length'])==25014754, 'OCR引擎HEAD保持类型与完整长度')
        try:other.open(urllib.request.Request(origin+'/_local/family.sqlite3', method='HEAD'));status=200
        except urllib.error.HTTPError as e:status=e.code
        check(status==404, 'HEAD也不能下载私人数据库')
        api(elder,'/family/'+family_id,None,'DELETE');_,family=api(child,'/family');check(not family['families'],'老人端也可以解除绑定')
        api(child,'/auth/logout',{});status,_=api(child,'/family/invite',{'role':'child'});check(status==401,'退出后不能生成邀请码')
    finally:server.shutdown();server.server_close();thread.join()
print(f'第四版新增接口：{checks}项通过')
