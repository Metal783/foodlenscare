from pathlib import Path
p=Path(__file__).resolve().parent.parent/'src/FoodRecognition.tsx'
s=p.read_text(encoding='utf-8')
s='import { runRecognition } from "./recognition";\nimport { putRecord } from "./backend";\n'+s
s=s.replace('function ProcessingPage({ onCancel }: { onCancel: () => void })', 'function ProcessingPage({ onCancel, progress }: { onCancel: () => void; progress: string })').replace('当前为演示识别，不会将任意照片声称为真实识别结果。', '{progress || "正在本机读取包装文字，请稍候。"}')
start=s.index('function ResultPage(')
end=s.index('export default function FoodRecognition',start)
section=s[start:end]
section=section.replace('  photo,\n', '  record,\n  photo,\n',1).replace('  photo: string;', '  record: any;\n  photo: string;',1)
section=section.replace('<h2>原味燕麦片</h2>', '<h2>{record?.productName || "未读清标签"}</h2>').replace('✓ 适量食用 · 饮食参考', '{record?.assessment?.headline || "待核对包装"}')
section=section.replace('{userPhoto && <small>以下为演示结果，不对应您照片中的真实识别。</small>}', '{!userPhoto && <small>独立演示用例，不记入真实识别历史。</small>}')
section=section.replace('以下为示例识别内容，尚未核对实物，不代表产品实际配方。', '{record?.label?.ingredientsConfirmed ? "已核对配料，请仍以实物包装为准。" : "本机OCR读取内容，尚未人工核对，请对照完整包装。"}')
section=section.replace('配料（示例）：燕麦片', '配料：{record?.label?.ingredientText || "未读清，请重新拍摄配料区域"}').replace('示例未识别到添加糖信息，不等于一定不含。请核对完整配料表与营养表。', '{record?.label?.allergenDeclaration || "未读到过敏原声明不等于不含过敏原，请核对完整包装。"}')
section=section.replace('按您平时的饮食方案适量安排，搭配蛋白质与蔬菜。燕麦也是主食，别只看“原味”字样。', '{record?.assessment?.advice || "请核对营养表和实际食用份量。"}')
section=section.replace('已保存到本地演示记录', '已保存识别历史；尚未计为实际食用')
s=s[:start]+section+s[end:]
s=s.replace('onUpdateElder: (draft: ElderDraft) => boolean;', 'onUpdateElder: (draft: ElderDraft) => Promise<boolean>;')
s=s.replace('  const [outcome, setOutcome]', '  const [record, setRecord] = useState<any>(null);\n  const [progress, setProgress] = useState("");\n  const controller = useRef<AbortController | null>(null);\n  const alive = useRef(true);\n  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); window.speechSynthesis?.cancel(); }; }, []);\n  const [outcome, setOutcome]')
s=s.replace('"原味燕麦片。适量食用，仅供饮食参考。示例成分尚未核对实物，请查看完整配料表、过敏原声明和营养表。识别不是医疗诊断。",', '`${record?.productName || "未读清标签"}。${record?.assessment?.headline || "待核对"}。${record?.assessment?.advice || "请核对完整包装"}。识别不是医疗诊断。`,')
start=s.index('  useEffect(() => {\n    if (stage !== "processing")')
end=s.index('  useEffect(() => {',start+15)
s=s[:start]+s[end:]
start=s.index('  const recognize = (nextPhoto:')
end=s.index('  const requestLeave',start)
s=s[:start]+'''  const recognize = async (nextPhoto: string, isUserPhoto: boolean) => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setPhoto(nextPhoto); setUserPhoto(isUserPhoto); setRecord(null); setSaved(false);
    setTaskId(current => current + 1); setProgress("正在准备照片…"); setStage("processing");
    try {
      if (!isUserPhoto && outcome === "failure") { setStage("failure"); return; }
      const result = await runRecognition(nextPhoto, elder, active.signal, text => { if (!active.signal.aborted) setProgress(text); }, !isUserPhoto);
      if (!alive.current || active.signal.aborted) return;
      setRecord(result); setPhoto(result.photoDataUrl);
      if (isUserPhoto) {
        try { await putRecord(result); if (active.signal.aborted || !alive.current) return; setSaved(true); }
        catch (error) { setSpeechMessage(`识别历史保存失败：${(error as Error).message}，可点击保存重试。`); }
      }
      setStage(!result.label.rawText && !result.label.ingredientText && isUserPhoto ? "failure" : "result");
    } catch (error) { if (!active.signal.aborted && alive.current) { setProgress((error as Error).message); setSpeechMessage((error as Error).message); setStage("failure"); } }
  };
  const startCamera = () => {
    controller.current?.abort(); stopSpeech();
    setTaskId(current => current + 1); setSaved(false); setSaving(false); setStage("camera");
  };
''' + s[end:]
start=s.index('  const save = () => {')
end=s.index('\n  if (stage === "camera")',start)
s=s[:start]+'''  const save = async () => {
    if (saving || saved || !record) return;
    if (!userPhoto) { setSpeechMessage("演示用例不保存到真实识别历史。"); return; }
    setSaving(true);
    try { await putRecord(record); setSaved(true); }
    catch (error) { setSpeechMessage((error as Error).message); }
    finally { setSaving(false); }
  };
''' + s[end:]
s=s.replace('onSave={(next) => {\n          const success = onUpdateElder(next);', 'onSave={async (next) => {\n          const success = await onUpdateElder(next);').replace('<ProcessingPage onCancel={startCamera} />', '<ProcessingPage onCancel={startCamera} progress={progress} />').replace('<ResultPage\n', '<ResultPage\n        record={record}\n')
p.write_text(s,encoding='utf-8')
p=p.parent/'HealthRecords.tsx'
s=p.read_text(encoding='utf-8')
s='import { useBackend } from "./backend";\n'+s
s=s.replace('  const [page, setPage]', '  const backend = useBackend();\n  const [page, setPage]',1).replace('[elder.phone, page, session],', '[elder.phone, page, session, backend.revision],')
s=s.replace('示例内容，尚未核对包装，不代表实际产品配方。', '{record.raw?.label?.ingredientsConfirmed ? "当时已核对配料，请仍以包装为准。" : "当时OCR读取内容，尚未人工核对包装。"}')
p.write_text(s,encoding='utf-8')
print('真实OCR、规则、识别历史和结果展示已接入。')
