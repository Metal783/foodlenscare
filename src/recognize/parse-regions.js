/** 保留文字框并提取营养候选；只在用户核对后计算。 */
import { parseLabelText, splitIngredientLines, findIngredientHeading } from './parse-label.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';
const TITLES = { energy:/^(?:能量|热量)/, protein:/^蛋白(?:质)?/, saturatedFat:/^饱和脂肪(?:酸)?/, fat:/^脂肪/, carbohydrate:/^碳水(?:化合物|化物)/, sugar:/^(?:糖|总糖|糖分|添加糖)/, sodium:/^钠/ };
const normalize = t=>String(t||'').replace(/([\u3400-\u9fff])[ \t\u3000]+(?=[\u3400-\u9fff])/g,'$1').trim();
export function groupOcrRows(items=[]) {
  const lines=items.filter(i=>i.text?.trim() && i.poly?.length>=4 && i.poly.every(p=>p.length>=2 && p.every(Number.isFinite))).map(i=>({
    ...i,text:normalize(i.text), x:Math.min(...i.poly.map(p=>p[0])), y:i.poly.reduce((s,p)=>s+p[1],0)/i.poly.length,
    height:Math.max(1,((i.poly[3][1]-i.poly[0][1])+(i.poly[2][1]-i.poly[1][1]))/2)
  })).sort((a,b)=>a.y-b.y || a.x-b.x);
  const rows=[];
  for(const line of lines) {
    const row=rows.find(r=>Math.abs(r.y-line.y)<=Math.min(r.height,line.height)*0.6);
    if(row) { row.items.push(line); row.y=row.items.reduce((s,l)=>s+l.y,0)/row.items.length; }
    else rows.push({y:line.y,height:line.height,items:[line]});
  }
  return rows.sort((a,b)=>a.y-b.y).map(r=>{r.items.sort((a,b)=>a.x-b.x); return {...r,text:r.items.map(i=>i.text).join(' '),confidence:Math.min(...r.items.map(i=>i.score??0))};});
}
function readValue(text,key) {
  const hit=text.match(/(?<![\d.\-])([0-9]+(?:\.[0-9]+)?)\s*(千焦|干焦|kJ|千卡|kcal|毫克|mg|克|g)(?![a-z])/i);
  if(!hit) return null;
  let value=Number(hit[1]); const unit=hit[2].toLowerCase();
  if(key==='energy') {
    if(/^(千卡|kcal)$/.test(unit)) value=Math.round(value*4.184*1000)/1000;
    else if(!/^(千焦|干焦|kj)$/.test(unit)) return null;
  } else if(key==='sodium') {
    if(/^(克|g)$/.test(unit)) value*=1000;
    else if(!/^(毫克|mg)$/.test(unit)) return null;
  } else {
    if(/^(毫克|mg)$/.test(unit)) value/=1000;
    else if(!/^(克|g)$/.test(unit)) return null;
  }
  return {value,raw:hit[0],warning:unit==='干焦'?'原文单位识别为“干焦”，请核对是否为千焦。':''};
}
export function labelFromRegions(result) {
  const rows=groupOcrRows(result.items),rawText=rows.map(r=>r.text).join('\n');
  const label=parseLabelText(rawText,{channelLabel:'PaddleOCR · 本机中文识别'});
  const candidates={},per100g={},confidence={};
  for(const f of NUTRIENT_FIELDS) {per100g[f.key]=null;confidence[f.key]=0;}
  let start=rows.findIndex(r=>/营养成分表|营养标签/.test(r.text));
  if(start<0) start=rows.findIndex(r=>/每\s*100\s*(?:毫升|ml|克|g)/i.test(r.text));
  const tail=start<0?[]:rows.slice(start);
  const end=tail.findIndex((r,i)=>i>0 && /^(?:产品名称|产品类型|配料|原料|净含量|生产日期|保质期)/.test(r.text));
  const table=end<0?tail:tail.slice(0,end),header=table.slice(0,3).map(r=>r.text).join(' ');
  const basis=header.match(/每\s*100\s*(毫升|ml|克|g)/i);
  const bases=[...header.matchAll(/每\s*100\s*(毫升|ml|克|g)/gi)].map(m=>/毫升|ml/i.test(m[1])?'ml':'g');
  const ambiguous=new Set(bases).size>1 || (Boolean(basis) && /每\s*(份|瓶|包|袋)/.test(header));
  const servingUnit=basis&&!ambiguous?(/毫升|ml/i.test(basis[1])?'ml':'g'):null;
  if(servingUnit) for(const row of table) {
    const key=Object.keys(TITLES).find(k=>TITLES[k].test(row.text.replace(/\s/g,'')));
    if(!key) continue;
    const parsed=readValue(row.text,key); if(!parsed) continue;
    if(candidates[key] && candidates[key].value!==parsed.value) {per100g[key]=null;confidence[key]=0;candidates[key].conflict=true;continue;}
    if(candidates[key]?.conflict) continue;
    candidates[key]={...parsed,confidence:row.confidence,text:row.text,boxes:row.items.map(i=>i.poly)};
    per100g[key]=parsed.value;confidence[key]=row.confidence;
  }
  const heading=findIngredientHeading(label.ingredientText),ingredientRows=rows.filter(r=>/配料|原料/.test(r.text));
  return {...label,rawText,ingredientLines:splitIngredientLines(label.ingredientText),
    ingredientHeadingSuspect:heading?!/^(?:配料表|配料|原料|原辅料)/.test(heading.heading):false,
    nutritionPer100g:per100g,nutritionCandidates:candidates,confidence,
    missingFields:NUTRIENT_FIELDS.filter(f=>per100g[f.key]==null).map(f=>f.key),
    servingUnit,servingLabel:servingUnit==='ml'?'每 100 毫升':servingUnit==='g'?'每 100 克':'口径待核对',
    declaredPer:servingUnit?'per100g':'unknown',servingBasis:'per100g',
    ocrConfidence:ingredientRows.length?Math.min(...ingredientRows.map(r=>r.confidence)):rows.length?rows.reduce((s,r)=>s+r.confidence,0)/rows.length:0,
    ocrRows:rows.map(r=>({text:r.text,confidence:r.confidence,boxes:r.items.map(i=>i.poly)})),
    imageDimensions:result.image,readingOnly:true,channel:'paddleOcr',nutritionConfirmed:false};
}
