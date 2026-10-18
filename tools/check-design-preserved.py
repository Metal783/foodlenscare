"""逐字节确认原CSS与素材保留，避免无意重设计。"""
from pathlib import Path
import zipfile
import hashlib
import json
root=Path(__file__).resolve().parent.parent
archive=root.parent/'UI界面'/'Foodlenscare App Onboarding.zip'
checks=[]
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        if item.is_dir():continue
        if item.filename=='src/index.css' or item.filename.startswith(('public/assets/','public/audio/')) or item.filename=='public/favicon.svg':
            expected=z.read(item)
            actual=(root/item.filename).read_bytes()
            assert actual==expected,f'原始样式或素材变化：{item.filename}'
            checks.append({'file':item.filename,'sha256':hashlib.sha256(actual).hexdigest()})
report={'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'unchangedFiles':len(checks),'files':checks}
(root/'_qa').mkdir(exist_ok=True)
(root/'_qa'/'界面样式与素材保留检查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'原始CSS与素材：{len(checks)}个文件逐字节一致。')
