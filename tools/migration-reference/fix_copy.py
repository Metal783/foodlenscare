from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=root/'src/App.tsx'
s=p.read_text(encoding='utf-8').replace('输入您的手机号码，我们将发送验证码。','输入手机号码，页面将显示本地测试验证码。').replace('短信验证码','本地测试验证码')
p.write_text(s,encoding='utf-8')
p=root/'src/Onboarding.tsx'
s=p.read_text(encoding='utf-8').replace('信息仅用于个人照护演示','信息用于个人饮食照护').replace('本地演示数据','本机家庭服务数据').replace('未验证的号码需先完成演示验证','未验证的号码需先完成本地测试验证')
p.write_text(s,encoding='utf-8')
p=root/'src/FoodRecognition.tsx'
s=p.read_text(encoding='utf-8').replace('<span className="result-badge">{record?.assessment?.headline || "待核对包装"}</span>', '<span className="result-badge" style={record?.assessment?.level === "red" ? { color: "#a21717", background: "#fff0f0" } : record?.assessment?.level !== "green" ? { color: "#7c4a12", background: "#fff2dc" } : undefined}>{record?.assessment?.headline || "待核对包装"}</span>')
p.write_text(s,encoding='utf-8')
p=root/'src/ChildApp.tsx'
s=p.read_text(encoding='utf-8')
start=s.index('import {\n  latestVoiceReceipt,')
end=s.index('} from "./childNotifications"',start)+len('} from "./childNotifications"')
s=s[:start]+'import type { ChildNotificationPreferences } from "./childNotifications"'+s[end:]
for old,new in [('一份关怀，陪妈妈好好吃每一餐。','一份关怀，陪家人好好吃每一餐。'),('让妈妈听见你的关心','让{selectedElder()}听见你的关心'),('妈妈的食物记录','{selectedElder()}的食物记录'),('结合妈妈的已有设置','结合{selectedElder()}的已有设置'),('把关心，说给妈妈听','把关心，说给{selectedElder()}听'),('发送给妈妈','发送给{selectedElder()}'),('发送语音提醒妈妈','发送语音提醒{selectedElder()}')]:
    s=s.replace(old,new)
p.write_text(s,encoding='utf-8')
