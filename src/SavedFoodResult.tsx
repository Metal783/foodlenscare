import FoodLabel from './FoodLabel';
import { AnalysisText, analysisStyle } from './SmartAnalysis';
import type { RecognitionRecord } from './records';
import PrivatePhoto from './PrivatePhoto';
import LocalDiseaseReminders from './LocalDiseaseReminders';
import FoodAssistant from './FoodAssistant';

export default function SavedFoodResult({ record, caption, profileAllowed = true }: { record: RecognitionRecord; caption: string; profileAllowed?: boolean }) {
  const raw = record.raw || {};
  const analysis = profileAllowed ? raw.aiAnalysis : undefined;
  const localBlock = profileAllowed && raw.assessment?.level === 'red';
  const title = /^(?:未识别|未读清|配料|原料|营养|每\s*\d)/.test(record.foodName) ? '食品识别' : record.foodName;
  return <>
    <section className="recognition-card result-summary">
      <PrivatePhoto alt={`${title}照片`} className="result-photo" src={record.photo} />
      <h2>{title}</h2><p>{caption}</p>
    </section>
    <section className="recognition-card" aria-label="食用建议" style={analysisStyle(localBlock ? 'not_recommended' : analysis?.recommendation)}>
      {!profileAllowed ? <><h3>食用建议</h3><p>饮食资料未授权，暂无法查看个性化分析。</p></> : analysis ? <AnalysisText analysis={analysis} /> : <>
        <h3>{localBlock ? '不建议食用' : '食用建议'}</h3>
        {localBlock && <p className="result-large">{String(raw.assessment.headline || '存在本人过敏原线索。').replace('识别文字疑似含有您过敏的', '配料中存在您的过敏原线索：').replace(/，请先别吃并核对包装[。]?/, '。')}</p>}
        <p>该记录未保存智能分析。</p>
      </>}
      <small>饮食建议仅供参考，不替代医疗诊断。</small>
    </section>
    {profileAllowed && <LocalDiseaseReminders record={raw} />}
    {profileAllowed && <FoodAssistant record={raw} />}
    <FoodLabel label={raw.label || { ingredientText: record.ingredients.join('、') }} />
  </>;
}
